/**
 * The two palettes behind the design tokens, as plain values with no React
 * Native in them, so the data layer can use them too. `index.ts` is the
 * runtime side: which palette is in force, and the sheets that follow it.
 *
 * Nothing red never appears in this file.
 */

export const light = {
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
  /**
   * Type on `klein`. The field is the same blue at night, so unlike `onBlack`
   * these do not invert with the scheme — pin11 is white on ultramarine in
   * both.
   */
  onKlein: '#F4F2ED',
  onKlein55: 'rgba(244,242,237,0.55)',

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
export const dark: Palette = {
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

export type Palette = { [K in keyof typeof light]: (typeof light)[K] };

/** Bright cycle used when GitHub hands back a language with no color. */
export const brightCycle = [
  light.blue,
  light.red,
  light.green,
  light.yellow,
  light.purple,
  light.pink,
] as const;
