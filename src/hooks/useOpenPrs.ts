import { useEffect, useState } from 'react';

import { demoPullRequests } from '../lib/demo';
import { fetchOpenPrs, type PullRequest } from '../lib/prs';
import { DEMO_TOKEN } from '../lib/token';

export type PrsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; prs: PullRequest[] }
  | { status: 'error' };

/** Settled result stamped with the request key that produced it. */
interface Settled {
  key: string;
  outcome: { status: 'ready'; prs: PullRequest[] } | { status: 'error' };
}

/**
 * Open PRs for the token owner, fetched only while the tab is active.
 * Demo tokens resolve instantly; real requests settle into a keyed result
 * so status is derived — never set synchronously inside the effect.
 */
export function useOpenPrs(
  token: string | null,
  login: string | null,
  active: boolean,
): PrsState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${token ?? ''}|${login ?? ''}|${active}`;

  useEffect(() => {
    if (!active || !token || !login || token === DEMO_TOKEN) return;

    const controller = new AbortController();

    fetchOpenPrs(token, login, controller.signal)
      .then((prs) => setSettled({ key, outcome: { status: 'ready', prs } }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSettled({ key, outcome: { status: 'error' } });
      });

    return () => controller.abort();
  }, [key, token, login, active]);

  if (!active || !token || !login) return { status: 'idle' };
  if (token === DEMO_TOKEN) return { status: 'ready', prs: demoPullRequests };
  if (settled?.key !== key) return { status: 'loading' };
  return settled.outcome;
}
