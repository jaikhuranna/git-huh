import type { SocialEvent } from './social';

/**
 * Local calendar arithmetic for snooze, "today", and the midnight rollover.
 *
 * Every value is read from the `Date` that is passed in. A timezone change is
 * a new local day because the parts come from the clock, not from a stored
 * offset, and a mark that names a date keeps that date when the clock moves.
 */

export interface DayMark {
  /** The event's own timestamp when it was handled. */
  at: string;
  done?: boolean;
  /** Epoch ms the row stays hidden until. Computed once, never from a later clock. */
  snoozeUntil?: number;
}

export type DayState = 'open' | 'snoozed' | 'done';

/** YYYY-MM-DD in the local zone. */
export function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const date = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${date}`;
}

/** Milliseconds from `now` until the next local midnight, at least one second. */
export function msUntilNextLocalMidnight(now: Date): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  // A clock jump can land exactly on, or past, the boundary we aimed at.
  return Math.max(next.getTime() - now.getTime(), 1000);
}

/**
 * Nine tomorrow morning — or this morning, if it is still before nine.
 * The instant is computed once and stored; later clock changes do not
 * recompute it onto another local day.
 */
export function nextMorning(now: Date): number {
  const morning = new Date(now);
  morning.setHours(9, 0, 0, 0);
  if (morning.getTime() <= now.getTime()) morning.setDate(morning.getDate() + 1);
  return morning.getTime();
}

/**
 * Whether a handled event is still put away.
 *
 * `snoozeUntil` is an instant chosen on the day the mark was made. Passing a
 * later `now` — after midnight, a DST jump, or a timezone change — compares
 * that instant; it does not recompute the morning onto the new local day.
 * A newer event timestamp still reopens the row, because someone wrote again.
 */
export function stateOnDay(
  event: Pick<SocialEvent, 'at'>,
  mark: DayMark | undefined,
  now: number,
): DayState {
  if (!mark) return 'open';
  if (Date.parse(event.at) > Date.parse(mark.at)) return 'open';
  if (mark.snoozeUntil != null && mark.snoozeUntil > now) return 'snoozed';
  if (mark.done) return 'done';
  return 'open';
}
