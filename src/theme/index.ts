/**
 * git-huh? design tokens.
 *
 * Nothing-style: pure black canvas, dot-matrix type, and a monochrome
 * tonal ramp. Color is used the way Nothing OS widgets use it — a single
 * red accent on an otherwise grayscale surface.
 */
export const colors = {
  canvas: '#000000',
  surface: '#0A0A0A',
  outline: '#1F1F1F',

  text: {
    primary: '#F2F2F2',
    secondary: '#8A8A8A',
    faint: '#4A4A4A',
  },

  /** Nothing red — reserved for "today" and the wordmark question mark. */
  accent: '#D71921',

  /**
   * Contribution intensity ramp. Material-style tonal steps mapped onto a
   * monochrome scale: dim gray (no activity) → near-white (peak day).
   * No hue, only lightness — that restraint is what makes it read as Nothing.
   * The bottom step stays clearly visible against `surface`; sparse days
   * must read as dots, not gaps.
   */
  ramp: ['#242424', '#4A4A4A', '#7A7A7A', '#B0B0B0', '#EDEDED'],
} as const;

export const fonts = {
  /** DotGothic16 — open-licensed stand-in for Nothing's proprietary NDot. */
  dot: 'DotGothic16_400Regular',
} as const;

export const radii = {
  widget: 28,
} as const;
