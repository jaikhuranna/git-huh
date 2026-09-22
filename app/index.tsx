import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Segments } from '../src/components/Segments';
import { TabBar } from '../src/components/TabBar';
import { Body, Label } from '../src/components/Type';
import { Wordmark } from '../src/components/Wordmark';
import { PatForm } from '../src/components/PatForm';
import { useActivity } from '../src/hooks/useActivity';
import { useContributions } from '../src/hooks/useContributions';
import { useOpenPrs } from '../src/hooks/useOpenPrs';
import { useSocial, type SocialState } from '../src/hooks/useSocial';
import { useTokenScopes } from '../src/hooks/useTokenScopes';
import type { GitHubModel } from '../src/lib/contributions';
import { DEMO_TOKEN, tokenStore } from '../src/lib/token';
import { clearWidget, syncWidget } from '../src/lib/widgetBridge';
import { EMPTY_ACTIVITY, spreadMessages } from '../src/lib/activity';
import { fetchCommitLines } from '../src/lib/commitLines';
import {
  cacheLines,
  clearCachedLines,
  isStale,
  readCachedLines,
  shuffle,
  type CommitLine,
} from '../src/lib/messageCache';
import { ArchiveScreen } from '../src/screens/ArchiveScreen';
import { BriefScreen } from '../src/screens/BriefScreen';
import { ClockScreen } from '../src/screens/ClockScreen';
import { CardsScreen } from '../src/screens/CardsScreen';
import { DotsScreen } from '../src/screens/DotsScreen';
import { FlowScreen } from '../src/screens/FlowScreen';
import { HeyScreen } from '../src/screens/HeyScreen';
import { IndexScreen } from '../src/screens/IndexScreen';
import { InboxScreen } from '../src/screens/InboxScreen';
import { LoadingScreen } from '../src/screens/LoadingScreen';
import { NowScreen } from '../src/screens/NowScreen';
import { OrbitScreen } from '../src/screens/OrbitScreen';
import { PosterScreen } from '../src/screens/PosterScreen';
import { PullScreen } from '../src/screens/PullScreen';
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { WeatherScreen } from '../src/screens/WeatherScreen';
import { colors, space } from '../src/theme';

/** undefined = restoring from the keystore, null = signed out. */
type TokenState = string | null | undefined;

/** Which pull request the detail overlay is showing, if any. */
interface OpenPull {
  repo: string;
  number: number;
}

type ScreenName =
  | 'hey'
  | 'now'
  | 'weather'
  | 'clock'
  | 'inbox'
  | 'index'
  | 'brief'
  | 'review'
  | 'cards'
  | 'poster'
  | 'flow'
  | 'orbit'
  | 'archive'
  | 'dots';

interface SectionView {
  name: ScreenName;
  /** What the segmented control calls it — one word wherever possible. */
  label: string;
}

interface Section {
  key: string;
  views: readonly SectionView[];
}

/**
 * Five sections, and every screen belongs to exactly one.
 *
 * The app used to be thirteen equal pages behind a scrolling rail, which
 * meant the answer to "where is the thing I want" was "swipe until it turns
 * up". These are the four questions the screens actually answer — what today
 * looks like, what wants me, what I am shipping, what the year was — plus
 * `lab`, which is where an artefact lives until it has earned a place in one
 * of the other four.
 *
 * The grouping, the count and the shape all follow Apple's guidance: a flat
 * bar of persistent, labelled destinations (three to five), content and not
 * actions, no drawer, nothing behind a menu. Views *inside* a section are a
 * segmented control at the top, because they are views of one subject.
 */
const SECTIONS: readonly Section[] = [
  {
    key: 'today',
    views: [
      { name: 'hey', label: 'you' },
      { name: 'now', label: 'now' },
      { name: 'weather', label: 'weather' },
      { name: 'clock', label: 'hours' },
    ],
  },
  { key: 'inbox', views: [{ name: 'inbox', label: 'recent' }] },
  {
    key: 'work',
    views: [
      { name: 'index', label: 'pulls' },
      { name: 'brief', label: 'brief' },
      { name: 'review', label: 'cycle' },
      { name: 'cards', label: 'repos' },
    ],
  },
  {
    key: 'year',
    views: [
      { name: 'poster', label: 'weeks' },
      { name: 'flow', label: 'split' },
      { name: 'orbit', label: 'languages' },
      { name: 'archive', label: 'years' },
    ],
  },
  { key: 'lab', views: [{ name: 'dots', label: 'join the dots' }] },
];

/** Every view in reading order — used by the `#demo/n` web shortcut. */
const FLAT = SECTIONS.flatMap((section, tab) =>
  section.views.map((_, page) => ({ tab, page })),
);

/** Lines kept for the loading screen — it draws about 26 at a time. */
const POOL_SIZE = 40;

/** Where to mint a token that can actually see the whole account. */
const TOKEN_SETTINGS_URL =
  'https://github.com/settings/tokens/new?scopes=read:user,repo&description=git-huh';

