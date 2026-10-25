import { usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Linking, Platform } from 'react-native';

import { useDayRollover } from '../hooks/useDayRollover';
import { useActivity, type ActivityState } from '../hooks/useActivity';
import { useContributions, type ContributionsState } from '../hooks/useContributions';
import { useOpenPrs } from '../hooks/useOpenPrs';
import { usePeople } from '../hooks/usePeople';
import { useQueue } from '../hooks/useQueue';
import { useSocial, type SocialState } from '../hooks/useSocial';
import { useTasks } from '../hooks/useTasks';
import { useTogether } from '../hooks/useTogether';
import { useTokenScopes } from '../hooks/useTokenScopes';
import { useTriage } from '../hooks/useTriage';
import { accountStore, type Account } from '../lib/accounts';
import { EMPTY_ACTIVITY, spreadMessages, type Activity } from '../lib/activity';
import { fetchCommitLines } from '../lib/commitLines';
import type { GitHubModel } from '../lib/contributions';
import { DEFAULT_HOME, readHome, type HomeSettings } from '../lib/home';
import {
  cacheLines,
  clearCachedLines,
  isStale,
  readCachedLines,
  shuffle,
  type CommitLine,
} from '../lib/messageCache';
import { routeForUrl, type Nav, type Route } from '../lib/nav';
import { markSeen } from '../lib/notify';
import type { SocialEvent } from '../lib/social';
import { readSaved, writeSaved } from '../lib/store';
import { stateOf, type Marks } from '../lib/triage';
import { DEMO_TOKEN, tokenStore } from '../lib/token';
import { clearWidget, syncWidget } from '../lib/widgetBridge';
import { hrefOf, SECTIONS, sectionOfPath } from './sections';

/** undefined = restoring from the keystore, null = signed out. */
export type TokenState = string | null | undefined;

/** Lines kept for the loading screen — it draws about 26 at a time. */
const POOL_SIZE = 40;

const WORK = SECTIONS.findIndex((section) => section.key === 'work');

const TOGETHER_KEY = 'accounts-together';
const HOME_KEY = 'home-settings';

export interface Session {
  token: TokenState;
  setToken: (token: string | null) => void;
  contributions: ContributionsState & { reload: () => void };
  /**
   * The year every chart draws: the account in use, summed with any others
   * ticked to be shown together. `contributions` is the account in use alone.
   */
  model: GitHubModel | null;
  /** Lowercase logins of the other accounts summed into `model`. */
  together: string[];
  toggleTogether: (login: string) => void;
  /** Ticked accounts that could not be read, and so are not in the sum. */
  missing: string[];
  /** What `today` lists at its foot. */
  home: HomeSettings;
  setHome: (next: HomeSettings) => void;
  /** Forget an account that is not the one in use. */
  forget: (login: string) => Promise<void>;
  scopes: ReturnType<typeof useTokenScopes>;
  prs: ReturnType<typeof useOpenPrs>;
  social: SocialState;
  /** Pull requests waiting on your review, and the ones you reviewed. */
  queue: ReturnType<typeof useQueue>;
  /** Issues and pull requests assigned to you, and issues you filed. */
  tasks: ReturnType<typeof useTasks>;
  /** A year of reviews, both ways. */
  people: ReturnType<typeof usePeople>;
  triage: ReturnType<typeof useTriage>;
  activityState: ActivityState;
  activity: Activity;
  /**
   * Ask for the commit history now — `today` calls it once its `hours`
   * block is near. `work` needs it on sight and asks by being open.
   */
  wantActivity: () => void;
  accounts: Account[];
  /** Commit subjects and their repositories, for the travelling strip. */
  lines: CommitLine[];
  /** Which section is on screen, from the route. */
  tab: number;
  goToTab: (index: number) => void;
  /** Everything pushed over the sections, bottom first. */
  stack: Route[];
  nav: Nav;
  openEvent: (event: SocialEvent) => void;
  /** Open a github.com link in the app if it can be, the browser if not. */
  openUrl: (item: { url: string }) => void;
  switchTo: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** The inbox tab's count. */
  wanting: number;
}

