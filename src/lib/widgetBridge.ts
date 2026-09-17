import { NativeModules, Platform } from 'react-native';

import type { WidgetModel } from './contributions';

interface WidgetBridge {
  sync(payload: string): Promise<void>;
  clear(): Promise<void>;
}

const bridge = NativeModules.GitHuhWidgetBridge as WidgetBridge | undefined;

const isAvailable = Platform.OS === 'android' && bridge != null;

/**
 * Push the latest contribution snapshot to any placed home-screen widgets.
 * The widget renders purely from this state; the app owns all API access.
 */
export async function syncWidget(model: WidgetModel): Promise<void> {
  if (!isAvailable) return;

  const days = model.columns.flatMap((column) =>
    column.map((day) => ({ l: day.level, t: day.isToday })),
  );

  await bridge.sync(
    JSON.stringify({
      login: model.login,
      total: model.total,
      todayCount: model.todayCount,
      todayCommits: model.todayCommits,
      totalCommits: model.totalCommits,
      openPrs: model.openPrs,
      days,
    }),
  );
}

/** Reset every placed widget to its empty state (called on disconnect). */
export async function clearWidget(): Promise<void> {
  if (!isAvailable) return;
  await bridge.clear();
}
