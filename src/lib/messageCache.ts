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
/**
 * Bumped whenever the shape or the limits of a stored line change, because a
 * pool already on the device is otherwise kept for a week and the change does
 * not reach the screen. 2.7 shipped a longer subject and a repository beside
 * it, and every phone carried on printing 34-character lines with nothing
 * after them: the cap is applied when a line is *written*, not when it is
 * read. A pool from an older version reads back with no timestamp, so it is
 * shown once and replaced on the same launch.
 */
const VERSION = 2;
const MAX_LINES = 40;
/**
 * Longest subject kept. It was 34, which is narrower than the widget's card:
 * every message longer than that arrived on the home screen already clipped
 * mid-word, with an ellipsis the widget had no say in. The strip travels now,
 * so there is no width to fit at all — this is only a guard against a commit
 * message with an essay in its subject line. The loading screen is unaffected
 * either way; it takes the first twenty glyphs of a line itself.
 *
 * The byte budget below is the real limit on how many lines are kept, so a
 * longer cap buys fuller messages at the cost of a few of them.
 */
const MAX_CHARS = 72;
/** Longest repository name kept beside a message. */
const MAX_REPO = 24;
const MAX_BYTES = 1800;

/** How long a pool is good for before the next launch refetches it. */
export const STALE_AFTER_MS = 7 * 86_400_000;

/**
 * One line of the pool: a commit subject and the repository it was written
 * in. The widget prints the repo after the message in a fainter ink, which
 * is the difference between a sentence on your home screen and a sentence
 * you can place.
 */
export interface CommitLine {
  message: string;
  /** Repository name without the owner — "git-huh", not "you/git-huh". */
  repo: string;
}

export interface CachedLines {
  lines: CommitLine[];
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

/** Owner and any trailing whitespace off; "you/git-huh" reads as "git-huh". */
function shortRepo(repo: string): string {
  const name = repo.trim().split('/').pop() ?? '';
  return name.length > MAX_REPO ? name.slice(0, MAX_REPO) : name;
}

export async function readCachedLines(): Promise<CachedLines> {
  try {
    const raw = secure ? await SecureStore.getItemAsync(KEY) : memory.value;
    if (!raw) return EMPTY_CACHE;
    const parsed: unknown = JSON.parse(raw);

    // v1 wrote a bare array. It has no timestamp, so it reads as stale and
    // gets replaced on this launch — but it still has something to show now.
    if (Array.isArray(parsed)) {
      return { lines: parsed.map(toLine).filter(isLine), at: 0 };
    }
    if (parsed && typeof parsed === 'object' && 'lines' in parsed) {
      const record = parsed as { lines?: unknown; at?: unknown; v?: unknown };
      return {
        lines: Array.isArray(record.lines)
          ? record.lines.map(toLine).filter(isLine)
          : [],
        // A pool written by an older version of this file is readable but not
        // current — it keeps its lines and loses its timestamp, so the screen
        // has something to show while the replacement is fetched.
        at: record.v === VERSION && typeof record.at === 'number' ? record.at : 0,
      };
    }
    return EMPTY_CACHE;
  } catch {
    // A corrupt cache is not worth an error path: the screen has a fallback.
    return EMPTY_CACHE;
  }
}

/**
 * One stored entry, whichever shape it was written in. Caches written before
 * 2.7 hold bare strings and have no repository to give, so they read back
 * with an empty one and the widget simply prints nothing after the message.
 */
function toLine(entry: unknown): CommitLine | null {
  if (typeof entry === 'string') return { message: entry, repo: '' };
  if (entry && typeof entry === 'object' && 'm' in entry) {
    const record = entry as { m?: unknown; r?: unknown };
    if (typeof record.m !== 'string') return null;
    return { message: record.m, repo: typeof record.r === 'string' ? record.r : '' };
  }
  return null;
}

function isLine(line: CommitLine | null): line is CommitLine {
  return line !== null && line.message.length > 0;
}

/** True when the pool is empty or older than a week. */
export function isStale(cache: CachedLines, now: number = Date.now()): boolean {
  return cache.lines.length === 0 || now - cache.at >= STALE_AFTER_MS;
}

export async function cacheLines(messages: CommitLine[]): Promise<void> {
  const lines: { m: string; r: string }[] = [];
  const seen = new Set<string>();
  let bytes = 32;
  for (const entry of messages) {
    if (lines.length >= MAX_LINES) break;
    const line = tidy(entry.message);
    if (!line) continue;
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const repo = shortRepo(entry.repo);
    bytes += line.length + repo.length + 16;
    if (bytes > MAX_BYTES) break;
    lines.push({ m: line, r: repo });
  }
  if (lines.length === 0) return;

  const raw = JSON.stringify({ v: VERSION, at: Date.now(), lines });
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