/**
 * Navigation and the actions that change the session. These identities stay
 * put while a feed or a chart refreshes, so a screen that only navigates
 * does not have to subscribe to that data.
 */
export interface SessionActions {
  setToken: (token: string | null) => void;
  toggleTogether: (login: string) => void;
  setHome: (next: HomeSettings) => void;
  forget: (login: string) => Promise<void>;
  wantActivity: () => void;
  tab: number;
  goToTab: (index: number) => void;
  stack: Route[];
  nav: Nav;
  openEvent: (event: SocialEvent) => void;
  openUrl: (item: { url: string }) => void;
  switchTo: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
}

/**
 * Account, year, inbox and work. A change here re-renders data consumers
 * only; actions live on the other context.
 */
export interface SessionData {
  token: TokenState;
  contributions: ContributionsState & { reload: () => void };
  model: GitHubModel | null;
  together: string[];
  missing: string[];
  home: HomeSettings;
  scopes: ReturnType<typeof useTokenScopes>;
  prs: ReturnType<typeof useOpenPrs>;
  social: SocialState;
  queue: ReturnType<typeof useQueue>;
  tasks: ReturnType<typeof useTasks>;
  people: ReturnType<typeof usePeople>;
  triage: ReturnType<typeof useTriage>;
  activityState: ActivityState;
  activity: Activity;
  accounts: Account[];
  lines: CommitLine[];
  /** The inbox tab's count. */
  wanting: number;
}

const SessionActionsContext = createContext<SessionActions | null>(null);
const SessionDataContext = createContext<SessionData | null>(null);

/** Navigation and session actions, without the year, inbox or charts. */
export function useSessionActions(): SessionActions {
  const actions = useContext(SessionActionsContext);
  if (!actions) throw new Error('useSession outside SessionProvider');
  return actions;
}

/** The account's data. Does not move when only the route stack does. */
export function useSessionData(): SessionData {
  const data = useContext(SessionDataContext);
  if (!data) throw new Error('useSession outside SessionProvider');
  return data;
}

/**
 * Both halves. Prefer `useSessionActions` or `useSessionData` in a screen
 * that should not redraw for the other half — a social refresh must not
 * re-execute a chart that never reads the inbox.
 */
export function useSession(): Session {
  const actions = useSessionActions();
  const data = useSessionData();
  return useMemo(() => ({ ...data, ...actions }), [actions, data]);
}

/**
 * Events that are addressed to you rather than about you, and that you have
 * not put away — the tab count. It is counted from the same rows the inbox
 * draws, so a badge can never say three over an inbox that shows none.
 */
function wantsYou(social: SocialState, marks: Marks): number {
  if (social.status !== 'ready') return 0;
  return social.events.filter(
    (event) =>
      (event.kind === 'review-request' ||
        event.kind === 'mention' ||
        (event.kind === 'review' && event.state === 'CHANGES_REQUESTED')) &&
      stateOf(event, marks) === 'open',
  ).length;
}

