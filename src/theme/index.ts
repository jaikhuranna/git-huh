/**
 * Design tokens: every colour, font, size and radius the app draws with.
 *
 * Every value is the home-screen widget's: one mono face, one ink in four
 * weights on a warm near-black card, dots whose size and weight are the data,
 * a plus for today and a wave for a silence. The raw palettes live in
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


/** A palette colour at a given opacity — a band under a diff line, a found line. */
export function tint(hex: string, alpha: number): string {
  const int = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

export const fonts = {
  /**
   * The widget's one face, IBM Plex Mono, in every role. The keys name the
   * role rather than the face: `light` for the big quiet words, `thin` for a
   * numeral at poster scale, `italic` for an aside.
   */
  thin: 'IBMPlexMono_200ExtraLight',
  light: 'IBMPlexMono_300Light',
  mono: 'IBMPlexMono_400Regular',
  italic: 'IBMPlexMono_400Regular_Italic',
  monoMedium: 'IBMPlexMono_500Medium',
  monoSemi: 'IBMPlexMono_600SemiBold',
} as const;

export const type = {
  /** A greeting, a handle — light, large, tight. */
  display: { fontFamily: fonts.light, fontSize: 34, lineHeight: 40, letterSpacing: -0.8 },
  displaySm: { fontFamily: fonts.light, fontSize: 24, lineHeight: 30, letterSpacing: -0.4 },
  title: { fontFamily: fonts.monoMedium, fontSize: 19, lineHeight: 25, letterSpacing: -0.3 },
  heading: { fontFamily: fonts.monoMedium, fontSize: 14, lineHeight: 20 },
  body: { fontFamily: fonts.mono, fontSize: 13, lineHeight: 20 },
  /** One figure at poster scale. */
  numeral: { fontFamily: fonts.thin, fontSize: 86, lineHeight: 92, letterSpacing: -4 },
  label: {
    fontFamily: fonts.mono,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.4,
  },
  data: { fontFamily: fonts.mono, fontSize: 12, lineHeight: 16 },
  micro: { fontFamily: fonts.mono, fontSize: 10, lineHeight: 13 },
} as const;

export const radii = {
  /** The widget's corner, on every card. */
  sheet: 28,
  card: 24,
  tile: 14,
  pill: 999,
} as const;

export const space = {
  gutter: 18,
  card: 18,
  row: 14,
} as const;

/**
 * Level → alpha/scale ramps shared by every field that reads intensity — the
 * widget's own (`DotFieldRenderer.SCALES` / `ALPHAS`), so a dot in the app
 * and a dot on the home screen are the same dot.
 */
export const levels = {
  alpha: [0.26, 0.46, 0.66, 0.84, 1],
  scale: [0.26, 0.44, 0.62, 0.82, 1],
} as const;
