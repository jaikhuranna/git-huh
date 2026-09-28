import { useMemo } from 'react';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { howLong, howLongMonths, quietRuns, wavePath } from '../lib/quiet';
import { colors, fonts, levels } from '../theme';
import { dot } from './DotField';

/**
 * One row of the widget's dots: a value per slot — a day, a week, a month —
 * drawn as a dot whose size and weight step with the value against the row's
 * peak. The peak squares off and carries its number; a slot with nothing in
 * it is the grid's ghost; `today` is the plus; and a long enough run of
 * nothing is the app's wave with its length over it, exactly as on the
 * widget. Every chart over time in the app that is not a whole field is one
 * or more of these.
 */
export function DotRow({
  values,
  width,
  height = 30,
  labels,
  today,
  quiet,
  unit = 'day',
  until,
  peakLabel = true,
  ink = colors.ink,
}: {
  values: readonly number[];
  width: number;
  /** Height of the dot band; labels, if any, go under it. */
  height?: number;
  /** One short label per slot, drawn under it (weekday initials, months). */
  labels?: readonly string[];
  /** Index drawn as the plus. */
  today?: number;
  /** A run of at least this many empty slots is a wave. Off when omitted. */
  quiet?: number;
  /** What a slot is, for the wave's length. */
  unit?: 'day' | 'week' | 'month';
  /** Slots after this have not happened and are never a silence. */
  until?: number;
  peakLabel?: boolean;
  ink?: string;
}) {
  const count = Math.max(1, values.length);
  const pitch = width / count;
  const size = Math.min(pitch * 0.72, height * 0.72);
  const labelRow = labels ? 16 : 0;
  const top = peakLabel ? 14 : 0;
  const cy = top + height / 2;

  const { buckets, ghosts, plus, waves, peak } = useMemo(() => {
    const peakValue = Math.max(0, ...values);
    const runs = quiet ? quietRuns(values, quiet, until ?? (today ?? values.length)) : [];
    const silent = (index: number) => runs.some((run) => index >= run.start && index <= run.end);
    const buckets: string[][] = [[], [], [], [], []];
    const ghosts: string[] = [];
    let plus = '';
    values.forEach((value, index) => {
      if (silent(index)) return;
      const cx = index * pitch + pitch / 2;
      if (index === today) {
        const arm = size * 0.5;
        const bar = size * 0.22;
        plus =
          `M${cx - arm} ${cy - bar / 2}h${arm * 2}v${bar}h${-arm * 2}Z` +
          `M${cx - bar / 2} ${cy - arm}h${bar}v${arm * 2}h${-bar}Z`;
        return;
      }
      if (value <= 0 || peakValue <= 0) {
        ghosts.push(dot(cx, cy, size * levels.scale[0], false));
        return;
      }
      const level = Math.max(1, Math.min(4, Math.ceil((value / peakValue) * 4)));
      buckets[level].push(dot(cx, cy, size * levels.scale[level], level === 4));
    });
    const waves = runs.map((run) => {
      const x1 = run.start * pitch + pitch * 0.25;
      const x2 = (run.end + 1) * pitch - pitch * 0.25;
      const slots = run.end - run.start + 1;
      return {
        key: run.start,
        d: wavePath(x1, x2, cy, Math.min(3, height * 0.1), Math.max(9, Math.min(14, pitch * 0.9))),
        x: (x1 + x2) / 2,
        label:
          x2 - x1 < 34
            ? ''
            : unit === 'month'
              ? howLongMonths(slots)
              : howLong(slots * (unit === 'week' ? 7 : 1)),
      };
    });
    const peakIndex = values.indexOf(peakValue);
    return {
      buckets: buckets.map((parts) => parts.join('')),
      ghosts: ghosts.join(''),
      plus,
      waves,
      peak: peakValue > 0 && peakIndex !== today ? { index: peakIndex, value: peakValue } : null,
    };
  }, [cy, height, pitch, quiet, size, today, unit, until, values]);

  return (
    <Svg height={top + height + labelRow} width={width}>
      {ghosts ? <Path d={ghosts} fill={ink} opacity={levels.alpha[0] * 0.55} /> : null}
      {buckets.map((d, level) =>
        d ? <Path d={d} fill={ink} key={level} opacity={levels.alpha[level]} /> : null,
      )}
      {plus ? <Path d={plus} fill={ink} /> : null}
      {waves.map((wave) => (
        <Path
          d={wave.d}
          fill="none"
          key={`w${wave.key}`}
          opacity={0.5}
          stroke={ink}
          strokeLinecap="round"
          strokeWidth={1.25}
        />
      ))}
      {waves.map((wave) =>
        wave.label ? (
          <SvgText
            fill={ink}
            fontFamily={fonts.mono}
            fontSize={9}
            key={`t${wave.key}`}
            opacity={0.7}
            textAnchor="middle"
            x={wave.x}
            y={cy - 8}
          >
            {wave.label}
          </SvgText>
        ) : null,
      )}
      {peakLabel && peak ? (
        <SvgText
          fill={ink}
          fontFamily={fonts.mono}
          fontSize={9}
          opacity={0.8}
          textAnchor="middle"
          x={peak.index * pitch + pitch / 2}
          y={10}
        >
          {peak.value}
        </SvgText>
      ) : null}
      {labels?.map((label, index) =>
        label ? (
          <SvgText
            fill={ink}
            fontFamily={fonts.mono}
            fontSize={9}
            key={`l${index}`}
            opacity={index === today ? 0.9 : 0.45}
            textAnchor="middle"
            x={index * pitch + pitch / 2}
            y={top + height + 12}
          >
            {label}
          </SvgText>
        ) : null,
      )}
    </Svg>
  );
}
