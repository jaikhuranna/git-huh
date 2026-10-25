import assert from 'node:assert/strict';
import { test } from 'node:test';

import { localDay, msUntilNextLocalMidnight, nextMorning, stateOnDay, type DayMark } from './day';
import type { SocialEvent } from './social';

const event = (at: string): SocialEvent => ({
  id: 'evt',
  kind: 'mention',
  actor: 'someone',
  title: 't',
  repo: 'o/r',
  number: 1,
  url: '',
  at,
});

/**
 * A wall clock in a named zone, independent of the machine's zone.
 * `timeZone` is applied by the formatter, so the same instant can be read as
 * two different local days.
 */
function zoned(isoLocal: string, timeZone: string): Date {
  const [date, time] = isoLocal.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second] = time.split(':').map(Number);
  const utc = Date.UTC(year, month - 1, day, hour, minute, second);
  const offset = zoneOffset(new Date(utc), timeZone);
  return new Date(utc - offset);
}

function zoneOffset(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(
    pick('year'),
    pick('month') - 1,
    pick('day'),
    pick('hour'),
    pick('minute'),
    pick('second'),
  );
  return asUtc - instant.getTime();
}

function withZone<T>(timeZone: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = timeZone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

test('a snooze made before midnight stays on that morning across the local day boundary', () => {
  withZone('UTC', () => {
    const made = new Date('2026-03-14T23:30:00Z');
    const until = nextMorning(made);
    const mark = { at: '2026-03-14T23:00:00Z', snoozeUntil: until };
    const row = event(mark.at);

    assert.equal(localDay(made), '2026-03-14');
    assert.equal(localDay(new Date(until)), '2026-03-15');
    assert.equal(new Date(until).getUTCHours(), 9);

    const justBefore = until - 1;
    const justAfter = until + 1;
    assert.equal(stateOnDay(row, mark, justBefore), 'snoozed');
    assert.equal(localDay(new Date(justBefore)), '2026-03-15');
    assert.equal(stateOnDay(row, mark, justAfter), 'open');
    // The morning that was chosen is not recomputed onto the 16th.
    assert.notEqual(nextMorning(new Date(justAfter)), until);
    assert.equal(stateOnDay(row, mark, nextMorning(new Date(justAfter)) - 1), 'open');
  });
});

test('a spring-forward midnight still wakes the snooze on the intended local morning', () => {
  withZone('America/New_York', () => {
    // 2026-03-08 02:00 does not exist; clocks jump from 01:59 to 03:00.
    const before = new Date('2026-03-08T06:30:00Z'); // 01:30 EST
    const after = new Date('2026-03-08T07:30:00Z'); // 03:30 EDT
    assert.equal(localDay(before), '2026-03-08');
    assert.equal(localDay(after), '2026-03-08');
    assert.equal(before.getHours(), 1);
    assert.equal(after.getHours(), 3);

    // 10:00 EST on the 7th is already past nine, so the snooze lands at 09:00 on the 8th.
    const until = nextMorning(new Date('2026-03-07T15:00:00Z'));
    const mark = { at: '2026-03-07T14:00:00Z', snoozeUntil: until };
    const row = event(mark.at);
    assert.equal(localDay(new Date(until)), '2026-03-08');
    assert.equal(new Date(until).getHours(), 9);
    // 09:00 EDT is 13:00Z. The missing 02:00 hour did not push it to the 9th.
    assert.equal(new Date(until).toISOString(), '2026-03-08T13:00:00.000Z');

    // 01:30 EST is half an hour from the jump. The lost hour makes the wait to
    // local midnight 21.5 hours, not 22.5, and the boundary is still the 9th.
    const gap = msUntilNextLocalMidnight(before);
    assert.equal(gap, 21.5 * 60 * 60 * 1000);
    assert.equal(localDay(new Date(before.getTime() + gap)), '2026-03-09');
    // The skipped hour is not a local midnight: 03:30 is still the 8th.
    assert.equal(localDay(after), localDay(before));

    assert.equal(stateOnDay(row, mark, until - 1), 'snoozed');
    assert.equal(stateOnDay(row, mark, until + 1), 'open');
    // Crossing the missing hour, still before the stored morning, stays snoozed.
    assert.equal(stateOnDay(row, mark, after.getTime()), 'snoozed');
  });
});

test('a fall-back keeps the snooze attached to the morning that was stored', () => {
  withZone('America/New_York', () => {
    // 2026-11-01 01:30 happens twice. The later one is still the same local date.
    const first = new Date('2026-11-01T05:30:00Z'); // 01:30 EDT
    const second = new Date('2026-11-01T06:30:00Z'); // 01:30 EST
    assert.equal(localDay(first), '2026-11-01');
    assert.equal(localDay(second), '2026-11-01');
    assert.equal(first.getHours(), second.getHours());

    const until = nextMorning(new Date('2026-10-31T15:00:00Z'));
    const mark = { at: '2026-10-31T14:00:00Z', snoozeUntil: until };
    const row = event(mark.at);
    assert.equal(localDay(new Date(until)), '2026-11-01');
    assert.equal(stateOnDay(row, mark, first.getTime()), 'snoozed');
    assert.equal(stateOnDay(row, mark, second.getTime()), 'snoozed');
    assert.equal(stateOnDay(row, mark, until + 1), 'open');
  });
});

test('changing timezone does not recompute a snooze onto the new local day', () => {
  const made = zoned('2026-06-15T22:00:00', 'America/Los_Angeles');
  const until = withZone('America/Los_Angeles', () => nextMorning(made));
  const mark = { at: '2026-06-15T20:00:00Z', snoozeUntil: until };
  const row = event(mark.at);
  // 09:00 in Los Angeles on the 16th is 18:00 the same calendar date in Berlin.
  // The local date string matches; the instant does not, which is the point.
  const morningThere = withZone('America/Los_Angeles', () => ({
    day: localDay(new Date(until)),
    hour: new Date(until).getHours(),
  }));
  const morningHere = withZone('Europe/Berlin', () => ({
    day: localDay(new Date(until)),
    hour: new Date(until).getHours(),
  }));
  assert.equal(morningThere.day, '2026-06-16');
  assert.equal(morningThere.hour, 9);
  assert.equal(morningHere.day, '2026-06-16');
  assert.equal(morningHere.hour, 18);
  // Recomputing "next morning" under Berlin aims at a different instant.
  const recomputed = withZone('Europe/Berlin', () => nextMorning(new Date(until - 1)));
  assert.notEqual(recomputed, until);
  // The stored mark is unchanged by that recomputation.
  assert.equal(withZone('Europe/Berlin', () => stateOnDay(row, mark, until - 1)), 'snoozed');
  assert.equal(mark.snoozeUntil, until);
});

test('foreground resume on a later local day expires a snooze and keeps a done mark', () => {
  withZone('UTC', () => {
    const left = new Date('2026-04-01T21:00:00Z');
    const resumed = new Date('2026-04-02T10:00:00Z');
    assert.notEqual(localDay(left), localDay(resumed));
    assert.ok(msUntilNextLocalMidnight(left) > 0);

    const snoozed: DayMark = { at: '2026-04-01T12:00:00Z', snoozeUntil: nextMorning(left) };
    const done: DayMark = { at: '2026-04-01T12:00:00Z', done: true };
    const row = event('2026-04-01T12:00:00Z');

    assert.equal(stateOnDay(row, snoozed, left.getTime()), 'snoozed');
    assert.equal(stateOnDay(row, snoozed, resumed.getTime()), 'open');
    assert.equal(stateOnDay(row, done, resumed.getTime()), 'done');
    // Seen state stays on the event date; a later day does not invent a new one.
    assert.equal(done.at, '2026-04-01T12:00:00Z');
    assert.equal(snoozed.snoozeUntil, nextMorning(left));
  });
});

test('a newer event timestamp reopens a row without moving the stored day', () => {
  const mark = { at: '2026-01-01T00:00:00Z', done: true, snoozeUntil: Date.parse('2026-01-02T09:00:00Z') };
  const row = event('2026-01-03T00:00:00Z');
  assert.equal(stateOnDay(row, mark, Date.parse('2026-01-01T12:00:00Z')), 'open');
  assert.equal(mark.at, '2026-01-01T00:00:00Z');
});
