import { GitHubError } from './github';

/**
 * Ask again while GitHub says "not there yet".
 *
 * Something made a second ago — a discussion, a release, a pull request —
 * can read as missing for a few seconds, because GitHub's reads lag its
 * writes. A page opened straight after making the thing would otherwise say
 * "could not find it" about the thing the person just made. Anything other
 * than a miss is passed straight through, and an abort stops the waiting.
 *
 * The wait is only worth it when we know the thing was just created. An
 * ordinary open of something that is simply not there should fail on the
 * first miss, not sit through four pauses and a bundle of extra reads.
 */
export async function eventually<T>(
  read: () => Promise<T | null>,
  {
    tries = 5,
    wait = 1500,
    signal,
    sleep = abortableSleep,
    /**
     * Set by the screen that just created the object. Without it, a miss is
     * a miss: one read, no pause, no repeat of the surrounding bundle.
     */
    recent = false,
  }: {
    tries?: number;
    wait?: number;
    signal?: AbortSignal;
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    recent?: boolean;
  } = {},
): Promise<T | null> {
  const attempts = recent ? tries : 1;
  for (let attempt = 1; ; attempt++) {
    if (signal?.aborted) return null;
    try {
      const found = await read();
      if (found != null || attempt >= attempts) return found;
    } catch (error) {
      const miss = error instanceof GitHubError && error.kind === 'missing';
      if (!miss || attempt >= attempts) throw error;
    }
    if (signal?.aborted) return null;
    await sleep(wait, signal);
  }
}

/** A pause that ends early when the screen goes away, instead of holding the try. */
export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', finish);
      resolve();
    }, ms);
    const finish = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener('abort', finish, { once: true });
  });
}
