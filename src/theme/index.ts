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

export const colors = {
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
  pastels: ['#F2A65A', '#B9A7E6', '#9BC995', '#F2A0C4'],

  /** pin09 poster square cycle — black dominates, brights punctuate. */
  poster: ['#0B0B0A', '#0B0B0A', '#0B0B0A', '#3B9FE0', '#EE3124', '#2DA44E'],

  /** pin07 full-bleed gradient stops. */
  warmGradient: ['#F5B426', '#D23A0E'],
  coldGradient: ['#7FA8C9', '#2C4F78'],

  /**
   * pin11's ultramarine field, sampled from the pin itself. Used by exactly
   * one surface — the loading screen — where it is the whole canvas.
   */
  klein: '#1A50D5',

  /** pin10 rain chart: steel for the "before" column, olive for "after". */
  steel: '#5E86A3',
  olive: '#8C8A5E',
  rain: '#2F6FA8',
} as const;

/** Bright cycle used when GitHub hands back a language with no color. */
export const brightCycle = [
  colors.blue,
  colors.red,
  colors.green,
  colors.yellow,
  colors.purple,
  colors.pink,
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
