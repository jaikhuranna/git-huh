import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { demoGitHubModel } from '../lib/demo';
import {
  fetchArchive,
  fetchContributions,
  fetchRepos,
  fetchToday,
  fetchWork,
  GitHubError,
  type ArchiveSlice,
  type ContributionStats,
  type Contributions,
  type ReposSlice,
  type Slice,
  type TodaySlice,
  type WorkSlice,
} from '../lib/github';
import { toGitHubModel, type GitHubModel } from '../lib/contributions';
import type { RequestPriority } from '../lib/rateLimit';
import { keyOf, readSaved, writeSaved, type Saved } from '../lib/store';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

const CONTRIBUTIONS_STALE_AFTER_MS = 30 * 60_000;

export type ContributionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      model: GitHubModel;
      /** Set when the year on screen came off the disk rather than from GitHub. */
      savedAt: number | null;
      /** True when that is because GitHub could not be reached. */
      offline: boolean;
      /** Ask for older years. Today does not wait on this. */
      loadArchive: () => void;
    }
  | { status: 'error'; error: GitHubError };

interface Rolling {
  contributions: Contributions;
  /** When the rolling calendar was last known good, if it came from disk. */
  savedAt: number | null;
}

function loading<T>(value: T): Slice<T> {
  return { status: 'loading', value, at: null };
}

const EMPTY_TODAY: TodaySlice = { todayCommits: 0, openPrs: 0 };
const EMPTY_WORK: WorkSlice = { followers: 0, following: 0, repoCount: 0 };
const EMPTY_REPOS: ReposSlice = { stars: 0, repos: [] };
const EMPTY_ARCHIVE: ArchiveSlice = { totalCommits: 0, totalPrivate: 0, years: [] };

function pendingStats(): ContributionStats {
  return {
    today: loading(EMPTY_TODAY),
    work: loading(EMPTY_WORK),
    repos: loading(EMPTY_REPOS),
    archive: loading(EMPTY_ARCHIVE),
  };
}

/**
 * A failed read keeps the previous answer and says so. A first failure is
 * unavailable, never a successful zero that gets saved as the truth.
 */
function failedSlice<T>(previous: Slice<T> | undefined, empty: T): Slice<T> {
  if (previous && (previous.status === 'ready' || previous.status === 'stale') && previous.at != null) {
    return { status: 'stale', value: previous.value, at: previous.at };
  }
  return { status: 'unavailable', value: empty, at: null };
}

function keep(error: unknown): undefined {
  if (error instanceof GitHubError && error.kind === 'invalid-token') throw error;
  if (error instanceof Error && error.name === 'AbortError') throw error;
  return undefined;
}

/**
 * The rolling calendar and profile, and nothing else. Archive, today's
 * counts and the repository list are separate reads so a stalled year does
 * not hold Today.
 */
/**
 * One account's model for a caller that is not the screen. The rolling
 * calendar is included immediately; today, work and repositories are asked
 * in parallel and omitted when they fail. The year archive is not fetched
 * here — opening a year does that — so a secondary account cannot stall on
 * twelve calendars.
 */
