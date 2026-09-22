import { useCallback, useEffect, useRef, useState } from 'react';

import { GitHubError } from '../lib/github';
import { readSaved, writeSaved } from '../lib/store';

export type Remote<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | {
      status: 'ready';
      data: T;
      /** When this answer was saved, if it came off the disk. */
      savedAt: number | null;
      /** True when the saved answer is on screen because GitHub could not be reached. */
      offline: boolean;
      /** True while a newer answer is on its way. */
      refreshing: boolean;
    }
  | { status: 'error'; error: unknown };

interface Round<T> {
  key: string;
  nonce: number;
  value: T;
  at: number;
}

interface Failure {
  key: string;
  nonce: number;
  error: unknown;
}

function isNetwork(error: unknown): boolean {
  return error instanceof GitHubError && error.kind === 'network';
}

/**
 * Cache-first loading, the one pattern behind every request in the app.
 *
 * The saved answer is on screen the moment it is read off the disk; the
 * fresh one replaces it when it lands; and when GitHub cannot be reached the
 * saved one stays, labelled with its age, instead of the screen turning into
 * an error. A cold start with a warm cache therefore draws real data before
 * the first request has left the phone — which is most of what "fast" means.
 *
 * Status is derived during render from results stamped with the key and the
 * round that produced them; nothing sets state synchronously in an effect.
 */
export function useRemote<T>(
  key: string | null,
  load: (signal: AbortSignal) => Promise<T>,
  {
    cacheKey = null,
    demo,
  }: {
    /** Where the answer is saved on the device. null = never saved. */
    cacheKey?: string | null;
    /** A ready answer for the demo account, computed by the caller. */
    demo?: T;
  } = {},
): Remote<T> & { reload: () => void } {
  const [nonce, setNonce] = useState(0);
  const [cached, setCached] = useState<Round<T> | null>(null);
  const [fresh, setFresh] = useState<Round<T> | null>(null);
  const [failed, setFailed] = useState<Failure | null>(null);

  // The loader is usually an inline closure; it is read through a ref so a
  // new closure every render does not mean a new request every render.
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });

  const skip = key == null || demo !== undefined;

  useEffect(() => {
    if (skip || key == null) return;
    let cancelled = false;
    const controller = new AbortController();

    if (cacheKey) {
      readSaved<T>(cacheKey).then((saved) => {
        if (cancelled || !saved) return;
        setCached({ key, nonce, value: saved.value, at: saved.at });
      });
    }

    loader
      .current(controller.signal)
      .then((value) => {
        if (cancelled) return;
        setFresh({ key, nonce, value, at: Date.now() });
        if (cacheKey) writeSaved(cacheKey, value).catch(() => {});
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof Error && error.name === 'AbortError') return;
        setFailed({ key, nonce, error });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [cacheKey, key, nonce, skip]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  if (key == null) return { status: 'idle', reload };
  if (demo !== undefined) {
    return {
      status: 'ready',
      data: demo,
      savedAt: null,
      offline: false,
      refreshing: false,
      reload,
    };
  }

  const failedNow = failed?.key === key && failed.nonce === nonce ? failed : null;
  const freshNow = fresh?.key === key ? fresh : null;
  const cachedNow = cached?.key === key ? cached : null;

  // A revoked token must fail loudly even with a saved answer to hide behind;
  // anything else — no signal, a rate limit — keeps the saved answer up.
  if (
    failedNow &&
    failedNow.error instanceof GitHubError &&
    failedNow.error.kind === 'invalid-token'
  ) {
    return { status: 'error', error: failedNow.error, reload };
  }

  if (freshNow) {
    const current = freshNow.nonce === nonce;
    return {
      status: 'ready',
      data: freshNow.value,
      savedAt: current ? null : freshNow.at,
      offline: !current && failedNow != null && isNetwork(failedNow.error),
      refreshing: !current && failedNow == null,
      reload,
    };
  }

  if (cachedNow) {
    return {
      status: 'ready',
      data: cachedNow.value,
      savedAt: cachedNow.at,
      offline: failedNow != null && isNetwork(failedNow.error),
      refreshing: failedNow == null,
      reload,
    };
  }

  if (failedNow) return { status: 'error', error: failedNow.error, reload };
  return { status: 'loading', reload };
}
