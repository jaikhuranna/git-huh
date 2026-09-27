import { brightCycle } from '../theme';
import type {
  Contributions,
  ContributionStats,
  ContributionWeek,
  RepoNode,
  YearStats,
} from './github';

export type Level = 0 | 1 | 2 | 3 | 4;

export interface GridDay {
  date: string;
  count: number;
  level: Level;
  isToday: boolean;
}

export type GridColumn = GridDay[];

export interface Breakdown {
  commits: number;
  pullRequests: number;
  issues: number;
  reviews: number;
  /**
   * Contributions GitHub will only report as a lump: work in repositories
   * the profile does not expose. It is already inside the calendar total, so
   * leaving it out of the breakdown made the two disagree by an order of
   * magnitude — a year of 441 contributions rendered as a flow of 10.
   */
  private: number;
}

export interface TopRepo {
  nameWithOwner: string;
  count: number;
}

export interface RepoSummary {
  name: string;
  nameWithOwner: string;
  owner: string;
  description: string;
  stars: number;
  forks: number;
  isPrivate: boolean;
  pushedAt: string;
  language: { name: string; color: string } | null;
  url: string;
}

export interface LanguageShare {
  name: string;
  color: string;
  bytes: number;
  share: number;
}

export interface YearSummary {
  year: number;
  total: number;
  /** Jan..Dec totals for that year. */
  months: number[];
  /**
   * Weekly totals for that year's own calendar, oldest first. The poster
   * draws every year from this, so 2019 gets the same column resolution as
   * this year instead of collapsing to twelve months.
   */
  weeks: number[];
  /** The month each week belongs to, 0–11, parallel to `weeks`. */
  weekMonths: number[];
  /** Contributions on/before today's month-day in that year. */
  beforeToday: number;
  /** Contributions after today's month-day in that year. */
  afterToday: number;
}

export interface GitHubModel {
  login: string;
  name: string;
  avatarUrl: string;
  bio: string;
  following: number;
  total: number;
  todayCount: number;
  todayCommits: number;
  totalCommits: number;
  /** Lifetime private-repo contributions, summed over the same years. */
  totalPrivate: number;
  openPrs: number;
  followers: number;
  stars: number;
  repoCount: number;
  /** First year the account contributed, from contributionYears. */
  since: number;
  /** Full year of weeks, column-major, today flagged. */
  columns: GridColumn[];
  breakdown: Breakdown;
  /** Top repos by commit count, capped at 4 + an "others" bucket. */
  topRepos: TopRepo[];
  repos: RepoSummary[];
  /** Aggregated across all repos, sorted by bytes desc. */
  languages: LanguageShare[];
  /** Per contribution year, oldest first. */
  years: YearSummary[];
  /** Weekly totals across the visible year, oldest first. */
  weeks: number[];
}

/** Local calendar date as YYYY-MM-DD, matching GitHub's day strings. */
export function toISODate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** GitHub-style intensity level: quartiles of the window's peak day. */
function levelFor(count: number, max: number): Level {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4)) as Level;
}

/** Deterministic hash so a repeated language name always lands on the same bright. */
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function fallbackColor(name: string): string {
  return brightCycle[hashString(name) % brightCycle.length];
}

function normalizeLanguage(
  lang: { name: string; color: string | null } | null,
): { name: string; color: string } | null {
  if (!lang) return null;
  return { name: lang.name, color: lang.color ?? fallbackColor(lang.name) };
}

function toRepoSummary(node: RepoNode): RepoSummary {
  const owner = node.nameWithOwner.split('/')[0] ?? node.nameWithOwner;
  return {
    name: node.name,
    nameWithOwner: node.nameWithOwner,
    owner,
    description: node.description ?? '',
    stars: node.stargazerCount,
    forks: node.forkCount,
    isPrivate: node.isPrivate,
    pushedAt: node.pushedAt ?? '',
    language: normalizeLanguage(node.primaryLanguage),
    url: node.url,
  };
}

/** Top 4 repos by commit count, with the rest folded into "others". */
function toTopRepos(byRepo: { nameWithOwner: string; count: number }[]): TopRepo[] {
  const sorted = [...byRepo].sort((a, b) => b.count - a.count);
  const top = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  const othersCount = rest.reduce((sum, repo) => sum + repo.count, 0);
  return othersCount > 0
    ? [...top, { nameWithOwner: 'others', count: othersCount }]
    : top;
}

