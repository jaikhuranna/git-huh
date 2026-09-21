import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Rect, Text as SvgText } from 'react-native-svg';

import { Label } from '../components/Type';
import { Wordmark } from '../components/Wordmark';
import type { GitHubModel } from '../lib/contributions';
import { colors, fonts, radii } from '../theme';
import { fmt, hash } from './shared';

const AXIS = 18;
const MONTHS = ['j', 'f', 'm', 'a', 'm', 'j', 'j', 'a', 's', 'o', 'n', 'd'];
const MONTH_NAMES = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

interface Series {
  values: number[];
  /** Calendar month each column belongs to, for the axis. */
  months: number[];
  unit: 'week' | 'month';
}

/**
 * pin09 — the IBM poster. Columns of stacked squares rising from the
 * baseline and dissolving into pixel rain at the top, filling the page the
 * way a poster does. One column per week of the selected year; the year
 * chips walk back through every year the account has been active.
 *
 * Every year is drawn from its *own* calendar, so 2019 gets the same
 * fifty-two columns as this year. The screen used to fall back to twelve
 * monthly bars for anything but the latest year, which made older years look
 * like a different chart — and drew the trailing-365-day window under this
 * year's label, which was not that year at all.
 */
export function PosterScreen({ model }: { model: GitHubModel }) {
  const [year, setYear] = useState<number | null>(null);
  // The poster is the whole page; its size comes from whatever the pager
  // leaves after the head, the caption and the year chips.
  const [stage, setStage] = useState({ width: 0, height: 0 });

  const years = useMemo(
    () => model.years.map((entry) => entry.year).sort((a, b) => b - a),
    [model.years],
  );
  const active = year ?? years[0] ?? new Date().getFullYear();

  const series = useMemo<Series>(() => {
    const entry = model.years.find((candidate) => candidate.year === active);
    if (entry && entry.weeks.length > 0) {
      return { values: entry.weeks, months: entry.weekMonths, unit: 'week' };
    }
    if (entry && entry.months.some((count) => count > 0)) {
      return {
        values: entry.months,
        months: entry.months.map((_, index) => index),
        unit: 'month',
      };
    }
    // No per-year calendar came back (a zeroed stats query): the trailing
    // window is all there is, and it is at least this year's shape.
    return {
      values: model.weeks,
      months: model.weeks.map((_, index) =>
        Math.min(11, Math.floor((index / Math.max(1, model.weeks.length)) * 12)),
      ),
      unit: 'week',
    };
  }, [active, model.weeks, model.years]);

  const total = series.values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...series.values);
  const peakIndex = series.values.indexOf(peak);
  const peakMonth = MONTH_NAMES[series.months[peakIndex] ?? 0];

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Label style={styles.headLabel}>{active}</Label>
        <Wordmark size={19} />
      </View>

      <View
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setStage((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
        style={styles.stage}
      >
        {stage.width > 0 && stage.height > 0 && (
          <Svg height={stage.height} width={stage.width}>
            <PixelRain
              height={stage.height - AXIS}
              peak={peak}
              series={series}
              width={stage.width}
            />
          </Svg>
        )}
      </View>

      <Label style={styles.caption}>
        {total > 0
          ? `${fmt(total)} contributions · busiest ${series.unit} ${fmt(peak)}, in ${peakMonth}`
          : `nothing recorded in ${active}`}
      </Label>

      {/* Wrapped, not scrolled: a horizontal scroller nested inside the
          pager loses every drag to the page swipe, so the chips could never
          be reached past the edge of the screen. */}
      <View style={styles.chips}>
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
      </View>
    </View>
  );
}

/**
 * The poster's signature move: a solid column that breaks into scattered,
 * drifting squares across its top third. Black dominates; the IBM brights
 * punctuate. A month rule runs under the baseline so a column can be placed
 * in the year without counting.
 */
function PixelRain({
  series,
  width,
  height,
  peak,
}: {
  series: Series;
  width: number;
  height: number;
  peak: number;
}) {
  const { values, months } = series;
  const count = Math.max(values.length, 1);
  const pitch = width / count;
  const cell = Math.max(3, Math.min(10, pitch - 1));
  const rows = Math.max(1, Math.floor(height / cell));

  const squares: ReactElement[] = [];

  values.forEach((value, column) => {
    const filled = Math.round((value / peak) * rows);
    // The top 30% of every column dissolves.
    const solid = Math.floor(filled * 0.7);
    const left = column * pitch + (pitch - cell) / 2;

    for (let row = 0; row < filled; row++) {
      const seed = hash(`${column}:${row}`);
      const dissolving = row >= solid;
      // Higher up the dissolve, the more squares drop out.
      const progress = filled > solid ? (row - solid) / (filled - solid) : 0;
      if (dissolving && (seed % 100) / 100 < progress * 0.85) continue;

      // Drift is a fraction of a *square*, not of a column: at one whole
      // pitch the loose squares landed on top of the neighbouring columns
      // and read as debris floating in mid-air.
      const drift = dissolving ? (((seed >> 7) % 3) - 1) * cell * 0.55 : 0;
      const x = left + drift;
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

  return (
    <>
      {squares}
      <Line
        opacity={0.35}
        stroke={colors.ink}
        strokeWidth={1}
        x1={0}
        x2={width}
        y1={height + 0.5}
        y2={height + 0.5}
      />
      {monthTicks(months).map(({ month, column }) => (
        <SvgText
          fill={colors.ink}
          fontFamily={fonts.mono}
          fontSize={9}
          key={`${month}-${column}`}
          opacity={0.55}
          x={column * pitch}
          y={height + 13}
        >
          {MONTHS[month]}
        </SvgText>
      ))}
    </>
  );
}

/** The first column of each month — one tick per month, never two. */
function monthTicks(months: number[]): { month: number; column: number }[] {
  const ticks: { month: number; column: number }[] = [];
  let previous = -1;
  months.forEach((month, column) => {
    if (month === previous) return;
    previous = month;
    ticks.push({ month, column });
  });
  return ticks;
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvasFlat,
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 4,
  },
  head: {
    alignItems: 'baseline',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 14,
  },
  headLabel: {
    color: colors.ink,
  },
  stage: {
    flex: 1,
  },
  caption: {
    marginTop: 10,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 6,
    paddingTop: 14,
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
