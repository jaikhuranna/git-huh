import assert from 'node:assert/strict';
import { test } from 'node:test';

import { conditionalHeaders, readCachedResponse, installValidatorStore } from './httpCache';
import { rest } from './rest';

const token = 'http-cache-token';
const path = '/repos/o/r';
const accept = 'application/vnd.github+json';

test('a stored etag is sent back, and a 304 reuses the body without rewriting it', async () => {
  const writes: unknown[] = [];
  installValidatorStore({
    async read() {
      return writes.length === 0
        ? null
        : (writes[writes.length - 1] as { body: unknown; etag: string | null; lastModified: string | null });
    },
    write(_key, value) {
      writes.push(value);
    },
  });

  const original = globalThis.fetch;
  const sent: (HeadersInit | undefined)[] = [];
  let calls = 0;
  globalThis.fetch = async (_input, init) => {
    calls += 1;
    sent.push(init?.headers);
    if (calls === 1) {
      return new Response(JSON.stringify({ name: 'r' }), {
        status: 200,
        headers: { 'content-type': 'application/json', etag: '"abc"' },
      });
    }
    return new Response(null, { status: 304, headers: { etag: '"abc"' } });
  };

  try {
    const first = await rest<{ name: string }>(token, path, { accept, revalidate: true });
    assert.deepEqual(first, { name: 'r' });
    assert.equal(writes.length, 1);

    const cached = await readCachedResponse<{ name: string }>(token, path, accept);
    assert.equal(cached?.etag, '"abc"');
    assert.deepEqual(conditionalHeaders(cached), { 'If-None-Match': '"abc"' });

    const second = await rest<{ name: string }>(token, path, { accept, revalidate: true });
    assert.deepEqual(second, { name: 'r' });
    assert.equal(writes.length, 1);

    const headers = new Headers(sent[1]);
    assert.equal(headers.get('If-None-Match'), '"abc"');
  } finally {
    globalThis.fetch = original;
    installValidatorStore({
      async read() {
        return null;
      },
      write() {},
    });
  }
});
