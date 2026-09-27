import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  hourHistogram,
  isMergeSubject,
  lastCommitAt,
  ledger,
  monthWindow,
  repoMonths,
  spreadMessages,
  type CommitSample,
} from './activity';

function commit(overrides: Partial<CommitSample>): CommitSample {
  return {
    hour: 12,
    weekday: 1,
    date: '2026-09-01',
    repo: 'a/b',
    additions: 0,
    deletions: 0,
    message: 'change',
    ...overrides,
  };
}

test('the ledger sums lines and takes a median that survives one huge commit', () => {
  const result = ledger([
    commit({ additions: 10, deletions: 2 }),
    commit({ additions: 5, deletions: 5 }),
    commit({ additions: 90_000, deletions: 0 }),
  ]);
  assert.deepEqual(result, { additions: 90_015, deletions: 7, net: 90_008, medianDiff: 12 });
  assert.equal(ledger([]).medianDiff, 0);
});

test('commits are bucketed by local hour', () => {
  const hours = hourHistogram([commit({ hour: 0 }), commit({ hour: 23 }), commit({ hour: 23 })]);
  assert.equal(hours.length, 24);
  assert.equal(hours[0], 1);
  assert.equal(hours[23], 2);
});

test('the month window runs back across a year boundary', () => {
  const window = monthWindow(3, new Date(2026, 0, 15));
  assert.deepEqual(
    window.map((bar) => bar.key),
    ['2025-11', '2025-12', '2026-01'],
  );
});

test('a repo the sample never reached has no months at all', () => {
  const now = new Date(2026, 8, 27);
  assert.deepEqual(repoMonths([commit({ repo: 'x/y' })], 'a/b', 12, now), []);
  const months = repoMonths([commit({ date: '2026-09-02' }), commit({ date: '2026-08-30' })], 'a/b', 2, now);
  assert.deepEqual(
    months.map((bar) => [bar.key, bar.count]),
    [
      ['2026-08', 1],
      ['2026-09', 1],
    ],
  );
});

test('the newest commit in a repo resolves to its hour', () => {
  const at = lastCommitAt([commit({ date: '2026-09-01', hour: 9 }), commit({ date: '2026-09-01', hour: 17 })], 'a/b');
  assert.equal(at, new Date(2026, 8, 1, 17).getTime());
  assert.equal(lastCommitAt([], 'a/b'), null);
});

test('merge commits are not yours to print', () => {
  assert.ok(isMergeSubject("Merge pull request #4 from a/b"));
  assert.ok(isMergeSubject('merge branch main into feature'));
  assert.ok(!isMergeSubject('Merged the two parsers'));
});

test('messages are spread across the whole history, deduplicated, without merges', () => {
  const commits = Array.from({ length: 100 }, (_, i) => commit({ message: `change ${i}` }));
  commits.push(commit({ message: 'CHANGE 0' }), commit({ message: 'Merge branch x' }));
  const spread = spreadMessages(commits, 4);
  assert.deepEqual(
    spread.map((line) => line.message),
    ['change 0', 'change 25', 'change 50', 'change 75'],
  );
  assert.equal(spreadMessages(commits.slice(0, 2), 10).length, 2);
});
