import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dueLine, readTasks } from './assigned';

test('issues and pull requests are told apart, and hidden ones dropped', () => {
  const node = (typename: string, number: number) => ({
    __typename: typename,
    number,
    title: 't',
    url: `https://github.com/a/b/issues/${number}`,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-02T00:00:00Z',
    repository: { nameWithOwner: 'a/b' },
    author: null,
    comments: { totalCount: 3 },
    labels: { nodes: [{ name: 'bug' }] },
    milestone: null,
  });
  const tasks = readTasks([node('Issue', 1), node('PullRequest', 2), {}]);
  assert.deepEqual(
    tasks.map((task) => [task.kind, task.number, task.author, task.labels]),
    [
      ['issue', 1, 'ghost', ['bug']],
      ['pull', 2, 'ghost', ['bug']],
    ],
  );
});

test('a milestone date is said in days', () => {
  const now = new Date(2026, 8, 29, 15);
  assert.equal(dueLine('2026-09-29T00:00:00Z', now), 'due today');
  assert.equal(dueLine('2026-10-02T00:00:00Z', now), 'due in 3d');
  assert.equal(dueLine('2026-09-20T00:00:00Z', now), '9d overdue');
  assert.equal(dueLine(null, now), null);
});
