declare module 'nothing-mtui' {
  export function nothingWidgetColors(
    palette: unknown,
    mode?: 'light' | 'dark',
  ): Record<string, string>;
  export const NEUTRAL1: string;
  export const NEUTRAL2: string;
  export const ACCENT1: string;
  export const ACCENT2: string;
  export const TOKENS: unknown;
  export const FALLBACKS: unknown;
}
