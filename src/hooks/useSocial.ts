import { useMemo } from 'react';

import { demoSocial } from '../lib/demo';
import { fetchSocial, type SocialEvent } from '../lib/social';
import { DEMO_TOKEN } from '../lib/token';
import { useRemote } from './useRemote';

export type SocialState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; events: SocialEvent[]; savedAt: number | null; offline: boolean }
  | { status: 'error' };

/**
 * The inbox. It fails into an error row rather than an empty one: "nobody
 * has said anything" and "GitHub would not tell us" are different facts and
 * the screen says which one it is. The last feed that loaded is kept, so the
 * inbox opens with what it had and a line saying how old that is.
 */
export function useSocial(
  token: string | null,
  login: string | null,
  active: boolean,
): SocialState & { reload: () => void } {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoSocial() : undefined),
    [token],
  );
  const remote = useRemote(
    active && token && login ? `${token}|${login}` : null,
    (signal) => fetchSocial(token ?? '', login ?? '', signal),
    {
      cacheKey: login && token !== DEMO_TOKEN ? `${login.toLowerCase()}-social` : null,
      demo,
    },
  );

  return useMemo(() => {
    if (remote.status === 'ready') {
      return {
        status: 'ready',
        events: remote.data,
        savedAt: remote.savedAt,
        offline: remote.offline,
        reload: remote.reload,
      };
    }
    if (remote.status === 'error') return { status: 'error', reload: remote.reload };
    return { status: remote.status, reload: remote.reload };
  }, [remote]);
}
