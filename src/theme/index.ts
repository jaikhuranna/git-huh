/**
 * Design tokens for git-huh 2.0.
 *
 * Every value is lifted from the "nothing github" pinboard (design/board),
 * and the board is emphatically *not* Nothing OS: warm paper instead of cold
 * grey, crosses and bars instead of dot matrices, a serif display face beside
 * a grotesque, and six categorical brights instead of one brand red.
 *
 * Nothing's own language survives in exactly one place — the Material You
 * background of widget A, resolved natively from the nothing-mtui token map.
 * Nothing red never appears in this file.
 */

import { Appearance } from 'react-native';

const light = {
  /** pin04 / pin07 warm paper — the app's default canvas. */
  canvas: '#F2F0EB',
  /** pin02 Ai OS grey, used only by the `now` screen. */
  canvasCool: '#E4E3DE',
  /** pin09 poster flat grey. */
  canvasFlat: '#EFEFEF',
  /** pin10 rain-chart cream. */
  canvasCream: '#F7F5F0',

  card: '#FBFAF7',
  recess: '#E9E7E1',
  hair: 'rgba(17,16,16,0.12)',
  hairStrong: 'rgba(17,16,16,0.28)',

  ink: '#111110',
  ink70: '#5B5A55',
  ink40: '#93918B',
  ink20: '#C6C4BE',

  /** pin03 filing tabs, pin08 urbit card. */
  black: '#0B0B0A',
  onBlack: '#F4F2ED',
  onBlack55: 'rgba(244,242,237,0.55)',
  onBlack25: 'rgba(244,242,237,0.25)',

  /**
   * Categorical brights — pin04's colored words, pin06's letter chips and
   * pin09's poster squares converge on these six. They mark *categories*;
   * none of them is a brand accent, and none is ever the only thing that
   * carries meaning.
   */
  blue: '#2F7FE0',
  red: '#E8412B',
  green: '#1F9A53',
  yellow: '#F5B426',
  purple: '#6B4FBB',
  pink: '#F2A0C4',

  /** pin02 dock pastels. */
  pastels: ['#F2A65A', '#B9A7E6', '#9BC995', '#F2A0C4'] as readonly string[],

  /** pin09 poster square cycle — black dominates, brights punctuate. */
  poster: ['#0B0B0A', '#0B0B0A', '#0B0B0A', '#3B9FE0', '#EE3124', '#2DA44E'] as readonly string[],

  /** pin07 full-bleed gradient stops. */
  warmGradient: ['#F5B426', '#D23A0E'] as readonly string[],
  coldGradient: ['#7FA8C9', '#2C4F78'] as readonly string[],

  /**
   * pin11's ultramarine field, sampled from the pin itself. Used by exactly
   * one surface — the loading screen — where it is the whole canvas.
   */
  klein: '#1A50D5',

  /** pin10 rain chart: steel for the "before" column, olive for "after". */
  steel: '#5E86A3',
  olive: '#8C8A5E',
  rain: '#2F6FA8',
};

/**
 * The same paper at night. Not an inverted screenshot: the canvas is a warm
 * near-black (the board's ink, lifted a step so a card can sit on it), the
 * ink is the day's paper, and the brights keep their hue. `black` means "the
 * solid surface" — a selected pill, a filing tab — so it inverts with the
 * rest and stays the strongest thing on the page.
 */
const dark: Palette = {
  ...light,
  canvas: '#141312',
  canvasCool: '#1A1A18',
  canvasFlat: '#161616',
  canvasCream: '#171614',

  card: '#1E1D1B',
  recess: '#282724',
  hair: 'rgba(242,240,235,0.12)',
  hairStrong: 'rgba(242,240,235,0.28)',

  ink: '#F2F0EB',
  ink70: '#B3B0A8',
  ink40: '#7F7C76',
  ink20: '#45433F',

  black: '#F2F0EB',
  onBlack: '#111110',
  onBlack55: 'rgba(17,16,16,0.55)',
  onBlack25: 'rgba(17,16,16,0.25)',

  blue: '#4A92EC',
  red: '#F0553F',
  green: '#35B067',

  poster: ['#F2F0EB', '#F2F0EB', '#F2F0EB', '#3B9FE0', '#EE3124', '#2DA44E'],
};

type Palette = { [K in keyof typeof light]: (typeof light)[K] };

export type Scheme = 'light' | 'dark';

let scheme: Scheme = Appearance.getColorScheme() === 'dark' ? 'dark' : 'light';
/** Bumped on every change of scheme, so `themed` styles know to rebuild. */
let version = 0;

export function currentScheme(): Scheme {
  return scheme;
}

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

/** Bright cycle used when GitHub hands back a language with no color. */
export const brightCycle = [
  light.blue,
  light.red,
  light.green,
  light.yellow,
  light.purple,
  light.pink,
] as const;

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

/**
 * Platform faces to fall back on if a Google font fails to load — the app
 * must still render readable type rather than a blank screen.
 */
export const fallbacks = {
  serif: 'serif',
  sans: 'sans-serif',
  mono: 'monospace',
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
