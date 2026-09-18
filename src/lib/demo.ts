import { toWidgetModel, type WidgetModel } from './contributions';
import type { ContributionStats, Contributions } from './github';
import type { PullRequest } from './prs';

/** Mulberry32 — tiny seeded PRNG so demo data is stable across renders. */
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEMO_LOGIN = 'jaikhuranna';

export const demoPullRequests: PullRequest[] = [
  {
    number: 142,
    title: 'feat: adaptive icon monochrome layer',
    repo: 'jaikhuranna/git-huh',
    htmlUrl: 'https://github.com/jaikhuranna/git-huh/pull/142',
    createdAt: '2026-09-16T10:24:00Z',
    draft: false,
  },
  {
    number: 139,
    title: 'fix(widget): today cell timezone drift',
    repo: 'jaikhuranna/git-huh',
    htmlUrl: 'https://github.com/jaikhuranna/git-huh/pull/142',
    createdAt: '2026-09-14T18:03:00Z',
    draft: false,
  },
  {
    number: 41,
    title: 'docs: release ritual checklist',
    repo: 'jaikhuranna/nothing-mtui',
    htmlUrl: 'https://github.com/jaikhuranna/nothing-mtui/pull/41',
    createdAt: '2026-09-11T09:41:00Z',
    draft: false,
  },
  {
    number: 128,
    title: 'perf: memoize dot matrix columns',
    repo: 'jaikhuranna/git-huh',
    htmlUrl: 'https://github.com/jaikhuranna/git-huh/pull/142',
    createdAt: '2026-09-08T21:12:00Z',
    draft: true,
  },
  {
    number: 33,
    title: 'chore: bump glance to 1.1.1',
    repo: 'jaikhuranna/dot-tiles',
    htmlUrl: 'https://github.com/jaikhuranna/dot-tiles/pull/33',
    createdAt: '2026-08-30T14:55:00Z',
    draft: false,
  },
];

function demoContributions(now: Date): Contributions {
  const random = rng(20260917);
  const weeks: Contributions['weeks'] = [];

  // One full year ending today, Sunday-aligned like GitHub's calendar.
  const end = new Date(now);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - 370);

  let cursor = new Date(start);
  let week: { contributionDays: { date: string; contributionCount: number }[] } = {
    contributionDays: [],
  };
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10);
    const weekend = cursor.getDay() === 0 || cursor.getDay() === 6;
    const burst = random() < 0.14 ? 6 : 0;
    const count = Math.max(
      0,
      Math.round(
        (weekend ? random() * 2 : random() * 7 + burst) -
          (random() < 0.08 ? 3 : 0),
      ),
    );
    week.contributionDays.push({ date: iso, contributionCount: count });
    if (week.contributionDays.length === 7) {
      weeks.push(week);
      week = { contributionDays: [] };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.contributionDays.length > 0) weeks.push(week);

  const totalContributions = weeks
    .flatMap((w) => w.contributionDays)
    .reduce((sum, d) => sum + d.contributionCount, 0);

  const years = Array.from(
    { length: 4 },
    (_, i) => now.getFullYear() - i,
  );

  return {
    login: DEMO_LOGIN,
    totalContributions,
    weeks,
    years,
  };
}

const demoStats: ContributionStats = {
  todayCommits: 3,
  totalCommits: 3214,
  openPrs: demoPullRequests.length,
};

/** Deterministic fake model — same shape the real pipeline produces. */
export function demoWidgetModel(now: Date = new Date()): WidgetModel {
  return toWidgetModel(demoContributions(now), demoStats, now);
}
