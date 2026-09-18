import { useEffect, useMemo, useState } from 'react';

import {
  fetchContributions,
  fetchStats,
  GitHubError,
} from '../lib/github';
import { demoWidgetModel } from '../lib/demo';
import { toWidgetModel, type WidgetModel } from '../lib/contributions';
import { DEMO_TOKEN } from '../lib/token';

export type ContributionsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; model: WidgetModel }
  | { status: 'error'; error: GitHubError };

/** Async result stamped with the token that produced it. */
interface SettledResult {
  token: string;
  outcome:
    | { status: 'ready'; model: WidgetModel }
    | { status: 'error'; error: GitHubError };
}

/**
 * Load and shape contributions for a token; null token means signed out.
 * The literal token "demo" short-circuits to deterministic fake data —
 * the layout sandbox for hand-tuning without touching GitHub.
 */
export function useContributions(token: string | null): ContributionsState {
  const [result, setResult] = useState<SettledResult | null>(null);

  const demoModel = useMemo(
    () => (token === DEMO_TOKEN ? demoWidgetModel() : null),
    [token],
  );

  useEffect(() => {
    if (!token || token === DEMO_TOKEN) return;

    const controller = new AbortController();

    fetchContributions(token, controller.signal)
      .then(async (contributions) => {
        let stats: Awaited<ReturnType<typeof fetchStats>>;
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
          stats = { todayCommits: 0, totalCommits: 0, openPrs: 0 };
        }
        return toWidgetModel(contributions, stats);
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
