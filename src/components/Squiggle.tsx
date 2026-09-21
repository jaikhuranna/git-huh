import { useMemo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { colors } from '../theme';

/**
 * A hand-drawn-looking wave, used as a rule.
 *
 * Conversation is the one part of a pull request that is not data — it is
 * people talking — and a straight hairline files it away as another table.
 * The wave is the screen's way of saying this part is written, not measured:
 * it separates comments, runs down the side of a thread as its spine, and
 * underlines the headings above them.
 */
export function Squiggle({
  length,
  amplitude = 2.6,
  wavelength = 13,
  color = colors.ink,
  opacity = 0.5,
  strokeWidth = 1.25,
  vertical = false,
  phase = 0,
  style,
}: {
  /** How far the wave runs, in points. */
  length: number;
  amplitude?: number;
  wavelength?: number;
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  /** Runs top to bottom instead of left to right. */
  vertical?: boolean;
  /** Shifts the wave along itself, so stacked rules do not line up. */
  phase?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const thickness = amplitude * 2 + strokeWidth * 2;
  const d = useMemo(
    () => wave(length, amplitude, wavelength, strokeWidth, phase, vertical),
    [amplitude, length, phase, strokeWidth, vertical, wavelength],
  );

  const width = vertical ? thickness : Math.max(1, length);
  const height = vertical ? Math.max(1, length) : thickness;

  return (
    <View pointerEvents="none" style={style}>
      <Svg height={height} width={width}>
        <Path
          d={d}
          fill="none"
          opacity={opacity}
          stroke={color}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
        />
      </Svg>
    </View>
  );
}

/** One sine, sampled finely enough that the curve never shows its facets. */
function wave(
  length: number,
  amplitude: number,
  wavelength: number,
  strokeWidth: number,
  phase: number,
  vertical: boolean,
): string {
  const centre = amplitude + strokeWidth;
  const steps = Math.max(2, Math.ceil(length / 2));
  const points: string[] = [];

  for (let step = 0; step <= steps; step++) {
    const along = (step / steps) * length;
    const across =
      centre + Math.sin(((along + phase) / wavelength) * 2 * Math.PI) * amplitude;
    const [x, y] = vertical ? [across, along] : [along, across];
    points.push(`${step === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  return points.join(' ');
}
