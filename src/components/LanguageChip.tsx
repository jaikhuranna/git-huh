import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { languageMark } from '../lib/languageMarks';
import { colors, fonts } from '../theme';
import { Heading } from './Type';

/** White or ink, whichever stays legible on `background`. */
function onColor(background: string): string {
  const hex = background.replace('#', '');
  const int = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? colors.ink : colors.onBlack;
}

/**
 * A language's real mark, tinted to sit on a chip filled with GitHub's colour
 * for that language. Languages devicon does not cover fall back to a
 * monogram, which is what the whole app used before.
 */
export function LanguageMarkIcon({
  name,
  size,
  color,
}: {
  name: string;
  size: number;
  color: string;
}) {
  const mark = languageMark(name);
  const tint = onColor(color);

  if (!mark) {
    return (
      <Heading
        style={{
          color: tint,
          fontFamily: fonts.sansBold,
          fontSize: Math.max(9, size * 0.5),
        }}
      >
        {name.slice(0, 2)}
      </Heading>
    );
  }

  return (
    <Svg height={size} viewBox={mark.viewBox} width={size}>
      <G>
        <Path d={mark.d} fill={tint} />
      </G>
    </Svg>
  );
}

/** The mark on its language-coloured chip — used by the `now` dock. */
export function LanguageChip({
  name,
  color,
  size,
  round = true,
}: {
  name: string;
  color: string;
  size: number;
  round?: boolean;
}) {
  return (
    <View
      style={[
        styles.chip,
        {
          backgroundColor: color,
          borderRadius: round ? size / 2 : 6,
          height: size,
          width: size,
        },
      ]}
    >
      <LanguageMarkIcon color={color} name={name} size={size * 0.52} />
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
