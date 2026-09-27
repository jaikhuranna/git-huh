import type { Activity } from './activity';
import type {
  GitHubModel,
  GridColumn,
  Level,
  RepoSummary,
  TopRepo,
  YearSummary,
} from './contributions';

/**
 * Several accounts as one year.
 *
 * Most people with a work account have a personal one too, and neither
 * profile alone is what they did: the work is split down the middle by which
 * login pushed it. Every figure here is a sum over the accounts, on the
 * first account's calendar — the days of the year are the same days whoever
 * is asking — and the intensity levels are worked out again over the sum, so
 * a day that was busy on both reads as busier than either.
 *
 * The first model is the one in use: its login stays the model's login,
 * because that is the account the inbox, the pull requests and every write
 * belong to. `accounts` lists everyone in the sum.
 */
export function mergeModels(models: readonly GitHubModel[]): GitHubModel {
  const [first, ...rest] = models;
  if (!first) throw new Error('mergeModels needs at least one model');
  if (rest.length === 0) return first;

  const byDate = new Map<string, number>();
  for (const model of models) {
    for (const day of model.columns.flat()) {
      byDate.set(day.date, (byDate.get(day.date) ?? 0) + day.count);
    }
  }
  const peak = Math.max(0, ...byDate.values());
  const columns: GridColumn[] = first.columns.map((column) =>
    column.map((day) => {
      const count = byDate.get(day.date) ?? 0;
      return { ...day, count, level: levelFor(count, peak) };
    }),
  );

  const sum = (pick: (model: GitHubModel) => number) =>
    models.reduce((total, model) => total + pick(model), 0);

  return {
    ...first,
    accounts: models.flatMap((model) => model.accounts ?? [model.login]),
    total: sum((model) => model.total),
    todayCount: columns.flat().find((day) => day.isToday)?.count ?? sum((model) => model.todayCount),
    todayCommits: sum((model) => model.todayCommits),
    totalCommits: sum((model) => model.totalCommits),
    totalPrivate: sum((model) => model.totalPrivate),
    openPrs: sum((model) => model.openPrs),
    followers: sum((model) => model.followers),
    following: sum((model) => model.following),
    stars: sum((model) => model.stars),
    repoCount: sum((model) => model.repoCount),
    since: Math.min(...models.map((model) => model.since)),
    columns,
    breakdown: {
      commits: sum((model) => model.breakdown.commits),
      pullRequests: sum((model) => model.breakdown.pullRequests),
      issues: sum((model) => model.breakdown.issues),
      reviews: sum((model) => model.breakdown.reviews),
      private: sum((model) => model.breakdown.private),
    },
    topRepos: mergeTopRepos(models.map((model) => model.topRepos)),
    repos: mergeRepos(models.map((model) => model.repos)),
    languages: mergeLanguages(models),
    years: mergeYears(models.map((model) => model.years)),
    weeks: first.weeks.map((_, index) => sum((model) => model.weeks[index] ?? 0)),
  };
}

/** Commits and pull requests from every account, deduplicated. */
export function mergeActivity(activities: readonly Activity[]): Activity {
  if (activities.length === 1) return activities[0];
  const seenCommits = new Set<string>();
  const seenPulls = new Set<string>();
  const commits = activities
    .flatMap((activity) => activity.commits)
    .filter((commit) => {
      const key = `${commit.repo}|${commit.date}|${commit.hour}|${commit.message}`;
      if (seenCommits.has(key)) return false;
      seenCommits.add(key);
      return true;
    });
  const pulls = activities
    .flatMap((activity) => activity.pulls)
    .filter((pull) => {
      const key = `${pull.repo}#${pull.number}`;
      if (seenPulls.has(key)) return false;
      seenPulls.add(key);
      return true;
    });
  return { commits, pulls };
}

function levelFor(count: number, max: number): Level {
  if (count <= 0 || max <= 0) return 0;
  return Math.min(4, Math.ceil((count / max) * 4)) as Level;
}

/** Top four by commits over every account, the rest (and every "others") folded. */
function mergeTopRepos(lists: readonly TopRepo[][]): TopRepo[] {
  const counts = new Map<string, number>();
  let others = 0;
  for (const list of lists) {
    for (const repo of list) {
      if (repo.nameWithOwner === 'others') others += repo.count;
      else counts.set(repo.nameWithOwner, (counts.get(repo.nameWithOwner) ?? 0) + repo.count);
    }
  }
  const sorted = [...counts.entries()]
    .map(([nameWithOwner, count]) => ({ nameWithOwner, count }))
    .sort((a, b) => b.count - a.count);
  others += sorted.slice(4).reduce((total, repo) => total + repo.count, 0);
  const top = sorted.slice(0, 4);
  return others > 0 ? [...top, { nameWithOwner: 'others', count: others }] : top;
}

/** A repository two accounts can both see is still one repository. */
function mergeRepos(lists: readonly RepoSummary[][]): RepoSummary[] {
  const seen = new Map<string, RepoSummary>();
  for (const repo of lists.flat()) {
    if (!seen.has(repo.nameWithOwner)) seen.set(repo.nameWithOwner, repo);
  }
  return [...seen.values()].sort((a, b) => Date.parse(b.pushedAt || '0') - Date.parse(a.pushedAt || '0'));
}

function mergeLanguages(models: readonly GitHubModel[]): GitHubModel['languages'] {
  const totals = new Map<string, { color: string; bytes: number }>();
  for (const model of models) {
    for (const language of model.languages) {
      const entry = totals.get(language.name) ?? { color: language.color, bytes: 0 };
      entry.bytes += language.bytes;
      totals.set(language.name, entry);
    }
  }
  const all = [...totals.values()].reduce((total, entry) => total + entry.bytes, 0);
  return [...totals.entries()]
    .map(([name, { color, bytes }]) => ({ name, color, bytes, share: all > 0 ? bytes / all : 0 }))
    .sort((a, b) => b.bytes - a.bytes);
}

/** Years are summed by year; a year's weeks line up because it is the same calendar. */
function mergeYears(lists: readonly YearSummary[][]): YearSummary[] {
  const byYear = new Map<number, YearSummary>();
  for (const year of lists.flat()) {
    const found = byYear.get(year.year);
    if (!found) {
      byYear.set(year.year, {
        ...year,
        months: [...year.months],
        weeks: [...year.weeks],
        weekMonths: [...year.weekMonths],
      });
      continue;
    }
    found.total += year.total;
    found.beforeToday += year.beforeToday;
    found.afterToday += year.afterToday;
    found.months = found.months.map((value, index) => value + (year.months[index] ?? 0));
    const length = Math.max(found.weeks.length, year.weeks.length);
    found.weeks = Array.from(
      { length },
      (_, index) => (found.weeks[index] ?? 0) + (year.weeks[index] ?? 0),
    );
    if (year.weekMonths.length > found.weekMonths.length) found.weekMonths = [...year.weekMonths];
  }
  return [...byYear.values()].sort((a, b) => a.year - b.year);
}
