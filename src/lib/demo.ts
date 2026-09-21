import { toGitHubModel, toISODate, type GitHubModel } from './contributions';
import type {
  Contributions,
  ContributionStats,
  ContributionWeek,
  RepoNode,
  YearStats,
} from './github';
import type { Activity, CommitSample, PullDetail } from './activity';
import { parsePatch, type PullDetailFull } from './pullDetail';
import type { PullRequest } from './prs';
import type { SocialEvent } from './social';

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
const DEMO_NAME = 'Jai Khurana';
const DEMO_BIO = 'Building small, honest software. Currently: git-huh.';
const DEMO_AVATAR = 'https://avatars.githubusercontent.com/u/0?v=4';
const DEMO_CREATED_AT = '2016-03-12T00:00:00Z';
const YEAR_COUNT = 6;

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

/** Real GitHub language colors — the demo has to look like a real profile. */
const LANGUAGES = [
  { name: 'TypeScript', color: '#3178c6' },
  { name: 'Kotlin', color: '#A97BFF' },
  { name: 'Swift', color: '#F05138' },
  { name: 'Python', color: '#3572A5' },
  { name: 'Rust', color: '#dea584' },
  { name: 'Go', color: '#00ADD8' },
  { name: 'C', color: '#555555' },
  { name: 'Shell', color: '#89e051' },
];

const REPO_NAMES = [
  'git-huh',
  'nothing-mtui',
  'dot-tiles',
  'orbit-widget',
  'flux-cli',
  'pixel-rain',
  'quiet-hours',
  'sig-noise',
  'halftone',
  'index-cards',
  'weather-glass',
  'poster-grid',
];

/** Relative activity per calendar month — dips around the holidays, humps in spring/autumn. */
const MONTH_SHAPE = [0.55, 0.5, 0.75, 0.9, 1.05, 1.15, 0.85, 0.7, 1.2, 1.3, 1.0, 0.6];

/** Sun=0 .. Sat=6. Wednesday is this demo's clear peak weekday. */
const WEEKDAY_SHAPE = [0.35, 0.9, 1.0, 1.35, 1.05, 1.15, 0.4];

/** Career-progression curve: quieter early years, busier recently. */
function yearActivityBase(yearIndex: number): number {
  return 1.4 + (yearIndex / Math.max(1, YEAR_COUNT - 1)) * 2.6;
}

function dayCount(random: () => number, base: number, month: number, weekday: number): number {
  const weight = base * MONTH_SHAPE[month] * WEEKDAY_SHAPE[weekday];
  const noise = random() < 0.1 ? 0 : random() * weight * 1.8;
  return Math.max(0, Math.round(noise));
}

/**
 * One date -> contribution-count map spanning every demo year plus the
 * rolling window, so the same date always yields the same count whether it's
 * read through a per-year calendar or the default 365-day window.
 */
function buildDailyMap(now: Date, random: () => number): { map: Map<string, number>; startYear: number } {
  const startYear = now.getFullYear() - (YEAR_COUNT - 1);
  const start = new Date(startYear, 0, 1);
  // Sunday-aligned end, matching GitHub's calendar so full weeks render cleanly.
  const end = new Date(now);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const map = new Map<string, number>();
  const cursor = new Date(start);
  while (cursor <= end) {
    const yearIndex = cursor.getFullYear() - startYear;
    const base = yearActivityBase(yearIndex);
    const count = cursor > now ? 0 : dayCount(random, base, cursor.getMonth(), cursor.getDay());
    map.set(toISODate(cursor), count);
    cursor.setDate(cursor.getDate() + 1);
  }
  return { map, startYear };
}

/**
 * Hand-placed streaks so the derived insights are worth looking at: a long
 * one buried mid-history for the dots screen's dot-to-dot line, and a
 * shorter live one ending today so currentStreak < longestStreak.
 */
function injectStreaks(map: Map<string, number>, now: Date, random: () => number): void {
  const longStart = new Date(now);
  longStart.setDate(longStart.getDate() - 130);
  for (let i = 0; i < 18; i++) {
    const d = new Date(longStart);
    d.setDate(d.getDate() + i);
    map.set(toISODate(d), 2 + Math.floor(random() * 5));
  }

  for (let i = 0; i < 9; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map.set(toISODate(d), 1 + Math.floor(random() * 6));
  }
}

