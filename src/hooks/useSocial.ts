import { useEffect, useState } from 'react';

import { demoSocial } from '../lib/demo';
import { fetchSocial, type SocialEvent } from '../lib/social';
import { DEMO_TOKEN } from '../lib/token';

export type SocialState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; events: SocialEvent[] }
  | { status: 'error' };

interface Settled {
  key: string;
  outcome: { status: 'ready'; events: SocialEvent[] } | { status: 'error' };
}

/**
 * The home screen's activity feed. It fails into an error row rather than an
 * empty one: "nobody has said anything" and "GitHub would not tell us" are
 * different facts and the screen says which one it is.
 */
export function useSocial(
  token: string | null,
  login: string | null,
  active: boolean,
): SocialState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${token ?? ''}|${login ?? ''}`;

  useEffect(() => {
    if (!active || !token || !login || token === DEMO_TOKEN) return;

    const controller = new AbortController();
    fetchSocial(token, login, controller.signal)
      .then((events) => setSettled({ key, outcome: { status: 'ready', events } }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSettled({ key, outcome: { status: 'error' } });
      });

    return () => controller.abort();
  }, [active, key, token, login]);

  if (!token || !login) return { status: 'idle' };
  if (token === DEMO_TOKEN) return { status: 'ready', events: demoSocial() };
  if (settled?.key !== key) return { status: 'loading' };
  return settled.outcome;
}
