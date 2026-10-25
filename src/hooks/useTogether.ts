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

/** How many secondary accounts may load at once. The rest wait their turn. */
const ACCOUNT_LANES = 2;

/** A per-account model younger than this is reused instead of fetched again. */
const FRESH_MS = 5 * 60_000;

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function lane(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await run(items[index], index);
    }
  }
  const width = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: width }, () => lane()));
  return results;
}

/**
 * Other accounts, added into the one in use.
 *
 * Each account's year is fetched with its own token — GitHub only tells a
 * token about its own account — and saved where that account's own model is
 * saved, so switching to it later opens warm. The sum itself is not saved:
 * it is derived, and a derived copy would keep account B's year inside A's
 * box after B was removed. An account that cannot be read falls back to its
 * saved year, and failing that drops out of the sum with its name on the
 * list of `missing`, rather than taking the charts down.
 *
 * A handful of accounts must not all hit GitHub at once. Two load at a time,
 * the active account already has its year, and a secondary whose own model
 * was saved moments ago is reused rather than fetched again.
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
      const missing: string[] = [];
      const models = await mapLimited(others, ACCOUNT_LANES, async (account) => {
        const cacheKey = `model-${keyOf(account.token)}`;
        const saved = await readSaved<GitHubModel>(cacheKey);
        if (saved && Date.now() - saved.at < FRESH_MS) return saved.value;
        try {
          const model = await loadModel(account.token, signal, 'background');
          // Same key the account uses when it is the one in front, so turning
          // it on later finds a year already saved.
          writeSaved(cacheKey, model).catch(() => {});
          return model;
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          if (error instanceof GitHubError && error.kind === 'invalid-token') {
            missing.push(account.login);
            return null;
          }
          if (saved) return saved.value;
          missing.push(account.login);
          return null;
        }
      });
      const present = models.filter((model): model is GitHubModel => model != null);
      const order = others.map((account) => account.login.toLowerCase());
      present.sort(
        (a, b) => order.indexOf(a.login.toLowerCase()) - order.indexOf(b.login.toLowerCase()),
      );
      return { models: present, missing };
    },
    // The sum lives in the registry for this session only. Persisting it
    // would keep a removed account's year reachable under the one that remains.
    { cacheKey: null, staleAfterMs: FRESH_MS },
  );

  const commits = useRemote<Activity[]>(
    key && activityWanted ? key : null,
    (signal) =>
      mapLimited(others, ACCOUNT_LANES, (account) =>
        fetchActivity(account.token, account.login, signal, null, 'background').catch((error: unknown) => {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          return EMPTY_ACTIVITY;
        }),
      ),
    { cacheKey: null, staleAfterMs: FRESH_MS },
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
