import { useMemo } from 'react';

import { demoGitHubModel } from '../lib/demo';
import {
  fetchContributions,
  fetchStats,
  GitHubError,
  type ContributionStats,
} from '../lib/github';
import { toGitHubModel, type GitHubModel } from '../lib/contributions';
import { keyOf } from '../lib/store';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

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
    }
  | { status: 'error'; error: GitHubError };

/**
 * Everything the second query would have provided, zeroed. The calendar is
 * the load-bearing request; the stats query is large enough that a rate limit
 * or a slow repository bucket should degrade the extra screens rather than
 * take the whole app down.
 */
const EMPTY_STATS: ContributionStats = {
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

async function loadModel(token: string, signal: AbortSignal): Promise<GitHubModel> {
  const contributions = await fetchContributions(token, signal);
  let stats: ContributionStats;
  try {
    stats = await fetchStats(token, contributions.login, contributions.years, signal);
  } catch (error) {
    // A revoked token must fail loudly; anything else (rate limits, search
    // hiccups) degrades to zeroed stats so the grid survives.
    if (error instanceof GitHubError && error.kind === 'invalid-token') throw error;
    if (error instanceof Error && error.name === 'AbortError') throw error;
    stats = EMPTY_STATS;
  }
  return toGitHubModel(contributions, stats);
}

/**
 * Load and shape contributions for a token; null token means signed out.
 * The literal token "demo" short-circuits to deterministic fake data —
 * the layout sandbox for hand-tuning without touching GitHub.
 *
 * The last year that loaded is kept on the device, so a launch with a warm
 * cache goes straight to the app instead of the loading wave, and a launch
 * with no signal still has a year to show — marked with its age.
 */
export function useContributions(
  token: string | null,
): ContributionsState & { reload: () => void } {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoGitHubModel() : undefined),
    [token],
  );
  const remote = useRemote(
    token,
    (signal) => loadModel(token ?? '', signal),
    {
      cacheKey: token && token !== DEMO_TOKEN ? `model-${keyOf(token)}` : null,
      demo,
    },
  );

  switch (remote.status) {
    case 'idle':
      return { status: 'idle', reload: remote.reload };
    case 'loading':
      return { status: 'loading', reload: remote.reload };
    case 'ready':
      return {
        status: 'ready',
        model: remote.data,
        savedAt: remote.savedAt,
        offline: remote.offline,
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
}
