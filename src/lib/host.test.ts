import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  blockedInTheClear,
  bytes,
  demoOverview,
  demoServiceDetail,
  duration,
  isBadLine,
  normalizeUrl,
  showValue,
  since,
  tidyLogLine,
  squeeze,
  uptimeShare,
  verdict,
  type HostSettings,
} from './host';
import {
  HOST_BACKOFF_CAP_MS,
  hostBackoffAfterFailure,
  hostBackoffAfterSuccess,
  hostBackoffDelay,
  hostCallBlocked,
  hostConnectionIdentity,
  hostIdentity,
  hostPollMayStart,
  initialHostBackoff,
  settleSample,
  stableJson,
  type SettledSample,
} from './hostLifecycle';

test('an address is given a scheme and loses its trailing slash and /v1', () => {
  assert.equal(normalizeUrl('desk.tail0.ts.net:8796'), 'http://desk.tail0.ts.net:8796');
  assert.equal(normalizeUrl(' https://desk.ts.net:8797/ '), 'https://desk.ts.net:8797');
  assert.equal(normalizeUrl('http://desk.ts.net:8796/v1/'), 'http://desk.ts.net:8796');
  assert.equal(normalizeUrl(' '), '');
});

test('only plain http outside the tailnet names is refused by a release build', () => {
  assert.equal(blockedInTheClear('http://100.64.0.1:8796'), true);
  assert.equal(blockedInTheClear('http://desk.tail0.ts.net:8796'), false);
  assert.equal(blockedInTheClear('https://example.com'), false);
});

test('squeezing keeps the peak of each run and leaves empty runs empty', () => {
  assert.deepEqual(squeeze([1, 5, 2, 2, null, null], 3), [5, 2, null]);
  assert.deepEqual(squeeze([1, 2], 10), [1, 2]);
  assert.equal(squeeze(Array(360).fill(1), 40).length, 40);
});

test('numbers are shown the way their panel asks', () => {
  assert.equal(showValue(92.53, 'percent'), '93%');
  assert.equal(showValue(0.25, 'percent'), '0.3%');
  assert.equal(showValue(0, 'percent'), '0%');
  assert.equal(showValue(46, 'number', '°c'), '46°c');
  assert.equal(showValue(126, 'number', 'watchers'), '126 watchers');
  assert.equal(showValue(0.58, 'number'), '0.58');
  assert.equal(showValue(3 * 2 ** 30, 'bytes'), '3.0 gb');
  assert.equal(showValue(null, 'number'), '—');
  assert.equal(showValue('ok', 'number'), 'ok');
});

test('durations are short', () => {
  assert.equal(duration(42), '42s');
  assert.equal(duration(3 * 3600 + 5 * 60), '3h 5m');
  assert.equal(duration(4 * 86_400 + 3 * 3600), '4d 3h');
  assert.equal(duration(40 * 86_400), '40d');
  assert.equal(since(1000, 1000 * 1000 + 90_000), '1m');
  assert.equal(bytes(512), '512 b');
});

test('a service that runs but does not answer is not up', () => {
  assert.deepEqual(verdict({ state: 'active', health: null }), { word: 'up', ok: true });
  assert.deepEqual(verdict({ state: 'active', health: { ok: false, detail: '', ms: 0, at: 0 } }), {
    word: 'not answering',
    ok: false,
  });
  assert.equal(verdict({ state: 'inactive' }).word, 'down');
  assert.equal(verdict({ state: 'activating' }).ok, null);
});

test('uptime is the share of readings that were up, ignoring gaps', () => {
  assert.equal(uptimeShare([1, 1, 0, null]), 67);
  assert.equal(uptimeShare([null]), null);
});

test('the demo host has a service page for every service it lists', () => {
  const overview = demoOverview();
  for (const service of overview.services) {
    assert.equal(demoServiceDetail(service.id).id, service.id);
  }
});

test('a journal line loses its stamp, its unit and the timestamp the program printed', () => {
  assert.deepEqual(
    tidyLogLine('2026-10-13T19:25:45+0530 watcher[812]: 2026/10/13 19:25:45 board: fetch_error: timeout'),
    { time: '19:25', text: 'board: fetch_error: timeout' },
  );
  assert.deepEqual(tidyLogLine('plain line'), { time: '', text: 'plain line' });
  assert.equal(isBadLine('board: fetch_error: HTTP 404'), false);
  assert.equal(isBadLine('panic: runtime error'), true);
  assert.equal(isBadLine('ERROR could not bind'), true);
});