function rollingWeeks(map: Map<string, number>, now: Date): ContributionWeek[] {
  const end = new Date(now);
  end.setDate(end.getDate() + (6 - end.getDay()));
  const start = new Date(end);
  start.setDate(start.getDate() - 370);

  const weeks: ContributionWeek[] = [];
  let week: ContributionWeek = { contributionDays: [] };
  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = toISODate(cursor);
    week.contributionDays.push({ date: iso, contributionCount: map.get(iso) ?? 0 });
    if (week.contributionDays.length === 7) {
      weeks.push(week);
      week = { contributionDays: [] };
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  if (week.contributionDays.length > 0) weeks.push(week);
  return weeks;
}

function chunkWeeks(days: { date: string; contributionCount: number }[]): ContributionWeek[] {
  const weeks: ContributionWeek[] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push({ contributionDays: days.slice(i, i + 7) });
  }
  return weeks;
}

function demoYears(map: Map<string, number>, startYear: number, now: Date): YearStats[] {
  const years: YearStats[] = [];
  for (let i = 0; i < YEAR_COUNT; i++) {
    const year = startYear + i;
    const start = new Date(year, 0, 1);
    const end = new Date(year, 11, 31);
    const days: { date: string; contributionCount: number }[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const iso = toISODate(d);
      days.push({ date: iso, contributionCount: map.get(iso) ?? 0 });
    }
    const totalContributions = days.reduce((sum, day) => sum + day.contributionCount, 0);
    years.push({
      year,
      // The per-year API bucket only reports commits; ~60% of contributions
      // being commits is a believable split for the demo.
      totalCommits: Math.round(totalContributions * 0.6),
      totalContributions,
      weeks: chunkWeeks(days),
    });
  }
  return years;
}

