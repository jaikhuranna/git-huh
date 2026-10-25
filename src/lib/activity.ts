import { z } from 'zod';

import { toISODate } from './contributions';
import { executeQuery, type RequestPriority } from './github';
import { PULL_SUMMARY_FIELDS, pullSummarySchema, rememberPull, toPullSummary, type PullSummary } from './pullRequest';
import type { CommitLine } from './messageCache';

/**
 * The second tier of GitHub data: the things you only get by opening an
 * object rather than listing it. Pull request bodies and diff stats, and a
 * sample of real commits with their timestamps — which is what makes a
 * commit-hour histogram and a cycle-time chart possible at all.
 *
 * Kept separate from github.ts because it is optional: every screen it
 * feeds degrades to an empty state, and a failure here must never take the
 * contribution calendar down with it.
 */

/**
 * The cards screen draws twelve repositories, so the history sample reaches
 * twelve; at six, half the deck had no bars to draw and the axis under each
 * card was a different length from the one above it.
 */
const REPO_SAMPLE = 12;
const COMMITS_PER_REPO = 60;
const PR_SAMPLE = 30;

const commitSchema = z.object({
  committedDate: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  messageHeadline: z.string(),
  author: z
    .object({ user: z.object({ login: z.string() }).nullable() })
    .nullable()
    .optional(),
});

const historySchema = z.object({
  nameWithOwner: z.string(),
  defaultBranchRef: z
    .object({
      target: z
        .object({ history: z.object({ nodes: z.array(commitSchema) }) })
        .nullable(),
    })
    .nullable(),
});

const pullSchema = pullSummarySchema.extend({
  closedAt: z.string().nullable(),
  repository: z.object({ nameWithOwner: z.string() }),
  comments: z.object({ totalCount: z.number().int().nonnegative() }),
  reviews: z
    .object({
      nodes: z.array(
        z.object({ submittedAt: z.string().nullable(), state: z.string() }),
      ),
    })
    .nullable(),
});

const activitySchema = z.object({
  prs: z.object({ nodes: z.array(pullSchema.partial().passthrough()) }),
  repos: z.object({
    repositories: z.object({ nodes: z.array(historySchema) }),
  }),
});

export interface CommitSample {
  /** Local hour 0–23, which is the point of collecting these at all. */
  hour: number;
  weekday: number;
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  /** owner/name, so a repo's own activity can be drawn on its own card. */
  repo: string;
  additions: number;
  deletions: number;
  message: string;
}

/** A sampled PR for charts and list previews, never a second detail page. */
export interface PullActivity extends PullSummary {
  closedAt: string | null;
  comments: number;
  firstReviewAt: string | null;
}

export interface Activity {
  commits: CommitSample[];
  pulls: PullActivity[];
  /**
   * `ready` is a real sample, including a genuine empty one. `unavailable`
   * means the read failed and the arrays are not a claim that nothing
   * happened. `stale` is the last ready sample after a later failure.
   */
  /**
   * `ready` is a real sample, including a genuine empty one. `unavailable`
   * means the read failed. `stale` is the last ready sample after a later
   * failure. Optional so a merger that only concatenates samples still
   * typechecks; a missing value is treated as ready.
   */
  availability?: 'ready' | 'unavailable' | 'stale';
  /** When a ready or stale sample was known to be true. */
  at?: number | null;
}

export const EMPTY_ACTIVITY: Activity = {
  commits: [],
  pulls: [],
  availability: 'unavailable',
  at: null,
};

/** A successful sample with nothing in it. Distinct from a failed read. */
export function emptyActivity(at = Date.now()): Activity {
  return { commits: [], pulls: [], availability: 'ready', at };
}

