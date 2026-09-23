import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { Markdown } from '../components/Markdown';
import { Squiggle } from '../components/Squiggle';
import { Data, Heading, Label, Serif } from '../components/Type';
import type { Activity, PullDetail } from '../lib/activity';
import { colors, fonts, radii, space, themed } from '../theme';
import { ago, fmt } from './shared';

/**
 * pin03's filing card, opened up. The `index` screen lists pull requests;
 * this one actually reads one — the description, the diff, the review state.
 *
 * The description is rendered rather than printed. GitHub hands back raw
 * Markdown, and this screen used to put it on the page verbatim: a heading
 * arrived as a literal `## Problem` and a list as a column of hyphens.
 *
 * Paging lives in a bar pinned to the bottom, so `next` is in the same place
 * on every pull request. It used to sit under the description, which meant
 * its position depended on how much the author had written — a long body put
 * it below the fold and a one-liner put it halfway up the screen.
 */
export function BriefScreen({
  activity,
  loading,
  onOpen,
}: {
  activity: Activity;
  loading: boolean;
  onOpen: (pr: PullDetail) => void;
}) {
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);
  const pulls = activity.pulls;
  const at = Math.min(index, Math.max(0, pulls.length - 1));
  const pr = pulls[at];
  const body = width - space.gutter * 2;

  return (
    <View style={styles.screen}>
      <View style={styles.masthead}>
        <Data style={styles.chapter}>Ch. 4 /</Data>
        <Data style={styles.title}>THE BRIEF</Data>
        <Data style={styles.chapter}>
          {pulls.length ? `${at + 1} / ${pulls.length}` : '—'}
        </Data>
      </View>

      {loading && <Label style={styles.note}>opening the file…</Label>}
      {!loading && !pr && (
        <Label style={styles.note}>no pull requests to read</Label>
      )}

      {pr && (
        <>
          <ScrollView
            contentContainerStyle={styles.page}
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
          >
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
            <Squiggle
              amplitude={2.4}
              length={body * 0.45}
              opacity={0.45}
              style={styles.headRule}
              wavelength={13}
            />

            {/* Clamped: this is the shelf copy, and the whole thing is one
                tap away on the pull request itself. */}
            <Markdown limit={900} source={pr.body} width={body} />

            <Pressable
              accessibilityRole="button"
              onPress={() => onOpen(pr)}
              style={styles.openRow}
            >
              <Label style={styles.openLabel}>
                read the whole thing · talk · diff →
              </Label>
            </Pressable>
          </ScrollView>

          <View style={styles.footer}>
            <Squiggle
              amplitude={2.4}
              length={width}
              opacity={0.35}
              style={styles.footerRule}
              wavelength={15}
            />
            <Pressable
              accessibilityRole="button"
              disabled={at <= 0}
              onPress={() => setIndex(Math.max(0, at - 1))}
              style={[styles.pill, at <= 0 && styles.muted]}
            >
              <Label style={styles.pillLabel}>← prev</Label>
            </Pressable>
            <Data style={styles.counter}>
              {at + 1} of {pulls.length}
            </Data>
            <Pressable
              accessibilityRole="button"
              disabled={at >= pulls.length - 1}
              onPress={() => setIndex(Math.min(pulls.length - 1, at + 1))}
              style={[
                styles.pill,
                styles.solid,
                at >= pulls.length - 1 && styles.muted,
              ]}
            >
              <Label style={styles.solidLabel}>next →</Label>
            </Pressable>
          </View>
        </>
      )}
    </View>
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

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      flex: 1,
      paddingTop: 4,
    },
    masthead: {
      alignItems: 'baseline',
      borderBottomColor: colors.ink,
      borderBottomWidth: 1,
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginHorizontal: space.gutter,
      paddingBottom: 8,
    },
    scroll: {
      flex: 1,
    },
    page: {
      paddingBottom: 24,
      paddingHorizontal: space.gutter,
      paddingTop: 16,
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
    headRule: {
      marginBottom: 2,
      marginTop: 2,
    },
    openRow: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      marginTop: 22,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    openLabel: {
      color: colors.ink,
      textAlign: 'center',
    },
    footer: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      justifyContent: 'space-between',
      paddingBottom: 6,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
    },
    footerRule: {
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    counter: {
      color: colors.ink40,
      fontSize: 10,
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
      opacity: 0.3,
    },
    note: {
      marginTop: 24,
      textAlign: 'center',
    },
  }),
);
