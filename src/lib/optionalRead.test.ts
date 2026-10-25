import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GitHubError } from './github';
import { explainReadFailure, optionalRead, type OptionalRead, type ReadFailure } from './optionalRead';

/**
 * What a disk cache is allowed to keep. A failure is a failure record, never
 * a successful empty payload that a later read could treat as "nothing there".
 */
type CachedSlice<T> = { savedAt: number; value: OptionalRead<T> } | null;

function persist<T>(cache: { current: CachedSlice<T> }, result: OptionalRead<T>, now: number): void {
  if (result.error) {
    cache.current = { savedAt: now, value: { data: null, error: result.error } };
    return;
  }
  cache.current = { savedAt: now, value: result };
}

function isEmptySuccess<T>(value: OptionalRead<T> | undefined): boolean {
  return value != null && value.error == null && Array.isArray(value.data) && value.data.length === 0;
}

async function staleThen<T>(
  stale: T,
  failure: GitHubError,
): Promise<{ shown: OptionalRead<T>; cache: CachedSlice<T> }> {
  const cache: { current: CachedSlice<T> } = { current: null };
  const first = await optionalRead(Promise.resolve(stale));
  persist(cache, first, 1);
  let second: OptionalRead<T>;
  try {
    second = await optionalRead(Promise.reject(failure));
  } catch (error) {
    // A revoked token is not a slice failure. The stale success stays, and
    // nothing writes a zero in its place.
    assert.equal(cache.current?.value.error, null);
    throw error;
  }
  persist(cache, second, 2);
  return { shown: second, cache: cache.current };
}

test('a stale list followed by forbidden stays a failure, not an empty list', async () => {
  const stale = [{ id: 'cached' }];
  const { shown, cache } = await staleThen(stale, new GitHubError('forbidden', 'Resource not accessible.'));
  assert.deepEqual(shown, {
    data: null,
    error: { kind: 'forbidden', message: 'Resource not accessible.' },
  });
  assert.equal(isEmptySuccess(cache?.value), false);
  assert.equal(cache?.value.error?.kind, 'forbidden');
  assert.equal(explainReadFailure(shown.error as ReadFailure, 'the files'), 'github did not allow loading the files · Resource not accessible');
});

test('a revoked token is rethrown and is not stored as an empty success', async () => {
  const stale = [{ id: 'stale' }];
  const cache: { current: CachedSlice<typeof stale> } = {
    current: { savedAt: 1, value: { data: stale, error: null } },
  };
  const stored = cache.current;
  if (!stored) throw new Error('fixture was not stored');
  await assert.rejects(
    staleThen(stale, new GitHubError('invalid-token', 'Bad credentials')),
    (error: unknown) => error instanceof GitHubError && error.kind === 'invalid-token',
  );
  // The stale success is still the cached value. Nothing wrote a zero over it.
  assert.equal(cache.current, stored);
  assert.deepEqual(stored.value, { data: stale, error: null });
  assert.equal(isEmptySuccess(stored.value), false);
});

test('missing, offline, and rate-limit failures are recorded and never become a valid zero', async () => {
  const cases: GitHubError[] = [
    new GitHubError('missing', 'Not found.'),
    new GitHubError('network', 'The request failed.', 'unsent'),
    new GitHubError('api', 'API rate limit exceeded.', 'rate-limited'),
  ];
  for (const failure of cases) {
    const { shown, cache } = await staleThen([{ id: 'stale' }], failure);
    assert.equal(shown.data, null);
    assert.equal(shown.error?.kind, failure.kind);
    assert.equal(shown.error?.message, failure.message);
    assert.equal(isEmptySuccess(cache?.value), false);
    assert.notDeepEqual(cache?.value, { data: [], error: null });
    assert.notDeepEqual(cache?.value, { data: 0, error: null });
  }
});

test('a genuine empty answer is the only zero that is persisted', async () => {
  const cache: { current: CachedSlice<unknown[]> } = { current: null };
  const empty = await optionalRead(Promise.resolve([] as unknown[]));
  persist(cache, empty, 1);
  assert.deepEqual(cache.current?.value, { data: [], error: null });

  const failed = await optionalRead(Promise.reject(new GitHubError('forbidden', 'no')));
  persist(cache, failed, 2);
  assert.equal(cache.current?.value.data, null);
  assert.equal(isEmptySuccess(cache.current?.value), false);
});

test('cancellation and a programming error are not converted into a failure record', async () => {
  const abort = new DOMException('The operation was aborted.', 'AbortError');
  await assert.rejects(optionalRead(Promise.reject(abort)), (error: unknown) => error === abort);
  const bug = new TypeError('cannot read');
  await assert.rejects(optionalRead(Promise.reject(bug)), (error: unknown) => error === bug);
});
