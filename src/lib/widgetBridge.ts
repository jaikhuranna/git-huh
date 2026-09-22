import { NativeModules, Platform } from 'react-native';
import { nothingWidgetColors, type MaterialYouPalette } from 'nothing-mtui';

import { GRID_WEEKS, type GitHubModel } from './contributions';
import type { CommitLine } from './messageCache';

/**
 * Widget A's surface comes from nothing-mtui — the token map lifted from
 * com.nothing.communitywidgets. The package is the owner of the *mapping*
 * (widgetBg is neutral1/50 in light, neutral1/900 in dark); the device is the
 * owner of the *palette*, since those tones resolve from the wallpaper and
 * only Android can read them. So JS asks the bridge for the live palette and
 * resolves the tokens against it — passing null, as this used to, silently
 * returns the package's static fallbacks and the widget stops tracking the
 * user's theme entirely.
 *
 * Both modes travel in the payload so the widget can flip with the system
 * theme without another round trip into JS.
 */

interface WidgetBridge {
  sync(payload: string): Promise<void>;
  clear(): Promise<void>;
  materialYouPalette(): Promise<MaterialYouPalette | null>;
}

const bridge = NativeModules.GitHuhWidgetBridge as WidgetBridge | undefined;

const isAvailable = Platform.OS === 'android' && bridge != null;

/**
 * How many commit subjects travel to the widget as its masthead pool — the
 * whole cache, which is capped at 40 lines and under 2 KB.
 *
 * It used to be a slice of a freshly shuffled pool, so every launch sent the
 * widget a *different sixteen*. The widget holds one line for a whole day, and
 * it can only do that if it is looking at the same pool each time.
 */
const WIDGET_LINES = 40;

/**
 * Push the latest contribution snapshot to any placed home-screen widgets.
 * The widgets render purely from this state; the app owns all API access.
 *
 * `lines` is the same pool of your own commit subjects the loading screen is
 * written in, each with the repository it was written in. Widget A runs one
 * of them across the card as a strip, picked by the date and held for the
 * day, so it says something you wrote rather than repeating your handle back
 * at you.
 */
export async function syncWidget(
  model: GitHubModel,
  lines: readonly CommitLine[] = [],
): Promise<void> {
  if (!isAvailable) return;

  /**
   * Seven cells per week, always.
   *
   * GitHub clips the first and last weeks of the window to the days that
   * exist, so the flat array was not a multiple of seven — and the widget
   * indexes it column-major as `column * 7 + row`. Every weekday in the grid
   * was therefore drawn one or two rows away from where it belonged, which is
   * invisible when it is wrong and quietly wrong when it looks fine. Padding
   * the two ragged weeks with empty days puts each row back on its own
   * weekday, and future days read as unfilled, exactly as they do on GitHub.
   */
  const cells = model.columns.flatMap((column, index) => {
    const filled = column.map((day) => ({ l: day.level, t: day.isToday }));
    const missing = 7 - filled.length;
    if (missing <= 0) return filled;
    const blanks = Array.from({ length: missing }, () => ({ l: 0, t: false }));
    return index === 0 ? [...blanks, ...filled] : [...filled, ...blanks];
  });
  const days = cells.slice(-GRID_WEEKS * 7);

  // Re-read every sync rather than caching: the palette follows the
  // wallpaper, which the user can change while the app is running.
  const palette = await bridge.materialYouPalette().catch(() => null);
  const light = nothingWidgetColors(palette, 'light');
  const dark = nothingWidgetColors(palette, 'dark');

  await bridge.sync(
    JSON.stringify({
      login: model.login,
      total: model.total,
      todayCount: model.todayCount,
      todayCommits: model.todayCommits,
      totalCommits: model.totalCommits,
      openPrs: model.openPrs,
      mtui: {
        light: {
          bg: light.widgetBg,
          elements: light.widgetElements,
          food: light.widgetFood,
        },
        dark: {
          bg: dark.widgetBg,
          elements: dark.widgetElements,
          food: dark.widgetFood,
        },
      },
      /** Legacy flat key, read by widgets installed before 2.0.1. */
      bg: dark.widgetBg,
      days,
      lines: lines
        .slice(0, WIDGET_LINES)
        .map((line) => ({ m: line.message, r: line.repo })),
    }),
  );
}

/** Reset every placed widget to its empty state (called on disconnect). */
export async function clearWidget(): Promise<void> {
  if (!isAvailable) return;
  await bridge.clear();
}
