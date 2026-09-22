import { useEffect, useMemo, useState } from 'react';

import { demoGitHubModel } from '../lib/demo';
import {
  fetchContributions,
  fetchStats,
  GitHubError,
  type ContributionStats,
} from '../lib/github';
import { toGitHubModel, type GitHubModel } from '../lib/contributions';
import { DEMO_TOKEN } from '../lib/token';

export type ContributionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; model: GitHubModel }
  | { status: 'error'; error: GitHubError };

/** Async result stamped with the token that produced it. */
interface SettledResult {
  token: string;
  outcome:
    | { status: 'ready'; model: GitHubModel }
    | { status: 'error'; error: GitHubError };
}

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

/**
 * Load and shape contributions for a token; null token means signed out.
 * The literal token "demo" short-circuits to deterministic fake data —
 * the layout sandbox for hand-tuning without touching GitHub.
 */
export function useContributions(token: string | null): ContributionsState {
  const [result, setResult] = useState<SettledResult | null>(null);

  const demoModel = useMemo(
    () => (token === DEMO_TOKEN ? demoGitHubModel() : null),
    [token],
  );

  useEffect(() => {
    if (!token || token === DEMO_TOKEN) return;

    const controller = new AbortController();

    fetchContributions(token, controller.signal)
      .then(async (contributions) => {
        let stats: ContributionStats;
        try {
          stats = await fetchStats(
            token,
            contributions.login,
            contributions.years,
            controller.signal,
          );
        } catch (error) {
          // A revoked token must fail loudly; anything else (rate limits,
          // search hiccups) degrades to zeroed stats so the grid survives.
          if (error instanceof GitHubError && error.kind === 'invalid-token') {
            throw error;
          }
          if (error instanceof Error && error.name === 'AbortError') throw error;
          stats = EMPTY_STATS;
        }
        return toGitHubModel(contributions, stats);
      })
      .then((model) =>
        setResult({ token, outcome: { status: 'ready', model } }),
      )
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setResult({
          token,
          outcome: {
            status: 'error',
            error:
              error instanceof GitHubError
                ? error
                : new GitHubError('api', 'Something unexpected happened.'),
          },
        });
      });

    return () => controller.abort();
  }, [token]);

  if (!token) return { status: 'idle' };
  if (demoModel) return { status: 'ready', model: demoModel };
  if (result?.token !== token) return { status: 'loading' };
  return result.outcome;
}
