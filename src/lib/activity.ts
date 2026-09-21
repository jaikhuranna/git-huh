import { z } from 'zod';

import { executeQuery } from './github';

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

const REPO_SAMPLE = 6;
const COMMITS_PER_REPO = 60;
const PR_SAMPLE = 30;

const commitSchema = z.object({
  committedDate: z.string(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  messageHeadline: z.string(),
  author: z
    .object({ user: z.object({ login: z.string() }).nullable() })
    .nullable(),
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

const pullSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  body: z.string(),
  state: z.string(),
  isDraft: z.boolean(),
  createdAt: z.string(),
  closedAt: z.string().nullable(),
  mergedAt: z.string().nullable(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  reviewDecision: z.string().nullable(),
  repository: z.object({ nameWithOwner: z.string() }),
  labels: z
    .object({ nodes: z.array(z.object({ name: z.string(), color: z.string() })) })
    .nullable(),
  comments: z.object({ totalCount: z.number().int().nonnegative() }),
  commits: z.object({ totalCount: z.number().int().nonnegative() }),
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

export interface PullDetail {
  number: number;
  title: string;
  url: string;
  body: string;
  repo: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  closedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  comments: number;
  reviewDecision: string | null;
  firstReviewAt: string | null;
  labels: { name: string; color: string }[];
}

export interface Activity {
  commits: CommitSample[];
  pulls: PullDetail[];
}

export const EMPTY_ACTIVITY: Activity = { commits: [], pulls: [] };

function query(login: string): string {
  // `author:` on history needs a node id we do not have yet, so the author
  // filter happens client-side against the login instead.
  return /* GraphQL */ `
    query Activity {
      prs: search(
        type: ISSUE
        query: "is:pr author:${login} sort:updated-desc"
        first: ${PR_SAMPLE}
      ) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            body
            state
            isDraft
            createdAt
            closedAt
            mergedAt
            additions
            deletions
            changedFiles
            reviewDecision
            repository { nameWithOwner }
            labels(first: 6) { nodes { name color } }
            comments { totalCount }
            commits { totalCount }
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
                  history(first: ${COMMITS_PER_REPO}) {
                    nodes {
                      committedDate
                      additions
                      deletions
                      messageHeadline
                      author { user { login } }
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

/** Fetch commit timestamps and pull request detail. Never throws. */
export async function fetchActivity(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<Activity> {
  const data = await executeQuery(
    token,
    query(login),
    activitySchema,
    signal,
  );

  const commits: CommitSample[] = [];
  for (const repo of data.repos.repositories.nodes) {
    const nodes = repo.defaultBranchRef?.target?.history.nodes ?? [];
    for (const node of nodes) {
      // Other people's commits land in the same history; keep only ours.
      if (node.author?.user?.login?.toLowerCase() !== login.toLowerCase()) {
        continue;
      }
      const when = new Date(node.committedDate);
      commits.push({
        hour: when.getHours(),
        weekday: when.getDay(),
        date: `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}`,
        repo: repo.nameWithOwner,
        additions: node.additions,
        deletions: node.deletions,
        message: node.messageHeadline,
      });
    }
  }

  const pulls: PullDetail[] = [];
  for (const raw of data.prs.nodes) {
    const node = pullSchema.safeParse(raw);
    // The search union can return issues too; skip anything that is not a PR.
    if (!node.success) continue;
    const pr = node.data;
    pulls.push({
      number: pr.number,
      title: pr.title,
      url: pr.url,
      body: pr.body,
      repo: pr.repository.nameWithOwner,
      state:
        pr.state === 'MERGED' ? 'MERGED' : pr.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
      isDraft: pr.isDraft,
      createdAt: pr.createdAt,
      mergedAt: pr.mergedAt,
      closedAt: pr.closedAt,
      additions: pr.additions,
      deletions: pr.deletions,
      changedFiles: pr.changedFiles,
      commits: pr.commits.totalCount,
      comments: pr.comments.totalCount,
      reviewDecision: pr.reviewDecision,
      firstReviewAt: pr.reviews?.nodes[0]?.submittedAt ?? null,
      labels: pr.labels?.nodes ?? [],
    });
  }

  return { commits, pulls };
}

/** Commits per local hour, 0–23. */
export function hourHistogram(commits: CommitSample[]): number[] {
  const hours = new Array(24).fill(0);
  for (const commit of commits) hours[commit.hour] += 1;
  return hours;
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
  const sizes = commits
    .map((c) => c.additions + c.deletions)
    .sort((a, b) => a - b);
  return {
    additions,
    deletions,
    net: additions - deletions,
    medianDiff: sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0,
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

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

export function cycleStats(pulls: PullDetail[]): CycleStats {
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

/**
 * A repository's own recent activity, as one intensity level per day for the
 * last `days` days, newest last.
 *
 * The card halftone used to be a hash of the repo name — a texture that looked
 * like data and meant nothing. This is the real thing, and it returns an empty
 * array when there is nothing to draw so the card can say so rather than
 * inventing a pattern.
 */
export function repoDensity(
  commits: CommitSample[],
  repo: string,
  days: number,
  now: Date = new Date(),
): number[] {
  const mine = commits.filter((commit) => commit.repo === repo);
  if (mine.length === 0) return [];

  const byDay = new Map<string, number>();
  for (const commit of mine) {
    byDay.set(commit.date, (byDay.get(commit.date) ?? 0) + 1);
  }

  const out: number[] = [];
  const cursor = new Date(now);
  cursor.setDate(cursor.getDate() - (days - 1));
  for (let i = 0; i < days; i++) {
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`;
    out.push(byDay.get(key) ?? 0);
    cursor.setDate(cursor.getDate() + 1);
  }

  const peak = Math.max(...out, 1);
  return out.map((count) =>
    count === 0 ? 0 : Math.min(4, Math.ceil((count / peak) * 4)),
  );
}

/** Every commit message, newest first — the loading screen reads these. */
export function commitMessages(commits: CommitSample[]): string[] {
  return commits.map((commit) => commit.message).filter((m) => m.trim().length > 0);
}
