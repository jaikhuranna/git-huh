import { useMemo } from 'react';

import { fetchTasks, type Tasks } from '../lib/assigned';
import { demoTasks } from '../lib/demo';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote, type Remote } from './useRemote';

/** Assigned work and filed issues, fetched while the inbox is open. */
export function useTasks(
  token: string | null,
  login: string | null,
  active: boolean,
): Remote<Tasks> & { reload: () => void } {
  const demo = useMemo(() => (token === DEMO_TOKEN ? demoTasks() : undefined), [token]);
  return useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchTasks(token ?? '', login ?? '', signal),
    { cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-tasks` : null, demo },
  );
}
