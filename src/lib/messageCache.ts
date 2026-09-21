import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The loading screen is made of your own commit messages, which creates a
 * chicken-and-egg problem: it has to be on screen *before* the request that
 * would fetch them. So a pool of messages is kept on the device and only
 * refreshed when it goes stale — every other launch just reshuffles what is
 * already here, which costs nothing and still reads differently each time.
 *
 * SecureStore is the only persistence this app already carries, and it warns
 * above about 2 KB per value on Android, hence the hard budget below. These
 * are public commit subjects, not secrets — the store is being used as a
 * small key/value box, not for its encryption.
 */

const KEY = 'commit_lines';
const MAX_LINES = 40;
const MAX_CHARS = 34;
const MAX_BYTES = 1800;

/** How long a pool is good for before the next launch refetches it. */
export const STALE_AFTER_MS = 7 * 86_400_000;

export interface CachedLines {
  lines: string[];
  /** Epoch ms the pool was written. 0 for a pre-2.4 cache with no stamp. */
  at: number;
}

export const EMPTY_CACHE: CachedLines = { lines: [], at: 0 };

/** Mirrors tokenStore: expo-secure-store has no web implementation. */
const secure = Platform.OS !== 'web';
const memory = { value: null as string | null };

function tidy(message: string): string {
  const line = message.trim().replace(/\s+/g, ' ');
  return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line;
}

export async function readCachedLines(): Promise<CachedLines> {
  try {
    const raw = secure ? await SecureStore.getItemAsync(KEY) : memory.value;
    if (!raw) return EMPTY_CACHE;
    const parsed: unknown = JSON.parse(raw);

    // v1 wrote a bare array. It has no timestamp, so it reads as stale and
    // gets replaced on this launch — but it still has something to show now.
    if (Array.isArray(parsed)) {
      return { lines: parsed.filter(isLine), at: 0 };
    }
    if (parsed && typeof parsed === 'object' && 'lines' in parsed) {
      const record = parsed as { lines?: unknown; at?: unknown };
      return {
        lines: Array.isArray(record.lines) ? record.lines.filter(isLine) : [],
        at: typeof record.at === 'number' ? record.at : 0,
      };
    }
    return EMPTY_CACHE;
  } catch {
    // A corrupt cache is not worth an error path: the screen has a fallback.
    return EMPTY_CACHE;
  }
}

function isLine(line: unknown): line is string {
  return typeof line === 'string';
}

/** True when the pool is empty or older than a week. */
export function isStale(cache: CachedLines, now: number = Date.now()): boolean {
  return cache.lines.length === 0 || now - cache.at >= STALE_AFTER_MS;
}

export async function cacheLines(messages: string[]): Promise<void> {
  const lines: string[] = [];
  const seen = new Set<string>();
  let bytes = 32;
  for (const message of messages) {
    if (lines.length >= MAX_LINES) break;
    const line = tidy(message);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bytes += line.length + 3;
    if (bytes > MAX_BYTES) break;
    lines.push(line);
  }
  if (lines.length === 0) return;

  const raw = JSON.stringify({ at: Date.now(), lines });
  try {
    if (secure) await SecureStore.setItemAsync(KEY, raw);
    else memory.value = raw;
  } catch {
    // Storage full or locked — the next launch just shows the fallback.
  }
}

export async function clearCachedLines(): Promise<void> {
  try {
    if (secure) await SecureStore.deleteItemAsync(KEY);
    else memory.value = null;
  } catch {
    // Nothing to do; the token is gone either way.
  }
}

/**
 * Fisher-Yates, on a copy. The pool is only refetched weekly, so the shuffle
 * is what keeps the loading screen from being the same picture every launch.
 */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