/** Sample `count` distinct languages without replacement. */
function pickLanguages(random: () => number, count: number): typeof LANGUAGES {
  const pool = [...LANGUAGES];
  const picked: typeof LANGUAGES = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const index = Math.floor(random() * pool.length);
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

function demoRepos(now: Date, random: () => number): RepoNode[] {
  const count = 8 + Math.floor(random() * 5); // 8-12
  return REPO_NAMES.slice(0, count).map((name, index) => {
    const [primary, ...secondary] = pickLanguages(random, 1 + Math.floor(random() * 3));
    const languages = [
      { name: primary.name, color: primary.color, size: 40_000 + Math.floor(random() * 200_000) },
      ...secondary.map((lang) => ({
        name: lang.name,
        color: lang.color,
        size: 2_000 + Math.floor(random() * 40_000),
      })),
    ];

    const pushedAt = new Date(now);
    pushedAt.setDate(pushedAt.getDate() - Math.floor(random() * 200));

    return {
      name,
      nameWithOwner: `${DEMO_LOGIN}/${name}`,
      description: `${name.replace(/-/g, ' ')} — a small, honest tool.`,
      stargazerCount: Math.floor(random() * 400) + (index === 0 ? 200 : 0),
      forkCount: Math.floor(random() * 40),
      isPrivate: random() < 0.25,
      pushedAt: pushedAt.toISOString(),
      url: `https://github.com/${DEMO_LOGIN}/${name}`,
      primaryLanguage: { name: primary.name, color: primary.color },
      languages,
    };
  });
}

/** More than 4 entries so the flow screen's "others" bucket has something to show. */
function demoCommitsByRepo(
  repos: RepoNode[],
  totalCommits: number,
  random: () => number,
): { nameWithOwner: string; count: number }[] {
  const shuffled = [...repos].sort(() => random() - 0.5).slice(0, Math.min(7, repos.length));
  const weights = shuffled.map((_, i) => 1 / (i + 1.4));
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  return shuffled.map((repo, i) => ({
    nameWithOwner: repo.nameWithOwner,
    count: Math.max(1, Math.round((weights[i] / weightSum) * totalCommits)),
  }));
}

function splitBreakdown(total: number, random: () => number) {
  const commits = Math.round(total * (0.54 + random() * 0.06));
  const pullRequests = Math.round(total * (0.16 + random() * 0.05));
  const issues = Math.round(total * (0.08 + random() * 0.04));
  const reviews = Math.max(0, total - commits - pullRequests - issues);
  return { commits, pullRequests, issues, reviews };
}

function sumDays(weeks: ContributionWeek[]): number {
  return weeks.flatMap((week) => week.contributionDays).reduce((sum, day) => sum + day.contributionCount, 0);
}

/** Deterministic fake profile that exercises every screen — no empty arrays, no zeros. */
export function demoGitHubModel(now: Date = new Date()): GitHubModel {
  const random = rng(20260917);

  const { map, startYear } = buildDailyMap(now, random);
  injectStreaks(map, now, random);

  const repos = demoRepos(now, random);
  const weeks = rollingWeeks(map, now);
  const totalContributions = sumDays(weeks);
  const breakdown = splitBreakdown(totalContributions, random);
  const commitsByRepo = demoCommitsByRepo(repos, breakdown.commits, random);
  const years = demoYears(map, startYear, now);

  const contributions: Contributions = {
    login: DEMO_LOGIN,
    name: DEMO_NAME,
    avatarUrl: DEMO_AVATAR,
    bio: DEMO_BIO,
    createdAt: DEMO_CREATED_AT,
    totalContributions,
    weeks,
    years: Array.from({ length: YEAR_COUNT }, (_, i) => startYear + i),
    totalCommitContributions: breakdown.commits,
    totalPullRequestContributions: breakdown.pullRequests,
    totalIssueContributions: breakdown.issues,
    totalPullRequestReviewContributions: breakdown.reviews,
    commitContributionsByRepository: commitsByRepo,
  };

  const todayCount = map.get(toISODate(now)) ?? 0;
  const stats: ContributionStats = {
    todayCommits: todayCount > 0 ? Math.max(1, Math.round(todayCount * 0.7)) : 0,
    totalCommits: years.reduce((sum, year) => sum + year.totalCommits, 0),
    openPrs: demoPullRequests.length,
    followers: 214,
    following: 97,
    stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
    // More repos exist than the demo details, same as a real account.
    repoCount: repos.length + 26,
    repos,
    years,
  };

  return toGitHubModel(contributions, stats, now);
}

/** Back-compat alias — the builder used to be called this everywhere. */
export const demoWidgetModel = demoGitHubModel;

/**
 * Commit timestamps and pull request detail for the demo token. Shaped so
 * the clock has a believable double hump (a working day and a late-evening
 * session) rather than a flat field.
 */
export function demoActivity(): Activity {
  const random = rng(4242);
  const commits: CommitSample[] = [];

  // Two clusters: office hours, and the after-dinner session.
  for (let i = 0; i < 260; i++) {
    const evening = random() < 0.42;
    const centre = evening ? 22 : 11;
    const spread = evening ? 2.4 : 3.2;
    const hour = Math.round(
      centre + (random() + random() + random() - 1.5) * spread,
    );
    const size = Math.round(4 + random() * random() * 320);
    const daysAgo = Math.floor(random() * 120);
    const when = new Date(Date.parse('2026-09-21T12:00:00Z') - daysAgo * 86_400_000);
    commits.push({
      hour: ((hour % 24) + 24) % 24,
      weekday: when.getDay(),
      date: `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`,
      repo: `jaikhuranna/${DEMO_REPOS[Math.floor(random() * DEMO_REPOS.length)]}`,
      additions: Math.round(size * (0.45 + random() * 0.5)),
      deletions: Math.round(size * (0.1 + random() * 0.45)),
      message: DEMO_MESSAGES[Math.floor(random() * DEMO_MESSAGES.length)],
    });
  }

  const now = Date.parse('2026-09-21T09:00:00Z');
  const pulls: PullDetail[] = demoPullRequests.map((pr, index) => {
    const openedAt = Date.parse(pr.createdAt);
    const merged = index % 3 !== 0;
    const cycle = (3 + random() * 90) * 3_600_000;
    const additions = Math.round(20 + random() * 600);
    return {
      number: pr.number,
      title: pr.title,
      url: pr.htmlUrl,
      body: DEMO_BODIES[index % DEMO_BODIES.length],
      repo: pr.repo,
      state: merged ? ('MERGED' as const) : ('OPEN' as const),
      isDraft: pr.draft,
      createdAt: pr.createdAt,
      mergedAt: merged ? new Date(openedAt + cycle).toISOString() : null,
      closedAt: merged ? new Date(openedAt + cycle).toISOString() : null,
      additions,
      deletions: Math.round(additions * (0.15 + random() * 0.8)),
      changedFiles: 1 + Math.floor(random() * 14),
      commits: 1 + Math.floor(random() * 9),
      comments: Math.floor(random() * 12),
      reviewDecision: merged ? 'APPROVED' : index % 2 ? 'REVIEW_REQUIRED' : null,
      firstReviewAt: new Date(openedAt + cycle * 0.35).toISOString(),
      labels:
        index % 2 === 0
          ? [{ name: 'enhancement', color: 'a2eeef' }]
          : [{ name: 'bug', color: 'd73a4a' }],
    };
  });

  void now;
  return { commits, pulls };
}

const DEMO_REPOS = ['git-huh', 'nothing-mtui', 'dot-tiles', 'orbit-widget', 'flux-cli', 'pixel-rain'];

const DEMO_MESSAGES = [
  'fix(widget): today cell timezone drift',
  'refactor: split the sankey layout pass',
  'feat: halftone sigil generator',
  'chore: bump glance to 1.1.1',
  'perf: memoize dot matrix columns',
  'docs: release ritual checklist',
];

const DEMO_BODIES = [
  'The monochrome layer was missing from the adaptive icon, so themed icons fell back to the full-colour foreground and looked wrong on a tinted home screen.\n\nAdds the layer and regenerates every density.',
  'The widget read the day boundary in UTC while the grid read it locally, so around midnight the accent cell landed on the wrong square. Both now agree on the local date.',
  'Splits the layout pass out of the renderer so the ribbon geometry can be unit tested without a canvas.',
  'Generates a deterministic sigil from a hash of the repository name, using the same four primitives as the launcher icon.',
];

/**
 * A believable activity feed for the demo token: every event kind at least
 * once, so the filter chips all have something to show.
 */
export function demoSocial(): SocialEvent[] {
  const base = Date.parse('2026-09-21T09:00:00Z');
  const hours = (n: number) => new Date(base - n * 3_600_000).toISOString();

  const events: SocialEvent[] = [
    {
      id: 'd1',
      kind: 'comment',
      actor: 'annapetrova',
      title: 'feat: adaptive icon monochrome layer',
      repo: 'jaikhuranna/git-huh',
      number: 142,
      url: 'https://github.com/jaikhuranna/git-huh/pull/142',
      at: hours(2),
      excerpt: 'The monochrome layer looks right on my Pixel, but the padding is off by a hair at 48dp.',
    },
    {
      id: 'd2',
      kind: 'review',
      actor: 'marcusleroy',
      state: 'CHANGES_REQUESTED',
      title: 'refactor: split the sankey layout pass',
      repo: 'jaikhuranna/git-huh',
      number: 139,
      url: 'https://github.com/jaikhuranna/git-huh/pull/139',
      at: hours(7),
      excerpt: 'Two passes over the same array — can this fold into one?',
    },
    {
      id: 'd3',
      kind: 'review-request',
      actor: 'siyakapoor',
      title: 'fix: keystore path on fresh clones',
      repo: 'nothing-labs/mtui',
      number: 88,
      url: 'https://github.com/nothing-labs/mtui/pull/88',
      at: hours(11),
      excerpt: 'wants your review',
    },
    {
      id: 'd4',
      kind: 'mention',
      actor: 'devonwrites',
      title: 'Widget stops updating after a theme change',
      repo: 'nothing-labs/mtui',
      number: 401,
      url: 'https://github.com/nothing-labs/mtui/issues/401',
      at: hours(19),
      excerpt: 'mentioned you',
    },
    {
      id: 'd5',
      kind: 'review',
      actor: 'annapetrova',
      state: 'APPROVED',
      title: 'perf: memoize dot matrix columns',
      repo: 'jaikhuranna/dot-tiles',
      number: 57,
      url: 'https://github.com/jaikhuranna/dot-tiles/pull/57',
      at: hours(26),
      excerpt: 'Nice — 40% fewer re-renders on my trace.',
    },
  ];

  const mine: SocialEvent[] = demoPullRequests.slice(0, 4).map((pr, index) => ({
    id: `d-open-${pr.number}`,
    kind: 'open' as const,
    actor: DEMO_LOGIN,
    title: pr.title,
    repo: pr.repo,
    number: pr.number,
    url: pr.htmlUrl,
    at: new Date(base - (index + 1) * 9 * 3_600_000).toISOString(),
    excerpt: pr.draft
      ? 'draft'
      : index === 0
        ? 'approved · ready to merge'
        : 'waiting on review',
  }));

  return [...events, ...mine].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );
}

