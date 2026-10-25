import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

import { executeMutation, executeQuery, GitHubError } from './github';
import { rest } from './rest';

async function settlesBeforeGuard<T>(promise: Promise<T>): Promise<T | 'still-pending'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<'still-pending'>((resolve) => {
        timer = setTimeout(() => resolve('still-pending'), 150);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function stalledResponse(onCancel: () => void): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      cancel: onCancel,
    }),
    { headers: { 'content-type': 'application/json' } },
  );
}

test('REST deadline includes a stalled body and cancels its reader', async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async () => stalledResponse(() => { cancelled = true; });
  try {
    const result = await settlesBeforeGuard(
      rest('rest-stalled-body', '/repos/o/r', { timeoutMs: 15, revalidate: false }).catch(
        (error: unknown) => error,
      ),
    );
    assert.ok(result instanceof GitHubError);
    assert.equal(result.outcome, 'timeout');
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('GraphQL deadline includes a stalled body and cancels its reader', async () => {
  const original = globalThis.fetch;
  let cancelled = false;
  globalThis.fetch = async () => stalledResponse(() => { cancelled = true; });
  try {
    const result = await settlesBeforeGuard(
      executeQuery('graphql-stalled-body', 'query { viewer { login } }', z.unknown(), {
        timeoutMs: 15,
      }).catch((error: unknown) => error),
    );
    assert.ok(result instanceof GitHubError);
    assert.equal(result.outcome, 'timeout');
    assert.equal(cancelled, true);
  } finally {
    globalThis.fetch = original;
  }
});

test('caller cancellation during a body read stays an abort and cancels the reader', async () => {
  const original = globalThis.fetch;
  const caller = new AbortController();
  let cancelled = false;
  globalThis.fetch = async () => stalledResponse(() => { cancelled = true; });
  const timer = setTimeout(() => caller.abort(), 10);
  try {
    const result = await settlesBeforeGuard(
      rest('rest-cancelled-body', '/repos/o/r', {
        signal: caller.signal,
        timeoutMs: 100,
        revalidate: false,
      }).catch((error: unknown) => error),
    );
    assert.ok(result instanceof Error);
    assert.equal(result.name, 'AbortError');
    assert.equal(cancelled, true);
  } finally {
    clearTimeout(timer);
    globalThis.fetch = original;
  }
});

test('a mutation body timeout retains its uncertain write outcome', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => stalledResponse(() => {});
  try {
    const result = await settlesBeforeGuard(
      executeMutation('mutation-stalled-body', 'mutation { change }', z.unknown(), {}, {
        timeoutMs: 15,
      }).catch((error: unknown) => error),
    );
    assert.ok(result instanceof GitHubError);
    assert.equal(result.kind, 'network');
    assert.equal(result.outcome, 'timeout');
  } finally {
    globalThis.fetch = original;
  }
});

test('the read deadline also settles a request stalled before headers', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      reject(error);
    }, { once: true });
  });
  try {
    const result = await settlesBeforeGuard(
      rest('rest-stalled-headers', '/repos/o/r', { timeoutMs: 15, revalidate: false }).catch(
        (error: unknown) => error,
      ),
    );
    assert.ok(result instanceof GitHubError);
    assert.equal(result.outcome, 'timeout');
  } finally {
    globalThis.fetch = original;
  }
});

test('an empty successful REST response completes without reading a body', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 204 });
  try {
    const result = await rest('rest-no-content', '/repos/o/r', { revalidate: false });
    assert.equal(result, undefined);
  } finally {
    globalThis.fetch = original;
  }
});
