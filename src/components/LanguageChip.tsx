import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import { languageMark } from '../lib/languageMarks';
import { colors, fonts, themed } from '../theme';
import { Heading } from './Type';

/**
 * A language's real mark in the app's one ink. Languages devicon does not
 * cover fall back to a two-letter monogram. GitHub's colour for the language
 * is not drawn: the name always sits beside the mark, and the name is what
 * tells two languages apart.
 */
export function LanguageMarkIcon({
  name,
  size,
  tint = colors.ink,
}: {
  name: string;
  size: number;
  tint?: string;
}) {
  const mark = languageMark(name);

  if (!mark) {
    return (
      <Heading
        style={{
          color: tint,
          fontFamily: fonts.monoSemi,
          fontSize: Math.max(8, size * 0.5),
          lineHeight: Math.max(10, size * 0.62),
        }}
      >
        {name.slice(0, 2).toLowerCase()}
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

/** The mark on a round chip of the card's inset — the widget's dot, holding a glyph. */
export function LanguageChip({
  name,
  size,
  round = true,
}: {
  name: string;
  size: number;
  round?: boolean;
}) {
  return (
    <View
      style={[
        styles.chip,
        {
          borderRadius: round ? size / 2 : 6,
          height: size,
          width: size,
        },
      ]}
    >
      <LanguageMarkIcon name={name} size={size * 0.54} />
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: {
      alignItems: 'center',
      backgroundColor: colors.recess,
      justifyContent: 'center',
    },
  }),
);
