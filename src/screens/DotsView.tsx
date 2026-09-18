import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DotText } from '../components/DotText';
import { DotMatrix } from '../components/DotMatrix';
import { FadeIn } from '../components/FadeIn';
import { StatCard } from '../components/StatCard';
import { insights, type WidgetModel } from '../lib/contributions';
import { colors } from '../theme';

interface DotsViewProps {
  model: WidgetModel;
}

/** Full matrix + the remaining stats as a card mosaic, after the pin-grid reference. */
export function DotsView({ model }: DotsViewProps) {
  const [width, setWidth] = useState(0);
  const stats = insights(model);

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn>
        <View style={styles.header}>
          <DotText style={styles.heading}>the year in dots</DotText>
          <DotText style={styles.total}>{format(model.total)}</DotText>
        </View>
      </FadeIn>

      {width > 0 && (
        <FadeIn delay={80}>
          <View style={styles.matrixCard}>
            <DotMatrix columns={model.columns} width={width - 36} />
          </View>
        </FadeIn>
      )}

      <FadeIn delay={140}>
        <View style={styles.legend}>
          <DotText style={styles.legendLabel}>less</DotText>
          {colors.dotScale.map((scale) => (
            <View
              key={scale}
              style={[
                styles.legendDot,
                {
                  width: Math.round(4 + scale * 8),
                  height: Math.round(4 + scale * 8),
                  backgroundColor: `rgba(255,255,255,${colors.dotAlpha[colors.dotScale.indexOf(scale)]})`,
                  borderRadius: scale >= 1 ? 2 : 999,
                },
              ]}
            />
          ))}
          <DotText style={styles.legendLabel}>more</DotText>
        </View>
      </FadeIn>

      <FadeIn delay={200}>
        <View style={styles.mosaic}>
          <View style={styles.mosaicColumn}>
            <StatCard
              value={String(stats.currentStreak)}
              label="current streak"
              accent={stats.currentStreak > 0}
            />
            <StatCard value={String(stats.bestDay)} label="best day" />
            <StatCard
              value={stats.avgPerDay.toFixed(1)}
              label="avg / day"
            />
          </View>
          <View style={styles.mosaicColumn}>
            <StatCard value={String(stats.longestStreak)} label="longest streak" />
            <StatCard value={String(stats.activeDays)} label="active days" />
            <StatCard value={stats.busiestWeekday} label="busiest day" />
          </View>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

function format(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

const styles = StyleSheet.create({
  content: {
    gap: 20,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heading: {
    fontSize: 16,
    letterSpacing: 1,
  },
  total: {
    color: colors.text.secondary,
    fontSize: 16,
    letterSpacing: 1,
  },
  matrixCard: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 168,
    padding: 18,
  },
  legend: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'flex-end',
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
  mosaic: {
    flexDirection: 'row',
    gap: 10,
  },
  mosaicColumn: {
    flex: 1,
    gap: 10,
  },
});
