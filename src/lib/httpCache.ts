/**
 * Validators for REST reads, so an unchanged resource is not parsed again.
 *
 * GitHub sends ETag and Last-Modified on ordinary GETs. Sending them back
 * earns a 304 and an empty body, which is the same object we already hold.
 * The identity is the account plus the representation (the Accept header),
 * because two tokens and two media types are not one resource.
 *
 * GraphQL is a POST and is not stored here. GitHub does not answer those
 * with a validator this cache could reuse.
 *
 * The box this lives in is injected: the app registers the disk-backed one
 * (`httpCacheStore.ts`) at startup, while everything else — including the
 * pure modules the unit tests import — gets a small in-memory map, so no
 * test has to load `expo-file-system` to import `rest.ts`.
 */

import { composeKey } from './cacheKey';

export interface CachedResponse<T> {
  body: T;
  etag: string | null;
  lastModified: string | null;
}

export interface StoredValidator {
  body: unknown;
  etag: string | null;
  lastModified: string | null;
}

/** Somewhere a validator and its body survive between revalidations. */
export interface ValidatorStore {
  read(key: string): Promise<StoredValidator | null>;
  write(key: string, value: StoredValidator): void;
}

/** Per session, for callers that never install the disk box. */
const MAX_MEMORY = 200;
const memory = new Map<string, StoredValidator>();
const memoryStore: ValidatorStore = {
  async read(key) {
    return memory.get(key) ?? null;
  },
  write(key, value) {
    if (memory.size >= MAX_MEMORY && !memory.has(key)) {
      const oldest = memory.keys().next().value;
      if (oldest !== undefined) memory.delete(oldest);
    }
    memory.set(key, value);
  },
};

let backing: ValidatorStore = memoryStore;

/** Called once by the app to keep validators on the device instead of in RAM. */
export function installValidatorStore(store: ValidatorStore): void {
  backing = store;
}

/**
 * A short non-secret name for the account. The token itself must never be a
 * file name; the last characters of it are still a secret.
 */
function accountMark(token: string): string {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

function cacheKey(token: string, path: string, accept: string): string {
  return composeKey(accountMark(token), 'http', accept, path);
}

export async function readCachedResponse<T>(
  token: string,
  path: string,
  accept: string,
): Promise<CachedResponse<T> | null> {
  const saved = await backing.read(cacheKey(token, path, accept));
  if (!saved) return null;
  const { body, etag, lastModified } = saved;
  if (etag == null && lastModified == null) return null;
  return { body: body as T, etag, lastModified };
}

export function writeCachedResponse<T>(
  token: string,
  path: string,
  accept: string,
  entry: CachedResponse<T>,
): void {
  if (entry.etag == null && entry.lastModified == null) return;
  backing.write(cacheKey(token, path, accept), entry);
}

/** Headers for a revalidation. Absent when we have nothing to send. */
export function conditionalHeaders(entry: CachedResponse<unknown> | null): Record<string, string> {
  if (!entry) return {};
  return {
    ...(entry.etag ? { 'If-None-Match': entry.etag } : {}),
    ...(entry.lastModified ? { 'If-Modified-Since': entry.lastModified } : {}),
  };
}
