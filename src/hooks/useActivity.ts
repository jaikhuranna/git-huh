import { useMemo } from 'react';

import { EMPTY_ACTIVITY, fetchActivity, type Activity } from '../lib/activity';
import { demoActivity } from '../lib/demo';
import { GitHubError } from '../lib/github';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

const ACTIVITY_STALE_AFTER_MS = 5 * 60_000;

export type ActivityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      activity: Activity;
      /** True when this sample is the last good one after a failed refresh. */
      stale: boolean;
      savedAt: number | null;
      offline: boolean;
    }
  | { status: 'unavailable'; failure: 'invalid-token' | 'aborted' | 'failed' };

/**
 * Commit timestamps and pull request summaries. Only fetched once a screen
 * that needs them is reachable. A failure is unavailable, not an empty
 * sample: an empty sample is a real answer that nothing matched. The last
 * sample stays on screen, marked stale, so hours and repos survive a blip.
 */
export function useActivity(
  token: string | null,
  login: string | null,
  active: boolean,
  viewerId?: string | null,
): ActivityState {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? withReady(demoActivity()) : undefined),
    [token],
  );
  const remote = useRemote(
    active && token && login ? `${token}|${login}|${viewerId ?? ''}` : null,
    (signal) => fetchActivity(token ?? '', login ?? '', signal, viewerId, 'background'),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-activity-v2` : null,
      demo,
      staleAfterMs: ACTIVITY_STALE_AFTER_MS,
    },
  );

  return useMemo(() => {
    if (remote.status === 'ready') {
      const activity = remote.data.availability ? remote.data : withReady(remote.data);
      const stale = remote.failure != null || activity.availability === 'stale' || remote.stale === true;
      return {
        status: 'ready',
        activity: stale ? { ...activity, availability: 'stale' } : activity,
        stale,
        savedAt: remote.savedAt,
        offline: remote.offline,
      };
    }
    if (remote.status === 'error') {
      const failure =
        remote.error instanceof GitHubError && remote.error.kind === 'invalid-token'
          ? 'invalid-token'
          : remote.error instanceof Error && remote.error.name === 'AbortError'
            ? 'aborted'
            : 'failed';
      return { status: 'unavailable', failure };
    }
    return { status: remote.status };
  }, [remote]);
}

function withReady(activity: Activity): Activity {
  return { ...activity, availability: activity.availability ?? 'ready', at: activity.at ?? null };
}

export { EMPTY_ACTIVITY };
