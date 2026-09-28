import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { Card } from '../components/Card';
import { DotField } from '../components/DotField';
import { Marquee } from '../components/Marquee';
import { FeedRow } from '../components/SocialFeed';
import { Body, Display, Label, Micro, Serif } from '../components/Type';
import { useFeedHistory } from '../hooks/useFeedHistory';
import type { SocialState } from '../hooks/useSocial';
import { handleOf, insights, type GitHubModel } from '../lib/contributions';
import { HOME_BLOCKS, homeEvents, type HomeSettings } from '../lib/home';
import type { CommitLine } from '../lib/messageCache';
import { useNav } from '../lib/nav';
import type { SocialEvent } from '../lib/social';
import { colors, fonts, space, themed } from '../theme';
import { fmt, historyLevels, Page } from './shared';

/** The widget's card is 7 rows at up to 22dp a dot; so is this one. */
const FIELD_ROWS = 7;
const FIELD_PITCH = 21;

/**
 * The first page is the home-screen widget, set in the app: a greeting, then
 * the widget's own card — your commit messages travelling across the top and
 * the last few months of days as dots under them, today the plus in the
 * corner — and one sentence that carries the year's figures.
 *
 * Under it, what people have been saying on your work, pull request comments
 * unless the account page says otherwise. It starts with the inbox's feed and
 * keeps going: scrolling pages in older pull requests, so it runs as far back
 * as the conversation does. The account itself lives behind the avatar.
 */
export function HeyScreen({
  model,
  social,
  home,
  lines,
  active,
  onOpen,
  onSettings,
}: {
  model: GitHubModel;
  social: SocialState;
  home: HomeSettings;
  lines: readonly CommitLine[];
  active: boolean;
  onOpen: (event: SocialEvent) => void;
  /** The account page, where the feed's kinds are chosen. */
  onSettings: () => void;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);
  const nav = useNav();
  const history = useFeedHistory(nav.token, nav.login, active && home.blocks.length > 0);
  const inner = width - space.gutter * 2 - space.card * 2;

  return (
    <Page onEnd={history.more}>
      <View style={styles.greeting}>
        <Display style={styles.hey}>hey,</Display>
        <Display adjustsFontSizeToFit numberOfLines={1}>
          {handleOf(model)}
        </Display>
      </View>

      <Card style={styles.widget}>
        <Marquee
          active={active}
          items={(lines.length > 0 ? lines : FALLBACK).map((line) => ({
            lead: line.repo,
            text: line.message,
          }))}
          style={styles.strip}
        />
        <DotField
          days={historyLevels(model)}
          height={FIELD_ROWS * FIELD_PITCH}
          maxPitch={FIELD_PITCH}
          rows={FIELD_ROWS}
          style={styles.field}
          width={inner}
        />
      </Card>

      <Sentence derived={derived} model={model} />

      <Serif style={styles.since}>
        since {model.since} · {fmt(derived.activeDays)} active days ·{' '}
        {derived.currentStreak > 0
          ? `${derived.currentStreak} day streak`
          : 'no streak today'}
      </Serif>

      <HomeFeed
        history={history}
        home={home}
        onOpen={onOpen}
        onSettings={onSettings}
        social={social}
      />
    </Page>
  );
}

/** A first launch with no pool of messages yet still has a strip. */
const FALLBACK: CommitLine[] = [
  { repo: 'git-huh', message: 'first commit' },
  { repo: 'git-huh', message: 'reading your year' },
];

/**
 * Under the greeting, what people have been saying on your work. The inbox's
 * feed first, then the history as it pages in, the same comment once.
 */
