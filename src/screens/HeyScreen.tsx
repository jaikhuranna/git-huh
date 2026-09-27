import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CrossField } from '../components/CrossField';
import { FeedRow } from '../components/SocialFeed';
import { Body, Display, Label, Micro, Serif } from '../components/Type';
import type { SocialState } from '../hooks/useSocial';
import { handleOf, insights, type GitHubModel } from '../lib/contributions';
import { HOME_BLOCKS, HOME_ROWS, homeEvents, type HomeSettings } from '../lib/home';
import type { SocialEvent } from '../lib/social';
import { colors, fonts, themed } from '../theme';
import { fmt, Page } from './shared';

/**
 * pin04 — Pantom's landing page. A serif greeting, a field of plus glyphs
 * standing in for the contribution year, and one sentence that carries the
 * year's figures in five colours.
 *
 * Under it, a short feed — pull request comments by default, chosen on the
 * account page — so the page runs on into what people said instead of
 * ending in a stretch of empty paper. The account itself (switching, adding,
 * notifications, disconnect) lives behind the avatar in the top-right corner.
 */
export function HeyScreen({
  model,
  social,
  home,
  onOpen,
  onInbox,
  onSettings,
}: {
  model: GitHubModel;
  social: SocialState;
  home: HomeSettings;
  onOpen: (event: SocialEvent) => void;
  /** The whole feed, in its own section. */
  onInbox: () => void;
  /** The account page, where the feed's kinds are chosen. */
  onSettings: () => void;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);

  // Two days per column keeps the crosses far enough apart to read as
  // separate marks rather than merging into bars, the way pin04's do.
  const levels = bucket(model.columns.flat().map((day) => day.level), 2);

  return (
    <Page>
      <Display>Hey,</Display>
      <Display adjustsFontSizeToFit numberOfLines={1} style={styles.handle}>
        {handleOf(model)}
      </Display>

      <CrossField
        days={levels}
        daysPerCell={2}
        height={132}
        style={styles.field}
        width={width - 40}
      />

      <Sentence derived={derived} model={model} />

      <Serif style={styles.since}>
        since {model.since} · {fmt(derived.activeDays)} active days ·{' '}
        {derived.currentStreak > 0
          ? `${derived.currentStreak} day streak`
          : 'no streak today'}
      </Serif>

      <HomeFeed
        home={home}
        onInbox={onInbox}
        onOpen={onOpen}
        onSettings={onSettings}
        social={social}
      />
    </Page>
  );
}

/**
 * Under the greeting, what people have been saying on your work — pull
 * request comments unless the account page says otherwise. It is the inbox's
 * own feed, filtered; nothing is fetched for it, and it is a glance, so it
 * shows the newest few and points at the inbox for the rest.
 */
function HomeFeed({
  social,
  home,
  onOpen,
  onInbox,
  onSettings,
}: {
  social: SocialState;
  home: HomeSettings;
  onOpen: (event: SocialEvent) => void;
  onInbox: () => void;
  onSettings: () => void;
}) {
  const events = social.status === 'ready' ? homeEvents(social.events, home) : [];
  const rows = events.slice(0, HOME_ROWS);
  const title =
    home.blocks.length === 0
      ? 'nothing chosen'
      : HOME_BLOCKS.filter((block) => home.blocks.includes(block.key))
          .map((block) => block.label)
          .join(' · ');

  return (
    <View style={styles.block}>
      <View style={styles.blockHead}>
        <Label numberOfLines={1} style={styles.blockTitle}>
          {title}
        </Label>
        <Pressable accessibilityRole="button" hitSlop={10} onPress={onSettings}>
          <Label style={styles.link}>change</Label>
        </Pressable>
      </View>

      {home.blocks.length === 0 && (
        <Micro style={styles.blockNote}>
          pick what shows here from the account page, top right
        </Micro>
      )}
      {home.blocks.length > 0 && social.status === 'loading' && (
        <Micro style={styles.blockNote}>reading the room…</Micro>
      )}
      {home.blocks.length > 0 && social.status === 'error' && (
        <Micro style={styles.blockNote}>github would not hand over the feed</Micro>
      )}
      {home.blocks.length > 0 && social.status === 'ready' && rows.length === 0 && (
        <Micro style={styles.blockNote}>nothing new on your pull requests · quiet week</Micro>
      )}

      {rows.map((event) => (
        <FeedRow event={event} key={event.id} onOpen={() => onOpen(event)} />
      ))}

      {events.length > rows.length && (
        <Pressable accessibilityRole="button" onPress={onInbox} style={styles.more}>
          <Label style={styles.link}>{events.length - rows.length} more in the inbox →</Label>
        </Pressable>
      )}
    </View>
  );
}

