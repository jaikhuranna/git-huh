import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_HOME,
  HISTORY_WINDOW,
  historyEvents,
  homeEvents,
  readHome,
  retainHistory,
  type HistoryPage,
  type HistoryWindow,
} from './home';
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
    [],
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
    [],
    { blocks: ['pr-comments', 'mentions'] },
  );
  assert.equal(rows.length, 2);
});

test('a saved setting with unknown blocks keeps only the ones it knows', () => {
  assert.deepEqual(readHome({ blocks: ['mentions', 'weather'] }), { blocks: ['mentions'] });
  assert.deepEqual(readHome(null), DEFAULT_HOME);
});

test('a comment in both the inbox feed and the paged history is listed once', () => {
  const rows = homeEvents(
    [event('a', 'comment', '2026-01-02T00:00:00Z')],
    [event('b', 'comment', '2026-01-01T00:00:00Z'), event('a', 'comment', '2026-01-02T00:00:00Z')],
    DEFAULT_HOME,
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['a', 'b'],
  );
});

function page(after: string | null, ids: string[], next: string | null): HistoryPage {
  return {
    after,
    next,
    events: ids.map((id, index) => event(id, 'comment', `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`)),
  };
}

test('retained history drops the newest pages once the window is full', () => {
  let window: HistoryWindow = { pages: [] };
  for (let i = 0; i < HISTORY_WINDOW + 2; i++) {
    window = retainHistory(window, page(i === 0 ? null : `c${i}`, [`p${i}`], `c${i + 1}`));
  }
  assert.equal(window.pages.length, HISTORY_WINDOW);
  assert.equal(window.pages[0]?.after, 'c2');
  assert.equal(historyEvents(window).some((event) => event.id === 'p0'), false);
  assert.equal(historyEvents(window).some((event) => event.id === `p${HISTORY_WINDOW + 1}`), true);
  assert.equal(window.pages.at(-1)?.next, `c${HISTORY_WINDOW + 2}`);
});

test('an id that leaves the window is dropped even when a later page repeats it', () => {
  const first = page(null, ['shared', 'old'], 'c1');
  const second = page('c1', ['shared', 'new'], null);
  const window = retainHistory(retainHistory({ pages: [] }, first, 1), second, 1);
  assert.equal(window.pages.length, 1);
  assert.deepEqual(historyEvents(window).map((row) => row.id), ['shared', 'new']);
  assert.equal(historyEvents(window).some((row) => row.id === 'old'), false);
});

test('overlapping history pages expose each event once, keeping the newest copy', () => {
  const newest = event('shared', 'comment', '2026-01-03T00:00:00Z');
  const older = event('shared', 'comment', '2026-01-01T00:00:00Z');
  const window = retainHistory(
    retainHistory(
      { pages: [] },
      { after: null, events: [newest], next: 'c1' },
    ),
    { after: 'c1', events: [older], next: null },
  );

  assert.deepEqual(historyEvents(window), [newest]);
});
