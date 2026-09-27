import { StyleSheet, Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, fonts, themed, type } from '../theme';

/**
 * The three voices of the board: a display serif (pin04's "Hey,"), a
 * grotesque (pin02's headings and pin07's thin numerals) and a typewriter
 * mono (pin03's index, pin08's ~names, pin09's caption).
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

/** pin04 — greetings, hero words, pin10's year labels. */
export const Display = make('display');
export const Serif = make('serif');
export const Title = make('title');
export const Heading = make('heading');
export const Body = make('body');
/** pin07's 54°F lockup — Inter ExtraLight at poster scale. */
export const Numeral = make('numeral');
/** Small mono caps-ish label — the app's connective tissue. */
export const Label = make('label');
export const Data = make('data');
export const Micro = make('micro');

const voices = themed(() =>
  StyleSheet.create({
    display: { ...type.display, color: colors.ink },
    serif: { fontFamily: fonts.serif, fontSize: 15, lineHeight: 20, color: colors.ink },
    title: { ...type.title, color: colors.ink },
    heading: { ...type.heading, color: colors.ink },
    body: { ...type.body, color: colors.ink },
    numeral: { ...type.numeral, color: colors.ink },
    label: { ...type.label, color: colors.ink40 },
    data: { ...type.data, color: colors.ink },
    micro: { ...type.micro, color: colors.ink40 },
  }),
);
