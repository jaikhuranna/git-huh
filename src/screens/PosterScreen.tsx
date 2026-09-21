import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';

import { Label } from '../components/Type';
import { Wordmark } from '../components/Wordmark';
import type { GitHubModel } from '../lib/contributions';
import { colors, radii } from '../theme';
import { fmt, hash, Page } from './shared';

/**
 * pin09 — the IBM poster. Columns of stacked squares rising from the
 * baseline and dissolving into pixel rain at the top. One column per week;
 * the year chips walk back through every year the account has been active.
 */
export function PosterScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const [year, setYear] = useState<number | null>(null);

  const years = model.years.map((entry) => entry.year).sort((a, b) => b - a);
  const active = year ?? years[0] ?? new Date().getFullYear();

  // The live calendar only covers the trailing year, so older years fall back
  // to their monthly shape — twelve columns instead of fifty-two.
  const series = useMemo(() => {
    const latest = years[0];
    if (active === latest && model.weeks.length > 0) {
      return { values: model.weeks, unit: 'weeks' as const };
    }
    const entry = model.years.find((candidate) => candidate.year === active);
    return { values: entry?.months ?? [], unit: 'months' as const };
  }, [active, model.weeks, model.years, years]);

  const chartWidth = width - 40;
  const chartHeight = 420;
  const total = series.values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...series.values);
  const peakIndex = series.values.indexOf(peak);

  return (
    <Page background={colors.canvasFlat}>
      <View style={styles.head}>
        <Label style={styles.headLabel}>{active}</Label>
        <Wordmark size={19} />
      </View>

      <Svg height={chartHeight} width={chartWidth}>
        <PixelRain
          height={chartHeight}
          peak={peak}
          values={series.values}
          width={chartWidth}
        />
      </Svg>

      <Label style={styles.caption}>
        {fmt(total)} contributions · peak {series.unit === 'weeks' ? 'week' : 'month'}{' '}
        {peakIndex + 1} at {fmt(peak)}
      </Label>

      <ScrollView
        contentContainerStyle={styles.chips}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        {years.map((candidate) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: candidate === active }}
            key={candidate}
            onPress={() => setYear(candidate)}
            style={[styles.chip, candidate === active && styles.chipOn]}
          >
            <Label style={candidate === active ? styles.chipLabelOn : undefined}>
              {candidate}
            </Label>
          </Pressable>
        ))}
      </ScrollView>
    </Page>
  );
}

/**
 * The poster's signature move: a solid column that breaks into scattered,
 * drifting squares across its top third. Black dominates; the IBM brights
 * punctuate.
 */
function PixelRain({
  values,
  width,
  height,
  peak,
}: {
  values: number[];
  width: number;
  height: number;
  peak: number;
}) {
  const count = Math.max(values.length, 1);
  const pitch = width / count;
  const cell = Math.max(3, Math.min(9, pitch - 1));
  const rows = Math.floor(height / cell);

  const squares: ReactElement[] = [];

  values.forEach((value, column) => {
    const filled = Math.round((value / peak) * rows);
    // The top 30% of every column dissolves.
    const solid = Math.floor(filled * 0.7);

    for (let row = 0; row < filled; row++) {
      const seed = hash(`${column}:${row}`);
      const dissolving = row >= solid;
      // Higher up the dissolve, the more squares drop out.
      const progress = filled > solid ? (row - solid) / (filled - solid) : 0;
      if (dissolving && (seed % 100) / 100 < progress * 0.85) continue;

      const drift = dissolving ? ((seed >> 7) % 3) - 1 : 0;
      const x = (column + drift) * pitch;
      if (x < 0 || x > width - cell) continue;

      squares.push(
        <Rect
          fill={colors.poster[seed % colors.poster.length]}
          height={cell - 1}
          key={`${column}-${row}`}
          width={cell - 1}
          x={x}
          y={height - (row + 1) * cell}
        />,
      );
    }
  });

  return <>{squares}</>;
}

const styles = StyleSheet.create({
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 18,
  },
  headLabel: {
    color: colors.ink,
  },
  caption: {
    marginTop: 12,
  },
  chips: {
    gap: 8,
    paddingTop: 16,
  },
  chip: {
    borderColor: colors.hair,
    borderRadius: radii.pill,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipOn: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  chipLabelOn: {
    color: colors.onBlack,
  },
});