/** Byte totals per language across every repo, sorted desc. */
function toLanguages(repos: RepoNode[]): LanguageShare[] {
  const totals = new Map<string, { color: string | null; bytes: number }>();
  for (const repo of repos) {
    for (const lang of repo.languages) {
      const entry = totals.get(lang.name) ?? { color: lang.color, bytes: 0 };
      entry.bytes += lang.size;
      if (!entry.color && lang.color) entry.color = lang.color;
      totals.set(lang.name, entry);
    }
  }
  const totalBytes = [...totals.values()].reduce((sum, t) => sum + t.bytes, 0);
  return [...totals.entries()]
    .map(([name, { color, bytes }]) => ({
      name,
      color: color ?? fallbackColor(name),
      bytes,
      share: totalBytes > 0 ? bytes / totalBytes : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Monthly shape + before/after-today split for one contribution year. */
function toYearSummary(year: YearStats, now: Date): YearSummary {
  const cutoff = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`;
  const months = new Array(12).fill(0) as number[];
  let beforeToday = 0;
  let afterToday = 0;

  for (const day of year.weeks.flatMap((week) => week.contributionDays)) {
    const [, month, dayOfMonth] = day.date.split('-');
    months[Number(month) - 1] += day.contributionCount;
    const monthDay = `${month}-${dayOfMonth}`;
    if (monthDay <= cutoff) beforeToday += day.contributionCount;
    else afterToday += day.contributionCount;
  }

  return {
    year: year.year,
    total: year.totalContributions,
    months,
    weeks: weeklyTotals(year.weeks),
    weekMonths: weekMonths(year.weeks),
    beforeToday,
    afterToday,
  };
}

function weeklyTotals(weeks: ContributionWeek[]): number[] {
  return weeks.map((week) =>
    week.contributionDays.reduce((sum, day) => sum + day.contributionCount, 0),
  );
}

/** Which month each week sits in — its first day's, so the axis reads left to right. */
function weekMonths(weeks: ContributionWeek[]): number[] {
  return weeks.map((week) => {
    const first = week.contributionDays[0]?.date;
    return first ? Number(first.slice(5, 7)) - 1 : 0;
  });
}

/**
 * The year to print after "since".
 *
 * The earliest contribution year is the interesting number, but it is
 * computed from commit author dates, which are a text field anyone can set —
 * one imported repository with a 1999 timestamp and a 2016 account claims to
 * have been here since 1999. The account's own creation year is the earliest
 * thing that can honestly be said, so it is the floor, and this year is the
 * ceiling.
 */
export function sinceYear(
  contributions: Pick<Contributions, 'years' | 'createdAt'>,
  now: Date = new Date(),
): number {
  const thisYear = now.getFullYear();
  const created = new Date(contributions.createdAt).getFullYear();
  const floor = Number.isFinite(created) ? created : thisYear;
  const earliest =
    contributions.years.length > 0 ? Math.min(...contributions.years) : floor;
  return Math.min(Math.max(earliest, floor), thisYear);
}

/** Shape raw calendar + stats data into the app's view model. Pure and testable. */
export function toGitHubModel(
  contributions: Contributions,
  stats: ContributionStats,
  now: Date = new Date(),
): GitHubModel {
  const today = toISODate(now);
  const columns: GridColumn[] = contributions.weeks.map((week) =>
    week.contributionDays.map((day) => ({
      date: day.date,
      count: day.contributionCount,
      level: 0 as Level,
      isToday: day.date === today,
    })),
  );

  const allDays = columns.flat();
  const max = allDays.reduce((peak, day) => Math.max(peak, day.count), 0);
  for (const day of allDays) {
    day.level = levelFor(day.count, max);
  }

  // GitHub's calendar day boundaries can drift one day off the local clock;
  // if no cell matched, mark the most recent past day as "today" so the
  // accent dot always renders.
  if (!allDays.some((day) => day.isToday)) {
    const lastPast = allDays.findLast((day) => day.date <= today);
    if (lastPast) lastPast.isToday = true;
  }

  return {
    login: contributions.login,
    name: contributions.name ?? contributions.login,
    avatarUrl: contributions.avatarUrl,
    bio: contributions.bio ?? '',
    following: stats.following,
    total: contributions.totalContributions,
    todayCount: allDays.find((day) => day.isToday)?.count ?? 0,
    todayCommits: stats.todayCommits,
    totalCommits: stats.totalCommits,
    totalPrivate: stats.totalPrivate,
    openPrs: stats.openPrs,
    followers: stats.followers,
    stars: stats.stars,
    repoCount: stats.repoCount,
    since: sinceYear(contributions, now),
    columns,
    breakdown: {
      commits: contributions.totalCommitContributions,
      pullRequests: contributions.totalPullRequestContributions,
      issues: contributions.totalIssueContributions,
      reviews: contributions.totalPullRequestReviewContributions,
      private: contributions.restrictedContributions,
    },
    topRepos: toTopRepos(contributions.commitContributionsByRepository),
    repos: stats.repos.map(toRepoSummary),
    languages: toLanguages(stats.repos),
    years: stats.years.map((year) => toYearSummary(year, now)),
    weeks: weeklyTotals(contributions.weeks),
  };
}

export interface Insights {
  currentStreak: number;
  longestStreak: number;
  /** Indices into the flattened day array (columns.flat()) for the dots screen. */
  longestStreakRange: { startIndex: number; endIndex: number };
  bestDay: number;
  activeDays: number;
  avgPerDay: number;
  busiestWeekday: string;
  /** Same info as busiestWeekday, as a 0 (Sun) .. 6 (Sat) index. */
  peakWeekday: number;
  /** Index into model.columns of the highest-total week. */
  peakWeekIndex: number;
  yesterdayCount: number;
  /** This week's total vs the previous week's, as a signed percentage. */
  velocity: number;
  /** activeDays / total days in the visible window, 0-1. */
  consistency: number;
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Streaks, peaks and rhythms derived from the visible window. */
export function insights(model: GitHubModel): Insights {
  const days = model.columns.flat();

  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].count > 0; i--) {
    currentStreak += 1;
  }

  let longestStreak = 0;
  let longestStart = 0;
  let longestEnd = -1;
  let run = 0;
  let runStart = 0;
  let bestDay = 0;
  let activeDays = 0;
  const weekdayTotalsArr = new Array(WEEKDAYS.length).fill(0);

  days.forEach((day, index) => {
    if (day.count > 0) {
      run = run === 0 ? 1 : run + 1;
      if (run === 1) runStart = index;
      if (run > longestStreak) {
        longestStreak = run;
        longestStart = runStart;
        longestEnd = index;
      }
    } else {
      run = 0;
    }
    bestDay = Math.max(bestDay, day.count);
    if (day.count > 0) activeDays += 1;
    const weekday = new Date(`${day.date}T00:00:00`).getDay();
    weekdayTotalsArr[weekday] += day.count;
  });

  const peakWeekday = weekdayTotalsArr.indexOf(Math.max(...weekdayTotalsArr));
  const busiestWeekday = WEEKDAYS[peakWeekday] ?? 'monday';

  let peakWeekIndex = 0;
  let peakWeekTotal = -1;
  model.columns.forEach((column, index) => {
    const total = column.reduce((sum, day) => sum + day.count, 0);
    if (total > peakWeekTotal) {
      peakWeekTotal = total;
      peakWeekIndex = index;
    }
  });

  const thisWeek =
    model.columns[model.columns.length - 1]?.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const lastWeek =
    model.columns[model.columns.length - 2]?.reduce((sum, day) => sum + day.count, 0) ?? 0;
  const velocity =
    lastWeek > 0 ? ((thisWeek - lastWeek) / lastWeek) * 100 : thisWeek > 0 ? 100 : 0;

  const todayIndex = days.findIndex((day) => day.isToday);
  const yesterdayCount = todayIndex > 0 ? days[todayIndex - 1].count : 0;

  return {
    currentStreak,
    longestStreak,
    longestStreakRange: {
      startIndex: longestStart,
      endIndex: Math.max(longestEnd, longestStart),
    },
    bestDay,
    activeDays,
    avgPerDay: days.length > 0 ? model.total / days.length : 0,
    busiestWeekday,
    peakWeekday,
    peakWeekIndex,
    yesterdayCount,
    velocity,
    consistency: days.length > 0 ? activeDays / days.length : 0,
  };
}
