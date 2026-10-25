import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  cancelResourceWork,
  dropResourceSnapshot,
  getResourceHydrationGeneration,
  getResourceSnapshot,
  isCurrentResourceGeneration,
  publishResource,
  publishResourceForGeneration,
  publishHydratedResource,
  publishNetworkResource,
  resourceIsFresh,
  resourceFreshnessTimestamp,
  shouldLoadResource,
  startResourceWork,
  subscribeResource,
} from './resourceStore';

test('publishing replaces the stable resource snapshot before notifying listeners', () => {
  const key = 'resource-store-snapshot-identity';
  const initial = getResourceSnapshot<string>(key);
  let notifications = 0;
  const unsubscribe = subscribeResource(key, () => {
    notifications += 1;
  });

  publishResource(key, { value: 'loaded', loading: false, refreshing: false });

  const next = getResourceSnapshot<string>(key);
  assert.equal(notifications, 1);
  assert.notEqual(next, initial);
  assert.equal(next.value, 'loaded');
  assert.equal(getResourceSnapshot(key), next);
  unsubscribe();
});

test('unsubscribe is idempotent and does not remove a later subscriber', () => {
  const key = 'resource-store-subscribe-lifecycle';
  const firstUnsubscribe = subscribeResource(key, () => {});
  firstUnsubscribe();

  let notifications = 0;
  subscribeResource(key, () => {
    notifications += 1;
  });
  firstUnsubscribe();
  publishResource(key, { value: 'latest' });

  assert.equal(notifications, 1);
});

test('cancelling a resource aborts its old work and prevents late publication', async () => {
  const key = 'resource-store-cancel-race';
  let resolveOld!: (value: string) => void;
  const old = startResourceWork(key, () => {
    return new Promise<string>((resolve) => {
      resolveOld = resolve;
    });
  });
  void old.promise.catch(() => {});
  await Promise.resolve();

  cancelResourceWork(key);
  assert.equal(old.signal.aborted, true);

  const current = startResourceWork(key, async () => 'current');
  assert.equal(await current.promise, 'current');
  assert.equal(isCurrentResourceGeneration(key, current.generation), true);
  assert.equal(
    publishResourceForGeneration(key, current.generation, { value: 'current' }),
    true,
  );

  resolveOld('stale');
  await old.promise;
  assert.equal(isCurrentResourceGeneration(key, old.generation), false);
  assert.equal(
    publishResourceForGeneration(key, old.generation, { value: 'stale' }),
    false,
  );
  assert.equal(getResourceSnapshot<string>(key).value, 'current');
});

test('disk hydration may publish while network is pending, then network replaces it', () => {
  const key = 'resource-store-disk-before-network';
  const hydration = getResourceHydrationGeneration(key);
  publishResource(key, { loading: true });

  assert.equal(
    publishHydratedResource(key, hydration, {
      value: 'disk',
      origin: 'disk',
      savedAt: 10,
    }),
    true,
  );
  assert.equal(getResourceSnapshot<string>(key).value, 'disk');

  publishNetworkResource(key, {
    value: 'network',
    origin: 'network',
    freshAt: 20,
    loading: false,
  });
  assert.equal(getResourceSnapshot<string>(key).value, 'network');
});

test('late disk hydration cannot replace a completed network value', () => {
  const key = 'resource-store-network-before-disk';
  const hydration = getResourceHydrationGeneration(key);
  publishNetworkResource(key, {
    value: 'network',
    origin: 'network',
    freshAt: 20,
    loading: false,
  });

  assert.equal(
    publishHydratedResource(key, hydration, {
      value: 'disk',
      origin: 'disk',
      savedAt: 10,
    }),
    false,
  );
  assert.equal(getResourceSnapshot<string>(key).value, 'network');
});

test('evicting and reopening a key cannot reuse an old request generation', async () => {
  const key = 'resource-store-eviction-generation';
  let resolveOld!: (value: string) => void;
  const old = startResourceWork(
    key,
    () =>
      new Promise<string>((resolve) => {
        resolveOld = resolve;
      }),
  );
  void old.promise.catch(() => {});
  await Promise.resolve();

  dropResourceSnapshot(key);
  const reopened = startResourceWork(key, async () => 'new');
  assert.notEqual(reopened.generation, old.generation);
  assert.equal(await reopened.promise, 'new');

  resolveOld('old');
  await old.promise;
  assert.equal(isCurrentResourceGeneration(key, old.generation), false);
});

test('evicting and reopening a key cannot reuse an old hydration generation', () => {
  const key = 'resource-store-eviction-hydration';
  const oldGeneration = getResourceHydrationGeneration(key);

  dropResourceSnapshot(key);
  const newGeneration = getResourceHydrationGeneration(key);

  assert.notEqual(newGeneration, oldGeneration);
});

test('freshness expires exactly at its configured age and is unbounded when omitted', () => {
  assert.equal(resourceIsFresh(1_000, 100, 1_099), true);
  assert.equal(resourceIsFresh(1_000, 100, 1_100), false);
  assert.equal(resourceIsFresh(null, 100, 1_000), false);
  assert.equal(resourceIsFresh(1_000, undefined, 9_999_999), true);
});

test('disk timestamps drive freshness until a network value is installed', () => {
  assert.equal(resourceFreshnessTimestamp('disk', 1_000, null), 1_000);
  assert.equal(resourceFreshnessTimestamp('network', null, 2_000), 2_000);
  assert.equal(resourceFreshnessTimestamp(null, null, null), null);
});

test('a stale failure does not retry until activation, foreground return, or manual reload', () => {
  const base = {
    fresh: false,
    loading: false,
    failed: true,
    activationChanged: false,
    foregroundChanged: false,
    manualReload: false,
  };
  assert.equal(shouldLoadResource(base), false);
  assert.equal(shouldLoadResource({ ...base, activationChanged: true }), true);
  assert.equal(shouldLoadResource({ ...base, foregroundChanged: true }), true);
  assert.equal(shouldLoadResource({ ...base, manualReload: true }), true);
  assert.equal(shouldLoadResource({ ...base, loading: true, manualReload: true }), false);
  assert.equal(shouldLoadResource({ ...base, fresh: true, foregroundChanged: true }), false);
});
