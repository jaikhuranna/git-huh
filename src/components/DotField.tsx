import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { foldField, howLong, placeField, wavePath } from '../lib/quiet';
import { colors, fonts, levels } from '../theme';

/** Three weeks of nothing is where a silence becomes a wave, as on the widget. */
const QUIET_DAYS = 21;
const WAVE_COLUMNS = 3;
/** The gap between two marks, as a share of the pitch — the widget's. */
const GAP_SHARE = 0.3;

/**
 * The widget's field, in the app: a run of days as dots whose size and
 * weight are the day's level, a peak day squared off, today a plus in the
 * bottom-right corner, and three weeks or more of nothing folded into the
 * app's wave with its length written over it. `DotFieldRenderer.kt` and
 * `DotField.swift` draw the same thing on the home screen; change one, change
 * the others.
 *
 * One `<Path>` per level keeps the tree at a handful of nodes however many
 * days there are, which is what lets a whole year be drawn at once.
 */
export function DotField({
  days,
  width,
  height,
  rows = 7,
  daysPerCell = 1,
  columnsHint,
  maxPitch = 22,
  today = true,
  ghost = true,
  ink = colors.ink,
  style,
}: {
  /** Levels 0–4, oldest first; the last one is today. Omitted for a decorative field. */
  days?: readonly number[];
  width: number;
  /** Tallest the field may be; the pitch is the tighter of the two axes. */
  height: number;
  rows?: number;
  /** How many calendar days one mark stands for, so a wave's length is true. */
  daysPerCell?: number;
  /** Aim for this many columns across `width` rather than the largest pitch. */
  columnsHint?: number;
  maxPitch?: number;
  /** Draw the newest mark as the plus. */
  today?: boolean;
  /** Draw the cells before the history begins as the grid's faint ghost. */
  ghost?: boolean;
  ink?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const pitch = Math.min(
    height / rows,
    maxPitch,
    columnsHint ? width / columnsHint : Infinity,
  );
  const columns = Math.max(1, Math.floor(width / pitch));
  const drawnWidth = pitch * columns;
  const drawnHeight = pitch * rows;

  const { paths, plus, waves } = useMemo(() => {
    const buckets: string[][] = [[], [], [], [], []];
    const ghosts: string[] = [];
    const waves: { d: string; x: number; y: number; label: string }[] = [];
    let plus = '';
    const cell = pitch * (1 - GAP_SHARE);
    const centre = (column: number, row: number) => [
      column * pitch + pitch / 2,
      row * pitch + pitch / 2,
    ];

    const mark = (level: number, column: number, row: number, isToday = false) => {
      const [cx, cy] = centre(column, row);
      if (isToday) {
        const arm = cell * 0.5;
        const bar = cell * 0.22;
        plus =
          `M${cx - arm} ${cy - bar / 2}h${arm * 2}v${bar}h${-arm * 2}Z` +
          `M${cx - bar / 2} ${cy - arm}h${bar}v${arm * 2}h${-bar}Z`;
        return;
      }
      buckets[level].push(dot(cx, cy, cell * levels.scale[level], level >= 4));
    };

    if (days) {
      const quietCells = Math.ceil(QUIET_DAYS / daysPerCell);
      // A cell of several days is already coarse: the wave is narrower and
      // keeps no column of empties either side (see `foldField`).
      const coarse = daysPerCell > 1;
      const waveColumns = coarse ? 2 : WAVE_COLUMNS;
      const slots = foldField(days, rows, {
        quietCells,
        waveColumns,
        edgeColumns: coarse ? 0 : 1,
      });
      let filled = 0;
      for (const piece of placeField(slots, columns, rows, waveColumns)) {
        if (piece.kind === 'mark') {
          const newest = piece.column === columns - 1 && piece.row === rows - 1;
          mark(Math.max(0, Math.min(4, piece.level)), piece.column, piece.row, today && newest);
          filled = Math.max(filled, (columns - piece.column) * rows);
          continue;
        }
        filled = Math.max(filled, (columns - piece.fromColumn) * rows);
        const inset = pitch * 0.35;
        const x1 = piece.fromColumn * pitch + inset;
        const x2 = piece.toColumn * pitch - inset;
        const middle = drawnHeight * 0.58;
        waves.push({
          d: wavePath(x1, x2, middle, pitch * 0.14, pitch * 0.82),
          x: (x1 + x2) / 2,
          y: middle - pitch * 0.14 - pitch * 0.55,
          label: howLong(piece.cells * daysPerCell),
        });
      }
      // Before the history the app has: the grid's ghost, so an account
      // younger than the field reads as "no days here" rather than a hole.
      if (ghost) {
        const used = Math.ceil(filled / rows);
        for (let column = 0; column < columns - used; column++) {
          for (let row = 0; row < rows; row++) {
            const [cx, cy] = centre(column, row);
            ghosts.push(dot(cx, cy, cell * levels.scale[0], false));
          }
        }
      }
    } else {
      decorative(columns * rows).forEach((level, index) =>
        mark(level, Math.floor(index / rows), index % rows),
      );
    }

    return {
      paths: [...buckets.map((segments) => segments.join('')), ghosts.join('')],
      plus,
      waves,
    };
  }, [columns, days, daysPerCell, drawnHeight, ghost, pitch, rows, today]);

  return (
    <View style={[{ height: drawnHeight, width: drawnWidth }, style]}>
      <Svg height={drawnHeight} width={drawnWidth}>
        {paths.map((d, level) =>
          d ? (
            <Path
              d={d}
              fill={ink}
              key={level}
              // The last bucket is the ghost of days before the history.
              opacity={level < 5 ? levels.alpha[level] : levels.alpha[0] * 0.45}
            />
          ) : null,
        )}
        {plus ? <Path d={plus} fill={ink} /> : null}
        {waves.map((wave) => (
          <Path
            d={wave.d}
            fill="none"
            key={`w${wave.x}`}
            opacity={0.5}
            stroke={ink}
            strokeLinecap="round"
            strokeWidth={1.25}
          />
        ))}
        {waves.map((wave) => (
          <SvgText
            fill={ink}
            fontFamily={fonts.mono}
            fontSize={Math.max(8, Math.min(13, pitch * 0.62))}
            key={`t${wave.x}`}
            opacity={0.72}
            textAnchor="middle"
            x={wave.x}
            y={wave.y}
          >
            {wave.label}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

/**
 * One mark as path data: a circle, or at the peak a rounded square — the
 * widget squares off its busiest days so intensity reads in shape as well as
 * size.
 */
export function dot(cx: number, cy: number, size: number, square: boolean): string {
  const r = size / 2;
  if (square) {
    const k = size * 0.22;
    const x = cx - r;
    const y = cy - r;
    return (
      `M${x + k} ${y}h${size - 2 * k}a${k} ${k} 0 0 1 ${k} ${k}v${size - 2 * k}` +
      `a${k} ${k} 0 0 1 ${-k} ${k}h${-(size - 2 * k)}a${k} ${k} 0 0 1 ${-k} ${-k}` +
      `v${-(size - 2 * k)}a${k} ${k} 0 0 1 ${k} ${-k}Z`
    );
  }
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${size} 0a${r} ${r} 0 1 0 ${-size} 0Z`;
}

/** Collapse `size` consecutive days into their peak, preserving intensity. */
export function bucket(values: readonly number[], size: number): number[] {
  const out: number[] = [];
  // Aligned to the newest day, so the last bucket always ends on today.
  const start = values.length % size;
  if (start > 0) out.push(Math.max(...values.slice(0, start)));
  for (let i = start; i < values.length; i += size) {
    out.push(Math.max(...values.slice(i, i + size)));
  }
  return out;
}

/** Stable pseudo-random field for the sign-in screen, which has no data yet. */
function decorative(count: number): number[] {
  const out: number[] = [];
  let seed = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const roll = seed / 0xffffffff;
    // Mostly the middle weights; a peak, which squares off, is rare — as it
    // is in a real year.
    out.push(roll < 0.42 ? 0 : roll > 0.97 ? 4 : 1 + Math.floor(((roll - 0.42) / 0.55) * 3));
  }
  return out;
}