/**
 * The connection table `hostClient` keeps, driven with the same rules: one
 * client per host and credential generation, dropped — with its samples and
 * its backoff — when that identity is replaced.
 */
function connections() {
  const opened: string[] = [];
  const clients = new Map<string, { id: string }>();
  const samples = new Map<string, SettledSample<object>>();
  const backoff = new Map<string, ReturnType<typeof initialHostBackoff>>();

  function identityOf(settings: HostSettings): string {
    return hostIdentity(settings, (token) => `gen:${token}`);
  }

  function clientFor(settings: HostSettings): { id: string } {
    const key = identityOf(settings);
    const existing = clients.get(key);
    if (existing) return existing;
    const created = { id: `client-${opened.length + 1}` };
    opened.push(key);
    clients.set(key, created);
    backoff.set(key, initialHostBackoff());
    return created;
  }

  function replace(previous: HostSettings, next: HostSettings | null): void {
    const from = identityOf(previous);
    if (next && identityOf(next) === from) return;
    clients.delete(from);
    backoff.delete(from);
    for (const key of samples.keys()) {
      if (key.startsWith(`${from}|`)) samples.delete(key);
    }
  }

  function remember(settings: HostSettings, kind: string, value: object): object {
    const key = `${identityOf(settings)}|${kind}`;
    const settled = settleSample(samples.get(key), value);
    samples.set(key, settled.sample);
    return settled.sample.value;
  }

  return { opened, clients, samples, backoff, identityOf, clientFor, replace, remember };
}

test('replacing the host or the token drops the stale client and its samples', () => {
  const desk: HostSettings = { url: 'http://desk.ts.net:8796/', token: 'alpha' };
  const sameDesk: HostSettings = { url: 'http://desk.ts.net:8796', token: 'alpha' };
  const newToken: HostSettings = { url: 'http://desk.ts.net:8796', token: 'beta' };
  const otherHost: HostSettings = { url: 'http://nas.ts.net:8796', token: 'alpha' };
  const life = connections();

  const first = life.clientFor(desk);
  const sample = life.remember(desk, 'overview', { cpu: 1 });
  life.backoff.set(life.identityOf(desk), hostBackoffAfterFailure(initialHostBackoff(), true, 1_000));
  assert.equal(life.clientFor(sameDesk), first, 'a trailing slash is not a second machine');
  assert.equal(life.remember(sameDesk, 'overview', { cpu: 1 }), sample);
  assert.equal(life.opened.length, 1);
  assert.equal(hostConnectionIdentity(desk.url, 'gen:alpha'), life.identityOf(desk));

  life.replace(desk, newToken);
  assert.equal(life.clients.has(life.identityOf(desk)), false);
  assert.equal(life.backoff.has(life.identityOf(desk)), false);
  assert.equal(life.samples.size, 0, 'the replaced credential must not keep the previous snapshot');

  const second = life.clientFor(newToken);
  assert.notEqual(second, first);
  life.remember(newToken, 'overview', { cpu: 2 });
  life.replace(newToken, otherHost);
  assert.equal(life.clients.has(life.identityOf(newToken)), false);
  assert.equal(life.samples.size, 0);
  life.clientFor(otherHost);
  assert.deepEqual(life.opened, [
    hostConnectionIdentity(desk.url, 'gen:alpha'),
    hostConnectionIdentity(newToken.url, 'gen:beta'),
    hostConnectionIdentity(otherHost.url, 'gen:alpha'),
  ]);

  life.replace(otherHost, null);
  assert.equal(life.clients.size, 0);
  assert.equal(life.samples.size, 0);
});

test('the same host and credential generation reuses one client', () => {
  const life = connections();
  const settings: HostSettings = { url: 'desk.ts.net:8796', token: 'alpha' };
  const first = life.clientFor(settings);
  const second = life.clientFor({ url: 'http://desk.ts.net:8796/v1/', token: 'alpha' });
  assert.equal(second, first);
  assert.equal(life.clients.size, 1);
  life.replace(settings, { url: 'http://desk.ts.net:8796', token: 'alpha' });
  assert.equal(life.clients.size, 1, 'rewriting the same identity must not drop the live client');
  assert.equal(life.clientFor(settings), first);
});

