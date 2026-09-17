import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { GRID_WEEKS, type WidgetModel } from '../lib/contributions';
import { colors, radii } from '../theme';

import { DotText } from './DotText';
import { Wordmark } from './Wordmark';

const SCREEN_MARGIN = 16;
const WIDGET_PADDING = 20;
const DOT_GAP = 4;

/** Stats column share of the widget width; the dot matrix takes the rest. */
const STATS_FLEX = 4;
const GRID_FLEX = 6;

const numberFormat = new Intl.NumberFormat('en-US');

interface ContributionWidgetProps {
  model: WidgetModel;
}

/**
 * The Nothing-style contribution widget: stats on the left third, a
 * monochrome dot matrix on the right two-thirds, with today's cell punched
 * out in Nothing red — the single allowed accent.
 */
export function ContributionWidget({ model }: ContributionWidgetProps) {
  const { width: screenWidth } = useWindowDimensions();
  const gridWidth =
    ((screenWidth - SCREEN_MARGIN * 2 - WIDGET_PADDING * 2) * GRID_FLEX) /
    (STATS_FLEX + GRID_FLEX);
  const dotSize = Math.floor(
    (gridWidth - DOT_GAP * (GRID_WEEKS - 1)) / GRID_WEEKS,
  );

  return (
    <View style={styles.widget}>
      <View style={styles.split}>
        <View style={styles.stats}>
          <Wordmark />
          <DotText
            style={[
              styles.statValue,
              model.todayCommits > 0 && styles.statValueAccent,
            ]}
          >
            {numberFormat.format(model.todayCommits)}
          </DotText>
          <DotText style={styles.statLabel}>today</DotText>
          <View style={styles.divider} />
          <DotText style={styles.statValue}>
            {numberFormat.format(model.totalCommits)}
          </DotText>
          <DotText style={styles.statLabel}>commits</DotText>
          <View style={styles.divider} />
          <DotText style={styles.statValue}>
            {numberFormat.format(model.openPrs)}
          </DotText>
          <DotText style={styles.statLabel}>open prs</DotText>
        </View>

        <View style={[styles.grid, { gap: DOT_GAP }]}>
          {model.columns.map((column) => (
            <View key={column[0]?.date} style={{ gap: DOT_GAP }}>
              {column.map((day) => (
                <View
                  key={day.date}
                  style={[
                    styles.dot,
                    { width: dotSize, height: dotSize },
                    { backgroundColor: colors.ramp[day.level] },
                    day.isToday && styles.todayDot,
                  ]}
                />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        <DotText style={styles.legendLabel}>less</DotText>
        {colors.ramp.map((tone) => (
          <View
            key={tone}
            style={[styles.legendDot, { backgroundColor: tone }]}
          />
        ))}
        <DotText style={styles.legendLabel}>more</DotText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  widget: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: radii.widget,
    borderWidth: 1,
    gap: 18,
    margin: SCREEN_MARGIN,
    padding: WIDGET_PADDING,
  },
  split: {
    alignItems: 'center',
    flexDirection: 'row',
  },
  stats: {
    flex: STATS_FLEX,
    gap: 3,
  },
  statValue: {
    color: colors.text.primary,
    fontSize: 22,
    letterSpacing: 1,
    lineHeight: 26,
    marginTop: 8,
  },
  statValueAccent: {
    color: colors.accent,
  },
  statLabel: {
    color: colors.text.secondary,
    fontSize: 10,
    letterSpacing: 1,
  },
  divider: {
    backgroundColor: colors.outline,
    height: 1,
    marginVertical: 6,
    width: 36,
  },
  grid: {
    flex: GRID_FLEX,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  dot: {
    borderRadius: 999,
  },
  todayDot: {
    backgroundColor: colors.accent,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  legendDot: {
    borderRadius: 999,
    height: 7,
    width: 7,
  },
  legendLabel: {
    color: colors.text.faint,
    fontSize: 10,
    letterSpacing: 1,
  },
});
