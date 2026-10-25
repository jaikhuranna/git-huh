/**
 * How long a request may sit, and how much of an answer is worth keeping.
 *
 * A page that is still "loading" after a minute is not loading; GitHub never
 * answered. The deadline is the app's, composed with whatever cancellation
 * the screen already passed, so a stalled read settles even when nobody
 * unmounts it. A body past its budget is not silently shortened into a
 * complete-looking answer — the caller gets a bounded fallback and is told
 * the rest was left behind.
 */

import { GitHubError } from './github';

/** Reads wait this long; writes a little longer, because they may have landed. */
export const DEFAULT_READ_TIMEOUT_MS = 20_000;
export const DEFAULT_WRITE_TIMEOUT_MS = 45_000;

export interface ResponseBudget {
  /** Stop reading once this many bytes have arrived. */
  maxBytes?: number;
  /** Keep only this many lines of a text body. */
  maxLines?: number;
}

export interface BudgetResult {
  text: string;
  /** True when the body was larger than the budget and the rest was dropped. */
  truncated: boolean;
}

/**
 * The caller's abort and a deadline, as one signal.
 *
 * `timedOut` is true only when the deadline fired and the caller did not.
 * A press on back is a cancellation; a budget is a timeout. They ask for
 * different words, and a timed-out write is not the same as one that never
 * left the device.
 */
export function composeDeadline(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; timedOut: () => boolean; dispose: () => void } {
  const controller = new AbortController();
  let fromDeadline = false;
  const timer = setTimeout(() => {
    fromDeadline = true;
    controller.abort();
  }, timeoutMs);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    timedOut: () => fromDeadline && !signal?.aborted,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

/** A rejection that arrived because the deadline fired, not because the person cancelled. */
export function deadlineError(): GitHubError {
  return new GitHubError(
    'network',
    'GitHub did not answer in time.',
    'timeout',
  );
}

/**
 * Read a body up to a byte budget, then a line budget.
 *
 * Crossing either bound sets `truncated` rather than returning a string that
 * looks finished. No budget means the whole body, which is what a small JSON
 * answer wants.
 */
export async function readBounded(
  response: Response,
  budget: ResponseBudget = {},
  signal?: AbortSignal,
): Promise<BudgetResult> {
  if (signal?.aborted) {
    void response.body?.cancel().catch(() => {});
    throw abortError();
  }
  const advertised = Number(response.headers.get('content-length'));
  if (
    budget.maxBytes != null &&
    Number.isFinite(advertised) &&
    advertised > budget.maxBytes
  ) {
    void response.body?.cancel().catch(() => {});
    return { text: '', truncated: true };
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const text = await waitForBody(response.text(), signal);
    return clipText(text, budget);
  }

  const decoder = new TextDecoder();
  let text = '';
  let bytes = 0;
  let lines = 0;
  let truncated = false;
  const cap = budget.maxBytes == null ? Number.POSITIVE_INFINITY : Math.max(0, budget.maxBytes);
  const lineCap = budget.maxLines == null ? Number.POSITIVE_INFINITY : Math.max(0, budget.maxLines);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  const append = (part: string) => {
    if (lineCap === Number.POSITIVE_INFINITY) {
      text += part;
      return true;
    }
    if (lineCap === 0) return false;
    for (let i = 0; i < part.length; i += 1) {
      if (part[i] !== '\n') continue;
      lines += 1;
      if (lines >= lineCap) {
        text += part.slice(0, i);
        return false;
      }
    }
    text += part;
    return true;
  };
  try {
    for (;;) {
      const { done, value } = await waitForBody(reader.read(), signal, cancel);
      if (done) break;
      bytes += value.byteLength;
      if (bytes > cap) {
        const keep = value.byteLength - (bytes - cap);
        if (keep > 0) append(decoder.decode(value.subarray(0, keep), { stream: true }));
        truncated = true;
        cancel();
        break;
      }
      if (!append(decoder.decode(value, { stream: true }))) {
        truncated = true;
        cancel();
        break;
      }
    }
    if (!truncated) truncated = !append(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  return { text, truncated };
}

function clipText(text: string, budget: ResponseBudget): BudgetResult {
  if (budget.maxBytes != null) {
    const encoded = new TextEncoder().encode(text);
    if (encoded.byteLength > budget.maxBytes) {
      text = new TextDecoder().decode(encoded.subarray(0, Math.max(0, budget.maxBytes)), {
        stream: true,
      });
      return finish(text, budget, true);
    }
  }
  return finish(text, budget, false);
}

function abortError(): Error {
  const error = new Error('The operation was aborted.');
  error.name = 'AbortError';
  return error;
}

async function waitForBody<T>(
  pending: Promise<T>,
  signal?: AbortSignal,
  cancel?: () => void,
): Promise<T> {
  if (!signal) return pending;
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cancel?.();
      reject(abortError());
    };
    pending.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) reject(abortError());
        else resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      },
    );
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
  });
}

function finish(text: string, budget: ResponseBudget, already: boolean): BudgetResult {
  if (budget.maxLines == null) return { text, truncated: already };
  const lines = text.split('\n');
  if (lines.length <= budget.maxLines) return { text, truncated: already };
  return { text: lines.slice(0, budget.maxLines).join('\n'), truncated: true };
}
