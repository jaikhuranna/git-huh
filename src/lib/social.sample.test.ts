import assert from 'node:assert/strict';
import { test } from 'node:test';

import { INBOX_ROW_CAP, sampleEvents } from './social';
import type { SocialEvent } from './social';

function event(id: string): SocialEvent {
  return {
    id,
    kind: 'comment',
    actor: 'someone',
    title: 't',
    repo: 'o/r',
    number: 1,
    url: '',
    at: '2026-01-01T00:00:00Z',
  };
}

test('a sample past the inbox cap says how many were left off', () => {
  const events = Array.from({ length: INBOX_ROW_CAP + 5 }, (_, index) => event(String(index)));
  const sample = sampleEvents(events, INBOX_ROW_CAP);
  assert.equal(sample.items.length, INBOX_ROW_CAP);
  assert.equal(sample.total, INBOX_ROW_CAP + 5);
  assert.equal(sample.truncated, true);
});

test('a sample that fits is not marked truncated', () => {
  const sample = sampleEvents([event('a')], INBOX_ROW_CAP);
  assert.equal(sample.truncated, false);
  assert.equal(sample.total, 1);
});

test('a list longer than the asked limit is marked truncated and keeps the count', () => {
  const events = [event('a'), event('b'), event('c')];
  const sample = sampleEvents(events, 2);
  assert.deepEqual(
    sample.items.map((item) => item.id),
    ['a', 'b'],
  );
  assert.equal(sample.total, 3);
  assert.equal(sample.truncated, true);
});
