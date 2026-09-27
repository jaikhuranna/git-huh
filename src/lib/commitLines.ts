import { z } from 'zod';

import { isMergeSubject } from './activity';
import type { CommitLine } from './messageCache';
import { rest } from './rest';

/**
 * Words for the loading screen, pulled from the whole of your history rather
 * than from this week.
 *
 * `activity.ts` reads the newest commits of your most recently pushed repos,
 * which is the wrong shape for this: it only ever shows the last few days of
 * work. The commit search endpoint can be sorted by author date in either
 * direction, so two requests give the two ends of your history — mostly the
 * old end, which is the half you have forgotten and the half worth reading,
 * plus a handful of recent ones so the screen still feels current.
 *
 * REST rather than GraphQL because GraphQL has no commit search at all. The
 * whole thing is best-effort: every failure resolves to an empty list and the
 * caller falls back to the sampled history it already has.
 */

/** Skewed hard towards the old end — that is the point of the screen. */
const OLDEST = 30;
const NEWEST = 12;

const searchSchema = z.object({
  items: z.array(
    z.object({
      sha: z.string(),
      commit: z.object({ message: z.string() }),
      // The widget prints this after the subject, so a line on the home
      // screen says where the work was as well as what it was.
      repository: z.object({ name: z.string() }).optional(),
    }),
  ),
});

/** Subject line only: GitHub's search returns the whole commit message. */
function subject(message: string): string {
  return message.split('\n')[0]?.trim() ?? '';
}

function authored(line: CommitLine): boolean {
  return line.message.length >= 3 && !isMergeSubject(line.message);
}

async function page(
  token: string,
  login: string,
  order: 'asc' | 'desc',
  perPage: number,
  signal?: AbortSignal,
): Promise<CommitLine[]> {
  const query = encodeURIComponent(`author:${login}`);
  // A 422 (an unindexed account), a 403 (the search rate limit) and every
  // other failure mean the same thing here: no words this time. The caller
  // turns them into an empty page.
  const data = await rest(
    token,
    `/search/commits?q=${query}&sort=author-date&order=${order}&per_page=${perPage}`,
    { schema: searchSchema, signal },
  );
  return data.items
    .map((item) => ({
      message: subject(item.commit.message),
      repo: item.repository?.name ?? '',
    }))
    .filter(authored);
}

/**
 * A pool of commit subjects, oldest-heavy. Never throws, except to re-raise
 * an abort, so a screen teardown does not write a stale cache.
 */
export async function fetchCommitLines(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<CommitLine[]> {
  const [old, recent] = await Promise.all([
    page(token, login, 'asc', OLDEST, signal).catch(rethrowAbort),
    page(token, login, 'desc', NEWEST, signal).catch(rethrowAbort),
  ]);

  const seen = new Set<string>();
  const pool: CommitLine[] = [];
  // Oldest first, so if the byte budget truncates the pool it is the recent
  // messages that get dropped rather than the archaeology.
  for (const line of [...old, ...recent]) {
    const key = line.message.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(line);
  }
  return pool;
}

function rethrowAbort(error: unknown): CommitLine[] {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  return [];
}
