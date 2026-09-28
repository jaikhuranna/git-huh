import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, themed, type } from '../theme';

/**
 * One face, the widget's: IBM Plex Mono at every size. The primitives are
 * roles — a light display line, a medium title, a regular body, a thin
 * numeral, a small label — so a screen says what a line is for and the face
 * follows.
 *
 * A face that failed to load falls back to the platform's own, so a failed
 * download degrades to readable type rather than a blank screen.
 */

/**
 * Callers routinely pass conditional arrays (`[base, isOn && onStyle]`), so
 * the prop has to be RN's own StyleProp rather than a bare TextStyle.
 */
type Props = Omit<TextProps, 'style'> & { style?: StyleProp<TextStyle> };

/** One primitive per voice, reading its sheet at render so it follows the scheme. */
function make(voice: keyof typeof voices) {
  return function Voice({ style, ...rest }: Props) {
    return <Text {...rest} style={[voices[voice], style]} />;
  };
}

/** Greetings and hero words — light and large. */
export const Display = make('display');
export const Serif = make('serif');
export const Title = make('title');
export const Heading = make('heading');
export const Body = make('body');
/** One figure at poster scale, in the thin cut. */
export const Numeral = make('numeral');
/** The small grey label — the app's connective tissue. */
export const Label = make('label');
export const Data = make('data');
export const Micro = make('micro');

const voices = themed(() =>
  StyleSheet.create({
    display: { ...type.display, color: colors.ink },
    serif: { fontFamily: fonts.italic, fontSize: 12, lineHeight: 18, color: colors.ink70 },
    title: { ...type.title, color: colors.ink },
    heading: { ...type.heading, color: colors.ink },
    body: { ...type.body, color: colors.ink },
    numeral: { ...type.numeral, color: colors.ink },
    label: { ...type.label, color: colors.ink40 },
    data: { ...type.data, color: colors.ink },
    micro: { ...type.micro, color: colors.ink40 },
  }),
);
