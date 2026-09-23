import { ExtensionStorage } from '@bacons/apple-targets';
import { NativeModules, Platform } from 'react-native';
import { nothingWidgetColors, type MaterialYouPalette } from 'nothing-mtui';

import type { GitHubModel } from './contributions';
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
 * iOS has no bridge of ours: the WidgetKit extension in `targets/widget/`
 * reads the same JSON out of this App Group's UserDefaults, and
 * ExtensionStorage (from @bacons/apple-targets) writes it and reloads the
 * timeline. The group has to match app.json and `appGroup` in Payload.swift.
 */
const APP_GROUP = 'group.app.githuh';
const PAYLOAD_KEY = 'payload';
const ios = Platform.OS === 'ios';
const storage = ios ? new ExtensionStorage(APP_GROUP) : null;

/**
 * Keep the last payload's commit subjects when this one carries none, for the
 * same account — what WidgetState.write does on Android. A sync routinely
 * lands before the pool is read back, and a card with no line is a card
 * with no masthead.
 */
function withKeptLines(payload: { login: string; lines: unknown[] }): string {
  if (payload.lines.length === 0 && storage) {
    try {
      const previous = JSON.parse(storage.get(PAYLOAD_KEY) ?? 'null') as
        | { login?: string; lines?: unknown[] }
        | null;
      if (previous?.login === payload.login && previous.lines?.length) {
        return JSON.stringify({ ...payload, lines: previous.lines });
      }
    } catch {
      // A payload that does not parse is the same as none.
    }
  }
  return JSON.stringify(payload);
}

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
  if (!isAvailable && !storage) return;

  /**
   * Every day of the year, in order, ending on today.
   *
   * The widget used to be sent weekday-aligned weeks — seven cells a column,
   * the ragged first and last weeks padded — because it drew GitHub's own
   * calendar, with today halfway up the last column and the rest of the week
   * drawn as days that had not happened. It now draws a run of days whose
   * last mark is always the bottom-right one, and collapses three weeks or more
   * of nothing into a wave with its length on it; both need the days as they
   * happened, with no padding in them. The whole year travels, because once
   * the silences are folded away there is room on the card for older work.
   */
  const flat = model.columns.flat();
  const todayAt = flat.findIndex((day) => day.isToday);
  const days = (todayAt >= 0 ? flat.slice(0, todayAt + 1) : flat).map((day) => ({
    l: day.level,
    t: day.isToday,
  }));

  // Re-read every sync rather than caching: the palette follows the
  // wallpaper, which the user can change while the app is running. iOS has
  // no Material You, so it gets nothing-mtui's static tones.
  const palette =
    isAvailable && bridge ? await bridge.materialYouPalette().catch(() => null) : null;
  const light = nothingWidgetColors(palette, 'light');
  const dark = nothingWidgetColors(palette, 'dark');

  const payload = {
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
  };

  if (storage) {
    storage.set(PAYLOAD_KEY, withKeptLines(payload));
    ExtensionStorage.reloadWidget();
    return;
  }
  if (bridge) await bridge.sync(JSON.stringify(payload));
}

/** Reset every placed widget to its empty state (called on disconnect). */
export async function clearWidget(): Promise<void> {
  if (storage) {
    storage.remove(PAYLOAD_KEY);
    ExtensionStorage.reloadWidget();
    return;
  }
  if (isAvailable && bridge) await bridge.clear();
}
