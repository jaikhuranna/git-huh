import { useMemo } from 'react';

import { demoPeople } from '../lib/demo';
import { fetchPeople, type People } from '../lib/people';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote, type Remote } from './useRemote';

const PEOPLE_STALE_AFTER_MS = 15 * 60_000;

/** A year of reviews, both ways — fetched once `year` is opened. */
export function usePeople(
  token: string | null,
  login: string | null,
  active: boolean,
): Remote<People> & { reload: () => void } {
  const demo = useMemo(() => (token === DEMO_TOKEN ? demoPeople() : undefined), [token]);
  return useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchPeople(token ?? '', login ?? '', signal, new Date(), 'background'),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-people` : null,
      demo,
      staleAfterMs: PEOPLE_STALE_AFTER_MS,
    },
  );
}
