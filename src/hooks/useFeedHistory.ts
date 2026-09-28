import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { fetchSocialPage, type SocialEvent } from '../lib/social';
import { DEMO_TOKEN } from '../lib/token';

export interface FeedHistory {
  events: SocialEvent[];
  /** A page is on its way. */
  loading: boolean;
  /** Nothing older exists — or the demo, which has no history to walk. */
  done: boolean;
  /** The last page failed; `more` tries it again. */
  failed: boolean;
  /** Ask for the next page. Safe to call as often as a scroll event fires. */
  more: () => void;
}

interface Pages {
  key: string;
  events: SocialEvent[];
  cursor: string | null;
  done: boolean;
}

/**
 * The `you` page's feed, walked backwards one page of pull requests at a
 * time as it is scrolled. The first page is asked for as soon as the page is
 * open, so the feed runs past the inbox's short list without a tap.
 *
 * Kept in memory only: it is a scroll back through history, and the inbox's
 * own feed is what is saved for offline.
 */
export function useFeedHistory(token: string | null, login: string | null, active: boolean): FeedHistory {
  const key = token && login && token !== DEMO_TOKEN ? `${token}|${login}` : null;
  const [pages, setPages] = useState<Pages | null>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const busy = useRef(false);

  // A different account starts over; derived rather than reset in an effect.
  const current = pages && pages.key === key ? pages : null;
  const done = key === null || (current?.done ?? false);

  const more = useCallback(() => {
    if (!key || !token || !login || busy.current || done) return;
    busy.current = true;
    const from = current?.cursor ?? null;
    const stamp = `${key}|${from ?? ''}`;
    setInFlight(stamp);
    fetchSocialPage(token, login, from)
      .then((page) => {
        setFailedAt(null);
        setPages((before) => {
          const base = before && before.key === key ? before.events : [];
          const seen = new Set(base.map((event) => event.id));
          return {
            key,
            events: [...base, ...page.events.filter((event) => !seen.has(event.id))],
            cursor: page.cursor,
            done: page.cursor === null,
          };
        });
      })
      .catch(() => setFailedAt(stamp))
      .finally(() => {
        busy.current = false;
        setInFlight(null);
      });
  }, [current?.cursor, done, key, login, token]);

  // The first page, as soon as the page is being looked at.
  const started = current !== null || inFlight !== null || failedAt !== null;
  useEffect(() => {
    if (active && !started) more();
  }, [active, more, started]);

  return useMemo(
    () => ({
      events: current?.events ?? [],
      loading: inFlight !== null,
      done,
      failed: failedAt !== null,
      more,
    }),
    [current?.events, done, failedAt, inFlight, more],
  );
}
