/**
 * Design tokens: every colour, font, size and radius the app draws with.
 *
 * Every value is lifted from the "nothing github" pinboard, and the board is
 * emphatically *not* Nothing OS: warm paper instead of cold grey, crosses and
 * bars instead of dot matrices, a serif display face beside a grotesque, and
 * six categorical brights instead of one brand red. The raw palettes live in
 * `palette.ts`; this module decides which one is in force.
 */

import { Appearance } from 'react-native';

import { dark, light, type Palette } from './palette';


export type Scheme = 'light' | 'dark';

let scheme: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
/** Bumped on every change of scheme, so `themed` styles know to rebuild. */
let version = 0;

/**
 * Called by the root layout with the system's scheme before anything below it
 * renders. The tree is remounted when it changes, which is what makes every
 * `themed` sheet and every inline `colors.x` read the new palette.
 */
export function setScheme(next: Scheme): void {
  if (next === scheme) return;
  scheme = next;
  version++;
}

/**
 * Every colour, read from the scheme in force. A getter per key rather than a
 * swapped object, so `import { colors }` stays the one way to reach a colour.
 */
export const colors = Object.defineProperties(
  {} as Palette,
  Object.fromEntries(
    (Object.keys(light) as (keyof Palette)[]).map((key) => [
      key,
      { enumerable: true, get: () => (scheme === 'dark' ? dark : light)[key] },
    ]),
  ),
);

/**
 * A module-level style sheet that follows the scheme: `themed(() =>
 * StyleSheet.create({...}))`. The sheet is built on first use and again after
 * the scheme changes; `styles.x` reads the current one.
 */
export function themed<T extends object>(build: () => T): T {
  let sheet: T | null = null;
  let builtAt = -1;
  const current = (): T => {
    if (sheet === null || builtAt !== version) {
      sheet = build();
      builtAt = version;
    }
    return sheet;
  };
  return new Proxy({} as T, {
    get: (_, key) => current()[key as keyof T],
  });
}


export const fonts = {
  /** pin04's display serif — greetings, hero words, pin10's year labels. */
  serif: 'InstrumentSerif_400Regular',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
  /** pin02's grotesque — titles, body, the pin07 thin numeral. */
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemi: 'Inter_600SemiBold',
  sansBold: 'Inter_700Bold',
  sansThin: 'Inter_200ExtraLight',
  /** pin03's typewriter index, pin08's ~names, pin09's IBM caption. */
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

export const type = {
  display: { fontFamily: fonts.serif, fontSize: 44, lineHeight: 46 },
  displaySm: { fontFamily: fonts.serif, fontSize: 30, lineHeight: 34 },
  title: { fontFamily: fonts.sansBold, fontSize: 24, lineHeight: 28 },
  heading: { fontFamily: fonts.sansSemi, fontSize: 15, lineHeight: 20 },
  body: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 20 },
  /** pin07's 54°F lockup. */
  numeral: { fontFamily: fonts.sansThin, fontSize: 86, lineHeight: 90 },
  label: {
    fontFamily: fonts.monoMedium,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.8,
  },
  data: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: fonts.mono, fontSize: 9, lineHeight: 12 },
} as const;

export const radii = {
  sheet: 28,
  card: 20,
  tile: 14,
  pill: 999,
} as const;

export const space = {
  gutter: 20,
  card: 18,
  row: 14,
} as const;

/** Level → opacity/scale ramps shared by every field that reads intensity. */
export const levels = {
  alpha: [0.08, 0.3, 0.52, 0.76, 1],
  scale: [0.22, 0.44, 0.64, 0.84, 1],
} as const;
