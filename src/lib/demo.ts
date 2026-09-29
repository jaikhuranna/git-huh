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
import type { Checks, LogTail, PendingDeployment } from './checks';
import type { IssueTemplate } from './issueForms';
import type {
  Alert,
  CodeHit,
  DiscussionRow,
  Entry,
  IssueRow,
  Release,
  RepoFile,
  RepoInfo,
} from './repo';
import type { Thread } from './thread';
import type { Queue } from './queue';
import type { Task, Tasks } from './assigned';
import { tallyPeople, type People } from './people';

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

/**
 * GitHub's own placeholder account, so nobody reads the demo's invented year
 * as a real person's. Every figure below is generated.
 */
const DEMO_LOGIN = 'octocat';
const DEMO_NAME = 'The Octocat';
const DEMO_BIO = 'A demo account. Every number here is made up.';
const DEMO_AVATAR = 'https://avatars.githubusercontent.com/u/0?v=4';
const DEMO_CREATED_AT = '2016-03-12T00:00:00Z';
const YEAR_COUNT = 6;

export const demoPullRequests: PullRequest[] = [
  {
    number: 142,
    title: 'feat: adaptive icon monochrome layer',
    repo: `${DEMO_LOGIN}/git-huh`,
    htmlUrl: `https://github.com/${DEMO_LOGIN}/git-huh/pull/142`,
    createdAt: '2026-09-16T10:24:00Z',
    draft: false,
  },
  {
    number: 139,
    title: 'fix(widget): today cell timezone drift',
    repo: `${DEMO_LOGIN}/git-huh`,
    htmlUrl: `https://github.com/${DEMO_LOGIN}/git-huh/pull/139`,
    createdAt: '2026-09-14T18:03:00Z',
    draft: false,
  },
  {
    number: 41,
    title: 'docs: release ritual checklist',
    repo: `${DEMO_LOGIN}/paper-tokens`,
    htmlUrl: `https://github.com/${DEMO_LOGIN}/paper-tokens/pull/41`,
    createdAt: '2026-09-11T09:41:00Z',
    draft: false,
  },
  {
    number: 128,
    title: 'perf: memoize dot matrix columns',
    repo: `${DEMO_LOGIN}/git-huh`,
    htmlUrl: `https://github.com/${DEMO_LOGIN}/git-huh/pull/128`,
    createdAt: '2026-09-08T21:12:00Z',
    draft: true,
  },
  {
    number: 33,
    title: 'chore: bump glance to 1.1.1',
    repo: `${DEMO_LOGIN}/dot-tiles`,
    htmlUrl: `https://github.com/${DEMO_LOGIN}/dot-tiles/pull/33`,
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
  'paper-tokens',
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

/** Quieter early years, busier recent ones. */
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
      restricted: Math.round(totalContributions * 0.22),
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
  // A quarter of the year behind closed doors, which is the shape of most
  // real accounts and the case the flow screen has to render honestly.
  const restricted = Math.round(total * (0.22 + random() * 0.08));
  const open = total - restricted;
  const commits = Math.round(open * (0.54 + random() * 0.06));
  const pullRequests = Math.round(open * (0.16 + random() * 0.05));
  const issues = Math.round(open * (0.08 + random() * 0.04));
  const reviews = Math.max(0, open - commits - pullRequests - issues);
  return { commits, pullRequests, issues, reviews, restricted };
}

function sumDays(weeks: ContributionWeek[]): number {
  return weeks.flatMap((week) => week.contributionDays).reduce((sum, day) => sum + day.contributionCount, 0);
}

/**
 * Two honest silences, so the demo shows the wave every chart draws over a
 * long stretch of nothing (`lib/quiet.ts`): six weeks off this spring, and a
 * summer away three years ago.
 */
function injectQuiet(map: Map<string, number>, now: Date, startYear: number): void {
  const clear = (from: Date, days: number) => {
    const day = new Date(from);
    for (let i = 0; i < days; i++) {
      map.set(toISODate(day), 0);
      day.setDate(day.getDate() + 1);
    }
  };
  const spring = new Date(now);
  spring.setDate(spring.getDate() - 190);
  clear(spring, 44);
  clear(new Date(startYear + 2, 5, 1), 122);
}

/** Deterministic fake profile that exercises every screen — no empty arrays, and two long silences for the wave. */
export function demoGitHubModel(now: Date = new Date()): GitHubModel {
  const random = rng(20260917);

  const { map, startYear } = buildDailyMap(now, random);
  injectStreaks(map, now, random);
  injectQuiet(map, now, startYear);

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
    restrictedContributions: breakdown.restricted,
    commitContributionsByRepository: commitsByRepo,
  };

  const todayCount = map.get(toISODate(now)) ?? 0;
  const stats: ContributionStats = {
    todayCommits: todayCount > 0 ? Math.max(1, Math.round(todayCount * 0.7)) : 0,
    totalCommits: years.reduce((sum, year) => sum + year.totalCommits, 0),
    totalPrivate: years.reduce((sum, year) => sum + year.restricted, 0),
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
      repo: `${DEMO_LOGIN}/${DEMO_REPOS[Math.floor(random() * DEMO_REPOS.length)]}`,
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

const DEMO_REPOS = ['git-huh', 'paper-tokens', 'dot-tiles', 'orbit-widget', 'flux-cli', 'pixel-rain'];

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
      repo: `${DEMO_LOGIN}/git-huh`,
      number: 142,
      url: `https://github.com/${DEMO_LOGIN}/git-huh/pull/142`,
      at: hours(2),
      excerpt: 'The monochrome layer looks right on my Pixel, but the padding is off by a hair at 48dp.',
    },
    {
      id: 'd2',
      kind: 'review',
      actor: 'marcusleroy',
      state: 'CHANGES_REQUESTED',
      title: 'fix(widget): today cell timezone drift',
      repo: `${DEMO_LOGIN}/git-huh`,
      number: 139,
      url: `https://github.com/${DEMO_LOGIN}/git-huh/pull/139`,
      at: hours(7),
      excerpt: 'The widget and the grid each work out the date — can they share one helper?',
    },
    {
      id: 'd3',
      kind: 'review-request',
      actor: 'siyakapoor',
      title: 'fix: keystore path on fresh clones',
      repo: 'halftone-labs/tokens',
      number: 88,
      url: 'https://github.com/halftone-labs/tokens/pull/88',
      at: hours(11),
      excerpt: 'wants your review',
    },
    {
      id: 'd4',
      kind: 'mention',
      actor: 'devonwrites',
      title: 'Widget stops updating after a theme change',
      repo: 'halftone-labs/tokens',
      number: 401,
      url: 'https://github.com/halftone-labs/tokens/issues/401',
      at: hours(19),
      excerpt: 'mentioned you',
    },
    {
      id: 'd5',
      kind: 'review',
      actor: 'annapetrova',
      state: 'APPROVED',
      title: 'perf: memoize dot matrix columns',
      repo: `${DEMO_LOGIN}/dot-tiles`,
      number: 57,
      url: `https://github.com/${DEMO_LOGIN}/dot-tiles/pull/57`,
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
    id: `demo-pr-${number}`,
    headSha: 'd3m0c0ffee',
    // The demo account wrote its own pull requests; the one it was asked to
    // review is someone else's, so approve is on offer there.
    viewerIsAuthor: repo.startsWith(`${DEMO_LOGIN}/`),
    number,
    title: listed?.title ?? 'feat: adaptive icon monochrome layer',
    url: listed?.htmlUrl ?? `https://github.com/${repo}/pull/${number}`,
    body: DEMO_PULL_BODIES[number] ?? DEMO_PULL_BODY,
    repo,
    author: DEMO_LOGIN,
    state: 'OPEN',
    isDraft: listed?.draft ?? false,
    createdAt: opened,
    mergedAt: null,
    baseRefName: 'main',
    headRefName: DEMO_BRANCHES[number] ?? 'monochrome-layer',
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

/**
 * The other listed pull requests say what they are about too; the
 * conversation and the diff are the one above's, which a demo can live with.
 */
const DEMO_PULL_BODIES: Record<number, string> = {
  139: `## Problem

The widget read the day boundary in UTC while the grid read it locally, so
for a few hours around midnight today's plus sat on yesterday's square.

## Fix

- one \`toISODate\` for both, in local time
- the line of the day turns over at local midnight as well`,
  41: `A checklist for cutting a release by hand: bump both version numbers, build
one ABI, attach the APK, and write notes a person would read.`,
  128: `Each column of the dot matrix is its own memoised component, so a new day
redraws one column instead of fifty-three.`,
  33: 'Glance 1.1.1 fixes the widget losing its corner radius on some launchers.',
};

const DEMO_BRANCHES: Record<number, string> = {
  139: 'widget-local-day',
  41: 'release-checklist',
  128: 'memo-columns',
  33: 'bump-glance',
};

// ---------------------------------------------------------------------------
// The rest of the world, for the demo account: a repository to walk around
// in, a file to edit, a thread to answer and a CI run that failed — so every
// screen that reads or writes has something real-looking to do without a
// network, and nothing it "sends" goes anywhere.

const ago = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

export function demoChecks(): Checks {
  return {
    runs: [
      {
        id: 9001,
        name: 'test (android)',
        status: 'completed',
        conclusion: 'failure',
        url: '#',
        app: 'github-actions',
        isActions: true,
        summary: '2 tests failed in widgetPayload',
      },
      {
        id: 9004,
        name: 'deploy (preview)',
        status: 'waiting',
        conclusion: null,
        url: '#',
        app: 'github-actions',
        isActions: true,
        summary: 'waiting for approval on preview',
      },
      {
        id: 9003,
        name: 'build (release)',
        status: 'in_progress',
        conclusion: null,
        url: '#',
        app: 'github-actions',
        isActions: true,
        summary: null,
      },
      {
        id: 9002,
        name: 'typecheck',
        status: 'completed',
        conclusion: 'success',
        url: '#',
        app: 'github-actions',
        isActions: true,
        summary: null,
      },
      {
        id: 9005,
        name: 'lint',
        status: 'completed',
        conclusion: 'success',
        url: '#',
        app: 'github-actions',
        isActions: true,
        summary: null,
      },
    ],
    workflows: [
      { id: 71, name: 'ci', status: 'completed', conclusion: 'failure', event: 'pull_request', url: '#' },
      { id: 72, name: 'preview', status: 'waiting', conclusion: null, event: 'pull_request', url: '#' },
    ],
  };
}

export function demoLog(): LogTail {
  return {
    errors: [
      'FAIL src/lib/widgetBridge.test.ts',
      "  ● widgetPayload › carries the monochrome layer: expected 'monochrome', received undefined",
      "  ● widgetPayload › falls back when a launcher asks for both: TypeError: layers is not iterable",
    ],
    tail: [
      '> jest --ci',
      'PASS src/lib/contributions.test.ts',
      'PASS src/lib/messageCache.test.ts',
      'FAIL src/lib/widgetBridge.test.ts',
      '  ● widgetPayload › carries the monochrome layer',
      "    expected 'monochrome', received undefined",
      '      41 |   const payload = widgetPayload(model);',
      "    > 42 |   expect(payload.layers[1]).toBe('monochrome');",
      '         |                              ^',
      'Tests:       2 failed, 61 passed, 63 total',
      'Error: Process completed with exit code 1.',
    ],
  };
}

export function demoPending(): PendingDeployment[] {
  return [{ environmentId: 1, environment: 'preview', canApprove: true }];
}

export function demoThread(repo: string, number: number, type: 'issue' | 'discussion'): Thread {
  const discussion = type === 'discussion';
  return {
    type,
    id: `demo-${type}-${number}`,
    number,
    repo,
    title: discussion
      ? 'Should the widget follow the wallpaper or the theme?'
      : 'Widget stops updating after a theme change',
    url: `https://github.com/${repo}/${discussion ? 'discussions' : 'issues'}/${number}`,
    body: discussion
      ? 'Material You gives us both. The wallpaper is prettier, the theme is what people *chose*. Which one wins when they disagree?'
      : 'After switching from light to dark the widget keeps the old background until the next sync.\n\n**Steps**\n\n1. Place the widget\n2. Switch the system theme\n3. Wait\n\n@octocat any idea whether the palette is read once?',
    state: discussion ? 'OPEN' : 'OPEN',
    author: 'devonwrites',
    createdAt: ago(52),
    labels: discussion ? [] : [{ name: 'bug', color: 'd73a4a' }],
    category: discussion ? 'Ideas' : null,
    comments: [
      {
        id: 'demo-tc1',
        author: 'annapetrova',
        body: 'Same on a Pixel 8. It fixes itself after the next sync, so the palette is cached somewhere.',
        createdAt: ago(40),
        url: '#',
        replies: discussion
          ? [
              {
                id: 'demo-tc1r',
                author: DEMO_LOGIN,
                body: 'It is read once per sync — the fix is to read it at bind time.',
                createdAt: ago(38),
                url: '#',
                replies: [],
              },
            ]
          : [],
      },
      {
        id: 'demo-tc2',
        author: 'marcusleroy',
        body: 'Could be the `system_neutral1_*` read happening on the wrong context.',
        createdAt: ago(20),
        url: '#',
        isAnswer: discussion,
        replies: [],
      },
    ],
    moreComments: 0,
  };
}

export function demoRepoInfo(repo: string): RepoInfo {
  return {
    nameWithOwner: repo,
    description: 'Make your own GitHub history worth looking at.',
    url: `https://github.com/${repo}`,
    defaultBranch: 'main',
    stars: 214,
    forks: 12,
    isPrivate: false,
    language: { name: 'TypeScript', color: '#3178c6' },
    permission: repo.startsWith(`${DEMO_LOGIN}/`) ? 'ADMIN' : 'READ',
    openIssues: 3,
    discussionsEnabled: true,
  };
}

export function demoEntries(path: string): Entry[] {
  if (path === 'src') {
    return [
      { name: 'lib', path: 'src/lib', type: 'dir', size: 0 },
      { name: 'screens', path: 'src/screens', type: 'dir', size: 0 },
      { name: 'theme.ts', path: 'src/theme.ts', type: 'file', size: 2210 },
    ];
  }
  if (path.startsWith('src/')) {
    return [{ name: 'widgetBridge.ts', path: `${path}/widgetBridge.ts`, type: 'file', size: 1320 }];
  }
  return [
    { name: '.github', path: '.github', type: 'dir', size: 0 },
    { name: 'src', path: 'src', type: 'dir', size: 0 },
    { name: 'README.md', path: 'README.md', type: 'file', size: 812 },
    { name: 'package.json', path: 'package.json', type: 'file', size: 1135 },
  ];
}

export function demoFile(path: string): RepoFile {
  const text = path.endsWith('README.md')
    ? '# git-huh\n\nMake your own GitHub history worth looking at.\n\nThe numbers GitHub already has about you, rendered as printed artefacts\nrather than as a dashboard. Paste a token, read your year.\n\n## Build\n\n    npm install\n    npx expo run:android\n\nTeh widget lives in `android/`.\n'
    : [
        "import type { GitHubModel } from './contributions';",
        '',
        'export function widgetPayload(model: GitHubModel) {',
        '  const days = model.columns.flat();',
        '  return {',
        '    days: days.map((day) => ({ l: day.level, t: day.isToday })),',
        '    today: model.todayCount,',
        '  };',
        '}',
        '',
      ].join('\n');
  return { path, sha: 'demo-blob', size: text.length, ref: 'main', text };
}

export function demoSearch(terms: string): { total: number; hits: CodeHit[] } {
  return {
    total: 3,
    hits: [
      {
        repo: `${DEMO_LOGIN}/git-huh`,
        path: 'src/lib/widgetBridge.ts',
        fragments: [`export function widgetPayload(model: GitHubModel) — ${terms}`],
      },
      {
        repo: `${DEMO_LOGIN}/git-huh`,
        path: 'README.md',
        fragments: [`The widget lives in android/ · ${terms}`],
      },
      {
        repo: `${DEMO_LOGIN}/paper-tokens`,
        path: 'src/index.ts',
        fragments: [`export function surfaceColor(palette, mode) · ${terms}`],
      },
    ],
  };
}

export function demoReleases(): Release[] {
  return [
    {
      id: 3,
      name: 'dev-3.0.0',
      tag: 'dev-3.0.0',
      body: 'Five sections instead of thirteen pages.\n\n- **today** — you · now · weather · hours\n- **inbox** — the feed, with a count on the tab\n- **lab** — where experiments live',
      publishedAt: ago(20),
      prerelease: true,
      draft: false,
      url: '#',
      assets: 1,
    },
    {
      id: 2,
      name: 'dev-2.9.0',
      tag: 'dev-2.9.0',
      body: 'The strip moves a width at a time, even where animations do not run.',
      publishedAt: ago(70),
      prerelease: true,
      draft: false,
      url: '#',
      assets: 1,
    },
  ];
}

export function demoIssues(): IssueRow[] {
  return [
    {
      number: 401,
      title: 'Widget stops updating after a theme change',
      author: 'devonwrites',
      comments: 2,
      createdAt: ago(52),
      labels: [{ name: 'bug', color: 'd73a4a' }],
    },
    {
      number: 398,
      title: 'Poster year chips overflow on small screens',
      author: 'annapetrova',
      comments: 0,
      createdAt: ago(160),
      labels: [],
    },
  ];
}

export function demoDiscussions(): DiscussionRow[] {
  return [
    {
      number: 12,
      title: 'Should the widget follow the wallpaper or the theme?',
      author: 'devonwrites',
      comments: 2,
      category: 'Ideas',
      updatedAt: ago(20),
      answered: true,
    },
  ];
}

export function demoAlerts(): Alert[] {
  return [
    {
      number: 7,
      severity: 'high',
      pkg: 'semver',
      ecosystem: 'npm',
      summary: 'semver vulnerable to Regular Expression Denial of Service',
      vulnerable: '< 7.5.2',
      patched: '7.5.2',
      manifest: 'package-lock.json',
      url: '#',
    },
    {
      number: 6,
      severity: 'medium',
      pkg: 'ws',
      ecosystem: 'npm',
      summary: 'ws affected by a DoS when handling a request with many HTTP headers',
      vulnerable: '>= 8.0.0, < 8.17.1',
      patched: '8.17.1',
      manifest: 'package-lock.json',
      url: '#',
    },
  ];
}

export function demoTemplates(): IssueTemplate[] {
  return [
    {
      file: 'bug.yml',
      name: 'Bug report',
      about: 'Something drew the wrong number, or nothing at all.',
      title: '[bug] ',
      labels: ['bug'],
      kind: 'form',
      body: '',
      fields: [
        { type: 'markdown', text: 'Thanks for writing it down. One screen per report, please.' },
        {
          type: 'dropdown',
          id: 'screen',
          label: 'Which screen',
          description: '',
          options: ['today', 'inbox', 'work', 'year', 'widget'],
          multiple: false,
          required: true,
        },
        {
          type: 'textarea',
          id: 'what',
          label: 'What happened',
          description: 'What you saw, and what you expected instead.',
          placeholder: 'The poster showed 2019 twice…',
          value: '',
          required: true,
          render: null,
        },
        {
          type: 'input',
          id: 'version',
          label: 'Version',
          description: 'From the release you installed.',
          placeholder: 'dev-3.0.0',
          value: '',
          required: false,
          render: null,
        },
        {
          type: 'checkboxes',
          id: 'checked',
          label: 'Checks',
          description: '',
          options: [{ label: 'I searched the open issues first', required: true }],
        },
      ],
    },
    {
      file: 'idea.md',
      name: 'Idea',
      about: 'A screen, a pin, a better way to say a number.',
      title: '',
      labels: ['idea'],
      kind: 'markdown',
      body: '**What it would show**\n\n\n**Which pin it comes from**\n',
      fields: [],
    },
  ];
}

const daysAgo = (days: number, now: number = Date.now()) =>
  new Date(now - days * 86_400_000).toISOString();

/**
 * A review queue with every kind of wait in it — asked this morning, asked a
 * fortnight ago, asked through a team — and reviews that have moved since.
 */
export function demoQueue(): Queue {
  const pull = (repo: string, number: number) => `https://github.com/${repo}/pull/${number}`;
  return {
    askedTotal: 4,
    asked: [
      {
        repo: 'halftone-labs/tokens',
        number: 81,
        title: 'refactor: one source for the spacing scale',
        url: pull('halftone-labs/tokens', 81),
        author: 'marcusleroy',
        askedAt: daysAgo(33),
        viaTeam: true,
        draft: false,
        additions: 412,
        deletions: 388,
        files: 23,
      },
      {
        repo: 'halftone-labs/tokens',
        number: 88,
        title: 'fix: keystore path on fresh clones',
        url: pull('halftone-labs/tokens', 88),
        author: 'siyakapoor',
        askedAt: daysAgo(9),
        viaTeam: false,
        draft: false,
        additions: 14,
        deletions: 6,
        files: 2,
      },
      {
        repo: 'annapetrova/plotter-fonts',
        number: 12,
        title: 'feat: single-stroke numerals for the pen plotter',
        url: pull('annapetrova/plotter-fonts', 12),
        author: 'annapetrova',
        askedAt: daysAgo(3),
        viaTeam: false,
        draft: false,
        additions: 96,
        deletions: 3,
        files: 5,
      },
      {
        repo: `${DEMO_LOGIN}/git-huh`,
        number: 147,
        title: 'widget: honour the launcher corner radius',
        url: pull(`${DEMO_LOGIN}/git-huh`, 147),
        author: 'devonwrites',
        askedAt: daysAgo(0.2),
        viaTeam: false,
        draft: true,
        additions: 38,
        deletions: 21,
        files: 3,
      },
    ],
    reviewed: [
      {
        repo: 'halftone-labs/tokens',
        number: 79,
        title: 'chore: drop the node 18 matrix',
        url: pull('halftone-labs/tokens', 79),
        author: 'siyakapoor',
        state: 'CHANGES_REQUESTED',
        reviewedAt: daysAgo(4),
        since: 3,
      },
      {
        repo: 'annapetrova/plotter-fonts',
        number: 9,
        title: 'docs: how the kerning table is generated',
        url: pull('annapetrova/plotter-fonts', 9),
        author: 'annapetrova',
        state: 'APPROVED',
        reviewedAt: daysAgo(2),
        since: 0,
      },
      {
        repo: 'marcusleroy/dotfiles',
        number: 30,
        title: 'zsh: lazy-load the version managers',
        url: pull('marcusleroy/dotfiles', 30),
        author: 'marcusleroy',
        state: 'COMMENTED',
        reviewedAt: daysAgo(11),
        since: 0,
      },
    ],
  };
}

/** Assigned work and filed issues across a few repositories, some with dates. */
export function demoTasks(): Tasks {
  const task = (
    kind: Task['kind'],
    repo: string,
    number: number,
    title: string,
    quiet: number,
    extra: Partial<Task> = {},
  ): Task => ({
    kind,
    repo,
    number,
    title,
    url: `https://github.com/${repo}/${kind === 'pull' ? 'pull' : 'issues'}/${number}`,
    author: DEMO_LOGIN,
    createdAt: daysAgo(quiet + 20),
    updatedAt: daysAgo(quiet),
    replies: 0,
    labels: [],
    milestone: null,
    draft: false,
    ...extra,
  });
  const now = new Date();
  const due = (days: number) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days)).toISOString();
  const assigned = [
    task('issue', 'halftone-labs/tokens', 401, 'Widget stops updating after a theme change', 0.5, {
      author: 'devonwrites',
      replies: 6,
      labels: ['bug', 'widget'],
      milestone: { title: 'v2.4', dueOn: due(4) },
    }),
    task('issue', 'halftone-labs/tokens', 377, 'Document the contrast ratios for every ink', 18, {
      author: 'marcusleroy',
      replies: 2,
      labels: ['docs'],
      milestone: { title: 'v2.3', dueOn: due(-6) },
    }),
    task('pull', `${DEMO_LOGIN}/git-huh`, 142, 'feat: adaptive icon monochrome layer', 1, { replies: 4 }),
    task('issue', `${DEMO_LOGIN}/git-huh`, 133, 'Share card: long repository names run off the frame', 40, {
      author: 'annapetrova',
      replies: 1,
      labels: ['share'],
    }),
  ];
  const filed = [
    task('issue', 'annapetrova/plotter-fonts', 14, 'The zero and the capital O are the same glyph', 5, {
      replies: 3,
    }),
    task('issue', 'expo/expo', 38211, 'NativeTabs: indicator colour ignored after a scheme change', 52, {
      replies: 11,
      labels: ['Issue accepted', 'Router'],
    }),
  ];
  return { assigned, assignedTotal: assigned.length, filed, filedTotal: filed.length };
}