/**
 * One opened pull request for the demo token: a description with headings
 * and a list, a review thread anchored to a line, a plain comment, and a
 * real unified diff — so the detail screen can be laid out without a
 * network, and every branch of the renderer has something to draw.
 */
export function demoPullDetail(repo: string, number: number): PullDetailFull {
  const listed = demoPullRequests.find((pr) => pr.number === number);
  const opened = listed?.createdAt ?? '2026-09-16T10:24:00Z';
  const at = (hours: number) =>
    new Date(Date.parse(opened) + hours * 3_600_000).toISOString();

  return {
    number,
    title: listed?.title ?? 'feat: adaptive icon monochrome layer',
    url: listed?.htmlUrl ?? `https://github.com/${repo}/pull/${number}`,
    body: DEMO_PULL_BODY,
    repo,
    author: DEMO_LOGIN,
    state: 'OPEN',
    isDraft: listed?.draft ?? false,
    createdAt: opened,
    mergedAt: null,
    baseRefName: 'main',
    headRefName: 'monochrome-layer',
    additions: 54,
    deletions: 13,
    changedFiles: 2,
    commits: 3,
    reviewDecision: 'REVIEW_REQUIRED',
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    comments: [
      {
        id: 'demo-c1',
        kind: 'comment',
        author: 'coderabbitai',
        body: 'Walked the diff. The fallback path reads cleanly now — one nit inline about the cast.',
        createdAt: at(2),
        url: '#',
      },
      {
        id: 'demo-t1',
        kind: 'thread',
        author: 'theo',
        body: 'Is the `as const` load-bearing here? If the array is already readonly the cast is noise.',
        createdAt: at(5),
        url: '#',
        path: 'src/lib/widgetBridge.ts',
        diffHunk:
          '@@ -12,6 +12,9 @@ export function widgetPayload(\n   const modes = ["light", "dark"] as const;\n+  const layers = ["foreground", "monochrome"] as const;',
        resolved: false,
        replies: [
          {
            id: 'demo-t1r1',
            kind: 'thread',
            author: DEMO_LOGIN,
            body: 'It is — without it the tuple widens to `string[]` and the bridge signature stops matching.',
            createdAt: at(6),
            url: '#',
          },
        ],
      },
      {
        id: 'demo-r1',
        kind: 'review',
        author: 'theo',
        body: 'Good change. Holding for the one thread above, then this is fine to land.',
        createdAt: at(6.5),
        url: '#',
        state: 'CHANGES_REQUESTED',
      },
    ],
    files: [
      {
        path: 'src/lib/widgetBridge.ts',
        status: 'modified',
        additions: 9,
        deletions: 2,
        hasPatch: true,
        ...parsePatch(
          '@@ -10,8 +10,15 @@ export function widgetPayload(model) {\n' +
            '   const modes = ["light", "dark"] as const;\n' +
            '-  const layers = ["foreground"];\n' +
            '-  return { modes, layers };\n' +
            '+  const layers = ["foreground", "monochrome"] as const;\n' +
            '+\n' +
            '+  // Themed icons ask for the monochrome layer and fall back to the\n' +
            '+  // foreground when a launcher does not ship one.\n' +
            '+  return {\n' +
            '+    modes,\n' +
            '+    layers,\n' +
            '+    fallback: layers[0],\n' +
            '+  };\n' +
            ' }\n',
        ),
      },
      {
        path: 'assets/android-icon-monochrome.png',
        status: 'added',
        additions: 0,
        deletions: 0,
        hasPatch: false,
        truncated: false,
        lines: [],
      },
    ],
    moreFiles: 0,
  };
}

const DEMO_PULL_BODY = `## Problem

Themed icons fell back to the full-colour foreground, so the launcher tinted
an already-coloured bitmap and the icon came out muddy on a dark wallpaper.

## Fix

- ship \`android-icon-monochrome.png\` at every density
- declare the layer in \`app.json\`
- teach \`widgetPayload\` that a launcher may ask for either layer

\`\`\`ts
const layers = ["foreground", "monochrome"] as const;
\`\`\`

> Checked against Pixel Launcher and Nothing Launcher on a tinted wallpaper.
`;
