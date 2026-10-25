import assert from 'node:assert/strict';
import { test } from 'node:test';

import { eventually } from './eventually';
import { GitHubError } from './github';

const instant = async () => {};

test('a freshly made thing is asked again until it is found', async () => {
  let calls = 0;
  const found = await eventually(
    async () => {
      calls++;
      if (calls < 3) throw new GitHubError('missing', 'not yet');
      return 'here';
    },
    { sleep: instant, recent: true },
  );
  assert.equal(found, 'here');
  assert.equal(calls, 3);
});

test('null counts as a miss, and gives up after the tries', async () => {
  let calls = 0;
  const found = await eventually(async () => {
    calls++;
    return null;
  }, { tries: 3, sleep: instant, recent: true });
  assert.equal(found, null);
  assert.equal(calls, 3);
});

test('a plain miss is one read, not a wait', async () => {
  let calls = 0;
  await assert.rejects(
    eventually(async () => {
      calls++;
      throw new GitHubError('missing', 'gone');
    }, { sleep: instant }),
  );
  assert.equal(calls, 1);
});

test('a recent miss is asked again, and a null miss is too', async () => {
  let thrown = 0;
  const found = await eventually(
    async () => {
      thrown++;
      if (thrown === 1) throw new GitHubError('missing', 'not yet');
      return 'landed';
    },
    { sleep: instant, recent: true, tries: 3 },
  );
  assert.equal(found, 'landed');
  assert.equal(thrown, 2);

  let empty = 0;
  const missed = await eventually(
    async () => {
      empty++;
      return null;
    },
    { sleep: instant, recent: true, tries: 2 },
  );
  assert.equal(missed, null);
  assert.equal(empty, 2);
});

test('any other failure is not retried', async () => {
  let calls = 0;
  await assert.rejects(
    eventually(async () => {
      calls++;
      throw new GitHubError('forbidden', 'no');
    }, { sleep: instant }),
  );
  assert.equal(calls, 1);
});
