/** Immutable public state for one shared remote resource. */
export interface ResourceSnapshot<T> {
  readonly value: T | undefined;
  readonly error: unknown;
  readonly loading: boolean;
  readonly refreshing: boolean;
  readonly savedAt: number | null;
  readonly freshAt: number | null;
  readonly origin: 'disk' | 'network' | null;
  readonly failure: string | null;
  readonly version: number;
}

type ResourceUpdate<T> = Partial<Omit<ResourceSnapshot<T>, 'version'>>;

export interface ResourceWork<T> {
  readonly generation: number;
  readonly signal: AbortSignal;
  readonly promise: Promise<T>;
}

interface ActiveResourceWork<T> extends ResourceWork<T> {
  readonly controller: AbortController;
}

const snapshots = new Map<string, ResourceSnapshot<unknown>>();
const listeners = new Map<string, Set<() => void>>();
const generations = new Map<string, number>();
const hydrationGenerations = new Map<string, number>();
const work = new Map<string, ActiveResourceWork<unknown>>();
let nextWorkGeneration = 0;
let nextHydrationGeneration = 0;

function initialSnapshot<T>(): ResourceSnapshot<T> {
  return {
    value: undefined,
    error: null,
    loading: false,
    refreshing: false,
    savedAt: null,
    freshAt: null,
    origin: null,
    failure: null,
    version: 0,
  };
}

export function resourceIsFresh(
  freshAt: number | null,
  staleAfterMs: number | undefined,
  now = Date.now(),
): boolean {
  if (freshAt == null) return false;
  return staleAfterMs == null || now - freshAt < staleAfterMs;
}

export function resourceFreshnessTimestamp(
  origin: ResourceSnapshot<unknown>['origin'],
  savedAt: number | null,
  freshAt: number | null,
): number | null {
  return freshAt ?? (origin === 'disk' ? savedAt : null);
}

export function shouldLoadResource({
  fresh,
  loading,
  failed,
  activationChanged,
  foregroundChanged,
  manualReload,
}: {
  fresh: boolean;
  loading: boolean;
  failed: boolean;
  activationChanged: boolean;
  foregroundChanged: boolean;
  manualReload: boolean;
}): boolean {
  if (loading) return false;
  if (manualReload) return true;
  if (fresh) return false;
  if (activationChanged || foregroundChanged) return true;
  return !failed;
}

/** Return the same immutable object until the resource is published again. */
export function getResourceSnapshot<T>(key: string): ResourceSnapshot<T> {
  let current = snapshots.get(key) as ResourceSnapshot<T> | undefined;
  if (!current) {
    current = Object.freeze(initialSnapshot<T>());
    snapshots.set(key, current as ResourceSnapshot<unknown>);
  }
  return current;
}

/** Install a new snapshot before notifying subscribers. */
export function publishResource<T>(key: string, update: ResourceUpdate<T>): void {
  const current = getResourceSnapshot<T>(key);
  snapshots.set(
    key,
    Object.freeze({ ...current, ...update, version: current.version + 1 }),
  );
  for (const listener of listeners.get(key) ?? []) listener();
}

export function getResourceHydrationGeneration(key: string): number {
  let generation = hydrationGenerations.get(key);
  if (generation === undefined) {
    generation = ++nextHydrationGeneration;
    hydrationGenerations.set(key, generation);
  }
  return generation;
}

export function invalidateResourceHydration(key: string): number {
  const generation = ++nextHydrationGeneration;
  hydrationGenerations.set(key, generation);
  return generation;
}

export function publishHydratedResource<T>(
  key: string,
  generation: number,
  update: ResourceUpdate<T>,
): boolean {
  if (getResourceHydrationGeneration(key) !== generation) return false;
  if (getResourceSnapshot<T>(key).value !== undefined) return false;
  publishResource(key, update);
  return true;
}

export function publishNetworkResource<T>(key: string, update: ResourceUpdate<T>): void {
  invalidateResourceHydration(key);
  publishResource(key, update);
}

export function publishResourceForGeneration<T>(
  key: string,
  generation: number,
  update: ResourceUpdate<T>,
): boolean {
  if (!isCurrentResourceGeneration(key, generation)) return false;
  publishResource(key, update);
  return true;
}

export function isCurrentResourceGeneration(key: string, generation: number): boolean {
  return (generations.get(key) ?? 0) === generation;
}

export function startResourceWork<T>(
  key: string,
  load: (signal: AbortSignal) => Promise<T>,
): ResourceWork<T> {
  const current = work.get(key) as ActiveResourceWork<T> | undefined;
  if (current) return current;

  const generation = ++nextWorkGeneration;
  generations.set(key, generation);
  const controller = new AbortController();
  let flight: ActiveResourceWork<T>;
  const promise = Promise.resolve()
    .then(() => load(controller.signal))
    .finally(() => {
      if (work.get(key) === flight) work.delete(key);
    });
  flight = { generation, signal: controller.signal, promise, controller };
  work.set(key, flight as ActiveResourceWork<unknown>);
  return flight;
}

/** Abort and invalidate the current request so its eventual result is obsolete. */
export function cancelResourceWork(key: string): number {
  const generation = ++nextWorkGeneration;
  generations.set(key, generation);
  const current = work.get(key);
  work.delete(key);
  current?.controller.abort();
  return generation;
}

export function subscribeResource(key: string, listener: () => void): () => void {
  let resourceListeners = listeners.get(key);
  if (!resourceListeners) {
    resourceListeners = new Set();
    listeners.set(key, resourceListeners);
  }
  resourceListeners.add(listener);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    resourceListeners?.delete(listener);
    if (resourceListeners?.size === 0 && listeners.get(key) === resourceListeners) {
      listeners.delete(key);
    }
  };
}

/** Drop the snapshot after the owning remote entry has passed its idle grace period. */
export function dropResourceSnapshot(key: string): void {
  if (listeners.has(key)) return;
  cancelResourceWork(key);
  invalidateResourceHydration(key);
  snapshots.delete(key);
  generations.delete(key);
  hydrationGenerations.delete(key);
}
