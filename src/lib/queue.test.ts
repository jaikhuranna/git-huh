import assert from 'node:assert/strict';
import { test } from 'node:test';

import { askedAt, commitsSince, readQueue } from './queue';

const request = (createdAt: string, typename: string, login?: string) => ({
  createdAt,
  requestedReviewer: { __typename: typename, login },
});

test('the wait starts when you were asked, not when the pull request was opened', () => {
  assert.deepEqual(
    askedAt(
      [request('2026-09-01T00:00:00Z', 'User', 'Someone'), request('2026-09-10T00:00:00Z', 'User', 'Me')],
      'me',
      '2026-08-01T00:00:00Z',
    ),
    { at: '2026-09-10T00:00:00Z', viaTeam: false },
  );
  assert.deepEqual(
    askedAt([request('2026-09-05T00:00:00Z', 'Team')], 'me', '2026-08-01T00:00:00Z'),
    { at: '2026-09-05T00:00:00Z', viaTeam: true },
  );
  assert.deepEqual(askedAt([], 'me', '2026-08-01T00:00:00Z'), {
    at: '2026-08-01T00:00:00Z',
    viaTeam: false,
  });
});

test('commits after a review are counted, not the ones before it', () => {
  assert.equal(
    commitsSince(['2026-09-01T00:00:00Z', '2026-09-03T00:00:00Z', '2026-09-04T00:00:00Z'], '2026-09-02T00:00:00Z'),
    2,
  );
});

const pr = (number: number, extra: Record<string, unknown>) => ({
  number,
  title: `pr ${number}`,
  url: `https://github.com/a/b/pull/${number}`,
  repository: { nameWithOwner: 'a/b' },
  author: { login: 'them' },
  ...extra,
});

test('the queue is oldest first, and a re-requested review is not listed twice', () => {
  const asked = (number: number, createdAt: string) =>
    pr(number, {
      createdAt,
      isDraft: false,
      additions: 1,
      deletions: 1,
      changedFiles: 1,
      timelineItems: { nodes: [] },
    });
  const queue = readQueue(
    {
      asked: { issueCount: 2, nodes: [asked(2, '2026-09-10T00:00:00Z'), asked(1, '2026-09-01T00:00:00Z'), {}] },
      reviewed: {
        nodes: [
          pr(1, {
            reviews: { nodes: [{ state: 'APPROVED', submittedAt: '2026-09-02T00:00:00Z' }] },
            commits: { nodes: [] },
          }),
          pr(3, {
            reviews: { nodes: [{ state: 'APPROVED', submittedAt: '2026-09-02T00:00:00Z' }] },
            commits: { nodes: [] },
          }),
          pr(4, {
            reviews: { nodes: [{ state: 'CHANGES_REQUESTED', submittedAt: '2026-09-01T00:00:00Z' }] },
            commits: { nodes: [{ commit: { committedDate: '2026-09-05T00:00:00Z' } }] },
          }),
        ],
      },
    },
    'me',
  );
  assert.deepEqual(queue.asked.map((item) => item.number), [1, 2]);
  // #1 is back in the queue; #4 has moved since and comes before #3.
  assert.deepEqual(queue.reviewed.map((item) => [item.number, item.since]), [
    [4, 1],
    [3, 0],
  ]);
});
