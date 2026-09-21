import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Body, Data, Label, Micro } from './Type';
import type { SocialState } from '../hooks/useSocial';
import {
  filterCounts,
  filterEvents,
  SOCIAL_FILTERS,
  type SocialEvent,
  type SocialFilter,
} from '../lib/social';
import { ago } from '../screens/shared';
import { colors, radii } from '../theme';

const MAX_ROWS = 12;

/**
 * The social side of GitHub on the front door: who commented on your pull
 * requests, who reviewed them, who asked for your review, who pulled you into
 * a thread — and your own open pull requests underneath it all.
 *
 * Every row is a real event with the text attached, and every row opens the
 * thread it came from. The filter is the point: on a busy week the feed is
 * mostly review noise and you want the two comments that were meant for you.
 */
export function SocialFeed({ state }: { state: SocialState }) {
  const [filter, setFilter] = useState<SocialFilter>('all');

  const events = state.status === 'ready' ? state.events : [];
  const counts = filterCounts(events);
  const rows = filterEvents(events, filter).slice(0, MAX_ROWS);

  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Label style={styles.headLeft}>recent</Label>
        {state.status === 'ready' && <Label>{events.length} events</Label>}
      </View>

      <View style={styles.chips}>
        {SOCIAL_FILTERS.map((value) => {
          const on = value === filter;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Label style={on ? styles.chipLabelOn : undefined}>
                {value}
                {state.status === 'ready' ? ` ${counts[value]}` : ''}
              </Label>
            </Pressable>
          );
        })}
      </View>

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
            : `no ${filter} in the last few days`}
        </Label>
      )}

      {rows.map((event) => (
        <FeedRow event={event} key={event.id} />
      ))}
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

function FeedRow({ event }: { event: SocialEvent }) {
  const mark = markOf(event);
  // On the canned kinds the excerpt only repeats the phrase; on a comment or
  // a review it is the thing you actually came to read.
  const quote =
    event.kind === 'comment' || event.kind === 'review'
      ? event.excerpt
      : undefined;
  const status = event.kind === 'open' ? event.excerpt : undefined;

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(event.url).catch(() => {})}
      style={styles.row}
    >
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
    marginTop: 30,
  },
  head: {
    alignItems: 'baseline',
    borderTopColor: colors.ink,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  headLeft: {
    color: colors.ink,
  },
  chips: {
    // Wrapped rather than scrolled: the feed sits inside the app's horizontal
    // pager, and a nested horizontal scroller there fights the page swipe.
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