/** Five colleagues and a year of reviews between them and the demo account. */
export function demoPeople(now: Date = new Date()): People {
  const random = rng(4242);
  const cast: [string, number, number][] = [
    ['annapetrova', 23, 18],
    ['marcusleroy', 14, 21],
    ['siyakapoor', 9, 6],
    ['devonwrites', 2, 7],
    ['tomasz-k', 3, 0],
    ['lin-hao', 0, 2],
  ];
  const when = () => new Date(now.getTime() - Math.floor(random() * random() * 360) * 86_400_000).toISOString();
  const user = (login: string) => ({ __typename: 'User', login });
  const mine = cast.flatMap(([login, reviewedYou]) =>
    Array.from({ length: reviewedYou }, () => {
      const at = when();
      return { createdAt: at, reviews: { nodes: [{ author: user(login), submittedAt: at }] } };
    }),
  );
  const theirs = cast.flatMap(([login, , youReviewed]) =>
    Array.from({ length: youReviewed }, () => {
      const at = when();
      return { createdAt: at, author: user(login), reviews: { nodes: [{ submittedAt: at }] } };
    }),
  );
  return {
    ...tallyPeople(mine, theirs, DEMO_LOGIN, now),
    sample: { mine: 50, mineTotal: 64, theirs: theirs.length, theirsTotal: theirs.length },
  };
}
