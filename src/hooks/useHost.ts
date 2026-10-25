import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { composeKey } from '../lib/cacheKey';
import { demoOverview, demoServiceDetail, type HostSettings, type Overview, type ServiceDetail } from '../lib/host';
import { fetchOverview, fetchService, forgetSettled, hostSampleUnchanged, hostStore, invalidateHostConnection } from '../lib/hostClient';
import { hostIdentity as connectionIdentity, hostPollMayStart } from '../lib/hostLifecycle';
import { useNav } from '../lib/nav';
import { pollWhileForeground } from '../lib/polling';
import { keyOf, removeSaved, writeSaved } from '../lib/store';
import { useRemote } from './useRemote';

/** The demo's host: drawn from `demoOverview`, never asked over the network. */
const DEMO: HostSettings = { url: 'demo', token: '' };

let shared: HostSettings | null | undefined;
const listeners = new Set<(value: HostSettings | null) => void>();

/**
 * Where the host is, shared by the section and the pages pushed from it, so
 * connecting on one is connected on all. `undefined` while the keystore is
 * being read.
 */
export function useHostSettings() {
  const nav = useNav();
  const [settings, setSettings] = useState<HostSettings | null | undefined>(shared);

  useEffect(() => {
    listeners.add(setSettings);
    if (shared === undefined) {
      hostStore.get().then((value) => {
        shared = value;
        listeners.forEach((listener) => listener(value));
      });
    }
    return () => {
      listeners.delete(setSettings);
    };
  }, []);

  const save = useCallback(async (next: HostSettings | null) => {
    const previous = shared;
    if (next) await hostStore.set(next);
    else await hostStore.clear();
    shared = next;
    // The previous connection's client, refusal latch, and snapshots belong
    // to a credential that is no longer the one in use. Forget them before
    // listeners start reading, so a replaced token cannot paint the old host.
    if (previous && hostIdentity(previous) !== (next ? hostIdentity(next) : null)) {
      invalidateHostConnection(previous);
      forgetSettled(previous);
      forgetHostSnapshots(previous);
    }
    listeners.forEach((listener) => listener(next));
  }, []);

  return { settings: nav.demo ? DEMO : settings, save, demo: nav.demo };
}

/**
 * Re-asks every `seconds` while `active`: the host's numbers are live, and a
 * section that is not on screen should not keep a phone's radio awake.
 */
export function usePoll(reload: () => void, seconds: number, active: boolean, inFlight = false) {
  useEffect(() => {
    // Hidden, or a poll is already in flight: leaving the effect stops the
    // timer, so hiding the screen halts the next poll and a repeated
    // foreground cannot stack another.
    if (!hostPollMayStart({ visible: active, inFlight })) return;
    return pollWhileForeground(reload, seconds, {
      currentState: AppState.currentState,
      subscribe: (listener) => {
        const subscription = AppState.addEventListener('change', listener);
        return () => subscription.remove();
      },
    });
  }, [active, inFlight, reload, seconds]);
}

export function useOverview(settings: HostSettings | null | undefined, active: boolean) {
  const demo = useMemo(() => (settings === DEMO ? demoOverview() : undefined), [settings]);
  const identity = settings && !demo ? hostIdentity(settings) : null;
  const cacheKey = identity ? composeKey(null, 'host', identity, 'overview') : null;
  const state = useRemote<Overview>(
    identity ? `${identity}|overview` : null,
    async (signal) =>
      keepChanged(cacheKey, await fetchOverview(settings as HostSettings, signal)),
    // Read from disk. Do not let useRemote write: it stamps a new time on
    // every sample, so an unchanged poll would rewrite the snapshot.
    // keepChanged writes the samples that actually moved.
    { cacheKey, persist: false, demo },
  );
  usePoll(
    state.reload,
    state.status === 'ready' ? state.data.every : 10,
    active && !!settings && !demo && state.status !== 'loading' && state.status !== 'idle',
    state.status === 'ready' && state.refreshing,
  );
  return state;
}

export function useService(settings: HostSettings | null | undefined, id: string, active: boolean) {
  const demo = useMemo(() => (settings === DEMO ? demoServiceDetail(id) : undefined), [id, settings]);
  const identity = settings && !demo ? hostIdentity(settings) : null;
  const cacheKey = identity ? composeKey(null, 'host', identity, 'service', id) : null;
  const state = useRemote<ServiceDetail>(
    identity ? `${identity}|service|${id}` : null,
    async (signal) =>
      keepChanged(cacheKey, await fetchService(settings as HostSettings, id, signal)),
    { cacheKey, persist: false, demo },
  );
  usePoll(
    state.reload,
    state.status === 'ready' ? state.data.every : 10,
    active && !!settings && !demo && state.status !== 'loading' && state.status !== 'idle',
    state.status === 'ready' && state.refreshing,
  );
  return state;
}

/**
 * One host plus one credential. The address is normalized so a trailing slash
 * is not a second machine, and the token is hashed the way account caches
 * hash theirs: the generation changes when the token is replaced, but the
 * token itself is never a file name.
 */
function hostIdentity(settings: HostSettings): string {
  return connectionIdentity(settings, keyOf);
}

/**
 * Write a sample only when its body is not the one already returned for this
 * connection. `useRemote` also writes whatever the loader returns; this write
 * is the one that can be skipped, and it lands first so a following identical
 * envelope is the only extra cost of an unchanged poll. See the note in
 * `hostClient` — there is no server delta.
 */
function keepChanged<T extends object>(cacheKey: string | null, value: T): T {
  if (cacheKey && !hostSampleUnchanged(value)) writeSaved(cacheKey, value).catch(() => {});
  return value;
}

/**
 * Drop the overview named for a connection that has been replaced. Service
 * files whose ids are not known here stay on disk under the old key, which
 * the new credential never opens.
 */
function forgetHostSnapshots(settings: HostSettings): void {
  const identity = hostIdentity(settings);
  removeSaved(composeKey(null, 'host', identity, 'overview')).catch(() => {});
}
