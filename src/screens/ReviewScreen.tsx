import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { Card } from '../components/Card';
import { dot } from '../components/DotField';

import { Data, Heading, Label } from '../components/Type';
import { cycleStats, type Activity } from '../lib/activity';
import { colors, themed } from '../theme';
import { Page, ScreenHead } from './shared';

const ROW = 30;
/** Spacing of the dots along a pull request's track. */
const DOT_PITCH = 9;

/**
 * Derived from pin10's rainfall chart: one row per pull request, a bar for
 * how long it stayed open, and a single vertical rule as the shared
 * reference. Review is what people spend most of their GitHub time on and
 * the app had nothing on it.
 */
export function ReviewScreen({
  activity,
  loading,
}: {
  activity: Activity;
  loading: boolean;
}) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 36 - 36;
  const stats = cycleStats(activity.pulls);

  // Oldest first, and only the ones that actually closed — an open PR has no
  // cycle time yet and would draw a bar to infinity.
  const rows = activity.pulls
    .filter((pr) => pr.mergedAt)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-14);

  const trackX = 0;
  const trackWidth = chartWidth - 40;
  const longest = Math.max(
    1,
    ...rows.map(
      (pr) => (Date.parse(pr.mergedAt ?? pr.createdAt) - Date.parse(pr.createdAt)) / 3_600_000,
    ),
  );
  const median = stats.medianCycleHours;

  return (
    <Page>
      <ScreenHead left="how long it took" right={`${activity.pulls.length} prs`} />

      {loading && <Label style={styles.note}>reading pull requests…</Label>}

      {!loading && rows.length === 0 && (
        <Label style={styles.note}>nothing merged in this window</Label>
      )}

      {rows.length > 0 && (
        <>
          <View style={styles.summary}>
            <Stat label="median cycle" value={duration(median)} />
            <Stat
              label="first review"
              value={duration(stats.medianReviewWaitHours)}
            />
            <Stat
              label="merge rate"
              value={`${Math.round(stats.mergeRate * 100)}%`}
            />
          </View>

          <Card>
          <Svg height={rows.length * ROW + 4} width={chartWidth}>
            {/* The median, carried down every row — pin10's centre line. */}
            <Line
              stroke={colors.ink40}
              strokeDasharray="2 4"
              strokeWidth={1}
              x1={trackX + (median / longest) * trackWidth}
              x2={trackX + (median / longest) * trackWidth}
              y1={0}
              y2={rows.length * ROW}
            />

            {rows.map((pr, index) => {
              const opened = Date.parse(pr.createdAt);
              const hours = (Date.parse(pr.mergedAt ?? pr.createdAt) - opened) / 3_600_000;
              const y = index * ROW + ROW / 2;
              const barWidth = Math.max(DOT_PITCH, (hours / longest) * trackWidth);
              const slow = hours > median;
              // Open to merge as a run of the widget's dots, one every few
              // points; the last one is the merge, and a slow one squares off.
              const count = Math.max(1, Math.round(barWidth / DOT_PITCH));
              let d = '';
              for (let i = 0; i < count; i++) {
                const last = i === count - 1;
                d += dot(trackX + i * DOT_PITCH + DOT_PITCH / 2, y, last ? 8 : 5, last && slow);
              }
              return (
                <Path
                  d={d}
                  fill={colors.ink}
                  key={pr.number}
                  opacity={slow ? 1 : 0.5}
                />
              );
            })}

            {/* Where the first review actually landed. */}
            {rows.map((pr, index) => {
              if (!pr.firstReviewAt) return null;
              const opened = Date.parse(pr.createdAt);
              const wait = (Date.parse(pr.firstReviewAt) - opened) / 3_600_000;
              if (wait <= 0) return null;
              const y = index * ROW + ROW / 2;
              return (
                <Circle
                  cx={trackX + Math.min(wait / longest, 1) * trackWidth}
                  cy={y}
                  fill={colors.card}
                  key={`r-${pr.number}`}
                  r={4.5}
                  stroke={colors.ink}
                  strokeWidth={1.5}
                />
              );
            })}
          </Svg>
          </Card>

          <Card style={styles.rows}>
            {rows.map((pr) => {
              const hours =
                (Date.parse(pr.mergedAt ?? pr.createdAt) - Date.parse(pr.createdAt)) /
                3_600_000;
              return (
                <View key={pr.number} style={styles.row}>
                  <Data style={styles.number}>#{pr.number}</Data>
                  <Data numberOfLines={1} style={styles.repo}>
                    {pr.repo.split('/').pop()}
                  </Data>
                  <Data style={styles.took}>{duration(hours)}</Data>
                </View>
              );
            })}
          </Card>

          <Label style={styles.legend}>
            dots · open to merge &nbsp;·&nbsp; ring · first review &nbsp;·&nbsp;
            dashed · median
          </Label>
        </>
      )}
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Heading style={styles.statValue}>{value}</Heading>
      <Label>{label}</Label>
    </View>
  );
}

/** Hours read badly past a day or two; switch units rather than scaling. */
function duration(hours: number): string {
  if (hours <= 0) return '—';
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  if (hours < 48) return `${Math.round(hours)}h`;
  return `${Math.round(hours / 24)}d`;
}

const styles = themed(() =>
  StyleSheet.create({
    summary: {
      flexDirection: 'row',
      gap: 8,
    },
    stat: {
      backgroundColor: colors.card,
      borderRadius: 20,
      flex: 1,
      gap: 4,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    statValue: {
      fontSize: 18,
    },
    rows: {
      paddingVertical: 8,
    },
    row: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 7,
    },
    number: {
      color: colors.ink40,
      minWidth: 46,
    },
    repo: {
      color: colors.ink70,
      flex: 1,
    },
    took: {
      color: colors.ink,
    },
    legend: {
      lineHeight: 16,
      paddingHorizontal: 4,
    },
    note: {
      marginTop: 24,
      textAlign: 'center',
    },
  }),
);
