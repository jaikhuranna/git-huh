import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The loading screen is made of your own commit messages, which creates a
 * chicken-and-egg problem: it has to be on screen *before* the request that
 * would fetch them. So the messages from one run are kept for the next one.
 *
 * SecureStore is the only persistence this app already carries, and it warns
 * above about 2 KB per value on Android, hence the hard budget below. These
 * are public commit subjects, not secrets — the store is being used as a
 * small key/value box, not for its encryption.
 */

const KEY = 'commit_lines';
const MAX_LINES = 26;
const MAX_CHARS = 34;
const MAX_BYTES = 1600;

/** Mirrors tokenStore: expo-secure-store has no web implementation. */
const secure = Platform.OS !== 'web';
const memory = { value: null as string | null };

function tidy(message: string): string {
  const line = message.trim().replace(/\s+/g, ' ');
  return line.length > MAX_CHARS ? `${line.slice(0, MAX_CHARS - 1)}…` : line;
}

export async function readCachedLines(): Promise<string[]> {
  try {
    const raw = secure ? await SecureStore.getItemAsync(KEY) : memory.value;
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is string => typeof line === 'string');
  } catch {
    // A corrupt cache is not worth an error path: the screen has a fallback.
    return [];
  }
}

export async function cacheLines(messages: string[]): Promise<void> {
  const lines: string[] = [];
  let bytes = 2;
  for (const message of messages.slice(0, MAX_LINES)) {
    const line = tidy(message);
    if (!line) continue;
    bytes += line.length + 3;
    if (bytes > MAX_BYTES) break;
    lines.push(line);
  }
  if (lines.length === 0) return;

  const raw = JSON.stringify(lines);
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
