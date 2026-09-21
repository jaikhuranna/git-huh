declare module 'nothing-mtui' {
  /** Material You palette shape: `{ neutral1: { 50: '#hex' }, ... }`. */
  export type MaterialYouPalette = Record<string, Record<number, string>>;

  export type TokenName =
    | 'widgetBg'
    | 'settingsBg'
    | 'widgetElements'
    | 'widgetFood'
    | 'widgetIcon'
    | 'mediaPageIndicator'
    | 'mediaPageIndicatorSelected'
    | 'mediaText'
    | 'mediaProgress'
    | 'mediaProgressBg'
    | 'mediaSwitchIcon'
    | 'mediaSwitchIconBg'
    | 'settingsAccent'
    | 'settingsStateOn'
    | 'settingsStateOff'
    | 'settingsThumbOff'
    | 'settingsTrackOff'
    | 'settingsTrackOn';

  /**
   * Resolve the Nothing widget tokens against a Material You palette.
   * Passing `null` returns the package's static fallbacks, which ignore the
   * device wallpaper; the live palette comes from the native bridge.
   */
  export function nothingWidgetColors(
    palette: MaterialYouPalette | null,
    mode?: 'light' | 'dark',
  ): Record<TokenName, string>;

  export const TOKENS: Record<
    'light' | 'dark',
    Record<TokenName, { static?: string; tone?: [string, number] }>
  >;
  export const FALLBACKS: Record<string, string>;
}
