import { useMemo, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Body, Data, Label, Micro } from './Type';
import type { SocialState } from '../hooks/useSocial';
import type { Triage } from '../hooks/useTriage';
import {
  filterEvents,
  SOCIAL_FILTERS,
  type SocialEvent,
  type SocialFilter,
} from '../lib/social';
import { stateOf, type TriageState } from '../lib/triage';
import { ago } from '../screens/shared';
import { colors, radii } from '../theme';

// The feed has a section to itself, so it lists what it has rather than the
// dozen rows that fitted under the greeting.
const MAX_ROWS = 40;
/** How far a row has to travel before letting go of it counts. */
const COMMIT_AT = 88;

type View_ = SocialFilter | 'snoozed' | 'done';
const FOLDERS = ['snoozed', 'done'] as const;

/**
 * The social side of GitHub, which is the whole of the `inbox` section: who
 * commented on your pull requests, who reviewed them, who asked for your
 * review, who pulled you into a thread — and your own open pull requests
 * underneath it all.
 *
 * Every row is a real event with the text attached, and every row opens the
 * thread it came from, inside the app. The filter is the point: on a busy
 * week the feed is mostly review noise and you want the two comments that
 * were meant for you. Then you put each one away — swipe left for `done`,
 * right for `snooze` — and the two folders at the end of the chips are where
 * they went. Anything someone writes on again comes back on its own.
 */
export function SocialFeed({
  state,
  triage,
  onOpen,
}: {
  state: SocialState;
  triage: Triage;
  onOpen: (event: SocialEvent) => void;
}) {
  const [view, setView] = useState<View_>('all');

  const events = useMemo(
    () => (state.status === 'ready' ? state.events : []),
    [state],
  );
  const byState = (wanted: TriageState) =>
    events.filter((event) => stateOf(event, triage.marks) === wanted);
  const open = byState('open');

  const folder = view === 'snoozed' || view === 'done';
  const rows = (folder ? byState(view) : filterEvents(open, view)).slice(0, MAX_ROWS);

  const count = (value: View_) =>
    value === 'snoozed' || value === 'done'
      ? byState(value).length
      : filterEvents(open, value).length;

  return (
    <View style={styles.section}>
      <View style={styles.chips}>
        {[...SOCIAL_FILTERS, ...FOLDERS].map((value) => {
          const on = value === view;
          const isFolder = value === 'snoozed' || value === 'done';
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={value}
              onPress={() => setView(value)}
              style={[styles.chip, isFolder && styles.folder, on && styles.chipOn]}
            >
              <Label style={on ? styles.chipLabelOn : undefined}>
                {value}
                {state.status === 'ready' ? ` ${count(value)}` : ''}
              </Label>
            </Pressable>
          );
        })}
      </View>

      {state.status === 'ready' && rows.length > 0 && (
        <Micro style={styles.hint}>
          {folder
            ? 'swipe either way · back to the inbox'
            : 'swipe left · done    swipe right · snooze till 9:00'}
        </Micro>
      )}

      {state.status === 'loading' && (
        <Label style={styles.note}>reading the room…</Label>
      )}

      {state.status === 'error' && (
        <Label style={styles.error}>
          github would not hand over the feed · check the token still has repo
          access
        </Label>
      )}

      {state.status === 'ready' && rows.length === 0 && (
        <Label style={styles.note}>
          {events.length === 0
            ? 'nothing new · quiet week'
            : view === 'done'
              ? 'nothing put away yet'
              : view === 'snoozed'
                ? 'nothing waiting for the morning'
                : open.length === 0
                  ? 'inbox zero · everything is handled'
                  : `no ${view} left in the inbox`}
        </Label>
      )}

      {rows.map((event) => (
        <SwipeRow
          folder={folder}
          key={event.id}
          onDone={() => triage.done(event)}
          onReopen={() => triage.reopen(event)}
          onSnooze={() => triage.snooze(event)}
        >
          <FeedRow event={event} onOpen={() => onOpen(event)} />
        </SwipeRow>
      ))}
    </View>
  );
}

/**
 * A row you can throw. Left is `done`, right is `snooze`; inside a folder
 * either direction puts it back. The words for both actions sit under the
 * row and are uncovered as it moves, so the gesture says what it will do
 * before you let go — and the same actions are on the row for a screen
 * reader, because a swipe is not the only way anyone should be able to do
 * this.
 */
