import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '../components/Avatar';
import { Card } from '../components/Card';
import { DiffDots } from '../components/DiffDots';
import { StateChip } from '../components/StateChip';
import { Body, Label, Micro } from '../components/Type';
import { WaitDot } from '../components/WaitDot';
import type { Remote } from '../hooks/useRemote';
import type { QueuedPull, Queue, ReviewedPull } from '../lib/queue';
import { savedAge } from '../lib/store';
import { colors, fonts, themed } from '../theme';
import { ago, Chips, fmt, Page, ScreenHead, whyNot } from './shared';

const NO_ASKED: QueuedPull[] = [];
const NO_REVIEWED: ReviewedPull[] = [];

type Filter = 'asked' | 'reviewed';

/** `asked 9d ago`, `asked today` — the age of the request, not of the change. */
function since(iso: string): string {
  const age = ago(iso);
  return age === 'today' ? 'today' : `${age} ago`;
}

/**
 * `inbox · review`: the pull requests waiting on you.
 *
 * The inbox has review requests in it already, one row each among the
 * comments and the mentions. This is the queue on its own, read from the
 * front: longest wait first, the wait counted from when you were *asked*, and
 * each change's size as the diff's own dots, so "how much reading is this" is
 * answered before it is opened. Under `reviewed`, the ones you have already
 * looked at, with whatever has been pushed since you did.
 */
export function QueueScreen({
  state,
  onOpen,
}: {
  state: Remote<Queue>;
  onOpen: (pr: { repo: string; number: number }) => void;
}) {
  const [filter, setFilter] = useState<Filter>('asked');
  const queue = state.status === 'ready' ? state.data : null;
  const asked = queue?.asked ?? NO_ASKED;
  const reviewed = queue?.reviewed ?? NO_REVIEWED;
  const moved = reviewed.filter((pr) => pr.since > 0).length;

  return (
    <Page>
      <ScreenHead
        left="waiting on you"
        right={queue ? `${fmt(queue.askedTotal)} to review` : ''}
      />
      {state.status === 'ready' && state.offline && state.savedAt != null && (
        <Micro style={styles.dim}>offline · saved {savedAge(state.savedAt)}</Micro>
      )}

      <Chips
        current={filter}
        items={[
          { key: 'asked', label: `asked ${asked.length}` },
          { key: 'reviewed', label: moved > 0 ? `reviewed ${reviewed.length} · ${moved} moved` : `reviewed ${reviewed.length}` },
        ]}
        onSelect={setFilter}
      />

      {(state.status === 'loading' || state.status === 'idle') && (
        <Label style={styles.note}>reading the queue…</Label>
      )}
      {state.status === 'error' && (
        <Body style={styles.error}>could not read the queue · {whyNot(state.error)}</Body>
      )}

      {queue && filter === 'asked' && (
        <>
          {asked.length === 0 ? (
            <Label style={styles.note}>nobody is waiting on you · nothing to read</Label>
          ) : (
            <>
              <Summary asked={asked} />
              {asked.map((pr) => (
                <Asked key={pr.url} onOpen={onOpen} pr={pr} />
              ))}
              {queue.askedTotal > asked.length && (
                <Micro style={styles.foot}>
                  the {asked.length} longest waits of {fmt(queue.askedTotal)} · the rest are on github
                </Micro>
              )}
            </>
          )}
        </>
      )}

      {queue && filter === 'reviewed' && (
        <>
          {reviewed.length === 0 ? (
            <Label style={styles.note}>nothing you reviewed is still open</Label>
          ) : (
            <Card padded={false} style={styles.list}>
              {reviewed.map((pr, index) => (
                <Reviewed first={index === 0} key={pr.url} onOpen={onOpen} pr={pr} />
              ))}
            </Card>
          )}
        </>
      )}
    </Page>
  );
}

/**
 * The queue at a glance: one of the widget's dots per pull request, oldest
 * on the left and sized by its wait, then a sentence with the reading in it.
 */
