import { useMemo } from 'react';

import { demoPullRequests } from '../lib/demo';
import { GitHubError } from '../lib/github';
import { fetchOpenPrs, type PullRequest } from '../lib/prs';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

const OPEN_PRS_STALE_AFTER_MS = 2 * 60_000;

export type PrsState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; prs: PullRequest[]; savedAt: number | null; offline: boolean; stale: boolean }
  | { status: 'unavailable'; failure: 'invalid-token' | 'failed'; savedAt: number | null };

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
    (signal) => fetchOpenPrs(token ?? '', login ?? '', signal, 'background'),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-prs` : null,
      demo,
      staleAfterMs: OPEN_PRS_STALE_AFTER_MS,
    },
  );

  return useMemo(() => {
    if (remote.status === 'ready') {
      return {
        status: 'ready',
        prs: remote.data,
        savedAt: remote.savedAt,
        offline: remote.offline,
        stale: remote.failure != null || remote.stale === true,
      };
    }
    if (remote.status === 'error') {
      return {
        status: 'unavailable',
        failure:
          remote.error instanceof GitHubError && remote.error.kind === 'invalid-token'
            ? 'invalid-token'
            : 'failed',
        savedAt: null,
      };
    }
    return { status: remote.status };
  }, [remote]);
}
