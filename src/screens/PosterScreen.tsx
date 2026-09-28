import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Line, Path, Text as SvgText } from 'react-native-svg';

import { Label } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { howLong, howLongMonths, quietRuns, wavePath, weekOfYear } from '../lib/quiet';
import { dot } from '../components/DotField';
import { colors, fonts, levels, radii, themed } from '../theme';
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

export interface Series {
  values: number[];
  /** Calendar month each column belongs to, for the axis. */
  months: number[];
  unit: 'week' | 'month';
  /**
   * Columns that have happened. The rest of this calendar year is zero
   * because it is the future, and the future is not a silence.
   */
  until: number;
}

/** The poster's columns for one year: its own weeks, else its months, else the trailing window. */
export function seriesFor(model: GitHubModel, year: number, now: Date = new Date()): Series {
  const current = year === now.getFullYear();
  const entry = model.years.find((candidate) => candidate.year === year);
  if (entry && entry.weeks.length > 0) {
    return {
      values: entry.weeks,
      months: entry.weekMonths,
      unit: 'week',
      until: current ? Math.min(entry.weeks.length, weekOfYear(now) + 1) : entry.weeks.length,
    };
  }
  if (entry && entry.months.some((count) => count > 0)) {
    return {
      values: entry.months,
      months: entry.months.map((_, index) => index),
      unit: 'month',
      until: current ? now.getMonth() + 1 : 12,
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
    until: model.weeks.length,
  };
}

/**
 * The year as a poster: columns of the widget's dots rising from the
 * baseline and dissolving into a rain of smaller, fainter ones at the top,
 * filling the page the way a poster does. One column per week of the selected year; the year
 * chips walk back through every year the account has been active.
 *
 * Every year is drawn from its *own* calendar, so 2019 gets the same
 * fifty-two columns as this year rather than twelve monthly bars that read
 * as a different chart — and this year's label sits over this calendar year,
 * not over the trailing 365 days.
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

  const series = useMemo<Series>(() => seriesFor(model, active), [active, model]);

  const total = series.values.reduce((sum, value) => sum + value, 0);
  const peak = Math.max(1, ...series.values);
  const peakIndex = series.values.indexOf(peak);
  const peakMonth = MONTH_NAMES[series.months[peakIndex] ?? 0];

  return (
    <View style={styles.screen}>
      <View style={styles.head}>
        <Label style={styles.headLabel}>{active}</Label>
        <Label>{series.unit === 'week' ? 'week by week' : 'month by month'}</Label>
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
 * The poster's signature move: a solid column of dots that breaks into
 * scattered, drifting ones across its top third, the busiest week's column
 * squared up to full weight. A month rule runs under the baseline so a column can be placed
 * in the year without counting.
 */
export function PixelRain({
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
  const { values, months, until, unit } = series;
  const peakColumn = values.indexOf(Math.max(...values));
  const count = Math.max(values.length, 1);
  const pitch = width / count;
  const cell = Math.max(3, Math.min(10, pitch - 1));
  const rows = Math.max(1, Math.floor(height / cell));

  // One path per weight: a poster's worth of dots is five nodes.
  const buckets: string[][] = [[], [], [], [], []];

  values.forEach((value, column) => {
    const filled = Math.round((value / peak) * rows);
    // The top 30% of every column dissolves.
    const solid = Math.floor(filled * 0.7);
    const left = column * pitch + (pitch - cell) / 2;

    for (let row = 0; row < filled; row++) {
      const seed = hash(`${column}:${row}`);
      const dissolving = row >= solid;
      // Higher up the dissolve, the more dots drop out, and the fainter and
      // smaller the ones left — the column thins into the page.
      const progress = filled > solid ? (row - solid) / (filled - solid) : 0;
      if (dissolving && (seed % 100) / 100 < progress * 0.85) continue;

      // Drift is a fraction of a *dot*, not of a column: at one whole pitch
      // the loose dots landed on the neighbouring columns and read as debris.
      const drift = dissolving ? (((seed >> 7) % 3) - 1) * cell * 0.55 : 0;
      const x = left + drift;
      if (x < 0 || x > width - cell) continue;

      const level = dissolving ? Math.max(0, 3 - Math.floor(progress * 3)) : column === peakColumn ? 4 : 3;
      buckets[level].push(
        dot(x + cell / 2, height - row * cell - cell / 2, cell * 0.8 * levels.scale[level], false),
      );
    }
  });
  // A month or more of nothing is bridged with the app's wave, sitting on
  // the baseline where the columns would have stood, with its length over it.
  const silences = quietRuns(values, unit === 'week' ? 4 : 3, until).map((run) => {
    const x1 = run.start * pitch + pitch * 0.2;
    const x2 = (run.end + 1) * pitch - pitch * 0.2;
    const length = run.end - run.start + 1;
    return {
      key: run.start,
      d: wavePath(x1, x2, height - 7, 2.4, 11),
      x: (x1 + x2) / 2,
      label: unit === 'week' ? howLong(length * 7) : howLongMonths(length),
      // The columns above a silence are empty, so its length always has room.
      roomy: true,
    };
  });

  return (
    <>
      {buckets.map((d, level) =>
        d.length ? (
          <Path d={d.join('')} fill={colors.ink} key={`l${level}`} opacity={levels.alpha[level]} />
        ) : null,
      )}
      {silences.map((silence) => (
        <Path
          d={silence.d}
          fill="none"
          key={`w${silence.key}`}
          opacity={0.5}
          stroke={colors.ink}
          strokeLinecap="round"
          strokeWidth={1.25}
        />
      ))}
      {silences.map((silence) =>
        silence.roomy ? (
          <SvgText
            fill={colors.ink}
            fontFamily={fonts.mono}
            fontSize={9}
            key={`t${silence.key}`}
            opacity={0.65}
            textAnchor="middle"
            x={silence.x}
            y={height - 16}
          >
            {silence.label}
          </SvgText>
        ) : null,
      )}
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

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
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
      borderColor: colors.hairStrong,
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
  }),
);
