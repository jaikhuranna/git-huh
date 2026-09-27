import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { foldField, howLong, placeField, wavePath } from '../lib/quiet';
import { colors, fonts, levels } from '../theme';

/** Three weeks of nothing is where a silence becomes a wave, as on the widget. */
const QUIET_DAYS = 21;
const WAVE_COLUMNS = 3;

/**
 * pin04's texture: the contribution year drawn as plus glyphs rather than
 * dots. Weight and opacity both step with intensity, which is what makes
 * the field read as printed type instead of a heat map — and is the whole
 * reason this app doesn't own a dot matrix any more.
 *
 * One <Path> per level keeps the tree at five nodes instead of hundreds.
 *
 * With real days it follows the widget's rules (`lib/quiet.ts`): the newest
 * cell is the bottom-right one, and three weeks or more of nothing folds
 * into the app's wave with its length written over it, so a year with one
 * busy spring shows the spring rather than a field of ghosts.
 */
export function CrossField({
  days,
  width,
  rows = 7,
  height = 160,
  daysPerCell = 1,
  columnsHint = 26,
  style,
}: {
  /** Levels 0–4, oldest first. Omitted for the decorative sign-in field. */
  days?: readonly number[];
  /** How many calendar days one cross stands for, so a wave's length is true. */
  daysPerCell?: number;
  /** Roughly how many columns to aim for across `width`. */
  columnsHint?: number;
  /** Available width. The cell pitch is derived from it so the field
   *  can never run past the screen edge. */
  width: number;
  rows?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  // Square cells sized to whichever axis is tighter, so the grid fits the
  // box on both. Columns then follow from the width that is actually left.
  const cell = Math.min(width / columnsHint, height / rows);
  const columns = Math.max(1, Math.floor(width / cell));
  const drawnWidth = cell * columns;

  const { paths, waves } = useMemo(() => {
    const buckets: string[][] = [[], [], [], [], []];
    const waves: { d: string; x: number; y: number; label: string }[] = [];
    const cross = (level: number, col: number, row: number) => {
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      // Arms stop well short of the cell edge so neighbouring crosses keep
      // clear air between them and never merge into bars.
      const arm = cell * (0.2 + 0.07 * level);
      buckets[level].push(`M${cx - arm} ${cy}H${cx + arm}M${cx} ${cy - arm}V${cy + arm}`);
    };

    if (days) {
      const quietCells = Math.ceil(QUIET_DAYS / daysPerCell);
      // A cell of several days is already coarse: the wave is narrower and
      // does not keep a column of empties either side (see `foldField`).
      const coarse = daysPerCell > 1;
      const waveColumns = coarse ? 2 : WAVE_COLUMNS;
      const slots = foldField(days, rows, {
        quietCells,
        waveColumns,
        edgeColumns: coarse ? 0 : 1,
      });
      for (const piece of placeField(slots, columns, rows, waveColumns)) {
        if (piece.kind === 'mark') {
          cross(Math.max(0, Math.min(4, piece.level)), piece.column, piece.row);
          continue;
        }
        const inset = cell * 0.35;
        const x1 = piece.fromColumn * cell + inset;
        const x2 = piece.toColumn * cell - inset;
        const middle = rows * cell * 0.58;
        waves.push({
          d: wavePath(x1, x2, middle, cell * 0.16, cell * 0.9),
          x: (x1 + x2) / 2,
          y: middle - cell * 0.75,
          label: howLong(piece.cells * daysPerCell),
        });
      }
    } else {
      decorative(columns * rows).forEach((level, index) =>
        cross(level, Math.floor(index / rows), index % rows),
      );
    }

    return { paths: buckets.map((segments) => segments.join('')), waves };
  }, [days, daysPerCell, columns, rows, cell]);

  return (
    <View style={[{ height: cell * rows, width: drawnWidth }, style]}>
      <Svg height={cell * rows} width={drawnWidth}>
        {paths.map((d, level) =>
          d ? (
            <Path
              d={d}
              key={level}
              opacity={levels.alpha[level]}
              stroke={colors.ink}
              strokeLinecap="butt"
              strokeWidth={0.8 + level * 0.5}
            />
          ) : null,
        )}
        {waves.map((wave) => (
          <Path
            d={wave.d}
            fill="none"
            key={`w${wave.x}`}
            opacity={0.5}
            stroke={colors.ink}
            strokeLinecap="round"
            strokeWidth={1.25}
          />
        ))}
        {waves.map((wave) => (
          <SvgText
            fill={colors.ink}
            fontFamily={fonts.mono}
            fontSize={Math.max(8, cell * 0.62)}
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

/** Stable pseudo-random field for the sign-in screen, which has no data yet. */
function decorative(count: number): number[] {
  const out: number[] = [];
  let seed = 0x9e3779b9;
  for (let i = 0; i < count; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const roll = seed / 0xffffffff;
    out.push(roll < 0.42 ? 0 : Math.min(4, 1 + Math.floor(roll * 4)));
  }
  return out;
}
