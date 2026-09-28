/**
 * The two palettes behind the design tokens, as plain values with no React
 * Native in them, so the data layer can use them too. `index.ts` is the
 * runtime side: which palette is in force, and the sheets that follow it.
 *
 * Every value comes from the home-screen widget: a warm near-black card with
 * the year on it in dots of one ink. The app is that card, zoomed out — one
 * ink in four weights on a card that sits on a slightly darker page, and no
 * colour at all except the two words a machine sometimes has to say (`yes`
 * and `no`: a line added or removed, a check that passed or failed).
 */

export const light = {
  /** The page the cards sit on. */
  canvas: '#ECE8E4',
  /** The widget's card — every raised surface in the app. */
  card: '#F8F5F2',
  /** Inset: a track, a code block, the underside of a swiped row. */
  recess: '#E0DBD6',
  hair: 'rgba(33,28,26,0.10)',
  hairStrong: 'rgba(33,28,26,0.24)',

  /**
   * One ink in four weights — statement, support, annotation, structure —
   * which is all the widget ever uses, at the same four alphas as its dots.
   */
  ink: '#211C1A',
  ink70: '#615854',
  ink40: '#978D88',
  ink20: '#CBC3BE',

  /** The solid surface: a selected chip, the one button that is the point. */
  black: '#211C1A',
  onBlack: '#F8F5F2',
  onBlack55: 'rgba(248,245,242,0.55)',
  onBlack25: 'rgba(248,245,242,0.25)',

  /**
   * The only two colours. Muted on purpose, so they sit in the widget's
   * world rather than on top of it, and never the only thing carrying the
   * meaning — a diff line is also signed, a check is also named.
   */
  yes: '#56794F',
  no: '#A8553F',
};

/**
 * The widget at night, which is how most people see it: a warm near-black
 * card on a page one step darker, the ink the colour of the "first commit"
 * strip.
 */
export const dark: Palette = {
  ...light,
  canvas: '#141110',
  card: '#221C1A',
  recess: '#2D2624',
  hair: 'rgba(236,229,224,0.09)',
  hairStrong: 'rgba(236,229,224,0.22)',

  ink: '#ECE5E0',
  ink70: '#ADA49E',
  ink40: '#7A716C',
  ink20: '#463E3B',

  black: '#ECE5E0',
  onBlack: '#1B1614',
  onBlack55: 'rgba(27,22,20,0.55)',
  onBlack25: 'rgba(27,22,20,0.25)',

  yes: '#93AD8A',
  no: '#D08A74',
};

export type Palette = { [K in keyof typeof light]: (typeof light)[K] };

/**
 * GitHub hands back some languages with no colour. The app no longer draws
 * languages in colour at all, but the data layer still fills the field, so
 * it gets greys rather than an invented hue.
 */
export const brightCycle = ['#8A817C', '#6F6762', '#A39A95', '#5A524E', '#B8AFAA', '#7F7671'] as const;
