import { memo, useCallback, useEffect, useRef } from 'react';
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar } from '../components/Avatar';
import { TOKEN_SETTINGS_URL } from '../components/PatForm';
import { Segments } from '../components/Segments';
import { Label } from '../components/Type';
import { Wordmark } from '../components/Wordmark';
import { shareKindOf } from '../lib/shareData';
import { savedAge } from '../lib/store';
import { ArchiveScreen as ArchiveView } from '../screens/ArchiveScreen';
import { BriefScreen as BriefView } from '../screens/BriefScreen';
import { CardsScreen as CardsView } from '../screens/CardsScreen';
import { ClockScreen as ClockView } from '../screens/ClockScreen';
import { DotsScreen as DotsView } from '../screens/DotsScreen';
import { FlowScreen as FlowView } from '../screens/FlowScreen';
import { HeyScreen as HeyView } from '../screens/HeyScreen';
import { InboxScreen as InboxView } from '../screens/InboxScreen';
import { IndexScreen as IndexView } from '../screens/IndexScreen';
import { NowScreen as NowView } from '../screens/NowScreen';
import { OrbitScreen as OrbitView } from '../screens/OrbitScreen';
import { PosterScreen as PosterView } from '../screens/PosterScreen';
import { ReviewScreen as ReviewView } from '../screens/ReviewScreen';
import { WeatherScreen as WeatherView } from '../screens/WeatherScreen';
import { colors, radii, space, themed } from '../theme';
import { SECTIONS, type ScreenName, type SectionView } from './sections';
import { useSession } from './session';

/**
 * Every section stays mounted once opened, and the session changes often — the
 * inbox refreshes, a page is pushed over everything. Memoised, a screen redraws
 * when its own data does, not whenever any of the fourteen's does.
 */
const ArchiveScreen = memo(ArchiveView);
const BriefScreen = memo(BriefView);
const CardsScreen = memo(CardsView);
const ClockScreen = memo(ClockView);
const DotsScreen = memo(DotsView);
const FlowScreen = memo(FlowView);
const HeyScreen = memo(HeyView);
const InboxScreen = memo(InboxView);
const IndexScreen = memo(IndexView);
const NowScreen = memo(NowView);
const OrbitScreen = memo(OrbitView);
const PosterScreen = memo(PosterView);
const ReviewScreen = memo(ReviewView);
const WeatherScreen = memo(WeatherView);

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
 * One section's segmented control and the pager holding its views.
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
  // off screen cannot be trusted to have kept its offset, and landing on view
  // one while the control says view three is worse than a jump.
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
        // A one-view section has nothing to page to, and a pager that still
        // claims horizontal drags would eat the inbox's swipe actions.
        scrollEnabled={views.length > 1}
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

/** A tab: the wordmark, the scope strip if it applies, and the section. */
export function SectionScreen({ index }: { index: number }) {
  const session = useSession();
  const { width } = useWindowDimensions();
  const {
    activity,
    activityState,
    contributions,
    model,
    nav,
    pages,
    prs,
    social,
    stack,
    tab,
    triage,
  } = session;
  const section = SECTIONS[index];
  const loadingActivity = activityState.status === 'loading';

  const { goToPage } = session;
  const openPull = useCallback(
    (pr: { repo: string; number: number }) =>
      nav.open({ kind: 'pull', repo: pr.repo, number: pr.number }),
    [nav],
  );
  const openAccount = useCallback(() => nav.open({ kind: 'account' }), [nav]);
  const view = section.views[pages[index]]?.name ?? section.views[0].name;
  const shareable = shareKindOf(view) != null;
  const onPage = useCallback((page: number) => goToPage(index, page), [goToPage, index]);

  const render = (name: ScreenName, live: boolean) => {
    if (!model) return null;
    switch (name) {
      case 'hey':
        return (
          <HeyScreen
            active={live}
            home={session.home}
            lines={session.lines}
            model={model}
            onOpen={session.openEvent}
            onSettings={openAccount}
            social={social}
          />
        );
      case 'now':
        return <NowScreen model={model} />;
      case 'weather':
        return <WeatherScreen model={model} />;
      case 'clock':
        return <ClockScreen activity={activity} loading={loadingActivity} />;
      case 'inbox':
        return <InboxScreen onOpen={session.openEvent} state={social} triage={triage} />;
      case 'index':
        return (
          <IndexScreen onOpen={openPull} state={prs} />
        );
      case 'brief':
        return (
          <BriefScreen activity={activity} loading={loadingActivity} onOpen={openPull} />
        );
      case 'review':
        return <ReviewScreen activity={activity} loading={loadingActivity} />;
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
        return <DotsScreen active={live} lines={session.lines} model={model} />;
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.screen}>
      <View style={styles.chrome}>
        <Wordmark size={17} />
        <View style={styles.corner}>
          {contributions.status === 'ready' &&
            contributions.offline &&
            contributions.savedAt != null && (
              <Label numberOfLines={1} style={styles.handle}>
                offline · {savedAge(contributions.savedAt)}
              </Label>
            )}
          {shareable && model && (
            <Pressable
              accessibilityLabel="share this view as an image"
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => nav.open({ kind: 'share', view })}
              style={styles.share}
            >
              <Label style={styles.shareLabel}>share</Label>
            </Pressable>
          )}
          {model && (
            <Pressable
              accessibilityLabel="account, notifications and settings"
              accessibilityRole="button"
              hitSlop={8}
              onPress={openAccount}
              style={styles.avatars}
            >
              {(model.accounts ?? [model.login]).slice(0, 3).map((login, position) => (
                <Avatar
                  key={login}
                  login={login}
                  size={28}
                  style={position > 0 ? styles.stacked : undefined}
                />
              ))}
            </Pressable>
          )}
        </View>
      </View>

      {session.scopes === 'limited' && <ScopeNotice />}

      <View style={styles.body}>
        <SectionPager
          active={index === tab && stack.length === 0}
          onPage={onPage}
          page={pages[index]}
          render={render}
          views={section.views}
          width={width}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    chrome: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    corner: {
      alignItems: 'center',
      flexDirection: 'row',
      flexShrink: 1,
      gap: 10,
    },
    handle: {
      color: colors.ink40,
      flexShrink: 1,
    },
    share: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 11,
      paddingVertical: 5,
    },
    shareLabel: {
      color: colors.ink,
    },
    avatars: {
      flexDirection: 'row',
    },
    stacked: {
      marginLeft: -9,
    },
    notice: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.tile,
      flexDirection: 'row',
      gap: 8,
      marginBottom: 6,
      marginHorizontal: space.gutter,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    noticeDot: {
      backgroundColor: colors.no,
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
    },
    pager: {
      flex: 1,
    },
  }),
);
