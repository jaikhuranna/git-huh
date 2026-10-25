import assert from 'node:assert/strict';
import { test } from 'node:test';

import { GitHubError } from './github';
import { composeDeadline, deadlineError, readBounded } from './requestBudget';

test('a deadline abort is a timeout, and a caller abort is not', async () => {
  const caller = new AbortController();
  const composed = composeDeadline(caller.signal, 30);
  assert.equal(composed.timedOut(), false);
  caller.abort();
  assert.equal(composed.signal.aborted, true);
  assert.equal(composed.timedOut(), false);
  composed.dispose();

  const waiting = composeDeadline(undefined, 15);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(waiting.signal.aborted, true);
  assert.equal(waiting.timedOut(), true);
  waiting.dispose();
});

test('a deadline error names a timeout rather than a cancelled read', () => {
  const error = deadlineError();
  assert.ok(error instanceof GitHubError);
  assert.equal(error.kind, 'network');
  assert.equal(error.outcome, 'timeout');
});

function streamed(chunks: Uint8Array[]): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  return new Response(stream);
}

test('a byte budget stops and reports instead of returning a quietly short body', async () => {
  const response = streamed([new TextEncoder().encode('abcdefghij')]);
  const bounded = await readBounded(response, { maxBytes: 4 });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text, 'abcd');
});

test('a line budget stops and reports instead of returning a quietly short body', async () => {
  const bounded = await readBounded(new Response('one\ntwo\nthree\n'), { maxLines: 2 });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text, 'one\ntwo');
});

test('an advertised length past the byte budget is not read as a complete body', async () => {
  const bounded = await readBounded(
    new Response('abcdefghij', { headers: { 'content-length': '10' } }),
    { maxBytes: 4 },
  );
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text, '');
});

test('a body inside both budgets is the whole answer', async () => {
  const bounded = await readBounded(new Response('one\ntwo'), { maxBytes: 20, maxLines: 5 });
  assert.equal(bounded.truncated, false);
  assert.equal(bounded.text, 'one\ntwo');
});

test('the no-reader fallback counts UTF-8 bytes without retaining a partial character', async () => {
  const response = {
    headers: new Headers(),
    body: null,
    text: async () => '🙂é',
  } as Response;
  const bounded = await readBounded(response, { maxBytes: 5 });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.text, '🙂');
});

test('a streamed byte cap cancels without retaining an incomplete UTF-8 character', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('🙂é'));
    },
    cancel() {
      cancelled = true;
    },
  }));
  const bounded = await readBounded(response, { maxBytes: 5 });
  assert.deepEqual(bounded, { text: '🙂', truncated: true });
  assert.equal(cancelled, true);
});

test('a line cap cancels a stream before waiting for the remaining body', async () => {
  let cancelled = false;
  const response = new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('one\ntwo\n'));
    },
    cancel() {
      cancelled = true;
    },
  }));
  const bounded = await readBounded(response, { maxLines: 2 });
  assert.deepEqual(bounded, { text: 'one\ntwo', truncated: true });
  assert.equal(cancelled, true);
});
