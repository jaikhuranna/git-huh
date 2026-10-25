import { useCallback, useEffect, useMemo, useState } from 'react';

import type { SocialEvent } from '../lib/social';
import { loadMarks, nextMorning, saveMarks, type Marks } from '../lib/triage';

const NO_MARKS: Marks = {};

interface Loaded {
  login: string;
  marks: Marks;
}

export interface Triage {
  marks: Marks;
  done: (event: SocialEvent) => void;
  snooze: (event: SocialEvent) => void;
  reopen: (event: SocialEvent) => void;
}

/** The inbox's done and snoozed marks for one account, saved as they change. */
export function useTriage(login: string | null): Triage {
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!login) return;
    let cancelled = false;
    loadMarks(login).then((marks) => {
      if (cancelled) return;
      // A swipe can land before this read returns. Those marks were made
      // against the live feed and must win; disk fills only the rest.
      setLoaded((current) => {
        if (current && current.login === login) {
          return { login, marks: { ...marks, ...current.marks } };
        }
        return { login, marks };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [login]);

  const marks = loaded && loaded.login === login ? loaded.marks : NO_MARKS;

  const update = useCallback(
    (change: (current: Marks) => Marks) => {
      if (!login) return;
      let next: Marks | null = null;
      setLoaded((current) => {
        const base = current && current.login === login ? current.marks : {};
        next = change(base);
        return { login, marks: next };
      });
      // Outside the updater: React may call it twice, and a write is not a
      // state transition.
      if (next) saveMarks(login, next).catch(() => {});
    },
    [login],
  );

  return useMemo(
    () => ({
      marks,
      done: (event: SocialEvent) =>
        update((current) => ({ ...current, [event.id]: { at: event.at, done: true } })),
      snooze: (event: SocialEvent) =>
        update((current) => ({
          ...current,
          [event.id]: { at: event.at, snoozeUntil: nextMorning() },
        })),
      reopen: (event: SocialEvent) =>
        update((current) => {
          const next = { ...current };
          delete next[event.id];
          return next;
        }),
    }),
    [marks, update],
  );
}