function SwipeRow({
  children,
  folder,
  onDone,
  onSnooze,
  onReopen,
}: {
  children: React.ReactNode;
  folder: boolean;
  onDone: () => void;
  onSnooze: () => void;
  onReopen: () => void;
}) {
  const { width } = useWindowDimensions();
  // One value per row for its whole life; state rather than a ref, because it
  // is read while rendering the transform.
  const [x] = useState(() => new Animated.Value(0));

  const leave = (direction: 1 | -1, then: () => void) =>
    Animated.timing(x, {
      duration: 160,
      toValue: direction * width,
      useNativeDriver: false,
    }).start(() => {
      then();
      x.setValue(0);
    });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          Math.abs(gesture.dx) > 12 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.6,
        onPanResponderMove: (_, gesture) => x.setValue(gesture.dx),
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx <= -COMMIT_AT) leave(-1, folder ? onReopen : onDone);
          else if (gesture.dx >= COMMIT_AT) leave(1, folder ? onReopen : onSnooze);
          else Animated.spring(x, { toValue: 0, useNativeDriver: false }).start();
        },
        onPanResponderTerminate: () =>
          Animated.spring(x, { toValue: 0, useNativeDriver: false }).start(),
      }),
    // `leave` closes over the handlers, which change with the row's folder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [folder, onDone, onReopen, onSnooze, width],
  );

  return (
    <View
      accessibilityActions={
        folder
          ? [{ name: 'reopen', label: 'back to the inbox' }]
          : [
              { name: 'done', label: 'done' },
              { name: 'snooze', label: 'snooze until 9:00' },
            ]
      }
      onAccessibilityAction={(event) => {
        const name = event.nativeEvent.actionName;
        if (name === 'done') onDone();
        if (name === 'snooze') onSnooze();
        if (name === 'reopen') onReopen();
      }}
      style={styles.swipe}
    >
      <View style={styles.under}>
        <Label style={styles.underLeft}>{folder ? 'back' : 'snooze'}</Label>
        <Label style={styles.underRight}>{folder ? 'back' : 'done'}</Label>
      </View>
      <Animated.View
        {...responder.panHandlers}
        style={[styles.over, { transform: [{ translateX: x }] }]}
      >
        {children}
      </Animated.View>
    </View>
  );
}

interface Mark {
  color: string;
  phrase: string;
}

/** Colour marks the category; the phrase says it in words as well. */
function markOf(event: SocialEvent): Mark {
  switch (event.kind) {
    case 'comment':
      return { color: colors.blue, phrase: 'commented on' };
    case 'review':
      if (event.state === 'APPROVED') {
        return { color: colors.green, phrase: 'approved' };
      }
      if (event.state === 'CHANGES_REQUESTED') {
        return { color: colors.red, phrase: 'requested changes on' };
      }
      return { color: colors.yellow, phrase: 'reviewed' };
    case 'review-request':
      return { color: colors.purple, phrase: 'asked you to review' };
    case 'mention':
      return { color: colors.pink, phrase: 'mentioned you in' };
    case 'open':
      return { color: colors.ink, phrase: 'your pull request' };
  }
}

function FeedRow({
  event,
  onOpen,
}: {
  event: SocialEvent;
  onOpen: () => void;
}) {
  const mark = markOf(event);
  // On the canned kinds the excerpt only repeats the phrase; on a comment or
  // a review it is the thing you actually came to read.
  const quote =
    event.kind === 'comment' || event.kind === 'review'
      ? event.excerpt
      : undefined;
  const status = event.kind === 'open' ? event.excerpt : undefined;

  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.row}>
      <View style={[styles.rule, { backgroundColor: mark.color }]} />

      <View style={styles.rowBody}>
        <View style={styles.rowTop}>
          <Data numberOfLines={1} style={styles.actor}>
            {event.kind === 'open' ? mark.phrase : `${event.actor} ${mark.phrase}`}
          </Data>
          <Micro style={styles.age}>{ago(event.at)}</Micro>
        </View>

        <Body numberOfLines={2} style={styles.title}>
          {event.title}
        </Body>

        {quote && (
          <Body numberOfLines={2} style={styles.quote}>
            “{quote}”
          </Body>
        )}

        <View style={styles.rowFoot}>
          <Micro style={styles.repo}>
            {event.repo} #{event.number}
          </Micro>
          {status && (
            <View style={styles.statusChip}>
              <Micro style={styles.statusText}>{status}</Micro>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    marginTop: 2,
  },
  chips: {
    // Wrapped rather than scrolled: the feed sits inside a horizontal pager,
    // and a nested horizontal scroller there fights the page swipe.
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    borderColor: colors.hair,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipOn: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  chipLabelOn: {
    color: colors.onBlack,
  },
  // Folders are where rows went, not kinds of row: dashed, so the two ends
  // of the chip row do not read as the same kind of filter.
  folder: {
    borderStyle: 'dashed',
  },
  hint: {
    color: colors.ink40,
    marginTop: 12,
  },
  swipe: {
    overflow: 'hidden',
  },
  under: {
    alignItems: 'center',
    backgroundColor: colors.recess,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    left: 0,
    paddingHorizontal: 14,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  underLeft: {
    color: colors.ink,
  },
  underRight: {
    color: colors.ink,
  },
  over: {
    backgroundColor: colors.canvas,
  },
  row: {
    borderTopColor: colors.hair,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 11,
  },
  rule: {
    borderRadius: 2,
    marginTop: 3,
    width: 3,
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTop: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  actor: {
    color: colors.ink,
    flex: 1,
    fontSize: 11,
  },
  age: {
    color: colors.ink40,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
  },
  quote: {
    color: colors.ink70,
    fontSize: 12,
    lineHeight: 17,
  },
  rowFoot: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    marginTop: 1,
  },
  repo: {
    color: colors.ink40,
    flex: 1,
  },
  statusChip: {
    backgroundColor: colors.ink20,
    borderRadius: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  statusText: {
    color: colors.ink70,
  },
  note: {
    marginTop: 16,
  },
  error: {
    color: colors.red,
    lineHeight: 16,
    marginTop: 16,
  },
});