test('hiding the screen during a poll halts it and foregrounding does not stack another', () => {
  let visible = true;
  let inFlight = false;
  let started = 0;
  const polls: AbortController[] = [];

  function begin(): AbortController | null {
    if (!hostPollMayStart({ visible, inFlight })) return null;
    inFlight = true;
    started += 1;
    const controller = new AbortController();
    polls.push(controller);
    return controller;
  }

  const first = begin();
  assert.ok(first);
  assert.equal(begin(), null, 'a poll already in flight is not started again');

  visible = false;
  first.abort();
  inFlight = false;
  assert.equal(first.signal.aborted, true);
  assert.equal(begin(), null, 'a hidden screen does not poll');

  visible = true;
  const resumed = begin();
  assert.ok(resumed);
  assert.equal(begin(), null, 'a second foreground does not stack a poll');
  assert.equal(hostPollMayStart({ visible: true, inFlight: true }), false);
  assert.equal(started, 2);
  assert.equal(polls.filter((poll) => !poll.signal.aborted).length, 1);
});

test('failure backoff waits, caps, and a success or a new credential clears it', () => {
  let backoff = initialHostBackoff();
  const start = 10_000;
  assert.equal(hostCallBlocked(backoff, start, false), null);
  assert.equal(hostBackoffDelay(1), 2_000);
  assert.equal(hostBackoffDelay(2), 4_000);
  assert.equal(hostBackoffDelay(3), 8_000);
  assert.equal(hostBackoffDelay(6), HOST_BACKOFF_CAP_MS);
  assert.equal(hostBackoffDelay(12), HOST_BACKOFF_CAP_MS);

  backoff = hostBackoffAfterFailure(backoff, false, start);
  assert.equal(hostCallBlocked(backoff, start + 1_999, false), 'waiting');
  assert.equal(hostCallBlocked(backoff, start + 2_000, false), null);
  assert.equal(hostCallBlocked(backoff, start + 1, true), null, 'a probe is not held back');

  backoff = hostBackoffAfterFailure(backoff, false, start);
  assert.equal(backoff.retryAt, start + 4_000);
  for (let i = 0; i < 8; i++) backoff = hostBackoffAfterFailure(backoff, false, start);
  assert.equal(backoff.retryAt - start, HOST_BACKOFF_CAP_MS);

  backoff = hostBackoffAfterSuccess();
  assert.deepEqual(backoff, initialHostBackoff());

  backoff = hostBackoffAfterFailure(backoff, true, start);
  assert.equal(hostCallBlocked(backoff, start + 1_000_000, false), 'refused');
  backoff = hostBackoffAfterSuccess();
  assert.equal(hostCallBlocked(backoff, start, false), null, 'a new credential starts unrefused');
});

test('retained samples stay one per resource and an unchanged poll is not a new object', () => {
  const life = connections();
  const settings: HostSettings = { url: 'http://desk.ts.net:8796', token: 'alpha' };
  const first = { cpu: 1, name: 'desk' };
  assert.equal(life.remember(settings, 'overview', first), first);
  assert.equal(life.samples.size, 1);

  const again = life.remember(settings, 'overview', { name: 'desk', cpu: 1 });
  assert.equal(again, first, 'the same numbers come back as the sample already held');
  assert.equal(life.samples.size, 1);

  const moved = { cpu: 2, name: 'desk' };
  assert.equal(life.remember(settings, 'overview', moved), moved);
  assert.equal(life.samples.get(`${life.identityOf(settings)}|overview`)?.value, moved);

  const kinds = ['overview', 'service:web', 'service:db'];
  for (let i = 0; i < 40; i++) {
    for (const kind of kinds) life.remember(settings, kind, { n: i, kind });
  }
  assert.equal(life.samples.size, kinds.length, 'history is not retained; one sample per resource');
  assert.deepEqual(stableJson({ b: 1, a: { d: 2, c: 3 } }), stableJson({ a: { c: 3, d: 2 }, b: 1 }));
});
