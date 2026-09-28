import { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { DiffDots } from '../components/DiffDots';
import { Markdown } from '../components/Markdown';
import { StateChip } from '../components/StateChip';
import { Squiggle } from '../components/Squiggle';
import { Data, Heading, Label } from '../components/Type';
import type { Activity, PullDetail } from '../lib/activity';
import { colors, radii, space, themed } from '../theme';
import { ago, fmt } from './shared';

/**
 * pin03's filing card, opened up. The `index` screen lists pull requests;
 * this one actually reads one — the description, the diff, the review state.
 *
 * The description is rendered rather than printed: GitHub hands back raw
 * Markdown, and verbatim a heading arrives as a literal `## Problem` and a
 * list as a column of hyphens.
 *
 * Paging lives in a bar pinned to the bottom, so `next` is in the same place
 * on every pull request. Under the description, its position would depend on
 * how much the author had written.
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
        <Label style={styles.title}>the brief</Label>
        <Label>{pulls.length ? `${at + 1} / ${pulls.length}` : '—'}</Label>
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
                <Data style={styles.tabText}>#{pr.number}</Data>
                <PullState pr={pr} />
              </View>

              <Data style={styles.repo}>{pr.repo}</Data>
              <Heading style={styles.prTitle}>{pr.title}</Heading>

              <View style={styles.diff}>
                <DiffDots additions={pr.additions} deletions={pr.deletions} />
              </View>

              <View style={styles.statRow}>
                <Data style={styles.stat}>{fmt(pr.changedFiles)} files</Data>
                <Data style={styles.stat}>{fmt(pr.commits)} commits</Data>
                <Data style={styles.stat}>{fmt(pr.comments)} comments</Data>
                <Data style={styles.stat}>{ago(pr.createdAt)}</Data>
              </View>

              {pr.labels.length > 0 && (
                <View style={styles.labels}>
                  {pr.labels.map((label) => (
                    <View key={label.name} style={styles.label}>
                      <Data style={styles.labelText}>{label.name}</Data>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <Label style={styles.bodyHead}>the description</Label>
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

function PullState({ pr }: { pr: PullDetail }) {
  const [text, tone] = pr.isDraft
    ? ['draft', colors.ink40]
    : pr.state === 'MERGED'
      ? ['merged', colors.ink]
      : pr.state === 'CLOSED'
        ? ['closed', colors.no]
        : pr.reviewDecision === 'APPROVED'
          ? ['approved', colors.yes]
          : ['open', colors.ink];
  return <StateChip text={text} tone={tone} />;
}

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      flex: 1,
      paddingTop: 4,
    },
    masthead: {
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginHorizontal: space.gutter,
      paddingBottom: 4,
      paddingHorizontal: 4,
    },
    scroll: {
      flex: 1,
    },
    page: {
      paddingBottom: 24,
      paddingHorizontal: space.gutter,
      paddingTop: 16,
    },
    title: {
      color: colors.ink,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.card,
      padding: 18,
    },
    tabRow: {
      alignItems: 'center',
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    tabText: {
      color: colors.ink40,
    },
    repo: {
      color: colors.ink40,
      fontSize: 11,
      marginTop: 14,
    },
    prTitle: {
      fontSize: 16,
      lineHeight: 23,
      marginTop: 4,
    },
    diff: {
      marginTop: 16,
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
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    labelText: {
      fontSize: 10,
    },
    bodyHead: {
      color: colors.ink,
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
