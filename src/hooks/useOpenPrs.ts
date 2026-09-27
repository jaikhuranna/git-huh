import { useMemo } from 'react';

import { demoPullRequests } from '../lib/demo';
import { fetchOpenPrs, type PullRequest } from '../lib/prs';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

export type PrsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; prs: PullRequest[]; savedAt: number | null; offline: boolean }
  | { status: 'error' };

/**
 * Open PRs for the token owner, fetched while the section is open. The saved
 * list is drawn first, so coming back to `work` shows the drawer at once and
 * lets the new answer slide in under it.
 */
export function useOpenPrs(
  token: string | null,
  login: string | null,
  active: boolean,
): PrsState {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoPullRequests : undefined),
    [token],
  );
  const remote = useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchOpenPrs(token ?? '', login ?? '', signal),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-prs` : null,
      demo,
    },
  );

  return useMemo(() => {
    if (remote.status === 'ready') {
      return {
        status: 'ready',
        prs: remote.data,
        savedAt: remote.savedAt,
        offline: remote.offline,
      };
    }
    if (remote.status === 'error') return { status: 'error' };
    return { status: remote.status };
  }, [remote]);
}
