import * as BackgroundTask from 'expo-background-task';
import * as Notifications from 'expo-notifications';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { accountStore } from './accounts';
import { verifyToken } from './github';
import { fetchSocial, type SocialEvent } from './social';
import { readSaved, writeSaved } from './store';
import { DEMO_TOKEN, tokenStore } from './token';
import { loadMarks, stateOf } from './triage';

/**
 * Being told, without a server.
 *
 * GitHub's pushes are the most complained-about part of its phone app: they
 * arrive late or not at all on some Android builds, and they never come for
 * a mention inside a pull request review. This app has no server to push
 * from, so it does the honest thing instead — Android wakes it every so
 * often (roughly every fifteen minutes, less on a low battery; Android
 * decides, not us), it reads the same feed the inbox shows, and anything
 * new that is addressed to you becomes a notification on the phone.
 *
 * The same rules as the inbox hold: a row you put away as `done` or
 * `snoozed` does not notify, and anything you have already seen with the app
 * open is not repeated.
 */

const TASK = 'githuh-inbox-check';
const CHANNEL = 'inbox';
const SETTINGS_KEY = 'notify-settings';
/** One launch's worth of notifications; past this they are summed up. */
const MAX_EACH = 4;
const KEEP_SEEN = 300;

export type NotifyKind = 'review-request' | 'mention' | 'changes' | 'approval' | 'comment';

export const NOTIFY_KINDS: { kind: NotifyKind; label: string }[] = [
  { kind: 'review-request', label: 'review requests' },
  { kind: 'mention', label: 'mentions' },
  { kind: 'changes', label: 'changes requested' },
  { kind: 'approval', label: 'approvals' },
  { kind: 'comment', label: 'comments' },
];

export interface NotifySettings {
  enabled: boolean;
  kinds: NotifyKind[];
  /** Nothing older than the moment notifications were switched on. */
  since: number;
}

export const DEFAULT_SETTINGS: NotifySettings = {
  enabled: false,
  kinds: ['review-request', 'mention', 'changes'],
  since: 0,
};

export function kindOf(event: SocialEvent): NotifyKind | null {
  switch (event.kind) {
    case 'review-request':
      return 'review-request';
    case 'mention':
      return 'mention';
    case 'review':
      return event.state === 'CHANGES_REQUESTED'
        ? 'changes'
        : event.state === 'APPROVED'
          ? 'approval'
          : 'comment';
    case 'comment':
      return 'comment';
    case 'open':
      return null;
  }
}

const stamp = (event: SocialEvent) => `${event.id}@${event.at}`;
const seenKey = (login: string) => `${login.toLowerCase()}-notified`;

export async function readSettings(): Promise<NotifySettings> {
  return (await readSaved<NotifySettings>(SETTINGS_KEY))?.value ?? DEFAULT_SETTINGS;
}

export async function writeSettings(settings: NotifySettings): Promise<void> {
  await writeSaved(SETTINGS_KEY, settings);
}

/** What the phone already knows about — so the background check stays quiet about it. */
export async function markSeen(login: string, events: SocialEvent[]): Promise<void> {
  const seen = (await readSaved<string[]>(seenKey(login)))?.value ?? [];
  const next = [...new Set([...events.map(stamp), ...seen])].slice(0, KEEP_SEEN);
  await writeSaved(seenKey(login), next);
}

function phrase(event: SocialEvent): string {
  switch (kindOf(event)) {
    case 'review-request':
      return `${event.actor} asked you to review`;
    case 'mention':
      return `${event.actor} mentioned you`;
    case 'changes':
      return `${event.actor} requested changes`;
    case 'approval':
      return `${event.actor} approved`;
    default:
      return `${event.actor} commented`;
  }
}

/** One pass: read the feed, post what is new, remember it. Returns how many were posted. */
async function checkInbox(): Promise<number> {
  const settings = await readSettings();
  if (!settings.enabled) return 0;
  const token = await tokenStore.get();
  if (!token || token === DEMO_TOKEN) return 0;

  const accounts = await accountStore.list();
  const login = accounts.find((account) => account.token === token)?.login ?? (await verifyToken(token));

  const [events, marks, seenSaved] = await Promise.all([
    fetchSocial(token, login),
    loadMarks(login),
    readSaved<string[]>(seenKey(login)),
  ]);
  // The inbox opens on what this pass read, rather than on an older answer.
  await writeSaved(`${login.toLowerCase()}-social`, events);

  const seen = new Set(seenSaved?.value ?? []);
  const fresh = events.filter((event) => {
    const kind = kindOf(event);
    return (
      kind != null &&
      settings.kinds.includes(kind) &&
      !seen.has(stamp(event)) &&
      Date.parse(event.at) > settings.since &&
      stateOf(event, marks) === 'open'
    );
  });

  for (const event of fresh.slice(0, MAX_EACH)) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: phrase(event),
        body: event.excerpt && kindOf(event) !== 'review-request' ? `${event.title} — “${event.excerpt}”` : event.title,
        subtitle: `${event.repo} #${event.number}`,
        data: { url: event.url, repo: event.repo, number: event.number },
      },
      trigger: null,
    });
  }
  if (fresh.length > MAX_EACH) {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `${fresh.length - MAX_EACH} more in the inbox`,
        body: 'open git-huh to read them',
        data: { inbox: true },
      },
      trigger: null,
    });
  }

  await markSeen(login, events);
  return Math.min(fresh.length, MAX_EACH + 1);
}

// Defined at module scope, as the task manager requires: Android may start
// the JavaScript runtime just to run this, with no screen at all.
if (Platform.OS === 'android') {
  TaskManager.defineTask(TASK, async () => {
    try {
      await checkInbox();
      return BackgroundTask.BackgroundTaskResult.Success;
    } catch {
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export type NotifyStatus =
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'blocked'; why: 'permission' | 'background' }
  | { kind: 'unsupported' };

export async function notifyStatus(settings: NotifySettings): Promise<NotifyStatus> {
  if (Platform.OS !== 'android') return { kind: 'unsupported' };
  if (!settings.enabled) return { kind: 'off' };
  const permission = await Notifications.getPermissionsAsync();
  if (!permission.granted) return { kind: 'blocked', why: 'permission' };
  const background = await BackgroundTask.getStatusAsync();
  if (background === BackgroundTask.BackgroundTaskStatus.Restricted) {
    return { kind: 'blocked', why: 'background' };
  }
  return { kind: 'on' };
}

/** Ask, set up the channel, and schedule the check. Returns the new settings. */
export async function enableNotifications(settings: NotifySettings): Promise<NotifySettings> {
  const asked = await Notifications.requestPermissionsAsync();
  const next: NotifySettings = { ...settings, enabled: asked.granted, since: Date.now() };
  if (asked.granted) {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'what wants you',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
  }
  await writeSettings(next);
  return next;
}

export async function disableNotifications(settings: NotifySettings): Promise<NotifySettings> {
  const next = { ...settings, enabled: false };
  await writeSettings(next);
  if (await TaskManager.isTaskRegisteredAsync(TASK)) await BackgroundTask.unregisterTaskAsync(TASK);
  return next;
}
