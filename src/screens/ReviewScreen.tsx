import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { Data, Heading, Label, Serif } from '../components/Type';
import { cycleStats, type Activity } from '../lib/activity';
import { colors, fonts } from '../theme';
import { Page, ScreenHead } from './shared';

const ROW = 30;

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
  const chartWidth = width - 40;
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

          <Svg height={rows.length * ROW + 18} width={chartWidth}>
            {/* The median, carried down every row — pin10's centre line. */}
            <Line
              stroke={colors.ink}
              strokeDasharray="3 3"
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
              const barWidth = Math.max(3, (hours / longest) * trackWidth);
              const slow = hours > median;
              return (
                <Rect
                  fill={slow ? colors.steel : colors.olive}
                  height={11}
                  key={pr.number}
                  rx={2}
                  width={barWidth}
                  x={trackX}
                  y={y - 5.5}
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
                  fill={colors.ink}
                  key={`r-${pr.number}`}
                  r={3}
                />
              );
            })}
          </Svg>

          <View style={styles.rows}>
            {rows.map((pr) => {
              const hours =
                (Date.parse(pr.mergedAt ?? pr.createdAt) - Date.parse(pr.createdAt)) /
                3_600_000;
              return (
                <View key={pr.number} style={styles.row}>
                  <Serif style={styles.number}>#{pr.number}</Serif>
                  <Data numberOfLines={1} style={styles.repo}>
                    {pr.repo.split('/').pop()}
                  </Data>
                  <Data style={styles.took}>{duration(hours)}</Data>
                </View>
              );
            })}
          </View>

          <Label style={styles.legend}>
            bar · open to merge &nbsp;·&nbsp; dot · first review &nbsp;·&nbsp;
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

const styles = StyleSheet.create({
  summary: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  stat: {
    backgroundColor: colors.card,
    borderRadius: 14,
    flex: 1,
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statValue: {
    fontSize: 18,
  },
  rows: {
    marginTop: 10,
  },
  row: {
    alignItems: 'baseline',
    borderTopColor: colors.hair,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 7,
  },
  number: {
    fontFamily: fonts.serifItalic,
    fontSize: 13,
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
    marginTop: 14,
  },
  note: {
    marginTop: 24,
    textAlign: 'center',
  },
});