export async function loadModel(
  token: string,
  signal: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<GitHubModel> {
  const rolling = await loadRolling(token, signal, priority);
  const stats = pendingStats();
  const login = rolling.contributions.login;
  const [today, work, repos] = await Promise.all([
    fetchToday(token, login, signal, new Date(), priority).catch((error: unknown) => {
      keep(error);
      return failedSlice(undefined, EMPTY_TODAY);
    }),
    fetchWork(token, signal, priority).catch((error: unknown) => {
      keep(error);
      return failedSlice(undefined, EMPTY_WORK);
    }),
    fetchRepos(token, signal, priority).catch((error: unknown) => {
      keep(error);
      return failedSlice(undefined, EMPTY_REPOS);
    }),
  ]);
  return withSlice(rolling, { ...stats, today, work, repos });
}

export async function loadRolling(
  token: string,
  signal: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<Rolling> {
  const contributions = await fetchContributions(token, signal, priority);
  return { contributions, savedAt: null };
}

/**
 * Fold one slice into a model that already has its calendar. The calendar
 * fields are rebuilt from the same contributions, so a late slice cannot
 * replace a newer grid with an older one.
 */
export function withSlice(
  rolling: Rolling,
  stats: ContributionStats,
  now: Date = new Date(),
): GitHubModel {
  return toGitHubModel(rolling.contributions, stats, now);
}

function cacheKeyFor(token: string | null): string | null {
  return token && token !== DEMO_TOKEN ? `model-${keyOf(token)}` : null;
}

/**
 * Load and shape contributions for a token; null token means signed out.
 * The literal token "demo" short-circuits to deterministic fake data —
 * the layout sandbox for hand-tuning without touching GitHub.
 *
 * The rolling calendar is published the moment it arrives, from disk or
 * from GitHub. Today, the work counts and the repository list fill in
 * beside it. Older years are fetched when something asks, and a failure
 * there leaves the calendar standing.
 */
export function useContributions(
  token: string | null,
): ContributionsState & { reload: () => void } {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoGitHubModel() : undefined),
    [token],
  );
  const cacheKey = cacheKeyFor(token);
  const remote = useRemote(
    token,
    (signal) => loadRolling(token ?? '', signal, 'background'),
    {
      cacheKey: null,
      demo: demo ? { contributions: rollingFromDemo(demo), savedAt: null } : undefined,
      staleAfterMs: CONTRIBUTIONS_STALE_AFTER_MS,
    },
  );
  const [cachedRolling, setCachedRolling] = useState<Rolling | null>(null);
  const [statsByToken, setStatsByToken] = useState<Record<string, ContributionStats>>({});
  const tokenKey = token ?? '';
  const stats = statsByToken[tokenKey] ?? pendingStats();
  const archiveAsked = useRef<string | null>(null);

  const rolling = remote.status === 'ready' ? remote.data : cachedRolling;
  const login = rolling?.contributions.login ?? null;

  useEffect(() => {
    if (!token || token === DEMO_TOKEN || !cacheKey) return;
    let alive = true;
    readSaved<GitHubModel>(cacheKey).then((saved) => {
      if (!alive || !saved) return;
      setCachedRolling(rollingFromSaved(saved));
      setStatsByToken((current) => ({
        ...current,
        [tokenKey]: hydrateStats(current[tokenKey] ?? pendingStats(), saved.value),
      }));
    }).catch(() => {});
    return () => {
      alive = false;
    };
  }, [cacheKey, token, tokenKey]);

  // Generic over the slice key, so a `today` value can only be written to the
  // `today` slot: the read and the slot it lands in are tied to one another.
  const apply = useCallback(
    <K extends keyof ContributionStats>(key: K, slice: ContributionStats[K]) => {
      setStatsByToken((current) => ({
        ...current,
        [tokenKey]: { ...(current[tokenKey] ?? pendingStats()), [key]: slice },
      }));
    },
    [tokenKey],
  );

  useEffect(() => {
    if (!token || token === DEMO_TOKEN || !login) return;
    const controller = new AbortController();
    const signal = controller.signal;
    const run = async <K extends 'today' | 'work' | 'repos'>(
      key: K,
      empty: ContributionStats[K]['value'],
      read: () => Promise<ContributionStats[K]>,
    ) => {
      try {
        const slice = await read();
        if (!signal.aborted) apply(key, slice);
      } catch (error) {
        keep(error);
        if (!signal.aborted) {
          setStatsByToken((current) => {
            const previous = current[tokenKey] ?? pendingStats();
            // `previous[key]` and `empty` are the same slice type; the cast
            // tells the checker what the generic key already guarantees.
            const slice = failedSlice<ContributionStats[K]['value']>(
              previous[key] as ContributionStats[K],
              empty,
            );
            return {
              ...current,
              [tokenKey]: { ...previous, [key]: slice },
            };
          });
        }
      }
    };
    void run('today', EMPTY_TODAY, () => fetchToday(token, login, signal, new Date(), 'background'));
    void run('work', EMPTY_WORK, () => fetchWork(token, signal, 'background'));
    void run('repos', EMPTY_REPOS, () => fetchRepos(token, signal, 'background'));
    return () => controller.abort();
  }, [apply, login, token, tokenKey]);

  const loadArchive = useCallback(() => {
    if (!token || token === DEMO_TOKEN || !rolling || archiveAsked.current === tokenKey) return;
    if (stats.archive.status === 'ready') return;
    archiveAsked.current = tokenKey;
    const controller = new AbortController();
    fetchArchive(token, rolling.contributions.years, controller.signal, 'background')
      .then((slice) => apply('archive', slice))
      .catch((error: unknown) => {
        archiveAsked.current = null;
        try {
          keep(error);
        } catch {
          return;
        }
        apply('archive', failedSlice(stats.archive, EMPTY_ARCHIVE));
      });
  }, [apply, rolling, stats.archive, token, tokenKey]);

  const model = useMemo(() => {
    if (!rolling) return null;
    if (token === DEMO_TOKEN) return demo ?? null;
    return withSlice(rolling, stats);
  }, [demo, rolling, stats, token]);

  useEffect(() => {
    if (!cacheKey || !model || token === DEMO_TOKEN) return;
    if (!calendarReady(model)) return;
    writeSaved(cacheKey, model).catch(() => {});
  }, [cacheKey, model, token]);

  return useMemo((): ContributionsState & { reload: () => void } => {
    if (model && rolling) {
      const fromDisk = remote.status !== 'ready';
      return {
        status: 'ready',
        model,
        savedAt: fromDisk ? rolling.savedAt : remote.status === 'ready' ? remote.savedAt : rolling.savedAt,
        offline: remote.status === 'ready' ? remote.offline : remote.status === 'error',
        loadArchive,
        reload: remote.reload,
      };
    }
    switch (remote.status) {
      case 'idle':
        return { status: 'idle', reload: remote.reload };
      case 'loading':
        return { status: 'loading', reload: remote.reload };
      case 'ready':
        return {
          status: 'ready',
          model: model ?? withSlice(remote.data, stats),
          savedAt: remote.savedAt ?? remote.data.savedAt,
          offline: remote.offline,
          loadArchive,
          reload: remote.reload,
        };
      case 'error':
        return {
          status: 'error',
          error:
            remote.error instanceof GitHubError
              ? remote.error
              : new GitHubError('api', 'Something unexpected happened.'),
          reload: remote.reload,
        };
    }
  }, [loadArchive, model, remote, rolling, stats]);
}

