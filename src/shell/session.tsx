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

import { useActivity, type ActivityState } from '../hooks/useActivity';
import { useContributions, type ContributionsState } from '../hooks/useContributions';
import { useOpenPrs } from '../hooks/useOpenPrs';
import { useSocial, type SocialState } from '../hooks/useSocial';
import { useTokenScopes } from '../hooks/useTokenScopes';
import { useTriage } from '../hooks/useTriage';
import { accountStore, type Account } from '../lib/accounts';
import { EMPTY_ACTIVITY, spreadMessages, type Activity } from '../lib/activity';
import { fetchCommitLines } from '../lib/commitLines';
import type { GitHubModel } from '../lib/contributions';
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
import { stateOf, type Marks } from '../lib/triage';
import { DEMO_TOKEN, tokenStore } from '../lib/token';
import { clearWidget, syncWidget } from '../lib/widgetBridge';
import { FLAT, hrefOf, SECTIONS, sectionOfPath } from './sections';

/** undefined = restoring from the keystore, null = signed out. */
export type TokenState = string | null | undefined;

/** Lines kept for the loading screen — it draws about 26 at a time. */
const POOL_SIZE = 40;

const INBOX = SECTIONS.findIndex((section) => section.key === 'inbox');

export interface Session {
  token: TokenState;
  setToken: (token: string | null) => void;
  contributions: ContributionsState & { reload: () => void };
  model: GitHubModel | null;
  scopes: ReturnType<typeof useTokenScopes>;
  prs: ReturnType<typeof useOpenPrs>;
  social: SocialState;
  triage: ReturnType<typeof useTriage>;
  activityState: ActivityState;
  activity: Activity;
  accounts: Account[];
  /** Commit subjects for the loading screen. */
  said: string[];
  /** Which section is on screen, from the route. */
  tab: number;
  goToTab: (index: number) => void;
  /** One page per section, so a section is where you left it. */
  pages: number[];
  goToPage: (section: number, page: number) => void;
  /** Everything pushed over the sections, bottom first. */
  stack: Route[];
  nav: Nav;
  openEvent: (event: SocialEvent) => void;
  switchTo: (token: string) => Promise<void>;
  disconnect: () => Promise<void>;
  /** The inbox tab's count. */
  wanting: number;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error('useSession outside SessionProvider');
  return session;
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
 * native now — each section is its own route — and because it has to survive
 * the tree being remounted when the system switches between light and dark.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const tab = sectionOfPath(pathname);

  const [token, setTokenState] = useState<TokenState>(undefined);
  const [pages, setPages] = useState<number[]>(() => SECTIONS.map(() => 0));
  const [stack, setStack] = useState<Route[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const setToken = useCallback((next: string | null) => setTokenState(next), []);

  const section = SECTIONS[tab].key;
  const view = SECTIONS[tab].views[pages[tab]]?.name ?? SECTIONS[tab].views[0].name;

  const contributions = useContributions(token ?? null);
  const scopes = useTokenScopes(token ?? null);
  const model = contributions.status === 'ready' ? contributions.model : null;
  const login = model?.login ?? null;
  const prs = useOpenPrs(token ?? null, login, section === 'work');
  // The inbox is the reason to open the app, so it is fetched as soon as we
  // know who you are and kept whichever section is open: the count on the
  // bar has to be true before you tap it.
  const social = useSocial(token ?? null, login, true);
  // The demo keeps its marks under its own name, never under the real login
  // it happens to borrow.
  const triage = useTriage(token === DEMO_TOKEN ? 'demo' : login);
  // Commit timestamps and PR bodies are a second, heavier request — asked
  // for one view before anything needs them, never on launch.
  const activityState = useActivity(
    token ?? null,
    login,
    section === 'work' || view === 'weather' || view === 'clock',
  );
  const activity =
    activityState.status === 'ready' ? activityState.activity : EMPTY_ACTIVITY;

  const goToTab = useCallback(
    (index: number) => router.navigate(hrefOf(index)),
    [router],
  );
  const goToPage = useCallback(
    (index: number, page: number) =>
      setPages((current) =>
        current.map((value, position) => (position === index ? page : value)),
      ),
    [],
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

  /** A row in the inbox opens the thing it is about — here, not in a browser. */
  const openEvent = useCallback(
    (event: SocialEvent) => {
      const route = routeForUrl(event.url);
      if (route) open(route);
      else Linking.openURL(event.url).catch(() => {});
    },
    [open],
  );

  // Every account this phone has been given, kept beside the current token.
  useEffect(() => {
    accountStore.list().then(setAccounts).catch(() => {});
  }, []);

  // The account in use joins the list the first time its login is known.
  useEffect(() => {
    if (!login || !token || token === DEMO_TOKEN) return;
    accountStore.upsert(login, token).then(setAccounts).catch(() => {});
  }, [login, token]);

  // What the inbox has shown with the app open is not worth a notification
  // later; the background check skips anything recorded here.
  const feedEvents = social.status === 'ready' ? social.events : null;
  useEffect(() => {
    if (!login || !feedEvents || token === DEMO_TOKEN) return;
    markSeen(login, feedEvents).catch(() => {});
  }, [feedEvents, login, token]);

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
        goToTab(INBOX);
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
  // The loading screen is built from the words alone; the repository only
  // means something on the widget, where there is room to place a line.
  const said = useMemo(() => words.map((word) => word.message), [words]);

  useEffect(() => {
    tokenStore.get().then((stored) => {
      // Web preview shortcut: #demo or #demo/4 boots fake data on a view,
      // numbered in reading order across every section.
      if (stored == null && Platform.OS === 'web') {
        const hash = window.location.hash;
        if (hash.startsWith('#demo')) {
          const pin = Number(hash.split('/')[1]);
          const target = FLAT[pin - 1];
          if (target) {
            setPages((current) =>
              current.map((page, index) =>
                index === target.tab ? target.page : page,
              ),
            );
            router.navigate(hrefOf(target.tab));
          }
          tokenStore.set(DEMO_TOKEN).then(() => setTokenState(DEMO_TOKEN));
          return;
        }
      }
      setTokenState(stored);
    });
    // Once, at launch: the router is stable for the life of the app.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (model && token !== DEMO_TOKEN) {
      syncWidget(model, words).catch(() => {});
    }
  }, [model, token, words]);

  /** Everything that belongs to one account's session, back to the start. */
  const resetSession = useCallback(async () => {
    await clearCachedLines();
    searched.current = false;
    setLines([]);
    setRefreshWords(true);
    setPages(SECTIONS.map(() => 0));
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

  const wanting = useMemo(() => wantsYou(social, triage.marks), [social, triage.marks]);

  const value = useMemo<Session>(
    () => ({
      token,
      setToken,
      contributions,
      model,
      scopes,
      prs,
      social,
      triage,
      activityState,
      activity,
      accounts,
      said,
      tab,
      goToTab,
      pages,
      goToPage,
      stack,
      nav,
      openEvent,
      switchTo,
      disconnect,
      wanting,
    }),
    [
      accounts,
      activity,
      activityState,
      contributions,
      disconnect,
      goToPage,
      goToTab,
      model,
      nav,
      openEvent,
      pages,
      prs,
      said,
      scopes,
      setToken,
      social,
      stack,
      switchTo,
      tab,
      token,
      triage,
      wanting,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
