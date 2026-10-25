import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

import { credentialGeneration, escapeName } from './cacheKey';
import { createSavedStore, type Saved, type SavedBackend } from './savedStore';

export type { Saved } from './savedStore';

/**
 * The device adapter for the ordered, bounded saved store. Tokens stay in the
 * keystore; read caches, authored drafts, and settings use this JSON box.
 * The core indexes physical names so pre-index files are included without
 * decoding or renaming filenames from an older app release.
 */
const web = Platform.OS === 'web';
const memory = new Map<string, string>();
const INDEX_KEY = '~index';

function folder(): Directory {
  const dir = new Directory(Paths.document, 'githuh-store');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

function fileForId(id: string): File {
  return new File(folder(), `${id}.json`);
}

const backend: SavedBackend = {
  async read(id) {
    if (web) return memory.get(id) ?? null;
    const file = fileForId(id);
    return file.exists ? file.text() : null;
  },
  async write(id, raw) {
    if (web) {
      memory.set(id, raw);
      return;
    }
    const file = fileForId(id);
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
    file.write(raw);
  },
  async remove(id) {
    if (web) {
      memory.delete(id);
      return;
    }
    const file = fileForId(id);
    if (file.exists) file.delete();
  },
  async list() {
    if (web) {
      return [...memory].map(([id, raw]) => ({
        id,
        bytes: new TextEncoder().encode(raw).byteLength,
        at: 0,
      }));
    }
    return folder().list()
      .filter((entry): entry is File => entry instanceof File && entry.name.endsWith('.json'))
      .map((file) => ({
        id: file.name.slice(0, -5),
        bytes: file.size,
        at: file.lastModified ?? file.creationTime ?? 0,
      }));
  },
};

const savedStore = createSavedStore(backend, {
  indexId: escapeName(INDEX_KEY),
  legacyId: escapeName,
  onIndexError(error) {
    console.warn('The saved-cache index could not be updated.', error);
  },
});

export function readSaved<T>(
  key: string,
  validate?: (value: unknown) => T | null,
): Promise<Saved<T> | null> {
  return savedStore.read(escapeName(key), validate);
}

/** Failed persistence rejects, including authored drafts and settings. */
export function writeSaved<T>(key: string, value: T): Promise<void> {
  return savedStore.write(escapeName(key), value);
}

export function removeSaved(key: string): Promise<void> {
  return savedStore.remove(escapeName(key));
}

/** Prefixes are already escaped by accountCachePrefixes. */
export function removeSavedPrefixes(prefixes: string[]): Promise<void> {
  return savedStore.removePrefixes(prefixes);
}

export function removeSavedPrefix(prefix: string): Promise<void> {
  return removeSavedPrefixes([escapeName(prefix)]);
}

export function pinSaved(key: string): void {
  savedStore.pin(escapeName(key), true);
}

export function unpinSaved(key: string): void {
  savedStore.pin(escapeName(key), false);
}

export function pruneSavedCache(budgetBytes?: number): Promise<void> {
  return savedStore.prune(budgetBytes);
}

/**
 * The persisted name of a credential. See `credentialGeneration`: this is no
 * longer a 32-bit hash, and it never returns the credential itself.
 */
export function keyOf(text: string): string {
  return credentialGeneration(text);
}

/** Short age for a saved answer, in the app's own voice: `4m`, `3h`, `2d`. */
export function savedAge(at: number, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}
