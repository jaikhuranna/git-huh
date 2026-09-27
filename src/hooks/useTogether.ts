import { useMemo } from 'react';

import type { Account } from '../lib/accounts';
import { EMPTY_ACTIVITY, fetchActivity, type Activity } from '../lib/activity';
import type { GitHubModel } from '../lib/contributions';
import { GitHubError } from '../lib/github';
import { mergeActivity, mergeModels } from '../lib/merge';
import { keyOf, readSaved, writeSaved } from '../lib/store';
import { loadModel } from './useContributions';
import { useRemote } from './useRemote';

export interface Together {
  /** The year on every chart: the account in use, plus every account ticked beside it. */
  model: GitHubModel | null;
  activity: Activity;
  /** Accounts that were ticked but could not be read (a revoked token, no signal and nothing saved). */
  missing: string[];
}

interface Others {
  models: GitHubModel[];
  missing: string[];
}

/**
 * Other accounts, added into the one in use.
 *
 * Each account's year is fetched with its own token — GitHub only tells a
 * token about its own account — and saved where that account's own model is
 * saved, so switching to it later opens warm. An account that cannot be read
 * falls back to its saved year, and failing that drops out of the sum with
 * its name on the list of `missing`, rather than taking the charts down.
 */
export function useTogether(
  primary: GitHubModel | null,
  primaryActivity: Activity,
  others: Account[],
  activityWanted: boolean,
): Together {
  const tokens = others.map((account) => account.token).join('|');
  const login = primary?.login.toLowerCase() ?? null;
  const key = login && others.length > 0 ? `${login}|${tokens}` : null;

  const years = useRemote<Others>(
    key,
    async (signal) => {
      const models: GitHubModel[] = [];
      const missing: string[] = [];
      await Promise.all(
        others.map(async (account) => {
          const cacheKey = `model-${keyOf(account.token)}`;
          try {
            const model = await loadModel(account.token, signal);
            writeSaved(cacheKey, model).catch(() => {});
            models.push(model);
          } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') throw error;
            const saved =
              error instanceof GitHubError && error.kind === 'invalid-token'
                ? null
                : await readSaved<GitHubModel>(cacheKey);
            if (saved) models.push(saved.value);
            else missing.push(account.login);
          }
        }),
      );
      // Promise order is arrival order; the sum is drawn in the list's order.
      const order = others.map((account) => account.login.toLowerCase());
      models.sort(
        (a, b) => order.indexOf(a.login.toLowerCase()) - order.indexOf(b.login.toLowerCase()),
      );
      return { models, missing };
    },
    { cacheKey: key ? `${login}-together-${keyOf(tokens)}` : null },
  );

  const commits = useRemote<Activity[]>(
    key && activityWanted ? key : null,
    (signal) =>
      Promise.all(
        others.map((account) =>
          fetchActivity(account.token, account.login, signal).catch((error: unknown) => {
            if (error instanceof Error && error.name === 'AbortError') throw error;
            return EMPTY_ACTIVITY;
          }),
        ),
      ),
    { cacheKey: key ? `${login}-together-activity-${keyOf(tokens)}` : null },
  );

  const read = years.status === 'ready' ? years.data : null;
  const otherActivity = commits.status === 'ready' ? commits.data : null;

  return useMemo<Together>(() => {
    if (!primary) return { model: null, activity: primaryActivity, missing: [] };
    if (others.length === 0 || !read) {
      return { model: primary, activity: primaryActivity, missing: [] };
    }
    return {
      model: mergeModels([primary, ...read.models]),
      activity: otherActivity ? mergeActivity([primaryActivity, ...otherActivity]) : primaryActivity,
      missing: read.missing,
    };
  }, [otherActivity, others.length, primary, primaryActivity, read]);
}
