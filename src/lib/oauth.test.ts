import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DeviceFlowError,
  readDeviceCode,
  readPoll,
  spacedCode,
  tokenKind,
  waitForToken,
  type DeviceCode,
} from './oauth';

test('a device code is read with its expiry and interval', () => {
  const code = readDeviceCode(
    {
      device_code: 'dc',
      user_code: 'WDJB-MJHT',
      verification_uri: 'https://github.com/login/device',
      expires_in: 900,
      interval: 5,
    },
    1_000,
  );
  assert.deepEqual(code, {
    deviceCode: 'dc',
    userCode: 'WDJB-MJHT',
    verificationUri: 'https://github.com/login/device',
    expiresAt: 901_000,
    interval: 5,
  });
});

test('an app with the device flow off says so, and a bad client id is misconfigured', () => {
  assert.throws(
    () => readDeviceCode({ error: 'device_flow_disabled' }),
    (error: unknown) => error instanceof DeviceFlowError && error.reason === 'disabled',
  );
  assert.throws(
    () => readDeviceCode({ error: 'Not Found' }),
    (error: unknown) => error instanceof DeviceFlowError && error.reason === 'misconfigured',
  );
});

test('polls: pending waits, slow_down backs off, a token ends it', () => {
  assert.deepEqual(readPoll({ error: 'authorization_pending' }, 5), { kind: 'wait', interval: 5 });
  assert.deepEqual(readPoll({ error: 'slow_down' }, 5), { kind: 'wait', interval: 10 });
  assert.deepEqual(readPoll({ error: 'slow_down', interval: 15 }, 5), { kind: 'wait', interval: 15 });
  assert.deepEqual(readPoll({ access_token: 'gho_x', scope: 'repo,read:user' }, 5), {
    kind: 'token',
    token: 'gho_x',
    scopes: ['repo', 'read:user'],
  });
  assert.deepEqual(readPoll({ error: 'access_denied' }, 5), { kind: 'failed', reason: 'denied' });
  assert.deepEqual(readPoll({ error: 'expired_token' }, 5), { kind: 'failed', reason: 'expired' });
});

function fakeFetch(answers: unknown[]): typeof fetch {
  let index = 0;
  return (async () => {
    const answer = answers[Math.min(index++, answers.length - 1)];
    if (answer instanceof Error) throw answer;
    return { json: async () => answer } as Response;
  }) as typeof fetch;
}

const quick: DeviceCode = {
  deviceCode: 'dc',
  userCode: 'ABCD-EFGH',
  verificationUri: 'https://github.com/login/device',
  expiresAt: Number.MAX_SAFE_INTEGER,
  interval: 0.001,
};

test('waiting survives a dropped connection and returns the token', async () => {
  const token = await waitForToken(
    'id',
    quick,
    undefined,
    fakeFetch([{ error: 'authorization_pending' }, new TypeError('offline'), { access_token: 'gho_ok' }]),
  );
  assert.equal(token, 'gho_ok');
});

test('a code past its expiry stops without asking again', async () => {
  await assert.rejects(
    waitForToken('id', { ...quick, expiresAt: 0 }, undefined, fakeFetch([{ access_token: 'x' }])),
    (error: unknown) => error instanceof DeviceFlowError && error.reason === 'expired',
  );
});

test('a token says how it came in', () => {
  assert.equal(tokenKind('gho_abc'), 'oauth');
  assert.equal(tokenKind('ghp_abc'), 'classic');
  assert.equal(tokenKind('github_pat_abc'), 'fine-grained');
  assert.equal(tokenKind('demo'), 'other');
});

test('codes are shown in two fours', () => {
  assert.equal(spacedCode('wdjbmjht'), 'WDJB-MJHT');
  assert.equal(spacedCode('WDJB-MJHT'), 'WDJB-MJHT');
});
