import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

import { executeQuery, GitHubError } from './github';
import { clearCooldown, cooldownRemaining, maySend, noteRateLimit } from './rateLimit';
import { rest } from './rest';

const token = 'rate-limit-token';

function denied(status: number, headers: Record<string, string>, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

test('a rate-limit 403 is not the same failure as a permission 403', async () => {
  clearCooldown(token);
  const original = globalThis.fetch;
  const calls: RequestInit[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push(init ?? {});
    if (calls.length === 1) {
      return denied(
        403,
        { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2000000000' },
        'API rate limit exceeded',
      );
    }
    return denied(403, {}, 'Resource not accessible by integration');
  };
  try {
    await assert.rejects(rest(token, '/rate-limited'), (error: unknown) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.kind, 'api');
      assert.equal(error.outcome, 'rate-limited');
      return true;
    });
    await assert.rejects(rest(token, '/forbidden', { priority: 'interactive' }), (error: unknown) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.kind, 'forbidden');
      assert.equal(error.outcome, 'rejected');
      return true;
    });
  } finally {
    globalThis.fetch = original;
    clearCooldown(token);
  }
});

test('a cooldown refuses background work and still allows an interactive read', () => {
  clearCooldown(token);
  const until = 5_000_000;
  noteRateLimit(token, until);
  assert.equal(maySend(token, 'background', until - 1), false);
  assert.equal(maySend(token, 'interactive', until - 1), true);
  assert.ok(cooldownRemaining(token, until - 1) > 0);
  clearCooldown(token);
});

test('a cooldown expires, so background work may leave again', () => {
  clearCooldown(token);
  const until = 5_000_000;
  noteRateLimit(token, until);
  assert.equal(maySend(token, 'background', until), true);
  assert.equal(cooldownRemaining(token, until), 0);
  clearCooldown(token);
});

test('an interactive read during a cooldown still reaches the network', async () => {
  clearCooldown(token);
  noteRateLimit(token, Date.now() + 60_000);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const body = await rest(token, '/interactive', { priority: 'interactive', revalidate: false });
    assert.deepEqual(body, { ok: true });
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    clearCooldown(token);
  }
});

test('a background request during a cooldown does not reach the network', async () => {
  clearCooldown(token);
  noteRateLimit(token, Date.now() + 60_000);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await assert.rejects(rest(token, '/background', { priority: 'background', revalidate: false }), (error: unknown) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.outcome, 'rate-limited');
      return true;
    });
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = original;
    clearCooldown(token);
  }
});

test('a background GraphQL read waits out a cooldown and leaves after it expires', async () => {
  clearCooldown(token);
  noteRateLimit(token, Date.now() + 60_000);
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({ data: { viewer: { login: 'ada' } } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  const schema = z.object({ viewer: z.object({ login: z.string() }) });
  try {
    await assert.rejects(
      executeQuery(token, 'query { viewer { login } }', schema, { priority: 'background' }),
      (error: unknown) => {
        assert.ok(error instanceof GitHubError);
        assert.equal(error.outcome, 'rate-limited');
        return true;
      },
    );
    assert.equal(calls, 0);
    clearCooldown(token);
    noteRateLimit(token, Date.now() - 1);
    const body = await executeQuery(token, 'query { viewer { login } }', schema, {
      priority: 'background',
    });
    assert.equal(body.viewer.login, 'ada');
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = original;
    clearCooldown(token);
  }
});
