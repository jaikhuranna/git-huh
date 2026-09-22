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

import { Rail } from '../src/components/Rail';
import { Body, Label } from '../src/components/Type';
import { Wordmark } from '../src/components/Wordmark';
import { PatForm } from '../src/components/PatForm';
import { useActivity } from '../src/hooks/useActivity';
import { useContributions } from '../src/hooks/useContributions';
import { useOpenPrs, type PrsState } from '../src/hooks/useOpenPrs';
import { useSocial, type SocialState } from '../src/hooks/useSocial';
import { useTokenScopes } from '../src/hooks/useTokenScopes';
import type { GitHubModel } from '../src/lib/contributions';
import { DEMO_TOKEN, tokenStore } from '../src/lib/token';
import { clearWidget, syncWidget } from '../src/lib/widgetBridge';
import type { Activity } from '../src/lib/activity';
import { EMPTY_ACTIVITY, spreadMessages } from '../src/lib/activity';
import { fetchCommitLines } from '../src/lib/commitLines';
import {
  cacheLines,
  clearCachedLines,
  isStale,
  readCachedLines,
  shuffle,
} from '../src/lib/messageCache';
import { ArchiveScreen } from '../src/screens/ArchiveScreen';
import { BriefScreen } from '../src/screens/BriefScreen';
import { ClockScreen } from '../src/screens/ClockScreen';
import { CardsScreen } from '../src/screens/CardsScreen';
import { DotsScreen } from '../src/screens/DotsScreen';
import { FlowScreen } from '../src/screens/FlowScreen';
import { HeyScreen } from '../src/screens/HeyScreen';
import { IndexScreen } from '../src/screens/IndexScreen';
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

/** One screen per pin on the board, in reading order. */
const SCREENS = [
  'hey',
  'now',
  'clock',
  'flow',
  'poster',
  'orbit',
  'weather',
  'cards',
  'index',
  'brief',
  'review',
  'dots',
  'archive',
] as const;

/** The `index` screen is the only one that needs the PR list. */
const PRS_PAGE = SCREENS.indexOf('index');

/**
 * Commit timestamps and PR bodies are a second, heavier request, so they are
 * only fetched once one of the screens that needs them is within reach.
 */
const ACTIVITY_PAGES = [
  SCREENS.indexOf('clock'),
  SCREENS.indexOf('cards'),
  SCREENS.indexOf('brief'),
  SCREENS.indexOf('review'),
];

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

function Page({
  index,
  active,
  model,
  prs,
  social,
  activity,
  activityLoading,
  onDisconnect,
  onOpenPull,
  width,
}: {
  index: number;
  /** True only for the page currently on screen — gates animation. */
  active: boolean;
  model: GitHubModel;
  prs: PrsState;
  social: SocialState;
  activity: Activity;
  activityLoading: boolean;
  onDisconnect: () => void;
  onOpenPull: (pull: OpenPull) => void;
  width: number;
}) {
  const name = SCREENS[index];
  return (
    <View style={{ width }}>
      {name === 'hey' && (
        <HeyScreen model={model} onDisconnect={onDisconnect} social={social} />
      )}
      {name === 'now' && <NowScreen model={model} />}
      {name === 'clock' && (
        <ClockScreen activity={activity} loading={activityLoading} />
      )}
      {name === 'flow' && <FlowScreen model={model} />}
      {name === 'poster' && <PosterScreen model={model} />}
      {name === 'orbit' && <OrbitScreen active={active} model={model} />}
      {name === 'weather' && <WeatherScreen model={model} />}
      {name === 'cards' && <CardsScreen activity={activity} model={model} />}
      {name === 'index' && (
        <IndexScreen
          onOpen={(pr) => onOpenPull({ repo: pr.repo, number: pr.number })}
          state={prs}
        />
      )}
      {name === 'brief' && (
        <BriefScreen
          activity={activity}
          loading={activityLoading}
          onOpen={(pr) => onOpenPull({ repo: pr.repo, number: pr.number })}
        />
      )}
      {name === 'review' && (
        <ReviewScreen activity={activity} loading={activityLoading} />
      )}
      {name === 'dots' && <DotsScreen model={model} />}
      {name === 'archive' && <ArchiveScreen model={model} />}
    </View>
  );
}

export default function Home() {
  const [token, setToken] = useState<TokenState>(undefined);
  const [page, setPage] = useState(0);
  const [openPull, setOpenPull] = useState<OpenPull | null>(null);
  const pager = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  const contributions = useContributions(token ?? null);
  const scopes = useTokenScopes(token ?? null);
  const model = contributions.status === 'ready' ? contributions.model : null;
  const login = model?.login ?? null;
  const prs = useOpenPrs(token ?? null, login, page === PRS_PAGE);
  // The feed lives on the front door, so it starts the moment we know who you
  // are rather than waiting for a page to come into view.
  const social = useSocial(token ?? null, login, page <= 1);
  const activityState = useActivity(
    token ?? null,
    login,
    ACTIVITY_PAGES.some((target) => Math.abs(page - target) <= 1),
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
  const [lines, setLines] = useState<string[]>([]);
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
      // Web preview shortcut: #demo or #demo/4 boots fake data on a screen.
      if (stored == null && Platform.OS === 'web') {
        const hash = window.location.hash;
        if (hash.startsWith('#demo')) {
          const pin = Number(hash.split('/')[1]);
          if (pin >= 1 && pin <= SCREENS.length) setPage(pin - 1);
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

  const goTo = (index: number) => {
    setPage(index);
    pager.current?.scrollTo({ animated: true, x: index * width });
  };

  const disconnect = async () => {
    if (token !== DEMO_TOKEN) await clearWidget().catch(() => {});
    await clearCachedLines();
    setLines([]);
    setRefreshWords(true);
    await tokenStore.clear();
    setToken(null);
    setPage(0);
    setOpenPull(null);
  };

  if (token === undefined) {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="opening the drawer" lines={words} />
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
        <LoadingScreen caption="reading your year" lines={words} />
      </>
    );
  }

  return (
    <>
      <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        <View style={styles.chrome}>
          <Wordmark size={20} />
          <View style={styles.chromeRight}>
            <Label>{SCREENS[page]}</Label>
            <Pressable accessibilityRole="button" onPress={disconnect}>
              <Label>{token === DEMO_TOKEN ? 'demo · exit' : 'disconnect'}</Label>
            </Pressable>
          </View>
        </View>

        {scopes === 'limited' && <ScopeNotice />}

        <View style={styles.body}>
          {model && (
            <ScrollView
              horizontal
              keyboardDismissMode="on-drag"
              onMomentumScrollEnd={(event) =>
                setPage(Math.round(event.nativeEvent.contentOffset.x / width))
              }
              pagingEnabled
              ref={pager}
              showsHorizontalScrollIndicator={false}
            >
              {SCREENS.map((name, index) => (
                <Page
                  activity={activity}
                  activityLoading={activityState.status === 'loading'}
                  active={index === page && openPull === null}
                  index={index}
                  key={name}
                  model={model}
                  onDisconnect={disconnect}
                  onOpenPull={setOpenPull}
                  prs={prs}
                  social={social}
                  width={width}
                />
              ))}
            </ScrollView>
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

        {model && <Rail names={SCREENS} onSelect={goTo} page={page} />}
      </SafeAreaView>

      {/* Over the pager rather than inside it: the detail page has its own
          horizontal scrollers, and nested inside the pager every one of them
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
  chromeRight: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 12,
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
