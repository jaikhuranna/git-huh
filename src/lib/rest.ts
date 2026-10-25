import type { z } from 'zod';

import { GitHubError, outcomeUnknown, parseAs } from './github';
import { conditionalHeaders, readCachedResponse, writeCachedResponse } from './httpCache';
import { maySend, noteRateLimit, type RequestPriority } from './rateLimit';
import {
  composeDeadline,
  deadlineError,
  DEFAULT_READ_TIMEOUT_MS,
  DEFAULT_WRITE_TIMEOUT_MS,
  readBounded,
  type ResponseBudget,
} from './requestBudget';

const API = 'https://api.github.com';

const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface RestOptions<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accept?: string;
  schema?: z.ZodType<T>;
  signal?: AbortSignal;
  /** Replaces the default deadline. A write's default is longer than a read's. */
  timeoutMs?: number;
  /** Background calls wait out a known rate-limit window. */
  priority?: RequestPriority;
  /**
   * Byte and line cap for this resource. Crossing it throws a bounded error
   * carrying the kept text, rather than pretending the short string is whole.
   */
  budget?: ResponseBudget;
  /**
   * Stable name for this attempt. A retry of an unknown outcome must pass the
   * same id, so a second press is a reconcile rather than a second write.
   */
  operationId?: string;
  /**
   * When false, skip conditional revalidation. Writes never send validators.
   * GraphQL does not come through here.
   */
  revalidate?: boolean;
}

/**
 * GitHub's REST half, with the same error rules as the GraphQL half.
 *
 * Everything that *changes* something goes through here or through a
 * GraphQL mutation, and the difference between the failures matters more for
 * a write than for a read. A dropped connection before the request left is
 * "nothing was sent". A dropped reply after it left is not: the comment, the
 * pull request or the workflow run may already exist, and saying otherwise
 * is how a person posts it twice.
 */
export async function rest<T = unknown>(
  token: string,
  /** Relative to the API root, so the token is only ever sent to GitHub. */
  path: string,
  options: RestOptions<T> = {},
): Promise<T> {
  const method = options.method ?? 'GET';
  const accept = options.accept ?? 'application/vnd.github+json';
  const write = WRITE.has(method);
  const priority = options.priority ?? 'interactive';

  if (!maySend(token, priority)) {
    throw new GitHubError(
      'api',
      'GitHub is rate-limiting this account. Waiting for the window to pass.',
      'rate-limited',
    );
  }

  // A write is not something we already stored. Conditional headers belong
  // only to a GET of a representation we have seen for this account.
  const cached =
    !write && options.revalidate !== false
      ? await readCachedResponse<T>(token, path, accept)
      : null;

  const deadline = composeDeadline(
    options.signal,
    options.timeoutMs ?? (write ? DEFAULT_WRITE_TIMEOUT_MS : DEFAULT_READ_TIMEOUT_MS),
  );

  // Once fetch is entered, a write may already be on the wire. A rejection
  // before that entry — a bad URL, a missing fetch — never left. The two are
  // not the same sentence.
  let response: Response;
  const open = write && options.signal?.aborted !== true;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...conditionalHeaders(cached),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: deadline.signal,
    }).catch((error: unknown) => {
      throw transportFailure(error, deadline.timedOut(), open);
    });

    // 304 is not an error. The body is empty on purpose; the object we stored
    // last time is the answer, and it is not parsed or written again.
    if (response.status === 304 && cached) return cached.body;

    if (!response.ok) {
      throw await failure(response, token, deadline.signal).catch((error: unknown) => {
        throw transportFailure(error, deadline.timedOut(), open);
      });
    }

    if (response.status === 204) return undefined as T;

    const bounded = await readBounded(response, options.budget, deadline.signal).catch(
      (error: unknown) => {
        throw transportFailure(error, deadline.timedOut(), open);
      },
    );
    if (bounded.truncated) {
      throw new GitHubError(
        'api',
        'GitHub sent more than this screen holds. The rest was left unread.',
        'bounded',
      );
    }

    const type = response.headers.get('content-type') ?? '';
    if (!type.includes('json')) return bounded.text as T;

    let data: unknown;
    try {
      data = JSON.parse(bounded.text);
    } catch {
      throw new GitHubError('api', 'GitHub sent back something this app does not understand.');
    }
    const parsed = options.schema ? parseAs(options.schema, data) : (data as T);
    if (!write) {
      writeCachedResponse(token, path, accept, {
        body: parsed,
        etag: response.headers.get('etag'),
        lastModified: response.headers.get('last-modified'),
      });
    }
    return parsed;
  } finally {
    deadline.dispose();
  }
}

/**
 * Plain text from an endpoint that answers with a redirect to a file.
 *
 * `budget` is how a log stays bounded: past the cap the call throws with
 * outcome `bounded` instead of returning a quietly shortened file.
 */
