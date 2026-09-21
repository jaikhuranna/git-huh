import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Body, Data, Heading, Label, Serif } from '../components/Type';
import type { Activity, PullDetail } from '../lib/activity';
import { colors, fonts, radii } from '../theme';
import { ago, fmt, Page } from './shared';

/**
 * pin03's filing card, opened up. The `index` screen lists pull requests;
 * this one actually reads one — the description, the diff, the review state.
 * That body text is the data you only get by following the object's URL,
 * and nothing else in the app touches it.
 */
export function BriefScreen({
  activity,
  loading,
}: {
  activity: Activity;
  loading: boolean;
}) {
  const [index, setIndex] = useState(0);
  const pulls = activity.pulls;
  const pr = pulls[Math.min(index, pulls.length - 1)];

  return (
    <Page>
      <View style={styles.masthead}>
        <Data style={styles.chapter}>Ch. 4 /</Data>
        <Data style={styles.title}>THE BRIEF</Data>
        <Data style={styles.chapter}>
          {pulls.length ? `${Math.min(index + 1, pulls.length)} / ${pulls.length}` : '—'}
        </Data>
      </View>

      {loading && <Label style={styles.note}>opening the file…</Label>}
      {!loading && !pr && (
        <Label style={styles.note}>no pull requests to read</Label>
      )}

      {pr && (
        <>
          <View style={styles.card}>
            <View style={styles.tabRow}>
              <View style={styles.tab}>
                <Data style={styles.tabText}>#{pr.number}</Data>
              </View>
              <StateChip pr={pr} />
            </View>

            <Data style={styles.repo}>{pr.repo}</Data>
            <Heading style={styles.prTitle}>{pr.title}</Heading>

            <DiffBar pr={pr} />

            <View style={styles.statRow}>
              <Data style={styles.stat}>{fmt(pr.changedFiles)} files</Data>
              <Data style={styles.stat}>{fmt(pr.commits)} commits</Data>
              <Data style={styles.stat}>{fmt(pr.comments)} comments</Data>
              <Data style={styles.stat}>{ago(pr.createdAt)}</Data>
            </View>

            {pr.labels.length > 0 && (
              <View style={styles.labels}>
                {pr.labels.map((label) => (
                  <View
                    key={label.name}
                    style={[styles.label, { borderColor: `#${label.color}` }]}
                  >
                    <Data style={styles.labelText}>{label.name}</Data>
                  </View>
                ))}
              </View>
            )}
          </View>

          <Serif style={styles.bodyHead}>The description</Serif>
          <Body style={styles.body}>
            {pr.body.trim().length > 0
              ? clamp(pr.body)
              : 'No description was written for this pull request.'}
          </Body>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              disabled={index >= pulls.length - 1}
              onPress={() => setIndex((i) => Math.min(i + 1, pulls.length - 1))}
              style={[styles.pill, index >= pulls.length - 1 && styles.muted]}
            >
              <Label style={styles.pillLabel}>next →</Label>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => Linking.openURL(pr.url).catch(() => {})}
              style={[styles.pill, styles.solid]}
            >
              <Label style={styles.solidLabel}>open on github</Label>
            </Pressable>
          </View>
        </>
      )}
    </Page>
  );
}

function StateChip({ pr }: { pr: PullDetail }) {
  const [text, tone] = pr.isDraft
    ? ['draft', colors.ink40]
    : pr.state === 'MERGED'
      ? ['merged', colors.purple]
      : pr.state === 'CLOSED'
        ? ['closed', colors.red]
        : pr.reviewDecision === 'APPROVED'
          ? ['approved', colors.green]
          : ['open', colors.blue];

  return (
    <View style={[styles.stateChip, { backgroundColor: tone }]}>
      <Data style={styles.stateText}>{text}</Data>
    </View>
  );
}

/** Additions against deletions, as one proportional rule. */
function DiffBar({ pr }: { pr: PullDetail }) {
  const total = Math.max(1, pr.additions + pr.deletions);
  const addShare = pr.additions / total;

  return (
    <View style={styles.diff}>
      <View style={styles.diffTrack}>
        <View style={[styles.diffAdd, { flex: Math.max(addShare, 0.02) }]} />
        <View style={[styles.diffDel, { flex: Math.max(1 - addShare, 0.02) }]} />
      </View>
      <View style={styles.diffLabels}>
        <Data style={styles.add}>+{fmt(pr.additions)}</Data>
        <Data style={styles.del}>−{fmt(pr.deletions)}</Data>
      </View>
    </View>
  );
}

/** PR bodies can be enormous; show the opening and say so. */
function clamp(body: string, limit = 420): string {
  const text = body.replace(/\r/g, '').replace(/\n{3,}/g, '\n\n').trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

const styles = StyleSheet.create({
  masthead: {
    alignItems: 'baseline',
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  chapter: {
    color: colors.ink70,
    fontSize: 11,
  },
  title: {
    fontSize: 12,
    letterSpacing: 1.6,
  },
  card: {
    backgroundColor: colors.card,
    borderColor: colors.hairStrong,
    borderWidth: 1,
    marginTop: 16,
    padding: 16,
  },
  tabRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  tab: {
    backgroundColor: colors.black,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tabText: {
    color: colors.onBlack,
    fontSize: 12,
  },
  stateChip: {
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  stateText: {
    color: colors.onBlack,
    fontSize: 10,
  },
  repo: {
    color: colors.ink70,
    fontSize: 10,
    marginTop: 14,
  },
  prTitle: {
    fontSize: 17,
    lineHeight: 23,
    marginTop: 4,
  },
  diff: {
    marginTop: 16,
  },
  diffTrack: {
    borderRadius: 2,
    flexDirection: 'row',
    gap: 2,
    height: 6,
    overflow: 'hidden',
  },
  diffAdd: {
    backgroundColor: colors.green,
  },
  diffDel: {
    backgroundColor: colors.red,
  },
  diffLabels: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 7,
  },
  add: {
    color: colors.green,
  },
  del: {
    color: colors.red,
  },
  statRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  stat: {
    color: colors.ink70,
    fontSize: 10,
  },
  labels: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  label: {
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  labelText: {
    fontSize: 10,
  },
  bodyHead: {
    fontFamily: fonts.serifItalic,
    fontSize: 15,
    marginTop: 22,
  },
  body: {
    color: colors.ink70,
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
  },
  pill: {
    alignItems: 'center',
    borderColor: colors.hair,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  pillLabel: {
    color: colors.ink,
  },
  solid: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  solidLabel: {
    color: colors.onBlack,
  },
  muted: {
    opacity: 0.35,
  },
  note: {
    marginTop: 24,
    textAlign: 'center',
  },
});
