import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { colors, fallbacks, fonts, type } from '../theme';

/**
 * The three voices of the board: a display serif (pin04's "Hey,"), a
 * grotesque (pin02's headings and pin07's thin numerals) and a typewriter
 * mono (pin03's index, pin08's ~names, pin09's caption).
 *
 * Every primitive falls back to a platform face, so a failed font download
 * degrades to readable type instead of a blank screen.
 */

/**
 * Callers routinely pass conditional arrays (`[base, isOn && onStyle]`), so
 * the prop has to be RN's own StyleProp rather than a bare TextStyle.
 */
type Props = Omit<TextProps, 'style'> & { style?: StyleProp<TextStyle> };

/** `base` is a function so the colour is read at render, in the scheme in force. */
function make(base: () => TextStyle, fallback: string) {
  return function Voice({ style, ...rest }: Props) {
    return <Text {...rest} style={[{ fontFamily: fallback }, base(), style]} />;
  };
}

/** pin04 — greetings, hero words, pin10's year labels. */
export const Display = make(
  () => ({ ...type.display, color: colors.ink }),
  fallbacks.serif,
);

export const DisplaySm = make(
  () => ({ ...type.displaySm, color: colors.ink }),
  fallbacks.serif,
);

export const Serif = make(
  () => ({ fontFamily: fonts.serif, fontSize: 15, lineHeight: 20, color: colors.ink }),
  fallbacks.serif,
);

export const Title = make(
  () => ({ ...type.title, color: colors.ink }),
  fallbacks.sans,
);

export const Heading = make(
  () => ({ ...type.heading, color: colors.ink }),
  fallbacks.sans,
);

export const Body = make(
  () => ({ ...type.body, color: colors.ink }),
  fallbacks.sans,
);

/** pin07's 54°F lockup — Inter ExtraLight at poster scale. */
export const Numeral = make(
  () => ({ ...type.numeral, color: colors.ink }),
  fallbacks.sans,
);

/** Small mono caps-ish label — the app's connective tissue. */
export const Label = make(
  () => ({ ...type.label, color: colors.ink40 }),
  fallbacks.mono,
);

export const Data = make(
  () => ({ ...type.data, color: colors.ink }),
  fallbacks.mono,
);

export const Micro = make(
  () => ({ ...type.micro, color: colors.ink40 }),
  fallbacks.mono,
);
