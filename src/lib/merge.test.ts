import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleOf, type GitHubModel } from './contributions';
import { mergeActivity, mergeModels } from './merge';

function model(login: string, counts: number[], extra: Partial<GitHubModel> = {}): GitHubModel {
  const days = counts.map((count, index) => ({
    date: `2026-01-${String(index + 1).padStart(2, '0')}`,
    count,
    level: 0 as const,
    isToday: index === counts.length - 1,
  }));
  return {
    login,
    name: login,
    avatarUrl: '',
    bio: '',
    following: 1,
    total: counts.reduce((a, b) => a + b, 0),
    todayCount: counts[counts.length - 1],
    todayCommits: 0,
    totalCommits: 10,
    totalPrivate: 0,
    openPrs: 1,
    followers: 2,
    stars: 3,
    repoCount: 1,
    since: 2020,
    columns: [days],
    breakdown: { commits: 5, pullRequests: 1, issues: 0, reviews: 0, private: 2 },
    topRepos: [{ nameWithOwner: `${login}/app`, count: 5 }],
    repos: [],
    languages: [{ name: 'TypeScript', color: '#3178c6', bytes: 100, share: 1 }],
    years: [
      {
        year: 2026,
        total: 4,
        months: Array(12).fill(1),
        weeks: [1, 2],
        weekMonths: [0, 0],
        beforeToday: 3,
        afterToday: 1,
      },
    ],
    weeks: [1, 2],
    ...extra,
  };
}

test('one account is returned untouched', () => {
  const only = model('a', [1, 2]);
  assert.equal(mergeModels([only]), only);
});

test('two accounts add up day by day and figure by figure', () => {
  const merged = mergeModels([model('a', [0, 2, 1]), model('b', [3, 0, 1], { since: 2018 })]);
  assert.equal(merged.login, 'a');
  assert.deepEqual(merged.accounts, ['a', 'b']);
  assert.deepEqual(
    merged.columns[0].map((day) => day.count),
    [3, 2, 2],
  );
  // Levels are worked out again over the sum: the peak day is level 4.
  assert.equal(merged.columns[0][0].level, 4);
  assert.equal(merged.total, 7);
  assert.equal(merged.todayCount, 2);
  assert.equal(merged.since, 2018);
  assert.equal(merged.breakdown.private, 4);
  assert.equal(merged.years[0].total, 8);
  assert.deepEqual(merged.years[0].weeks, [2, 4]);
  assert.equal(merged.languages[0].bytes, 200);
  assert.equal(merged.topRepos.length, 2);
  assert.equal(handleOf(merged), '~a + ~b');
});

test('the same pull request seen by two accounts is one pull request', () => {
  const pull = {
    number: 1,
    title: 't',
    url: '',
    body: '',
    repo: 'o/r',
    state: 'OPEN' as const,
    isDraft: false,
    createdAt: '',
    mergedAt: null,
    closedAt: null,
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commits: 0,
    comments: 0,
    reviewDecision: null,
    firstReviewAt: null,
    labels: [],
  };
  const merged = mergeActivity([
    { commits: [], pulls: [pull] },
    { commits: [], pulls: [pull] },
  ]);
  assert.equal(merged.pulls.length, 1);
});