/**
 * The app's state, above the tab navigator: the token, the year, the inbox,
 * the pushed pages. It lives here rather than in a screen because the tabs are
 * native now — each section is its own route — and because the navigator
 * stays mounted when the system switches between light and dark.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tab = sectionOfPath(pathname);

  const [token, setTokenState] = useState<TokenState>(undefined);
  const [stack, setStack] = useState<Route[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const setToken = useCallback((next: string | null) => setTokenState(next), []);

  const section = SECTIONS[tab].key;

  const contributions = useContributions(token ?? null);
  const scopes = useTokenScopes(token ?? null);
  const own = contributions.status === 'ready' ? contributions.model : null;
  const login = own?.login ?? null;
  const prs = useOpenPrs(token ?? null, login, section === 'work');
  // The inbox is the reason to open the app, so it is fetched as soon as we
  // know who you are and kept whichever section is open: the count on the
  // bar has to be true before you tap it.
  const social = useSocial(token ?? null, login, true);
  const queue = useQueue(token ?? null, login, section === 'work');
  const tasks = useTasks(token ?? null, login, section === 'work');
  const people = usePeople(token ?? null, login, section === 'year');
  // The demo keeps its marks under its own name, never under the real login
  // it happens to borrow.
  const triage = useTriage(token === DEMO_TOKEN ? 'demo' : login);
  // Commit timestamps and PR bodies are a second, heavier request — never
  // on launch. `work` draws them at the top of its page, so it asks when it
  // opens; `today` draws them half-way down, so it asks once it is scrolled
  // (`wantActivity`). The demo's are on the device, so it has them at once.
  const [activityWanted, setActivityWanted] = useState(false);
  const wantActivity = useCallback(() => setActivityWanted(true), []);
  // Snooze and "today" are functions of the clock. This bumps at local
  // midnight and when the app returns on a later day, and nothing else
  // subscribes to it.
  const day = useDayRollover();
  const needActivity = section === 'work' || activityWanted || token === DEMO_TOKEN;
  const activityState = useActivity(token ?? null, login, needActivity);
  const ownActivity =
    activityState.status === 'ready' ? activityState.activity : EMPTY_ACTIVITY;

  // Accounts ticked to be shown together with the one in use. Kept as logins,
  // so a refreshed token for the same account stays ticked.
  const [together, setTogether] = useState<string[]>([]);
  useEffect(() => {
    readSaved<string[]>(TOGETHER_KEY)
      .then((saved) => {
        if (Array.isArray(saved?.value)) setTogether(saved.value);
      })
      .catch(() => {});
  }, []);
  const toggleTogether = useCallback((name: string) => {
    const lower = name.toLowerCase();
    setTogether((current) => {
      const next = current.includes(lower)
        ? current.filter((item) => item !== lower)
        : [...current, lower];
      writeSaved(TOGETHER_KEY, next).catch(() => {});
      return next;
    });
  }, []);
  const others = useMemo(
    () =>
      token === DEMO_TOKEN || !login
        ? []
        : accounts.filter(
            (account) =>
              account.login.toLowerCase() !== login.toLowerCase() &&
              together.includes(account.login.toLowerCase()),
          ),
    [accounts, login, token, together],
  );
  const summed = useTogether(own, ownActivity, others, needActivity);
  const model = summed.model;
  const activity = summed.activity;

  const [home, setHomeState] = useState<HomeSettings>(DEFAULT_HOME);
  useEffect(() => {
    readSaved<unknown>(HOME_KEY)
      .then((saved) => {
        if (saved) setHomeState(readHome(saved.value));
      })
      .catch(() => {});
  }, []);
  const setHome = useCallback((next: HomeSettings) => {
    setHomeState(next);
    writeSaved(HOME_KEY, next).catch(() => {});
  }, []);

  const goToTab = useCallback(
    (index: number) => router.navigate(hrefOf(index)),
    [router],
  );
  const open = useCallback((route: Route) => setStack((current) => [...current, route]), []);
  const replace = useCallback(
    (route: Route) => setStack((current) => [...current.slice(0, -1), route]),
    [],
  );
  const close = useCallback(() => setStack((current) => current.slice(0, -1)), []);
  const nav = useMemo<Nav>(
    () => ({
      open,
      replace,
      close,
      token: token ?? null,
      login,
      demo: token === DEMO_TOKEN,
    }),
    [close, login, open, replace, token],
  );

  /** A row opens the thing it is about — here, not in a browser. */
  const openUrl = useCallback(
    (item: { url: string }) => {
      const route = routeForUrl(item.url);
      if (route) open(route);
      else Linking.openURL(item.url).catch(() => {});
    },
    [open],
  );
  const openEvent: (event: SocialEvent) => void = openUrl;

  // Every account this phone has been given, kept beside the current token.
  useEffect(() => {
    accountStore.list().then(setAccounts).catch(() => {});
  }, []);

  // The account in use joins the list the first time its login is known.
  useEffect(() => {
    if (!login || !token || token === DEMO_TOKEN) return;
    accountStore.upsert(login, token).then(setAccounts).catch(() => {});
  }, [login, token]);

  // An event is seen when the inbox is actually on screen, not when a
  // background fetch brought it in. A fetch while you are on another section
  // must still be eligible to notify.
  const feedEvents = social.status === 'ready' ? social.events : null;
  const inboxVisible = section === 'work' && stack.length === 0;
  useEffect(() => {
    if (!inboxVisible || !login || !feedEvents || token === DEMO_TOKEN) return;
    markSeen(login, feedEvents).catch(() => {});
  }, [feedEvents, inboxVisible, login, token]);

  // A tapped notification opens the pull request, issue or discussion it was
  // about — including when it is what started the app.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const handle = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data as {
        url?: string;
        inbox?: boolean;
      };
      const route = data?.url ? routeForUrl(data.url) : null;
      if (route) {
        setStack((current) => [...current, route]);
      } else if (data?.inbox) {
        goToTab(WORK);
      }
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    };
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handle(response);
      })
      .catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(handle);
    return () => subscription.remove();
  }, [goToTab]);

  /**
   * The loading screen is written in your own commit messages, which is a
   * problem, because it is on screen before anything has been fetched. So
   * the words are a pool kept on the device: every launch shuffles what is
   * already there and shows it immediately, and only a pool older than a
   * week sends a request to replace it.
   */
  const [lines, setLines] = useState<CommitLine[]>([]);
  const [refreshWords, setRefreshWords] = useState(false);

  useEffect(() => {
    let cancelled = false;
    readCachedLines().then((cache) => {
      if (cancelled) return;
      setLines(shuffle(cache.lines));
      setRefreshWords(isStale(cache));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Set once the search has written a pool, so the weaker backstop below
  // cannot land on top of it if activity happens to resolve a moment later.
  const searched = useRef(false);

  useEffect(() => {
    if (!refreshWords || !token || token === DEMO_TOKEN || !login) return;

    const controller = new AbortController();
    fetchCommitLines(token, login, controller.signal)
      .then(async (fresh) => {
        if (fresh.length === 0) return;
        searched.current = true;
        await cacheLines(fresh);
        setLines(shuffle(fresh));
        setRefreshWords(false);
      })
      .catch(() => {
        // Commit search is not available to every account; the sampled
        // history below is the backstop.
      });

    return () => controller.abort();
  }, [login, refreshWords, token]);

  const commits =
    activityState.status === 'ready' ? activityState.activity.commits : null;
  const sampled = useMemo(
    () => (commits ? spreadMessages(commits, POOL_SIZE) : []),
    [commits],
  );

  useEffect(() => {
    // Only if the search never landed: this pool is the last few days of the
    // repos you pushed to most recently, which is a much narrower slice of
    // your history than the search gives.
    if (!refreshWords || searched.current) return;
    if (sampled.length === 0 || token === DEMO_TOKEN) return;
    cacheLines(sampled).catch(() => {});
  }, [refreshWords, sampled, token]);

  // Shown while the cache is empty and the refresh is still in the air —
  // whatever the history sample has, rather than the placeholder.
  const shuffledSample = useMemo(() => shuffle(sampled), [sampled]);
  const words = lines.length > 0 ? lines : shuffledSample;

  useEffect(() => {
    tokenStore.get().then((stored) => {
      // Web preview shortcut: #demo or #demo/2 boots fake data on a
      // section, numbered from one in the order of the bar.
      if (stored == null && Platform.OS === 'web') {
        const hash = window.location.hash;
        if (hash.startsWith('#demo')) {
          const target = Number(hash.split('/')[1]) - 1;
          if (SECTIONS[target]) router.navigate(hrefOf(target));
          tokenStore.set(DEMO_TOKEN).then(() => setTokenState(DEMO_TOKEN));
          return;
        }
      }
      setTokenState(stored);
    });
    // Once, at launch: the router is stable for the life of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which account the widget should show. A sync that started for the
  // previous account must not land after a switch and paint the old year.
  const widgetGeneration = useRef(0);
  const widgetSent = useRef('');
  useEffect(() => {
    if (!model || token === DEMO_TOKEN) return;
    const generation = ++widgetGeneration.current;
    const loginKey = model.login.toLowerCase();
    const today = model.columns.flat().find((item) => item.isToday)?.date ?? '';
    const lineKey = words.map((line) => `${line.repo}\u0000${line.message}`).join('\n');
    const identity = `${loginKey}\u0000${today}\u0000${model.todayCount}\u0000${lineKey}`;
    if (widgetSent.current === identity) return;
    widgetSent.current = identity;
    syncWidget(model, words)
      .then(() => {
        if (widgetGeneration.current !== generation) {
          widgetSent.current = '';
        }
      })
      .catch(() => {
        if (widgetGeneration.current === generation) widgetSent.current = '';
      });
  }, [day, model, token, words]);

  /** Everything that belongs to one account's session, back to the start. */
  const resetSession = useCallback(async () => {
    await clearCachedLines();
    searched.current = false;
    setLines([]);
    setRefreshWords(true);
    setActivityWanted(false);
    setStack([]);
    router.navigate(hrefOf(0));
  }, [router]);

  const switchTo = useCallback(
    async (next: string) => {
      await resetSession();
      await tokenStore.set(next);
      setTokenState(next);
    },
    [resetSession],
  );

  /**
   * Forget this account. If the phone holds another, the app moves to it;
   * only the last one leaves you at the token form.
   */
  const disconnect = useCallback(async () => {
    const demo = token === DEMO_TOKEN;
    if (!demo) await clearWidget().catch(() => {});
    const remaining = !demo && login ? await accountStore.remove(login) : accounts;
    setAccounts(remaining);
    const next = remaining.find((account) => account.token !== token);
    if (next) {
      await switchTo(next.token);
      return;
    }
    await resetSession();
    await tokenStore.clear();
    setTokenState(null);
  }, [accounts, login, resetSession, switchTo, token]);

  const forget = useCallback(
    async (name: string) => {
      if (login && name.toLowerCase() === login.toLowerCase()) return;
      setAccounts(await accountStore.remove(name));
    },
    [login],
  );

  const wanting = useMemo(
    () => wantsYou(social, triage.marks),
    // `day` is the clock: a snooze that expires overnight, or a new local
    // day, has to recount even when the feed itself did not change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, social, triage.marks],
  );

  const actions = useMemo<SessionActions>(
    () => ({
      setToken,
      toggleTogether,
      setHome,
      forget,
      wantActivity,
      tab,
      goToTab,
      stack,
      nav,
      openEvent,
      openUrl,
      switchTo,
      disconnect,
    }),
    [
      disconnect,
      forget,
      goToTab,
      nav,
      openEvent,
      openUrl,
      setHome,
      setToken,
      stack,
      switchTo,
      tab,
      toggleTogether,
      wantActivity,
    ],
  );

  const data = useMemo<SessionData>(
    () => ({
      token,
      contributions,
      model,
      together,
      missing: summed.missing,
      home,
      scopes,
      prs,
      social,
      queue,
      tasks,
      people,
      triage,
      activityState,
      activity,
      accounts,
      lines: words,
      wanting,
    }),
    [
      accounts,
      activity,
      activityState,
      contributions,
      home,
      model,
      people,
      prs,
      queue,
      scopes,
      words,
      social,
      summed.missing,
      tasks,
      together,
      token,
      triage,
      wanting,
    ],
  );

  return (
    <SessionActionsContext.Provider value={actions}>
      <SessionDataContext.Provider value={data}>{children}</SessionDataContext.Provider>
    </SessionActionsContext.Provider>
  );
}