/**
 * The one thing the app cannot fix for you.
 *
 * A token without `repo` gets the public half of your year and nothing says
 * so: the grid comes back flat, today reads zero and the flow diagram adds up
 * to a handful of contributions. Silence is the worst possible answer, so
 * this strip names the cause and links to a token that has the scope.
 */
function ScopeNotice() {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => Linking.openURL(TOKEN_SETTINGS_URL).catch(() => {})}
      style={styles.notice}
    >
      <View style={styles.noticeDot} />
      <Label style={styles.noticeText}>
        this token has no repo scope · private work is invisible to it
      </Label>
    </Pressable>
  );
}

/**
 * One section: its segmented control and the pager holding its views.
 *
 * The pager stops at the section's own edges. A swipe never crosses into
 * another section — sections are chosen from the bar, deliberately, and a
 * horizontal drag that can land you three destinations away is the fault the
 * old thirteen-page rail had.
 */
function SectionPager({
  views,
  page,
  onPage,
  active,
  width,
  render,
}: {
  views: readonly SectionView[];
  page: number;
  onPage: (index: number) => void;
  active: boolean;
  width: number;
  render: (name: ScreenName, live: boolean) => React.ReactNode;
}) {
  const pager = useRef<ScrollView>(null);
  const shown = useRef(page);

  // Also runs when the section comes back into view: a pager that has been
  // `display: none` cannot be trusted to have kept its offset, and landing
  // on view one while the control says view three is worse than a jump.
  useEffect(() => {
    if (!active) return;
    pager.current?.scrollTo({ animated: shown.current !== page, x: page * width });
    shown.current = page;
  }, [active, page, width]);

  return (
    <>
      {views.length > 1 && (
        <Segments
          current={page}
          items={views.map((view) => view.label)}
          onSelect={onPage}
        />
      )}
      <ScrollView
        horizontal
        keyboardDismissMode="on-drag"
        onMomentumScrollEnd={(event) => {
          const next = Math.round(event.nativeEvent.contentOffset.x / width);
          shown.current = next;
          onPage(next);
        }}
        pagingEnabled
        ref={pager}
        showsHorizontalScrollIndicator={false}
        style={styles.pager}
      >
        {views.map((view, index) => (
          <View key={view.name} style={{ width }}>
            {render(view.name, active && index === page)}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

/** Events that are addressed to you rather than about you — the tab count. */
function wantsYou(social: SocialState): number {
  if (social.status !== 'ready') return 0;
  return social.events.filter(
    (event) =>
      event.kind === 'review-request' ||
      event.kind === 'mention' ||
      (event.kind === 'review' && event.state === 'CHANGES_REQUESTED'),
  ).length;
}

export default function Home() {
  const [token, setToken] = useState<TokenState>(undefined);
  const [tab, setTab] = useState(0);
  // One page per section, so a section is where you left it when you come
  // back to it — which is what a tab bar promises.
  const [pages, setPages] = useState<number[]>(() => SECTIONS.map(() => 0));
  const [visited, setVisited] = useState<number[]>([0]);
  const [openPull, setOpenPull] = useState<OpenPull | null>(null);
  const { width } = useWindowDimensions();

  const section = SECTIONS[tab].key;
  const view = SECTIONS[tab].views[pages[tab]]?.name ?? SECTIONS[tab].views[0].name;

  const contributions = useContributions(token ?? null);
  const scopes = useTokenScopes(token ?? null);
  const model = contributions.status === 'ready' ? contributions.model : null;
  const login = model?.login ?? null;
  const prs = useOpenPrs(token ?? null, login, section === 'work');
  // The inbox is the reason to open the app, so it is fetched from the first
  // section rather than waiting for its own tab: the count on the bar has to
  // be true before you tap it.
  const social = useSocial(
    token ?? null,
    login,
    section === 'inbox' || section === 'today',
  );
  // Commit timestamps and PR bodies are a second, heavier request — asked
  // for one view before anything needs them, never on launch.
  const activityState = useActivity(
    token ?? null,
    login,
    section === 'work' || view === 'weather' || view === 'clock',
  );
  const activity =
    activityState.status === 'ready' ? activityState.activity : EMPTY_ACTIVITY;

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
            setTab(target.tab);
            setVisited([target.tab]);
            setPages((current) =>
              current.map((page, index) =>
                index === target.tab ? target.page : page,
              ),
            );
          }
          tokenStore.set(DEMO_TOKEN).then(() => setToken(DEMO_TOKEN));
          return;
        }
      }
      setToken(stored);
    });
  }, []);

  useEffect(() => {
    if (model && token !== DEMO_TOKEN) {
      syncWidget(model, words).catch(() => {});
    }
  }, [model, token, words]);

  const goToTab = (index: number) => {
    setTab(index);
    // Sections mount the first time they are opened and stay mounted after
    // that: paying for all fourteen views on launch is what the old pager
    // did, and paying again on every tap is what a fresh mount would cost.
    setVisited((current) =>
      current.includes(index) ? current : [...current, index],
    );
  };

  const goToPage = (index: number, page: number) =>
    setPages((current) =>
      current.map((value, position) => (position === index ? page : value)),
    );

  const disconnect = async () => {
    if (token !== DEMO_TOKEN) await clearWidget().catch(() => {});
    await clearCachedLines();
    setLines([]);
    setRefreshWords(true);
    await tokenStore.clear();
    setToken(null);
    setTab(0);
    setPages(SECTIONS.map(() => 0));
    setVisited([0]);
    setOpenPull(null);
  };

  const screen = (model: GitHubModel) =>
    function render(name: ScreenName, live: boolean) {
      switch (name) {
        case 'hey':
          return (
            <HeyScreen
              demo={token === DEMO_TOKEN}
              model={model}
              onDisconnect={disconnect}
            />
          );
        case 'now':
          return <NowScreen model={model} />;
        case 'weather':
          return <WeatherScreen model={model} />;
        case 'clock':
          return (
            <ClockScreen
              activity={activity}
              loading={activityState.status === 'loading'}
            />
          );
        case 'inbox':
          return <InboxScreen onOpen={setOpenPull} state={social} />;
        case 'index':
          return (
            <IndexScreen
              onOpen={(pr) => setOpenPull({ repo: pr.repo, number: pr.number })}
              state={prs}
            />
          );
        case 'brief':
          return (
            <BriefScreen
              activity={activity}
              loading={activityState.status === 'loading'}
              onOpen={(pr) => setOpenPull({ repo: pr.repo, number: pr.number })}
            />
          );
        case 'review':
          return (
            <ReviewScreen
              activity={activity}
              loading={activityState.status === 'loading'}
            />
          );
        case 'cards':
          return <CardsScreen activity={activity} model={model} />;
        case 'poster':
          return <PosterScreen model={model} />;
        case 'flow':
          return <FlowScreen model={model} />;
        case 'orbit':
          return <OrbitScreen active={live} model={model} />;
        case 'archive':
          return <ArchiveScreen model={model} />;
        case 'dots':
          return <DotsScreen model={model} />;
      }
    };

  if (token === undefined) {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="opening the drawer" lines={said} />
      </>
    );
  }

  if (token === null) {
    return (
      <PatForm
        onTokenVerified={async (verified) => {
          await tokenStore.set(verified);
          setToken(verified);
        }}
      />
    );
  }

  if (contributions.status === 'loading' || contributions.status === 'idle') {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="reading your year" lines={said} />
      </>
    );
  }

  const tabs = SECTIONS.map((item) => ({
    key: item.key,
    label: item.key,
    badge: item.key === 'inbox' ? wantsYou(social) : undefined,
  }));

  return (
    <>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.chrome}>
          <Wordmark size={20} />
          <Label style={styles.handle}>
            {model ? `~${model.login.toLowerCase()}` : ''}
          </Label>
        </View>

        {scopes === 'limited' && <ScopeNotice />}

        <View style={styles.body}>
          {model &&
            SECTIONS.map((item, index) =>
              visited.includes(index) ? (
                <View
                  key={item.key}
                  style={index === tab ? styles.section : styles.hidden}
                >
                  <SectionPager
                    active={index === tab && openPull === null}
                    onPage={(page) => goToPage(index, page)}
                    page={pages[index]}
                    render={screen(model)}
                    views={item.views}
                    width={width}
                  />
                </View>
              ) : null,
            )}

          {contributions.status === 'error' && (
            <View style={styles.errorStack}>
              <Body style={styles.errorText}>
                {contributions.error.kind === 'invalid-token'
                  ? 'that token expired or was revoked'
                  : 'could not reach github'}
              </Body>
              <Pressable accessibilityRole="button" onPress={disconnect}>
                <Label style={styles.reset}>start over</Label>
              </Pressable>
            </View>
          )}
        </View>

        {model && <TabBar current={tab} onSelect={goToTab} tabs={tabs} />}
      </SafeAreaView>

      {/* Over the sections rather than inside one: the detail page has its
          own horizontal scrollers, and nested in a pager every one of them
          would lose its drag to the page swipe. */}
      {openPull && (
        <View style={styles.overlay}>
          <PullScreen
            number={openPull.number}
            onClose={() => setOpenPull(null)}
            repo={openPull.repo}
            token={token}
          />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  overlay: {
    backgroundColor: colors.canvas,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  chrome: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 10,
    paddingHorizontal: space.gutter,
    paddingTop: 14,
  },
  handle: {
    color: colors.ink40,
  },
  notice: {
    alignItems: 'center',
    backgroundColor: colors.recess,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
    marginHorizontal: space.gutter,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  noticeDot: {
    backgroundColor: colors.red,
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  noticeText: {
    color: colors.ink70,
    flex: 1,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  section: {
    flex: 1,
  },
  // Kept mounted and off screen: React Native honours `display: none`, so a
  // section that has been opened once keeps its state without drawing.
  hidden: {
    display: 'none',
  },
  pager: {
    flex: 1,
  },
  errorStack: {
    alignItems: 'center',
    flex: 1,
    gap: 16,
    justifyContent: 'center',
    paddingHorizontal: space.gutter,
  },
  errorText: {
    color: colors.red,
    textAlign: 'center',
  },
  reset: {
    color: colors.ink,
    textDecorationLine: 'underline',
  },
});
