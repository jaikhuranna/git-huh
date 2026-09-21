import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors, levels } from '../theme';

/**
 * pin04's texture: the contribution year drawn as plus glyphs rather than
 * dots. Weight and opacity both step with intensity, which is what makes
 * the field read as printed type instead of a heat map — and is the whole
 * reason this app doesn't own a dot matrix any more.
 *
 * One <Path> per level keeps the tree at five nodes instead of hundreds.
 */
export function CrossField({
  days,
  columns = 26,
  rows = 7,
  height = 120,
  style,
}: {
  /** Levels 0–4, column-major. Omitted for the decorative sign-in field. */
  days?: readonly number[];
  columns?: number;
  rows?: number;
  height?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const cell = height / rows;
  const width = cell * columns;

  const paths = useMemo(() => {
    const cells = days ?? decorative(columns * rows);
    const visible = cells.slice(-columns * rows);
    const buckets: string[][] = [[], [], [], [], []];

    visible.forEach((level, index) => {
      const col = Math.floor(index / rows);
      const row = index % rows;
      const cx = col * cell + cell / 2;
      const cy = row * cell + cell / 2;
      // Arms shorten with level so faint crosses read as hairline ticks.
      const arm = cell * (0.22 + 0.11 * level);
      buckets[level].push(
        `M${cx - arm} ${cy}H${cx + arm}M${cx} ${cy - arm}V${cy + arm}`,
      );
    });

    return buckets.map((segments) => segments.join(''));
  }, [days, columns, rows, cell]);

  return (
    <View style={[{ height, width }, style]}>
      <Svg height={height} width={width}>
        {paths.map((d, level) =>
          d ? (
            <Path
              d={d}
              key={level}
              opacity={levels.alpha[level]}
              stroke={colors.ink}
              strokeLinecap="butt"
              strokeWidth={0.9 + level * 0.65}
            />
          ) : null,
        )}
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
