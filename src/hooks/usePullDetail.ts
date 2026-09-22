import { useMemo } from 'react';

import { demoPullDetail } from '../lib/demo';
import { GitHubError } from '../lib/github';
import { fetchPullDetail, type PullDetailFull } from '../lib/pullDetail';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

export type PullDetailState =
  | { status: 'loading' }
  | { status: 'ready'; pull: PullDetailFull; savedAt: number | null; offline: boolean }
  | { status: 'error'; error: unknown };

/**
 * One pull request. Every one you open is kept on the device, so the ones
 * you read on the way to the train are still readable in the tunnel — with
 * their age on them, because the conversation is the part most likely to
 * have moved on since.
 */
export function usePullDetail(
  token: string | null,
  login: string | null,
  repo: string,
  number: number,
): PullDetailState & { reload: () => void } {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoPullDetail(repo, number) : undefined),
    [number, repo, token],
  );
  const remote = useRemote(
    token ? `${token}|${repo}#${number}` : null,
    async (signal) => {
      const pull = await fetchPullDetail(token ?? '', repo, number, signal);
      if (!pull) throw new GitHubError('missing', 'Not found.');
      return pull;
    },
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-pull-${repo}-${number}` : null,
      demo,
    },
  );

  if (remote.status === 'ready') {
    return {
      status: 'ready',
      pull: remote.data,
      savedAt: remote.savedAt,
      offline: remote.offline,
      reload: remote.reload,
    };
  }
  if (remote.status === 'error') return { status: 'error', error: remote.error, reload: remote.reload };
  return { status: 'loading', reload: remote.reload };
}
