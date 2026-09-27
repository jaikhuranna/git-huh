import assert from 'node:assert/strict';
import { test } from 'node:test';

import { toneOf } from './checks';
import { prAge } from './prs';

test('a check run reads as one of five tones', () => {
  assert.equal(toneOf({ status: 'completed', conclusion: 'success' }), 'pass');
  assert.equal(toneOf({ status: 'completed', conclusion: 'timed_out' }), 'fail');
  assert.equal(toneOf({ status: 'completed', conclusion: 'skipped' }), 'neutral');
  assert.equal(toneOf({ status: 'in_progress', conclusion: null }), 'running');
  assert.equal(toneOf({ status: 'waiting', conclusion: null }), 'waiting');
  assert.equal(toneOf({ status: 'completed', conclusion: 'action_required' }), 'waiting');
});

test('a pull request’s age is short', () => {
  const now = new Date('2026-09-27T12:00:00Z');
  assert.equal(prAge('2026-09-27T01:00:00Z', now), 'today');
  assert.equal(prAge('2026-09-26T01:00:00Z', now), 'yesterday');
  assert.equal(prAge('2026-09-17T12:00:00Z', now), '10d');
  assert.equal(prAge('2026-05-27T12:00:00Z', now), '4mo');
  assert.equal(prAge('2024-09-27T12:00:00Z', now), '2y');
});