function HomeFeed({
  social,
  history,
  home,
  onOpen,
  onSettings,
}: {
  social: SocialState;
  history: ReturnType<typeof useFeedHistory>;
  home: HomeSettings;
  onOpen: (event: SocialEvent) => void;
  onSettings: () => void;
}) {
  const inbox = social.status === 'ready' ? social.events : [];
  const rows = homeEvents([...inbox, ...history.events], home);
  const title =
    home.blocks.length === 0
      ? 'nothing chosen'
      : HOME_BLOCKS.filter((block) => home.blocks.includes(block.key))
          .map((block) => block.label)
          .join(' · ');
  const oldest = rows[rows.length - 1];

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
      {home.blocks.length > 0 && social.status === 'error' && rows.length === 0 && (
        <Micro style={styles.blockNote}>github would not hand over the feed</Micro>
      )}

      {rows.map((event) => (
        <FeedRow event={event} key={event.id} onOpen={() => onOpen(event)} />
      ))}

      {home.blocks.length > 0 && (
        <View style={styles.end}>
          {history.loading || social.status === 'loading' ? (
            <Micro style={styles.blockNote}>reading older pull requests…</Micro>
          ) : history.failed ? (
            <Pressable accessibilityRole="button" onPress={history.more}>
              <Micro style={styles.blockNote}>
                github stopped answering · <Text style={styles.link}>try again</Text>
              </Micro>
            </Pressable>
          ) : history.done ? (
            <Micro style={styles.blockNote}>
              {rows.length === 0
                ? 'nothing on your pull requests yet'
                : `that is everything${oldest ? `, back to ${monthOf(oldest.at)}` : ''}`}
            </Micro>
          ) : (
            <Pressable accessibilityRole="button" hitSlop={10} onPress={history.more}>
              <Micro style={[styles.blockNote, styles.link]}>older →</Micro>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function monthOf(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    .toLowerCase();
}

/**
 * One sentence, five figures — all of them about the same year the dots above
 * draw. The figures are set in full ink and the words around them a step
 * back, the widget's two weights, so the numbers can be read on their own. A
 * figure with nothing in it drops out rather than printing a zero.
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
        nothing on the calendar in the last year. the first commit will show up
        in the corner as a plus.
      </Body>
    );
  }

  const weekday = derived.busiestWeekday;

  return (
    <Body style={styles.sentence}>
      you made <Text style={styles.figure}>{fmt(model.total)}</Text>{' '}
      {model.total === 1 ? 'contribution' : 'contributions'} in the last year
      {repo ? (
        <>
          , more of them to <Text style={styles.figure}>{repo}</Text> than
          anywhere else
        </>
      ) : null}
      . you work most on <Text style={styles.figure}>{weekday}s</Text>
      {derived.longestStreak > 1 ? (
        <>
          , and your longest run was{' '}
          <Text style={styles.figure}>{fmt(derived.longestStreak)}</Text> days
          in a row
        </>
      ) : null}
      .{' '}
      {model.openPrs > 0 ? (
        <>
          <Text style={styles.figure}>{fmt(model.openPrs)}</Text>{' '}
          {model.openPrs === 1 ? 'pull request is' : 'pull requests are'} still open.
        </>
      ) : (
        'nothing of yours is waiting to merge.'
      )}
    </Body>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    greeting: {
      paddingHorizontal: 4,
      paddingTop: 6,
    },
    hey: {
      color: colors.ink40,
    },
    widget: {
      marginTop: 8,
    },
    strip: {
      marginBottom: 14,
    },
    field: {
      alignSelf: 'center',
    },
    sentence: {
      color: colors.ink70,
      fontSize: 15,
      lineHeight: 24,
      marginTop: 10,
      paddingHorizontal: 4,
    },
    figure: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
    since: {
      color: colors.ink40,
      paddingHorizontal: 4,
    },
    block: {
      gap: 8,
      marginTop: 18,
    },
    blockHead: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 2,
      paddingHorizontal: 4,
    },
    blockTitle: {
      color: colors.ink,
      flex: 1,
    },
    blockNote: {
      color: colors.ink40,
      lineHeight: 14,
    },
    end: {
      alignItems: 'center',
      paddingVertical: 14,
    },
    link: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
  }),
);
