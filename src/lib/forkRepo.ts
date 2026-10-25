/**
 * Creating a fork, then waiting until GitHub will answer for it.
 *
 * The forks endpoint returns before the new repository can be read. A missing
 * default-branch ref is that wait, not a failure. Proposal writes and the
 * plain "fork this repo" button share this wait so neither invents a second.
 */

import { z } from 'zod';

import { GitHubError } from './github';
import { encodePath } from './encodePath';
import { rest } from './rest';

const forkSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  default_branch: z.string(),
});

export interface Fork {
  full_name: string;
  owner: { login: string };
  default_branch: string;
}

/** Fork, then wait until the default branch can be read. It answers before it has. */
export async function forkOf(
  token: string,
  repo: string,
  signal?: AbortSignal,
  operationId?: string,
): Promise<Fork> {
  const fork = await rest(token, `/repos/${repo}/forks`, {
    method: 'POST',
    body: { default_branch_only: true },
    schema: forkSchema,
    signal,
    operationId,
  });
  for (let attempt = 0; attempt < 10; attempt++) {
    throwIfAborted(signal);
    try {
      await rest(token, `/repos/${fork.full_name}/git/ref/heads/${encodePath(fork.default_branch)}`, {
        signal,
      });
      return fork;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error;
      if (!(error instanceof GitHubError) || error.kind !== 'missing') throw error;
      await sleep(1500, signal);
    }
  }
  throw new GitHubError('api', 'The fork is still being made. Try again in a minute.');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('aborted');
  error.name = 'AbortError';
  throw error;
}

/** A wait that ends early when the caller cancels, without undoing the fork. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, ms);
    if (signal?.aborted) abort();
    else signal?.addEventListener('abort', abort, { once: true });
  });
}
