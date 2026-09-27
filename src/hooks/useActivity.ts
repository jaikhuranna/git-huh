import { useMemo } from 'react';

import { EMPTY_ACTIVITY, fetchActivity, type Activity } from '../lib/activity';
import { demoActivity } from '../lib/demo';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

export type ActivityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; activity: Activity };

/**
 * Commit timestamps and pull request detail. Only fetched once a screen that
 * needs them is reachable, and a failure resolves to the empty activity
 * rather than an error state — these screens are additive, so the rest of
 * the app must not care when GitHub declines. The last sample is kept on the
 * device, which also keeps `hours` and `repos` drawn when offline.
 */
export function useActivity(
  token: string | null,
  login: string | null,
  active: boolean,
): ActivityState {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoActivity() : undefined),
    [token],
  );
  const remote = useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchActivity(token ?? '', login ?? '', signal),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-activity` : null,
      demo,
    },
  );

  return useMemo(() => {
    if (remote.status === 'ready') return { status: 'ready', activity: remote.data };
    if (remote.status === 'error') return { status: 'ready', activity: EMPTY_ACTIVITY };
    return { status: remote.status };
  }, [remote]);
}
