import { ExtensionStorage } from '@bacons/apple-targets';
import { NativeModules, Platform } from 'react-native';

import type { GitHubModel } from './contributions';
import type { CommitLine } from './messageCache';

/**
 * The home-screen widget draws from one JSON payload written here: the days
 * of the year and a pool of your own commit subjects. It carries no colours —
 * the card's surface follows the wallpaper, so each platform resolves it
 * where the card is drawn, at the moment it is drawn.
 */

interface WidgetBridge {
  sync(payload: string): Promise<void>;
  clear(): Promise<void>;
}

/** Android: `WidgetBridgeModule.kt`, which stores the payload and redraws. */
const bridge =
  Platform.OS === 'android'
    ? (NativeModules.GitHuhWidgetBridge as WidgetBridge | undefined)
    : undefined;

/**
 * iOS has no bridge of ours: the WidgetKit extension in `targets/widget/`
 * reads the same JSON out of this App Group's UserDefaults, and
 * ExtensionStorage (from @bacons/apple-targets) writes it and reloads the
 * timeline. The group has to match app.json and `appGroup` in Payload.swift.
 */
const APP_GROUP = 'group.app.githuh';
const PAYLOAD_KEY = 'payload';
const storage = Platform.OS === 'ios' ? new ExtensionStorage(APP_GROUP) : null;

/**
 * The whole message cache travels — it is capped at 40 lines, under 2 KB. The
 * widget holds one line for a whole day, which only works if it is picking
 * from the same pool every time the app syncs, not a fresh shuffle of it.
 */
const WIDGET_LINES = 40;

/**
 * Read by `WidgetState.kt` on Android and `Payload.swift` on iOS. `todayCount`
 * is the calendar's (private work included), for the card's accessibility
 * label; the card itself prints no numbers.
 */
interface Payload {
  login: string;
  todayCount: number;
  /** Every day of the year up to today: `l` its level, `t` whether it is today. */
  days: { l: number; t: boolean }[];
  /** Commit subjects: `m` the message, `r` the repository it was written in. */
  lines: { m: string; r: string }[];
}

/**
 * Keep the last payload's commit subjects when this one carries none, for the
 * same account — what WidgetState.write does on Android. A sync routinely
 * lands before the pool is read back, and a card with no line is a card
 * with no masthead.
 */
function withKeptLines(payload: Payload): string {
  if (payload.lines.length === 0 && storage) {
    try {
      const previous = JSON.parse(storage.get(PAYLOAD_KEY) ?? 'null') as Partial<Payload> | null;
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
 * Push the latest snapshot to any placed home-screen widgets. The widgets
 * render purely from this; the app owns all API access.
 *
 * `lines` is the same pool of your own commit subjects the loading screen is
 * written in. The widget runs one of them across the card, picked by the date
 * and held for the day, so it says something you wrote rather than repeating
 * your handle back at you.
 */
export async function syncWidget(
  model: GitHubModel,
  lines: readonly CommitLine[] = [],
): Promise<void> {
  if (!bridge && !storage) return;

  // The days as they happened, ending on today, with no weekday padding: the
  // card draws a run of days whose last mark is always the bottom-right one,
  // and folds three weeks or more of nothing into a wave with its length on
  // it. The whole year travels, because once the silences are folded away
  // there is room on the card for older work.
  const flat = model.columns.flat();
  const todayAt = flat.findIndex((day) => day.isToday);
  const days = (todayAt >= 0 ? flat.slice(0, todayAt + 1) : flat).map((day) => ({
    l: day.level,
    t: day.isToday,
  }));

  const payload: Payload = {
    login: model.login,
    todayCount: model.todayCount,
    days,
    lines: lines.slice(0, WIDGET_LINES).map((line) => ({ m: line.message, r: line.repo })),
  };

  if (storage) {
    storage.set(PAYLOAD_KEY, withKeptLines(payload));
    ExtensionStorage.reloadWidget();
    return;
  }
  await bridge?.sync(JSON.stringify(payload));
}

/** Reset every placed widget to its empty state (called on disconnect). */
export async function clearWidget(): Promise<void> {
  if (storage) {
    storage.remove(PAYLOAD_KEY);
    ExtensionStorage.reloadWidget();
    return;
  }
  await bridge?.clear();
}
