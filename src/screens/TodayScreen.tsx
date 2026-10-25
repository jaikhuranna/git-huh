import { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Micro } from '../components/Type';
import { useFeedHistory } from '../hooks/useFeedHistory';
import { HOME_BLOCKS, homeEvents } from '../lib/home';
import type { SocialEvent } from '../lib/social';
import { GitHubGate } from '../shell/SectionScreen';
import { useSessionActions, useSessionData } from '../shell/session';
import { colors, themed } from '../theme';
import { ClockScreen } from './ClockScreen';
import { FeedEnd, HeyScreen, HomeFeedRow } from './HeyScreen';
import { NowScreen } from './NowScreen';
import { Block, ScreenHead, VirtualPage } from './shared';

/**
 * Every block redraws when its own data does, not whenever any of the
 * session's does: the inbox refreshes and pages are pushed while this one
 * sits mounted under them.
 */
const Hey = memo(HeyScreen);
const Now = memo(NowScreen);
const Clock = memo(ClockScreen);
const FeedRow = memo(HomeFeedRow);

/**
 * `today` — how am I doing — as one page, read top to bottom:
 *
 * 1. `you`: the greeting and the widget's card, and the year in a sentence.
 * 2. `today`: the count in the widget's dots, the weather, the last seven
 *    and thirty days, the languages.
 * 3. `hours`: when you commit, from real timestamps.
 * 4. what people said on your pull requests — last, because it pages in
 *    older history as you scroll and so has no end.
 *
 * `hours` is the one block that needs the commit history, a second and
 * heavier request; it is asked for once the page is scrolled towards it,
 * never on launch. The feed is the list's rows, so only a window of them
 * stays mounted; the charts stay the header.
 */
export function TodayScreen({ active }: { active: boolean }) {
  const { nav, openEvent, wantActivity } = useSessionActions();
  const { activity, activityState, home, lines, model, social } = useSessionData();
  const filterKey = home.blocks.join(',');
  const history = useFeedHistory(
    nav.token,
    nav.login,
    active && home.blocks.length > 0,
    filterKey,
  );
  const rows = useMemo(
    () => homeEvents(social.status === 'ready' ? social.events : [], history.events, home),
    [history.events, home, social],
  );

  const openAccount = useCallback(() => nav.open({ kind: 'account' }), [nav]);
  const shareYear = useCallback(() => nav.open({ kind: 'share', card: 'year' }), [nav]);
  const shareHours = useCallback(() => nav.open({ kind: 'share', card: 'hours' }), [nav]);
  const pageMore = useCallback(() => {
    if (active && home.blocks.length > 0) history.more(false);
  }, [active, history, home.blocks.length]);
  const renderItem = useCallback(
    ({ item }: { item: SocialEvent }) => <FeedRow event={item} onOpen={openEvent} />,
    [openEvent],
  );

  // The shell mounts the tabs before the year is ready, so a missing model is
  // an inline waiting or failure state, not a blank page.
  if (!model) return <GitHubGate>{null}</GitHubGate>;

  const title =
    home.blocks.length === 0
      ? 'nothing chosen'
      : HOME_BLOCKS.filter((block) => home.blocks.includes(block.key))
          .map((block) => block.label)
          .join(' · ');

  const header = (
    <View style={styles.header}>
      <Hey active={active} lines={lines} model={model} onShare={shareYear} />
      <Now model={model} />
      <Clock
        activity={activity}
        loading={activityState.status !== 'ready'}
        onShare={shareHours}
      />
      <Block>
        <ScreenHead
          action={{ hint: 'choose what is listed here', label: 'change', onPress: openAccount }}
          left={title}
        />
        {home.blocks.length === 0 && (
          <Micro style={styles.blockNote}>
            pick what shows here from the account page, top right
          </Micro>
        )}
        {home.blocks.length > 0 && social.status === 'error' && rows.length === 0 && (
          <Micro style={styles.blockNote}>github would not hand over the feed</Micro>
        )}
      </Block>
    </View>
  );

  return (
    <VirtualPage
      blocks
      data={home.blocks.length > 0 ? rows : []}
      footer={
        home.blocks.length > 0 ? (
          <FeedEnd
            history={history}
            oldest={rows[rows.length - 1]}
            rows={rows.length}
            social={social}
          />
        ) : null
      }
      header={header}
      keyExtractor={keyOf}
      onDeep={wantActivity}
      onEnd={pageMore}
      renderItem={renderItem}
    />
  );
}

function keyOf(event: SocialEvent): string {
  return event.id;
}

const styles = themed(() =>
  StyleSheet.create({
    header: {
      gap: 34,
    },
    blockNote: {
      color: colors.ink40,
      lineHeight: 14,
    },
  }),
);
