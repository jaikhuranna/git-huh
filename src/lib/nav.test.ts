import assert from 'node:assert/strict';
import { test } from 'node:test';

import { routeForUrl } from './nav';

test('a repository link opens the repository', () => {
  assert.deepEqual(routeForUrl('https://github.com/expo/expo'), { kind: 'repo', repo: 'expo/expo' });
  assert.deepEqual(routeForUrl('https://www.github.com/expo/expo.git'), {
    kind: 'repo',
    repo: 'expo/expo',
  });
});

test('pull requests, issues and discussions open their own pages', () => {
  assert.deepEqual(routeForUrl('https://github.com/a/b/pull/12#discussion_r1'), {
    kind: 'pull',
    repo: 'a/b',
    number: 12,
  });
  assert.deepEqual(routeForUrl('https://github.com/a/b/issues/7?q=1'), {
    kind: 'thread',
    repo: 'a/b',
    number: 7,
    type: 'issue',
  });
  assert.deepEqual(routeForUrl('https://github.com/a/b/discussions/3'), {
    kind: 'thread',
    repo: 'a/b',
    number: 3,
    type: 'discussion',
  });
});

test('a file link keeps its ref and decodes its path', () => {
  assert.deepEqual(routeForUrl('https://github.com/a/b/blob/main/docs/read%20me.md'), {
    kind: 'file',
    repo: 'a/b',
    ref: 'main',
    path: 'docs/read me.md',
  });
});

test('anything it cannot place stays a link', () => {
  for (const url of [
    'https://example.com/a/b',
    'https://github.com/settings/tokens',
    'https://github.com/orgs/expo/people',
    'https://github.com/a/b/actions/runs/1',
    'https://github.com/a/b/pull/not-a-number',
    'https://github.com/a/b/blob/main',
    'https://github.com/a/b/blob/main/%E0%A4%A.md',
  ]) {
    assert.equal(routeForUrl(url), null, url);
  }
});
