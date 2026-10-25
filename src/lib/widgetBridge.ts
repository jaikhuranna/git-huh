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
function withKeptLines(payload: Payload): Payload {
  if (payload.lines.length === 0 && storage) {
    try {
      const previous = JSON.parse(storage.get(PAYLOAD_KEY) ?? 'null') as Partial<Payload> | null;
      if (previous?.login === payload.login && previous.lines?.length) {
        return { ...payload, lines: previous.lines };
      }
    } catch {
      // A payload that does not parse is the same as none.
    }
  }
  return payload;
}

/**
 * One canonical string for a payload. Key order is fixed so two syncs of the
 * same days and the same lines compare equal even if the objects were built
 * apart. The date is not part of this string: the card picks today's line
 * when it draws, and dropping a later day from `days` still changes it.
 */
function canonical(payload: Payload): string {
  return JSON.stringify({
    login: payload.login,
    todayCount: payload.todayCount,
    days: payload.days,
    lines: payload.lines,
  });
}

/** The payload last handed to the widget, and which account generation wrote it. */
let applied: string | null = null;
let generation = 0;
/** Syncs still running, oldest first. A newer generation makes an older one a no-op. */
let chain: Promise<void> = Promise.resolve();

/**
 * Push the latest snapshot to any placed home-screen widgets. The widgets
 * render purely from this; the app owns all API access.
 *
 * `lines` is the same pool of your own commit subjects the loading screen is
 * written in. The widget runs one of them across the card, picked by the date
 * and held for the day, so it says something you wrote rather than repeating
 * your handle back at you.
 *
 * An identical payload does not write and does not ask for a redraw: the
 * model is synced often, and the card only changes when the days, the count
 * or the line pool do. Calls are serialized, and a clear or a later account
 * that started after this one wins — a slow sync must not paint the account
 * that was just left.
 */
export function syncWidget(
  model: GitHubModel,
  lines: readonly CommitLine[] = [],
): Promise<void> {
  if (!bridge && !storage) return Promise.resolve();

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

  const payload = withKeptLines({
    login: model.login,
    todayCount: model.todayCount,
    days,
    lines: lines.slice(0, WIDGET_LINES).map((line) => ({ m: line.message, r: line.repo })),
  });
  const text = canonical(payload);
  const mine = ++generation;
  if (text === applied) return Promise.resolve();

  const run = chain.then(async () => {
    if (mine !== generation || text === applied) return;
    if (storage) {
      storage.set(PAYLOAD_KEY, text);
      ExtensionStorage.reloadWidget();
    } else {
      await bridge?.sync(text);
    }
    if (mine === generation) applied = text;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Reset every placed widget to its empty state (called on disconnect). */
export function clearWidget(): Promise<void> {
  const mine = ++generation;
  applied = null;
  if (!bridge && !storage) return Promise.resolve();
  const run = chain.then(async () => {
    if (mine !== generation) return;
    if (storage) {
      storage.remove(PAYLOAD_KEY);
      ExtensionStorage.reloadWidget();
    } else {
      await bridge?.clear();
    }
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
