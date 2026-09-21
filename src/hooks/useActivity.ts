import { useEffect, useState } from 'react';

import {
  EMPTY_ACTIVITY,
  fetchActivity,
  type Activity,
} from '../lib/activity';
import { demoActivity } from '../lib/demo';
import { DEMO_TOKEN } from '../lib/token';

export type ActivityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; activity: Activity };

interface Settled {
  key: string;
  activity: Activity;
}

/**
 * Commit timestamps and pull request detail. Only fetched once a screen that
 * needs them is reachable, and a failure resolves to the empty activity
 * rather than an error state — these screens are additive, so the rest of
 * the app must not care when GitHub declines.
 */
export function useActivity(
  token: string | null,
  login: string | null,
  active: boolean,
): ActivityState {
  const [settled, setSettled] = useState<Settled | null>(null);
  const key = `${token ?? ''}|${login ?? ''}`;

  useEffect(() => {
    if (!active || !token || !login || token === DEMO_TOKEN) return;

    const controller = new AbortController();
    fetchActivity(token, login, controller.signal)
      .then((activity) => setSettled({ key, activity }))
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSettled({ key, activity: EMPTY_ACTIVITY });
      });

    return () => controller.abort();
  }, [active, key, token, login]);

  if (!token || !login) return { status: 'idle' };
  if (token === DEMO_TOKEN) return { status: 'ready', activity: demoActivity() };
  if (settled?.key !== key) return { status: 'loading' };
  return { status: 'ready', activity: settled.activity };
}
