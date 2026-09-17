import { useEffect, useState } from 'react';

import { fetchContributions, GitHubError } from '../lib/github';
import { toWidgetModel, type WidgetModel } from '../lib/contributions';

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
 * Status is derived from the latest settled result, so the effect only
 * ever sets state in async callbacks — never synchronously.
 */
export function useContributions(token: string | null): ContributionsState {
  const [result, setResult] = useState<SettledResult | null>(null);

  useEffect(() => {
    if (!token) return;

    const controller = new AbortController();

    fetchContributions(token, controller.signal)
      .then((data) =>
        setResult({
          token,
          outcome: { status: 'ready', model: toWidgetModel(data) },
        }),
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
  if (result?.token !== token) return { status: 'loading' };
  return result.outcome;
}
