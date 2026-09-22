import type { SocialEvent } from './social';
import { readSaved, writeSaved } from './store';

/**
 * What you have done with each thing in the inbox, kept on the phone.
 *
 * GitHub's own inbox marks a notification read the moment you glance at it,
 * which is why "come back to this" is impossible there and why people ask
 * for folders by name. Here nothing changes until you say so: swipe a row
 * away as `done`, or `snooze` it until the morning.
 *
 * And a handled row is not buried for good. Each mark remembers the moment
 * of the event it was made against, so when someone writes again on a
 * thread you had put away, the row is back — which is the part a read flag
 * cannot do at all.
 */

export interface Mark {
  /** The event's own timestamp when it was handled. */
  at: string;
  done?: boolean;
  /** Epoch ms the row stays hidden until. */
  snoozeUntil?: number;
}

export type Marks = Record<string, Mark>;

export type TriageState = 'open' | 'snoozed' | 'done';

const keyFor = (login: string) => `${login.toLowerCase()}-triage`;
/** Enough marks for months of inbox; the oldest fall off first. */
const KEEP = 400;

export async function loadMarks(login: string): Promise<Marks> {
  return (await readSaved<Marks>(keyFor(login)))?.value ?? {};
}

export async function saveMarks(login: string, marks: Marks): Promise<void> {
  const entries = Object.entries(marks);
  const kept =
    entries.length > KEEP
      ? Object.fromEntries(
          entries.sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, KEEP),
        )
      : marks;
  await writeSaved(keyFor(login), kept);
}

export function stateOf(
  event: SocialEvent,
  marks: Marks,
  now: number = Date.now(),
): TriageState {
  const mark = marks[event.id];
  if (!mark) return 'open';
  // Someone moved since you handled it: it is new again.
  if (Date.parse(event.at) > Date.parse(mark.at)) return 'open';
  if (mark.snoozeUntil != null && mark.snoozeUntil > now) return 'snoozed';
  if (mark.done) return 'done';
  return 'open';
}

/** Nine tomorrow morning — or this morning, if it is still before nine. */
export function nextMorning(now: Date = new Date()): number {
  const morning = new Date(now);
  morning.setHours(9, 0, 0, 0);
  if (morning.getTime() <= now.getTime()) morning.setDate(morning.getDate() + 1);
  return morning.getTime();
}
