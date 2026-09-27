import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEFAULT_HOME, homeEvents, readHome } from './home';
import type { SocialEvent } from './social';

const event = (id: string, kind: SocialEvent['kind'], at: string): SocialEvent => ({
  id,
  kind,
  actor: 'someone',
  title: 't',
  repo: 'o/r',
  number: 1,
  url: '',
  at,
});

test('by default the page lists pull request comments only, newest first', () => {
  const rows = homeEvents(
    [
      event('a', 'comment', '2026-01-01T00:00:00Z'),
      event('b', 'review', '2026-01-03T00:00:00Z'),
      event('c', 'comment', '2026-01-02T00:00:00Z'),
      event('d', 'open', '2026-01-04T00:00:00Z'),
    ],
    DEFAULT_HOME,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['c', 'a'],
  );
});

test('turning a block on adds its kind', () => {
  const rows = homeEvents(
    [event('a', 'comment', '2026-01-01T00:00:00Z'), event('b', 'mention', '2026-01-03T00:00:00Z')],
    { blocks: ['pr-comments', 'mentions'] },
  );
  assert.equal(rows.length, 2);
});

test('a saved setting with unknown blocks keeps only the ones it knows', () => {
  assert.deepEqual(readHome({ blocks: ['mentions', 'weather'] }), { blocks: ['mentions'] });
  assert.deepEqual(readHome(null), DEFAULT_HOME);
});
