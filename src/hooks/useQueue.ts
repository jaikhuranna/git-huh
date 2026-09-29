import { useMemo } from 'react';

import { demoQueue } from '../lib/demo';
import { fetchQueue, type Queue } from '../lib/queue';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote, type Remote } from './useRemote';

/** The review queue, fetched while the inbox is open and saved like everything else. */
export function useQueue(
  token: string | null,
  login: string | null,
  active: boolean,
): Remote<Queue> & { reload: () => void } {
  const demo = useMemo(() => (token === DEMO_TOKEN ? demoQueue() : undefined), [token]);
  return useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchQueue(token ?? '', login ?? '', signal),
    { cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-queue` : null, demo },
  );
}