function calendarReady(model: GitHubModel): boolean {
  return model.columns.length > 0 || model.login.length > 0;
}

/**
 * A previously saved model may be the old flat shape or a partial one.
 * Counts that were real stay, marked stale until the new read confirms them.
 * Zeros with no slice were the old failure path and are not revived as facts.
 */
function known<T>(slice: Slice<T> | undefined): slice is Slice<T> {
  return slice != null && (slice.status === 'ready' || slice.status === 'stale');
}

/**
 * Paint a cached model immediately, without treating an old zeroed failure
 * as a fresh answer. Slices that were saved as ready stay; bare numbers from
 * the previous shape are stale until this launch confirms them.
 */
function hydrateStats(current: ContributionStats, saved: GitHubModel): ContributionStats {
  const at = Date.now();
  return {
    today: known(current.today)
      ? current.today
      : known(saved.today)
        ? saved.today
        : { status: 'stale', value: { todayCommits: saved.todayCommits, openPrs: saved.openPrs }, at },
    work: known(current.work)
      ? current.work
      : known(saved.work)
        ? saved.work
        : {
            status: 'stale',
            value: { followers: saved.followers, following: saved.following, repoCount: saved.repoCount },
            at,
          },
    repos: known(current.repos)
      ? current.repos
      : known(saved.reposSlice)
        ? saved.reposSlice
        : current.repos,
    archive: known(current.archive)
      ? current.archive
      : known(saved.archive)
        ? saved.archive
        : saved.years.length > 0
          ? {
              status: 'stale',
              value: { totalCommits: saved.totalCommits, totalPrivate: saved.totalPrivate, years: [] },
              at,
            }
          : current.archive,
  };
}

function rollingFromSaved(saved: Saved<GitHubModel>): Rolling {
  return { contributions: rollingFromDemo(saved.value), savedAt: saved.at };
}

/** The demo model is already shaped. Rebuild the contributions the hook expects. */
function rollingFromDemo(model: GitHubModel): Contributions {
  return {
    id: model.viewerId ?? 'demo',
    login: model.login,
    name: model.name,
    avatarUrl: model.avatarUrl,
    bio: model.bio,
    createdAt: `${model.since}-01-01T00:00:00Z`,
    totalContributions: model.total,
    weeks: model.columns.map((column) => ({
      contributionDays: column.map((day) => ({ date: day.date, contributionCount: day.count })),
    })),
    years: model.years.map((year) => year.year),
    totalCommitContributions: model.breakdown.commits,
    totalPullRequestContributions: model.breakdown.pullRequests,
    totalIssueContributions: model.breakdown.issues,
    totalPullRequestReviewContributions: model.breakdown.reviews,
    restrictedContributions: model.breakdown.private,
    commitContributionsByRepository: model.topRepos
      .filter((repo) => repo.nameWithOwner !== 'others')
      .map((repo) => ({ nameWithOwner: repo.nameWithOwner, count: repo.count })),
  };
}