function query(login: string, viewerId: string | null): string {
  // With the viewer's node id, GitHub returns only that author's commits.
  // Without it the sample still filters by login after the fact, and is
  // still a sample of recent history, not a complete contribution log.
  const historyArgs = viewerId
    ? `first: ${COMMITS_PER_REPO}, author: { id: "${viewerId}" }`
    : `first: ${COMMITS_PER_REPO}`;
  const authorFields = viewerId ? '' : '${authorFields}';
  return /* GraphQL */ `
    query Activity {
      prs: search(
        type: ISSUE
        query: "is:pr author:${login} sort:updated-desc"
        first: ${PR_SAMPLE}
      ) {
        nodes {
          ... on PullRequest {
            ${PULL_SUMMARY_FIELDS}
            closedAt
            repository { nameWithOwner }
            comments { totalCount }
            reviews(first: 1) { nodes { submittedAt state } }
          }
        }
      }
      repos: viewer {
        repositories(
          first: ${REPO_SAMPLE}
          ownerAffiliations: OWNER
          isFork: false
          orderBy: { field: PUSHED_AT, direction: DESC }
        ) {
          nodes {
            nameWithOwner
            defaultBranchRef {
              target {
                ... on Commit {
                  history(${historyArgs}) {
                    nodes {
                      committedDate
                      additions
                      deletions
                      messageHeadline
                      ${authorFields}
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;
}

/**
 * Fetch a sample of commit timestamps and pull-request summaries.
 * Descriptions are not included. A failure rejects; it is not an empty sample.
 */
export async function fetchActivity(
  token: string,
  login: string,
  signal?: AbortSignal,
  viewerId?: string | null,
  priority: RequestPriority = 'interactive',
): Promise<Activity> {
  const data = await executeQuery(token, query(login, viewerId ?? null), activitySchema, {
    signal,
    priority,
  });

  const commits: CommitSample[] = [];
  for (const repo of data.repos.repositories.nodes) {
    const nodes = repo.defaultBranchRef?.target?.history.nodes ?? [];
    for (const node of nodes) {
      // Other people's commits land in the same history; keep only ours.
      if (!viewerId && node.author?.user?.login?.toLowerCase() !== login.toLowerCase()) {
        continue;
      }
      const when = new Date(node.committedDate);
      commits.push({
        hour: when.getHours(),
        weekday: when.getDay(),
        date: toISODate(when),
        repo: repo.nameWithOwner,
        additions: node.additions,
        deletions: node.deletions,
        message: node.messageHeadline,
      });
    }
  }

  const pulls: PullActivity[] = [];
  for (const raw of data.prs.nodes) {
    const node = pullSchema.safeParse(raw);
    // The search union can return issues too; skip anything that is not a PR.
    if (!node.success) continue;
    const pr = node.data;
    const summary = toPullSummary(pr, pr.repository.nameWithOwner);
    rememberPull({
      repo: summary.repo,
      number: summary.number,
      title: summary.title,
      htmlUrl: summary.url,
      createdAt: summary.createdAt,
      draft: summary.isDraft,
      membership: pr.state === 'OPEN' ? 'authored-open' : 'authored-history',
    });
    pulls.push({
      ...summary,
      closedAt: pr.closedAt,
      comments: pr.comments.totalCount,
      firstReviewAt: pr.reviews?.nodes[0]?.submittedAt ?? null,
    });
  }

  return { commits, pulls, availability: 'ready', at: Date.now() };
}

/** Commits per local hour, 0–23. */
export function hourHistogram(commits: CommitSample[]): number[] {
  const hours = new Array(24).fill(0);
  for (const commit of commits) hours[commit.hour] += 1;
  return hours;
}

/** The middle value — an upper median for an even count — or 0 for none. */
function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export interface Ledger {
  additions: number;
  deletions: number;
  /** Net lines; negative means you deleted more than you added. */
  net: number;
  /** Median diff size, which survives one enormous vendored commit. */
  medianDiff: number;
}

export function ledger(commits: CommitSample[]): Ledger {
  const additions = commits.reduce((sum, c) => sum + c.additions, 0);
  const deletions = commits.reduce((sum, c) => sum + c.deletions, 0);
  return {
    additions,
    deletions,
    net: additions - deletions,
    medianDiff: median(commits.map((c) => c.additions + c.deletions)),
  };
}

export interface CycleStats {
  /** Hours from opening a PR to merging it, per merged PR. */
  cycleHours: number[];
  medianCycleHours: number;
  /** Hours from opening to the first review landing. */
  medianReviewWaitHours: number;
  mergeRate: number;
  merged: number;
  open: number;
  closed: number;
}

const HOUR = 3_600_000;

export function cycleStats(pulls: PullActivity[]): CycleStats {
  const cycleHours: number[] = [];
  const waits: number[] = [];
  let merged = 0;
  let open = 0;
  let closed = 0;

  for (const pr of pulls) {
    if (pr.state === 'MERGED') merged += 1;
    else if (pr.state === 'CLOSED') closed += 1;
    else open += 1;

    const opened = Date.parse(pr.createdAt);
    if (pr.mergedAt) {
      cycleHours.push((Date.parse(pr.mergedAt) - opened) / HOUR);
    }
    if (pr.firstReviewAt) {
      waits.push((Date.parse(pr.firstReviewAt) - opened) / HOUR);
    }
  }

  const decided = merged + closed;
  return {
    cycleHours,
    medianCycleHours: median(cycleHours),
    medianReviewWaitHours: median(waits),
    mergeRate: decided > 0 ? merged / decided : 0,
    merged,
    open,
    closed,
  };
}

/** One month of a repository's history, oldest first. */
export interface MonthBar {
  /** YYYY-MM, so two bars can never be confused across a year boundary. */
  key: string;
  /** Single letter for the axis — J F M A M J J A S O N D. */
  initial: string;
  /** Commits by the token owner in that month, from the sampled history. */
  count: number;
}

const INITIALS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * The last `maxMonths` calendar months ending with this one, all at zero.
 *
 * Every repository card is drawn against this same window. An axis sized to
 * each repo's own commits would give one card a single bar and the card under
 * it twelve — two charts that look comparable and are not. A shared axis
 * costs some empty bars and buys a deck you can read down.
 */
export function monthWindow(maxMonths = 12, now: Date = new Date()): MonthBar[] {
  const last = now.getFullYear() * 12 + now.getMonth();
  const out: MonthBar[] = [];
  for (let index = last - (maxMonths - 1); index <= last; index++) {
    const month = ((index % 12) + 12) % 12;
    out.push({
      key: `${Math.floor(index / 12)}-${String(month + 1).padStart(2, '0')}`,
      initial: INITIALS[month],
      count: 0,
    });
  }
  return out;
}

/**
 * A repository's commit history over the shared month window, oldest first.
 *
 * Returns an empty array when the sample holds nothing for this repo, so the
 * card can say the sample never reached it rather than drawing twelve zeroes
 * and implying a year of silence.
 */
export function repoMonths(
  commits: CommitSample[],
  repo: string,
  maxMonths = 12,
  now: Date = new Date(),
): MonthBar[] {
  const counts = new Map<string, number>();
  for (const commit of commits) {
    if (commit.repo !== repo) continue;
    const key = commit.date.slice(0, 7);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  if (counts.size === 0) return [];

  // Both sides are YYYY-MM, which is what makes the window key a lookup.
  return monthWindow(maxMonths, now).map((bar) => ({
    ...bar,
    count: counts.get(bar.key) ?? 0,
  }));
}

/**
 * When the newest sampled commit in a repository landed, as epoch ms, or
 * null when the sample never reached that repo.
 *
 * This is not `pushedAt`. GitHub bumps `pushedAt` for a tag, a branch
 * deletion or a fork sync — anything that moves a ref — so sorting a deck of
 * repositories by it puts repos you have not written a line in at the top.
 *
 * The sample keeps a local day and a local hour rather than a timestamp, so
 * this resolves to the hour. That is enough to order a day's work; without
 * the hour, every repo touched today ties and the deck falls back to
 * whatever order GitHub happened to return.
 */
export function lastCommitAt(
  commits: CommitSample[],
  repo: string,
): number | null {
  let latest: number | null = null;
  for (const commit of commits) {
    if (commit.repo !== repo) continue;
    const at = Date.parse(
      `${commit.date}T${String(commit.hour).padStart(2, '0')}:00:00`,
    );
    if (Number.isNaN(at)) continue;
    if (latest === null || at > latest) latest = at;
  }
  return latest;
}

/** Merge commits are GitHub's words, not yours: no screen prints them. */
export function isMergeSubject(message: string): boolean {
  return /^merge (branch|pull request|remote|commit)/i.test(message);
}

/**
 * `count` messages spread evenly across the whole history rather than taken
 * off the top, so the loading screen shows work from all over time instead of
 * whatever happened to land this week. Merge commits are dropped — they are
 * GitHub's words, not yours.
 */
export function spreadMessages(
  commits: CommitSample[],
  count: number,
): CommitLine[] {
  const seen = new Set<string>();
  const pool: CommitLine[] = [];
  for (const commit of commits) {
    const clean = commit.message.trim();
    if (clean.length === 0) continue;
    if (isMergeSubject(clean)) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    pool.push({ message: clean, repo: commit.repo });
  }
  if (pool.length <= count) return pool;

  const step = pool.length / count;
  return Array.from({ length: count }, (_, i) => pool[Math.floor(i * step)]);
}
