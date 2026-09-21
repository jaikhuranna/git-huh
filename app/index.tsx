import { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import type { GitHubModel } from '../src/lib/contributions';
import { DEMO_TOKEN, tokenStore } from '../src/lib/token';
import { clearWidget, syncWidget } from '../src/lib/widgetBridge';
import type { Activity } from '../src/lib/activity';
import { EMPTY_ACTIVITY, spreadMessages } from '../src/lib/activity';
import {
  cacheLines,
  clearCachedLines,
  readCachedLines,
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
import { ReviewScreen } from '../src/screens/ReviewScreen';
import { WeatherScreen } from '../src/screens/WeatherScreen';
import { colors, space } from '../src/theme';

/** undefined = restoring from the keystore, null = signed out. */
type TokenState = string | null | undefined;

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

function Page({
  index,
  model,
  prs,
  social,
  activity,
  activityLoading,
  onDisconnect,
  width,
}: {
  index: number;
  model: GitHubModel;
  prs: PrsState;
  social: SocialState;
  activity: Activity;
  activityLoading: boolean;
  onDisconnect: () => void;
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
      {name === 'orbit' && <OrbitScreen model={model} />}
      {name === 'weather' && <WeatherScreen model={model} />}
      {name === 'cards' && <CardsScreen activity={activity} model={model} />}
      {name === 'index' && <IndexScreen state={prs} />}
      {name === 'brief' && (
        <BriefScreen activity={activity} loading={activityLoading} />
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
  const pager = useRef<ScrollView>(null);
  const { width } = useWindowDimensions();

  const contributions = useContributions(token ?? null);
  const model = contributions.status === 'ready' ? contributions.model : null;
  const prs = useOpenPrs(token ?? null, model?.login ?? null, page === PRS_PAGE);
  // The feed lives on the front door, so it starts the moment we know who you
  // are rather than waiting for a page to come into view.
  const social = useSocial(token ?? null, model?.login ?? null, page <= 1);
  const activityState = useActivity(
    token ?? null,
    model?.login ?? null,
    ACTIVITY_PAGES.some((target) => Math.abs(page - target) <= 1),
  );
  const activity =
    activityState.status === 'ready' ? activityState.activity : EMPTY_ACTIVITY;

  // The loading screen is written in your own commit messages, which can only
  // come from the run before this one — so this session's copy is saved for
  // next time, and last session's is what you see today.
  const [cached, setCached] = useState<string[]>([]);
  const commits =
    activityState.status === 'ready' ? activityState.activity.commits : null;
  const fresh = useMemo(
    () => (commits ? spreadMessages(commits, 26) : []),
    [commits],
  );
  const lines = fresh.length > 0 ? fresh : cached;

  useEffect(() => {
    readCachedLines().then(setCached);
  }, []);

  useEffect(() => {
    if (fresh.length === 0 || token === DEMO_TOKEN) return;
    cacheLines(fresh).catch(() => {});
  }, [fresh, token]);

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
      syncWidget(model).catch(() => {});
    }
  }, [model, token]);

  const goTo = (index: number) => {
    setPage(index);
    pager.current?.scrollTo({ animated: true, x: index * width });
  };

  const disconnect = async () => {
    if (token !== DEMO_TOKEN) await clearWidget().catch(() => {});
    await clearCachedLines();
    setCached([]);
    await tokenStore.clear();
    setToken(null);
    setPage(0);
  };

  if (token === undefined) {
    return (
      <>
        <StatusBar style="light" />
        <LoadingScreen caption="opening the drawer" lines={lines} />
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
        <LoadingScreen caption="reading your year" lines={lines} />
      </>
    );
  }

  return (
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
                index={index}
                key={name}
                model={model}
                onDisconnect={disconnect}
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
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
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