/**
 * pin04's one sentence, five figures in five colours — all of them about the
 * same year the crosses above it draw. It says what you did, where, how
 * steadily, when, and what is still open, and a figure with nothing in it
 * drops out rather than printing a zero. Vanity figures (stars, followers)
 * stay out of it: they make it read like a template filled in.
 */
function Sentence({
  model,
  derived,
}: {
  model: GitHubModel;
  derived: ReturnType<typeof insights>;
}) {
  const top = model.topRepos.find((repo) => repo.nameWithOwner.includes('/'));
  const repo = top?.nameWithOwner.split('/')[1];

  if (model.total === 0) {
    return (
      <Body style={styles.sentence}>
        Nothing on the calendar in the last year. The first commit will show up
        here as a cross.
      </Body>
    );
  }

  const weekday =
    derived.busiestWeekday.charAt(0).toUpperCase() + derived.busiestWeekday.slice(1);

  return (
    <Body style={styles.sentence}>
      You made <Text style={styles.blue}>{fmt(model.total)}</Text>{' '}
      {model.total === 1 ? 'contribution' : 'contributions'} in the last year
      {repo ? (
        <>
          , more of them to <Text style={styles.green}>{repo}</Text> than
          anywhere else
        </>
      ) : null}
      . You work most on <Text style={styles.yellow}>{weekday}s</Text>
      {derived.longestStreak > 1 ? (
        <>
          , and your longest run was{' '}
          <Text style={styles.purple}>{fmt(derived.longestStreak)}</Text> days
          in a row
        </>
      ) : null}
      .{' '}
      {model.openPrs > 0 ? (
        <>
          You have <Text style={styles.red}>{fmt(model.openPrs)}</Text>{' '}
          {model.openPrs === 1 ? 'pull request' : 'pull requests'} still open.
        </>
      ) : (
        'Nothing of yours is waiting to merge.'
      )}
    </Body>
  );
}

/** Collapse `size` consecutive days into their peak, preserving intensity. */
function bucket(levels: number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels.length; i += size) {
    out.push(Math.max(...levels.slice(i, i + size)));
  }
  return out;
}

const styles = themed(() =>
  StyleSheet.create({
    handle: {
      marginTop: -6,
    },
    field: {
      alignSelf: 'center',
      marginBottom: 20,
      marginTop: 18,
    },
    sentence: {
      fontSize: 17,
      lineHeight: 26,
    },
    blue: { color: colors.blue },
    green: { color: colors.green },
    red: { color: colors.red },
    yellow: { color: colors.yellow },
    purple: { color: colors.purple },
    since: {
      color: colors.ink40,
      fontFamily: fonts.serifItalic,
      fontSize: 13,
      marginTop: 16,
    },
    block: {
      marginTop: 28,
    },
    blockHead: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 8,
    },
    blockTitle: {
      color: colors.ink,
      flex: 1,
    },
    blockNote: {
      color: colors.ink40,
      lineHeight: 13,
      marginTop: 10,
    },
    link: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
    more: {
      paddingTop: 14,
    },
  }),
);
