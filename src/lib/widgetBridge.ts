import { NativeModules, Platform } from 'react-native';
import { nothingWidgetColors, type MaterialYouPalette } from 'nothing-mtui';

import { GRID_WEEKS, type GitHubModel } from './contributions';

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
 * Push the latest contribution snapshot to any placed home-screen widgets.
 * The widgets render purely from this state; the app owns all API access.
 */
export async function syncWidget(model: GitHubModel): Promise<void> {
  if (!isAvailable) return;

  const days = model.columns
    .flatMap((column) => column.map((day) => ({ l: day.level, t: day.isToday })))
    .slice(-GRID_WEEKS * 7);

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
    }),
  );
}

/** Reset every placed widget to its empty state (called on disconnect). */
export async function clearWidget(): Promise<void> {
  if (!isAvailable) return;
  await bridge.clear();
}
