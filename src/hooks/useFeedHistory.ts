import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  EMPTY_HISTORY,
  historyEvents,
  retainHistory,
  type HistoryWindow,
} from '../lib/home';
import { fetchSocialPage, type SocialEvent } from '../lib/social';
import { DEMO_TOKEN } from '../lib/token';

export interface FeedHistory {
  events: SocialEvent[];
  /** A page is on its way for the current account and filter. */
  loading: boolean;
  /** Nothing older exists — or the demo, which has no history to walk. */
  done: boolean;
  /** The last page for this account and filter failed; `more` tries it again. */
  failed: boolean;
  /**
   * Ask for the next page. Safe to call as often as a scroll event fires.
   * `manual` is an explicit retry; automatic paging is ignored unless the
   * feed is being looked at and at least one kind is selected.
   */
  more: (manual?: boolean) => void;
}

interface AccountPages {
  key: string;
  /** Filter generation these pages were loaded under. */
  filter: string;
  window: HistoryWindow;
}

/**
 * The feed at the foot of `today`, walked backwards one page of pull requests at a
 * time as it is scrolled. The first page is asked for as soon as the page is
 * open and a kind is selected, so the feed runs past the inbox's short list
 * without a tap.
 *
 * Kept in memory only, and only the last few pages: it is a scroll back
 * through history, and the inbox's own feed is what is saved for offline.
 * A late answer from a previous account or filter is dropped.
 */
export function useFeedHistory(
  token: string | null,
  login: string | null,
  active: boolean,
  filterKey = '',
): FeedHistory {
  const key = token && login && token !== DEMO_TOKEN ? `${token}|${login}` : null;
  const [pages, setPages] = useState<AccountPages | null>(null);
  const [inFlight, setInFlight] = useState<string | null>(null);
  const [failedAt, setFailedAt] = useState<string | null>(null);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const current =
    pages && pages.key === key && pages.filter === filterKey ? pages : null;
  const cursor = current ? (current.window.pages.at(-1)?.next ?? null) : null;
  const done = key === null || (current != null && current.window.pages.length > 0 && cursor === null);
  const stamp = `${key ?? ''}|${filterKey}|${current ? (cursor ?? '') : ''}`;

  const load = useCallback(
    (from: string | null, requestStamp: string) => {
      if (!key || !token || !login) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const gen = ++generation.current;
      setInFlight(requestStamp);
      setFailedAt((before) => (before === requestStamp ? null : before));
      fetchSocialPage(token, login, from, controller.signal)
        .then((page) => {
          if (gen !== generation.current) return;
          setPages((before) => {
            const base =
              before && before.key === key && before.filter === filterKey
                ? before.window
                : EMPTY_HISTORY;
            return {
              key,
              filter: filterKey,
              window: retainHistory(base, {
                after: from,
                events: page.events,
                next: page.cursor,
              }),
            };
          });
          setInFlight(null);
        })
        .catch((error: unknown) => {
          if (gen !== generation.current) return;
          if (error instanceof Error && error.name === 'AbortError') {
            setInFlight(null);
            return;
          }
          setFailedAt(requestStamp);
          setInFlight(null);
        });
    },
    [filterKey, key, login, token],
  );

  const more = useCallback(
    (manual = false) => {
      if (!key || !token || !login) return;
      if (!manual && (!active || filterKey.length === 0)) return;
      if (inFlight === stamp || failedAt === stamp || done) return;
      const from = current?.window.pages.at(-1)?.next ?? null;
      load(from, stamp);
    },
    [active, current, done, failedAt, filterKey, inFlight, key, load, login, stamp, token],
  );

  const started = current !== null || inFlight === stamp || failedAt === stamp;
  // The first page starts when the feed is in view and a kind is selected.
  // State is updated from the request callback, not from the effect body.
  useEffect(() => {
    if (!(active && filterKey.length > 0 && key && token && login && !started)) return;
    // Deferred so the in-flight flag is not set inside the effect body. The
    // generation check still drops the answer if the account or filter moved.
    const handle = setTimeout(() => load(null, stamp), 0);
    return () => clearTimeout(handle);
  }, [active, filterKey, key, load, login, stamp, started, token]);

  useEffect(() => {
    return () => {
      generation.current += 1;
      abortRef.current?.abort();
    };
  }, [key, filterKey]);

  const events = useMemo(
    () => (current ? historyEvents(current.window) : []),
    [current],
  );

  return useMemo(
    () => ({
      events,
      loading: inFlight === stamp,
      done,
      failed: failedAt === stamp,
      more,
    }),
    [done, events, failedAt, inFlight, more, stamp],
  );
}
