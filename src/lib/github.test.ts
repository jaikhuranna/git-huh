import assert from 'node:assert/strict';
import { test } from 'node:test';
import { z } from 'zod';

import { executeMutation, GitHubError } from './github';
import * as writes from './writes';

test('every GraphQL write preserves an unknown outcome when its dispatched reply is lost', async () => {
  const token = 'mutation-outcome-test';
  const cases: [string, () => Promise<unknown>][] = [
    ['comment', () => writes.addComment(token, 'subject', 'reply')],
    ['review', () => writes.submitReview(token, 'pull', 'COMMENT', 'review')],
    ['discussion comment', () => writes.addDiscussionComment(token, 'discussion', 'reply')],
    ['reaction', () => writes.setReaction(token, 'subject', 'THUMBS_UP', true)],
    ['edit comment', () => writes.editComment(token, 'issue', 'comment', 'edited')],
    ['delete comment', () => writes.deleteComment(token, 'issue', 'comment')],
    ['pin issue', () => writes.setPinned(token, 'issue', true)],
    ['merge', () => writes.mergePull(token, 'pull', 'MERGE', 'head')],
    ['auto merge', () => writes.setAutoMerge(token, 'pull', 'MERGE')],
    ['pull state', () => writes.setPullOpen(token, 'pull', false)],
    ['draft', () => writes.setDraft(token, 'pull', true)],
    ['update branch', () => writes.updatePullBranch(token, 'pull')],
    ['thread reply', () => writes.replyToThread(token, 'thread', 'reply')],
    ['resolve thread', () => writes.setThreadResolved(token, 'thread', true)],
    ['dismiss review', () => writes.dismissReview(token, 'review', 'dismissed')],
    ['nested discussion reply', () => writes.replyInDiscussion(token, 'discussion', 'parent', 'reply')],
    ['discussion answer', () => writes.setAnswer(token, 'comment', true)],
    ['upvote', () => writes.setUpvote(token, 'subject', true)],
    ['discussion state', () => writes.setDiscussionOpen(token, 'discussion', false)],
    ['edit discussion', () => writes.editDiscussion(token, 'discussion', { title: 'edited' })],
    ['create discussion', () => writes.createDiscussion(token, 'repository', 'category', 'title', 'body')],
    ['star', () => writes.setStarred(token, 'repository', true)],
  ];
  const original = globalThis.fetch;
  let dispatched = 0;
  globalThis.fetch = async () => {
    dispatched += 1;
    throw new TypeError('The connection closed before the reply arrived.');
  };

  try {
    for (const [name, write] of cases) {
      const before = dispatched;
      await assert.rejects(write, (error: unknown) => {
        assert.ok(error instanceof GitHubError, name);
        assert.equal(error.kind, 'network', name);
        assert.equal(error.outcome, 'unknown', name);
        return true;
      });
      assert.equal(dispatched, before + 1, `${name} must not replay an uncertain write`);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test('a mutation cancelled before dispatch rejects as an abort without sending a request', async () => {
  const controller = new AbortController();
  controller.abort();
  const original = globalThis.fetch;
  let dispatched = 0;
  globalThis.fetch = async () => {
    dispatched += 1;
    throw new TypeError('No request should have been dispatched.');
  };

  try {
    await assert.rejects(
      executeMutation('mutation-abort-test', 'mutation Write { change }', z.unknown(), {}, {
        signal: controller.signal,
      }),
      { name: 'AbortError' },
    );
    assert.equal(dispatched, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('the mutation entry sends variables and returns validated data', async () => {
  const original = globalThis.fetch;
  let sentBody: unknown;
  globalThis.fetch = async (_url, init) => {
    sentBody = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ data: { number: 42 } }), { status: 200 });
  };

  try {
    const result = await executeMutation(
      'mutation-success-test',
      'mutation Write($body: String!) { change(body: $body) }',
      z.object({ number: z.number().int() }),
      { body: 'hello' },
    );
    assert.deepEqual(result, { number: 42 });
    assert.deepEqual(sentBody, {
      query: 'mutation Write($body: String!) { change(body: $body) }',
      variables: { body: 'hello' },
    });
  } finally {
    globalThis.fetch = original;
  }
});
