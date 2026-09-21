import { useEffect, useState } from 'react';

import { demoPullDetail } from '../lib/demo';
import { fetchPullDetail, type PullDetailFull } from '../lib/pullDetail';
import { DEMO_TOKEN } from '../lib/token';

export type PullDetailState =
  | { status: 'loading' }
  | { status: 'ready'; pull: PullDetailFull }
  | { status: 'error' };

interface Settled {
  key: string;
  outcome: PullDetailState;
}

/**
 * One pull request, fetched when it is opened and thrown away when it is
 * closed. Nothing caches it: the diff is the largest payload in the app and
 * the conversation is the part most likely to have moved on since you looked.
 */
export function usePullDetail(
  token: string | null,
  repo: string | null,
  number: number | null,
): PullDetailState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${token ?? ''}|${repo ?? ''}|${number ?? ''}`;

  useEffect(() => {
    if (!token || !repo || number == null || token === DEMO_TOKEN) return;

    const controller = new AbortController();
    fetchPullDetail(token, repo, number, controller.signal)
      .then((pull) =>
        setSettled({
          key,
          outcome: pull ? { status: 'ready', pull } : { status: 'error' },
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSettled({ key, outcome: { status: 'error' } });
      });

    return () => controller.abort();
  }, [key, number, repo, token]);

  if (!token || !repo || number == null) return { status: 'loading' };
  if (token === DEMO_TOKEN) {
    return { status: 'ready', pull: demoPullDetail(repo, number) };
  }
  if (settled?.key !== key) return { status: 'loading' };
  return settled.outcome;
}
