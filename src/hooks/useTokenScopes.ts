import { useEffect, useState } from 'react';

import { fetchTokenScopes, seesPrivateWork } from '../lib/github';
import { DEMO_TOKEN } from '../lib/token';

/**
 * Whether the signed-in token can see private work.
 *
 * `'limited'` is the diagnosis for the failure this app had no way to
 * report: a token without `repo` is answered with only the public half of
 * the account, and GitHub returns that as a perfectly valid, perfectly empty
 * year. No error, no warning — just a flat dot grid, a today count of zero
 * and a flow diagram of ten contributions on an account that made hundreds.
 *
 * `'unknown'` covers fine-grained tokens, which send no scope header. There
 * is nothing to infer from silence, so the app says nothing.
 */
export type ScopeState = 'unknown' | 'full' | 'limited';

/** The answer, stamped with the token that produced it. */
interface Settled {
  token: string;
  limited: boolean;
}

export function useTokenScopes(token: string | null): ScopeState {
  const [result, setResult] = useState<Settled | null>(null);

  useEffect(() => {
    if (!token || token === DEMO_TOKEN) return;

    const controller = new AbortController();
    fetchTokenScopes(token, controller.signal)
      .then((scopes) => {
        const sees = seesPrivateWork(scopes);
        if (sees === null) return;
        setResult({ token, limited: !sees });
      })
      .catch(() => {
        // Best effort: a failed check is not worth an error path, it just
        // means no banner.
      });

    return () => controller.abort();
  }, [token]);

  // Derived rather than reset in the effect, so swapping tokens cannot leave
  // the previous account's answer on screen for a render.
  if (!token || result?.token !== token) return 'unknown';
  return result.limited ? 'limited' : 'full';
}
