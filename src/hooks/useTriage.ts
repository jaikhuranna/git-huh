import { useCallback, useEffect, useState } from 'react';

import type { SocialEvent } from '../lib/social';
import { loadMarks, nextMorning, saveMarks, type Marks } from '../lib/triage';

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
      if (!cancelled) setLoaded({ login, marks });
    });
    return () => {
      cancelled = true;
    };
  }, [login]);

  const marks = loaded && loaded.login === login ? loaded.marks : {};

  const update = useCallback(
    (change: (current: Marks) => Marks) => {
      if (!login) return;
      setLoaded((current) => {
        const base = current && current.login === login ? current.marks : {};
        const next = change(base);
        saveMarks(login, next).catch(() => {});
        return { login, marks: next };
      });
    },
    [login],
  );

  return {
    marks,
    done: (event) =>
      update((current) => ({ ...current, [event.id]: { at: event.at, done: true } })),
    snooze: (event) =>
      update((current) => ({
        ...current,
        [event.id]: { at: event.at, snoozeUntil: nextMorning() },
      })),
    reopen: (event) =>
      update((current) => {
        const next = { ...current };
        delete next[event.id];
        return next;
      }),
  };
}
