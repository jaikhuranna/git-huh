import { Directory, File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/**
 * A small JSON box on disk, for everything the app wants to still have when
 * the network is gone.
 *
 * SecureStore is where secrets live and it warns past 2 KB a value; a year of
 * contributions is forty times that. This is the app's documents directory,
 * one file per key, each carrying the time it was written — because a saved
 * answer shown without its age is a lie about the present.
 *
 * Nothing in here is secret. Tokens stay in the keystore (`accounts.ts`).
 */

export interface Saved<T> {
  value: T;
  /** Epoch ms the value was written. */
  at: number;
}

const web = Platform.OS === 'web';
const memory = new Map<string, string>();

function folder(): Directory {
  const dir = new Directory(Paths.document, 'githuh-store');
  if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
  return dir;
}

/** Keys become file names, so anything that is not a plain word is escaped. */
function fileFor(key: string): File {
  const safe = key.replace(/[^a-zA-Z0-9._-]/g, (char) => `_${char.charCodeAt(0)}_`);
  return new File(folder(), `${safe}.json`);
}

export async function readSaved<T>(key: string): Promise<Saved<T> | null> {
  try {
    const raw = web ? memory.get(key) : await readFile(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved<T>>;
    if (parsed == null || typeof parsed.at !== 'number' || !('value' in parsed)) {
      return null;
    }
    return parsed as Saved<T>;
  } catch {
    // A torn write or a shape from an older version is the same as nothing.
    return null;
  }
}

async function readFile(key: string): Promise<string | null> {
  const file = fileFor(key);
  return file.exists ? file.text() : null;
}

export async function writeSaved<T>(key: string, value: T): Promise<void> {
  const raw = JSON.stringify({ value, at: Date.now() } satisfies Saved<T>);
  if (web) {
    memory.set(key, raw);
    return;
  }
  try {
    const file = fileFor(key);
    if (!file.exists) file.create({ intermediates: true, overwrite: true });
    file.write(raw);
  } catch {
    // Saving is a convenience. Failing to save must never fail the screen.
  }
}

export async function removeSaved(key: string): Promise<void> {
  if (web) {
    memory.delete(key);
    return;
  }
  try {
    const file = fileFor(key);
    if (file.exists) file.delete();
  } catch {
    // Nothing to remove is the same as removed.
  }
}

/** Everything under a prefix — used when an account is removed. */
export async function removeSavedPrefix(prefix: string): Promise<void> {
  if (web) {
    for (const key of [...memory.keys()]) {
      if (key.startsWith(prefix)) memory.delete(key);
    }
    return;
  }
  try {
    const safePrefix = prefix.replace(/[^a-zA-Z0-9._-]/g, (char) => `_${char.charCodeAt(0)}_`);
    for (const entry of folder().list()) {
      if (entry instanceof File && entry.name.startsWith(safePrefix)) entry.delete();
    }
  } catch {
    // Best effort, like every other write here.
  }
}

/**
 * A stable, short name for something that must not be written down as-is —
 * a token, which identifies the account whose answers these are.
 */
export function keyOf(text: string): string {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value.toString(36);
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