function Summary({ asked }: { asked: readonly QueuedPull[] }) {
  const { lines, files, team } = useMemo(
    () => ({
      lines: asked.reduce((sum, pr) => sum + pr.additions + pr.deletions, 0),
      files: asked.reduce((sum, pr) => sum + pr.files, 0),
      team: asked.filter((pr) => pr.viaTeam).length,
    }),
    [asked],
  );
  const oldest = asked[0];

  return (
    <Card figure={`oldest ${ago(oldest.askedAt)}`} title="the queue">
      <View accessibilityLabel={`${asked.length} pull requests, oldest first`} style={styles.dots}>
        {asked.map((pr) => (
          <View key={pr.url} style={styles.dotCell}>
            <WaitDot since={pr.askedAt} />
          </View>
        ))}
      </View>
      <Body style={styles.sentence}>
        <Text style={styles.figure}>{asked.length}</Text>{' '}
        {asked.length === 1 ? 'pull request' : 'pull requests'}, about{' '}
        <Text style={styles.figure}>{fmt(lines)}</Text> changed lines across{' '}
        <Text style={styles.figure}>{fmt(files)}</Text> files. the oldest was asked{' '}
        <Text style={styles.figure}>{since(oldest.askedAt)}</Text>
        {team > 0 ? (
          <>
            ; <Text style={styles.figure}>{team}</Text> came through a team
          </>
        ) : null}
        .
      </Body>
    </Card>
  );
}

function Asked({
  pr,
  onOpen,
}: {
  pr: QueuedPull;
  onOpen: (pr: { repo: string; number: number }) => void;
}) {
  return (
    <Pressable
      accessibilityHint="opens the pull request"
      accessibilityRole="button"
      onPress={() => onOpen(pr)}
    >
      <Card>
        <View style={styles.byline}>
          <Avatar login={pr.author} size={22} />
          <Label numberOfLines={1} style={styles.author}>
            ~{pr.author}
          </Label>
          <WaitDot since={pr.askedAt} />
          <Micro style={styles.dim}>asked {since(pr.askedAt)}</Micro>
        </View>
        <Body numberOfLines={3} style={styles.title}>
          {pr.title}
        </Body>
        <Micro numberOfLines={1} style={styles.meta}>
          {pr.repo} #{pr.number} · {pr.files} {pr.files === 1 ? 'file' : 'files'}
          {pr.draft ? ' · draft' : ''}
          {pr.viaTeam ? ' · via a team' : ''}
        </Micro>
        <DiffDots additions={pr.additions} deletions={pr.deletions} />
      </Card>
    </Pressable>
  );
}

const VERDICT: Record<string, { text: string; tone: () => string }> = {
  APPROVED: { text: 'you approved', tone: () => colors.yes },
  CHANGES_REQUESTED: { text: 'you asked for changes', tone: () => colors.no },
  COMMENTED: { text: 'you commented', tone: () => colors.ink40 },
  DISMISSED: { text: 'your review was dismissed', tone: () => colors.ink20 },
};

function Reviewed({
  pr,
  first,
  onOpen,
}: {
  pr: ReviewedPull;
  first: boolean;
  onOpen: (pr: { repo: string; number: number }) => void;
}) {
  const verdict = VERDICT[pr.state] ?? VERDICT.COMMENTED;
  return (
    <Pressable
      accessibilityHint="opens the pull request"
      accessibilityRole="button"
      onPress={() => onOpen(pr)}
      style={[styles.row, !first && styles.rule]}
    >
      <View style={styles.rowHead}>
        <StateChip text={verdict.text} tone={verdict.tone()} />
        {pr.since > 0 ? (
          <Label style={styles.moved}>
            {pr.since} new {pr.since === 1 ? 'commit' : 'commits'}
          </Label>
        ) : (
          <Micro style={styles.dim}>nothing new</Micro>
        )}
      </View>
      <Body numberOfLines={2} style={styles.title}>
        {pr.title}
      </Body>
      <Micro numberOfLines={2} style={styles.dim}>
        you looked {since(pr.reviewedAt)} · ~{pr.author} · {pr.repo} #{pr.number}
      </Micro>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dim: {
      color: colors.ink40,
    },
    note: {
      marginTop: 18,
      textAlign: 'center',
    },
    error: {
      color: colors.no,
      marginTop: 18,
      textAlign: 'center',
    },
    foot: {
      color: colors.ink40,
      paddingHorizontal: 4,
    },
    dots: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
      marginBottom: 12,
    },
    dotCell: {
      alignItems: 'center',
      height: 14,
      justifyContent: 'center',
      width: 14,
    },
    sentence: {
      color: colors.ink70,
      fontSize: 15,
      lineHeight: 24,
    },
    figure: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
    byline: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    author: {
      color: colors.ink70,
      flex: 1,
    },
    title: {
      color: colors.ink,
      lineHeight: 19,
    },
    meta: {
      color: colors.ink40,
      marginBottom: 12,
      marginTop: 4,
    },
    list: {
      paddingBottom: 4,
      paddingTop: 4,
    },
    row: {
      gap: 6,
      marginHorizontal: 18,
      paddingVertical: 13,
    },
    rule: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
    },
    rowHead: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
    },
    moved: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
  }),
);
