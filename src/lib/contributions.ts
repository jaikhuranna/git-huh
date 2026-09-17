import type {
  Contributions,
  ContributionStats,
  ContributionWeek,
} from './github';

/** Weeks of history rendered in the widget's dot matrix. */
export const GRID_WEEKS = 18;

export type Level = 0 | 1 | 2 | 3 | 4;

export interface GridDay {
  date: string;
  count: number;
  level: Level;
  isToday: boolean;
}

export type GridColumn = GridDay[];

export interface WidgetModel {
  login: string;
  total: number;
  todayCount: number;
  todayCommits: number;
  totalCommits: number;
  openPrs: number;
  columns: GridColumn[];
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

function lastWeeks(weeks: ContributionWeek[], count: number): ContributionWeek[] {
  return weeks.slice(Math.max(0, weeks.length - count));
}

/** Shape raw calendar data into the widget's view model. Pure and testable. */
export function toWidgetModel(
  contributions: Contributions,
  stats: ContributionStats,
  now: Date = new Date(),
): WidgetModel {
  const today = toISODate(now);
  const columns: GridColumn[] = lastWeeks(contributions.weeks, GRID_WEEKS).map(
    (week) =>
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
    total: contributions.totalContributions,
    todayCount: allDays.find((day) => day.isToday)?.count ?? 0,
    todayCommits: stats.todayCommits,
    totalCommits: stats.totalCommits,
    openPrs: stats.openPrs,
    columns,
  };
}
