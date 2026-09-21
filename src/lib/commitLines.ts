import { z } from 'zod';

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

const SEARCH = 'https://api.github.com/search/commits';

/** Skewed hard towards the old end — that is the point of the screen. */
const OLDEST = 30;
const NEWEST = 12;

const searchSchema = z.object({
  items: z.array(
    z.object({
      sha: z.string(),
      commit: z.object({ message: z.string() }),
    }),
  ),
});

/** Subject line only: GitHub's search returns the whole commit message. */
function subject(message: string): string {
  return message.split('\n')[0]?.trim() ?? '';
}

/** Merge commits are GitHub's words, not yours. */
function authored(line: string): boolean {
  if (line.length < 3) return false;
  return !/^merge (branch|pull request|remote|commit)/i.test(line);
}

async function page(
  token: string,
  login: string,
  order: 'asc' | 'desc',
  perPage: number,
  signal?: AbortSignal,
): Promise<string[]> {
  const query = encodeURIComponent(`author:${login}`);
  const response = await fetch(
    `${SEARCH}?q=${query}&sort=author-date&order=${order}&per_page=${perPage}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal,
    },
  );
  // 422 (unindexed account), 403 (search rate limit) and friends all mean the
  // same thing here: no words this time.
  if (!response.ok) return [];
  const parsed = searchSchema.safeParse(await response.json());
  if (!parsed.success) return [];
  return parsed.data.items.map((item) => subject(item.commit.message)).filter(authored);
}

/**
 * A pool of commit subjects, oldest-heavy. Never throws; an abort is the one
 * thing it re-raises, so a screen teardown does not write a stale cache.
 */
export async function fetchCommitLines(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<string[]> {
  const [old, recent] = await Promise.all([
    page(token, login, 'asc', OLDEST, signal).catch(rethrowAbort),
    page(token, login, 'desc', NEWEST, signal).catch(rethrowAbort),
  ]);

  const seen = new Set<string>();
  const pool: string[] = [];
  // Oldest first, so if the byte budget truncates the pool it is the recent
  // messages that get dropped rather than the archaeology.
  for (const line of [...old, ...recent]) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push(line);
  }
  return pool;
}

function rethrowAbort(error: unknown): string[] {
  if (error instanceof Error && error.name === 'AbortError') throw error;
  return [];
}
