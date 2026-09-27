import assert from 'node:assert/strict';
import { test } from 'node:test';

import { insights, sinceYear, toGitHubModel, toISODate } from './contributions';
import type { ContributionStats, Contributions, ContributionWeek } from './github';

const NOW = new Date(2026, 8, 27, 15, 0);

/** A calendar of `counts`, one per day, ending on `end`, cut into weeks of seven. */
function calendar(counts: number[], end: Date = NOW): ContributionWeek[] {
  const days = counts.map((contributionCount, index) => {
    const date = new Date(end);
    date.setDate(end.getDate() - (counts.length - 1 - index));
    return { date: toISODate(date), contributionCount };
  });
  const weeks: ContributionWeek[] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push({ contributionDays: days.slice(i, i + 7) });
  return weeks;
}

function contributions(weeks: ContributionWeek[], extra: Partial<Contributions> = {}): Contributions {
  const total = weeks
    .flatMap((week) => week.contributionDays)
    .reduce((sum, day) => sum + day.contributionCount, 0);
  return {
    login: 'octo',
    name: null,
    avatarUrl: '',
    bio: null,
    createdAt: '2019-03-01T00:00:00Z',
    totalContributions: total,
    weeks,
    years: [2019, 2026],
    totalCommitContributions: 0,
    totalPullRequestContributions: 0,
    totalIssueContributions: 0,
    totalPullRequestReviewContributions: 0,
    restrictedContributions: 0,
    commitContributionsByRepository: [],
    ...extra,
  };
}

const STATS: ContributionStats = {
  todayCommits: 0,
  totalCommits: 0,
  totalPrivate: 0,
  openPrs: 0,
  followers: 0,
  following: 0,
  stars: 0,
  repoCount: 0,
  repos: [],
  years: [],
};

function model(counts: number[], end: Date = NOW) {
  return toGitHubModel(contributions(calendar(counts, end)), STATS, NOW);
}

test('toISODate is the local calendar day, zero-padded', () => {
  assert.equal(toISODate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});

test('today is flagged, and levels are quartiles of the peak day', () => {
  const m = model([0, 1, 2, 3, 4, 8, 5]);
  const days = m.columns.flat();
  assert.equal(days.at(-1)?.isToday, true);
  assert.equal(m.todayCount, 5);
  assert.deepEqual(
    days.map((day) => day.level),
    [0, 1, 1, 2, 2, 4, 3],
  );
});

test('a calendar that stops short of today flags its last past day', () => {
  const yesterday = new Date(NOW);
  yesterday.setDate(NOW.getDate() - 1);
  const days = model([1, 2, 3], yesterday).columns.flat();
  assert.deepEqual(
    days.map((day) => day.isToday),
    [false, false, true],
  );
});

test('the private bucket is carried in the breakdown', () => {
  const m = toGitHubModel(
    contributions(calendar([1]), { restrictedContributions: 40, totalCommitContributions: 3 }),
    STATS,
    NOW,
  );
  assert.equal(m.breakdown.private, 40);
  assert.equal(m.breakdown.commits, 3);
});

test('a streak counts back from today', () => {
  assert.equal(insights(model([1, 0, 2, 3, 1])).currentStreak, 3);
});

test('an empty today does not break the streak — the day is not over', () => {
  assert.equal(insights(model([0, 2, 3, 0])).currentStreak, 2);
});

test('a whole empty day does', () => {
  assert.equal(insights(model([4, 4, 0, 0])).currentStreak, 0);
});

test('the longest streak and where it sits', () => {
  const found = insights(model([1, 1, 1, 0, 1, 1, 0]));
  assert.equal(found.longestStreak, 3);
  assert.deepEqual(found.longestStreakRange, { startIndex: 0, endIndex: 2 });
  assert.equal(found.activeDays, 5);
});

test('insights are computed once per model', () => {
  const m = model([1, 2]);
  assert.equal(insights(m), insights(m));
});

test('since: never before the account existed, never after this year', () => {
  assert.equal(sinceYear({ years: [1999, 2020], createdAt: '2016-05-01T00:00:00Z' }, NOW), 2016);
  assert.equal(sinceYear({ years: [2021], createdAt: '2016-05-01T00:00:00Z' }, NOW), 2021);
  assert.equal(sinceYear({ years: [], createdAt: 'not a date' }, NOW), 2026);
});
