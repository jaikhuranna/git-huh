import { nothingWidgetColors } from 'nothing-mtui';

/**
 * Design tokens sourced from nothing-mtui — the color mapping extracted
 * from com.nothing.communitywidgets. Dark mode, static fallbacks:
 * widgetBg → neutral1_900 (#1b1b1b), widgetElements → #ffffff,
 * widgetFood → #d71921 (the one allowed accent).
 */
const mtui = nothingWidgetColors(null, 'dark');

export const colors = {
  canvas: '#000000',
  surface: '#101010',
  elevated: '#1C1C1C',
  outline: 'rgba(255,255,255,0.14)',

  text: {
    primary: mtui.widgetElements, // #ffffff
    secondary: 'rgba(255,255,255,0.62)',
    faint: 'rgba(255,255,255,0.38)',
  },

  /** mtui widgetFood — Nothing red. The only hue in the entire app. */
  accent: mtui.widgetFood,

  /**
   * Dot field, after the reference cards: every cell shows a dot. Intensity
   * grows the dot toward a full white square on peak days — the base texture
   * stays visible so the card reads as a dotted field, not sparse noise.
   */
  dotScale: [0.25, 0.45, 0.65, 0.85, 1.0],
  dotAlpha: [0.35, 0.55, 0.75, 0.9, 1.0],
} as const;

export const fonts = {
  /** DotGothic16 — open-licensed stand-in for Nothing's proprietary NDot. */
  dot: 'DotGothic16_400Regular',
} as const;

export const radii = {
  card: 28,
  chip: 999,
} as const;
