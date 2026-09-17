import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { GRID_WEEKS, type WidgetModel } from '../lib/contributions';
import { colors, radii } from '../theme';

import { DotText } from './DotText';
import { Wordmark } from './Wordmark';

const SCREEN_MARGIN = 16;
const WIDGET_PADDING = 20;
const DOT_GAP = 4;

const numberFormat = new Intl.NumberFormat('en-US');

interface ContributionWidgetProps {
  model: WidgetModel;
}

/**
 * The Nothing-style contribution widget: a monochrome dot matrix on black,
 * with today's cell punched out in Nothing red — the single allowed accent.
 */
export function ContributionWidget({ model }: ContributionWidgetProps) {
  const { width: screenWidth } = useWindowDimensions();
  const innerWidth =
    screenWidth - SCREEN_MARGIN * 2 - WIDGET_PADDING * 2;
  const dotSize = Math.floor(
    (innerWidth - DOT_GAP * (GRID_WEEKS - 1)) / GRID_WEEKS,
  );

  return (
    <View style={styles.widget}>
      <View style={styles.header}>
        <Wordmark />
        <View
          style={[
            styles.statusDot,
            model.todayCount === 0 && styles.statusDotIdle,
          ]}
        />
      </View>

      <DotText style={styles.total}>{numberFormat.format(model.total)}</DotText>
      <DotText style={styles.caption}>
        contributions · @{model.login.toLowerCase()}
      </DotText>

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
                  day.isToday && styles.today,
                ]}
              />
            ))}
          </View>
        ))}
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
        <View style={styles.footerSpacer} />
        <DotText style={styles.todayLabel}>
          today · {model.todayCount}
        </DotText>
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
    gap: 14,
    margin: SCREEN_MARGIN,
    padding: WIDGET_PADDING,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusDot: {
    backgroundColor: colors.accent,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  statusDotIdle: {
    backgroundColor: 'transparent',
    borderColor: colors.text.faint,
    borderWidth: 1,
  },
  total: {
    fontSize: 44,
    letterSpacing: 2,
    lineHeight: 48,
  },
  caption: {
    color: colors.text.secondary,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: -10,
  },
  grid: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 4,
  },
  dot: {
    borderRadius: 999,
  },
  today: {
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
  footerSpacer: {
    flex: 1,
  },
  todayLabel: {
    color: colors.text.secondary,
    fontSize: 10,
    letterSpacing: 1,
  },
});