export async function restText(
  token: string,
  path: string,
  signal?: AbortSignal,
  options: Omit<RestOptions<string>, 'method' | 'body' | 'schema'> = {},
): Promise<string> {
  return rest<string>(token, path, {
    ...options,
    accept: options.accept ?? 'text/plain',
    signal: signal ?? options.signal,
  });
}

/**
 * A fetch rejection, named for what we actually know.
 *
 * `dispatched` is true once `fetch` has been entered. A later rejection on a
 * write — a reset, a deadline — cannot prove the server did not apply it.
 * A rejection before that, or any rejection of a read, never changed anything.
 */
function transportFailure(error: unknown, timedOut: boolean, writeDispatched: boolean): GitHubError {
  if (timedOut) {
    if (writeDispatched) {
      return new GitHubError(
        'network',
        'GitHub did not answer in time. The change may already have landed.',
        'timeout',
      );
    }
    return deadlineError();
  }
  if (error instanceof Error && error.name === 'AbortError') throw error;
  if (writeDispatched) {
    return new GitHubError(
      'network',
      'The reply was lost. Check before trying again.',
      'unknown',
    );
  }
  return new GitHubError('network', 'Could not reach GitHub.', 'unsent');
}

async function failure(
  response: Response,
  token: string,
  signal: AbortSignal,
): Promise<GitHubError> {
  let message = `GitHub responded with ${response.status}.`;
  try {
    const bounded = await readBounded(response, { maxBytes: 64 * 1024 }, signal);
    const body = JSON.parse(bounded.text) as {
      message?: string;
      errors?: { message?: string; code?: string; field?: string }[];
    };
    const detail = body.errors?.find((error) => error.message)?.message;
    if (body.message) message = detail ? `${body.message}: ${detail}` : body.message;
  } catch (error) {
    if (signal.aborted) throw error;
    // Not every error body is JSON; the status line is enough.
  }

  if (response.status === 401) return new GitHubError('invalid-token', message);
  if (response.status === 403 || response.status === 429) {
    return classifyDenied(response, token, message);
  }
  if (response.status === 404) return new GitHubError('missing', message);
  return new GitHubError('api', message);
}

/**
 * A 403 is either "this token may not" or "slow down". GitHub uses 403 for
 * both, and 429 for the second. The headers, not the status alone, say which.
 * Search used to treat every forbidden as a rate limit, which hides a real
 * permission problem behind "try again in a minute".
 */
function classifyDenied(response: Response, token: string, message: string): GitHubError {
  const remaining = response.headers.get('x-ratelimit-remaining');
  const retryAfter = response.headers.get('retry-after');
  const reset = response.headers.get('x-ratelimit-reset');
  const limited =
    response.status === 429 ||
    remaining === '0' ||
    retryAfter != null ||
    /rate limit/i.test(message);

  if (!limited) return new GitHubError('forbidden', message);

  const retrySeconds = Number(retryAfter);
  const resetSeconds = Number(reset);
  const until = Number.isFinite(retrySeconds) && retrySeconds > 0
    ? Date.now() + retrySeconds * 1000
    : Number.isFinite(resetSeconds) && resetSeconds > 0
      ? resetSeconds * 1000
      : Date.now() + 60_000;
  noteRateLimit(token, until);
  return new GitHubError('api', message, 'rate-limited');
}

/**
 * What to tell a person when a write did not happen. Lower case, no
 * apology, and always the one thing that would change the outcome.
 *
 * An unknown outcome does not say the action was not sent. That sentence is
 * only true when the request never left.
 */
export function explain(error: unknown, doing = 'that'): string {
  if (outcomeUnknown(error)) {
    return `the reply was lost · check before trying ${doing} again`;
  }
  if (error instanceof GitHubError) {
    switch (error.kind) {
      case 'network':
        if (error.outcome === 'unsent') return `no connection · ${doing} was not sent`;
        return `the reply was lost · check before trying ${doing} again`;
      case 'invalid-token':
        return 'github rejected this token · sign in again';
      case 'forbidden':
        return `github did not allow ${doing} · ${error.message.replace(/\.$/, '')}`;
      case 'missing':
        return 'github could not find it · or this token cannot see it';
      case 'api':
        if (error.outcome === 'rate-limited') {
          return 'github is rate-limiting this account · wait before trying again';
        }
        if (error.outcome === 'bounded') {
          return 'the answer was too large to show whole';
        }
        return error.message.toLowerCase().replace(/\.$/, '');
    }
  }
  // Words already meant for the screen — what the host said went wrong.
  if (error instanceof Error && (error as { spoken?: boolean }).spoken) return error.message;
  return `${doing} did not go through`;
}

export { outcomeUnknown };
