import { z } from 'zod';

import { executeQuery } from './github';

/**
 * The review queue: pull requests waiting on *you*, and the ones you have
 * already looked at that have moved since.
 *
 * The inbox already carries review requests, one row each among forty other
 * kinds of thing. This is the queue on its own, answering the two questions
 * a request does not: how long has it waited (since you were *asked*, not
 * since it was opened — a pull request can sit for a month before anyone
 * requests you), and how much reading is it.
 */

export interface QueuedPull {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  /** When you were asked, or when it was opened if GitHub did not say. */
  askedAt: string;
  /** True when the request went to a team rather than to you by name. */
  viaTeam: boolean;
  draft: boolean;
  additions: number;
  deletions: number;
  files: number;
}

export interface ReviewedPull {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  /** Your last review's state: APPROVED · CHANGES_REQUESTED · COMMENTED · DISMISSED. */
  state: string;
  reviewedAt: string;
  /** Commits written after your last review — the reason to look again. */
  since: number;
}

export interface Queue {
  asked: QueuedPull[];
  /** How many GitHub says there are, which can be more than were fetched. */
  askedTotal: number;
  reviewed: ReviewedPull[];
}

const ASKED = 30;
const REVIEWED = 20;

const QUERY = /* GraphQL */ `
  query Queue($asked: String!, $reviewed: String!, $login: String!) {
    asked: search(type: ISSUE, query: $asked, first: ${ASKED}) {
      issueCount
      nodes {
        ... on PullRequest {
          number
          title
          url
          createdAt
          isDraft
          additions
          deletions
          changedFiles
          repository { nameWithOwner }
          author { login }
          timelineItems(itemTypes: [REVIEW_REQUESTED_EVENT], last: 10) {
            nodes {
              ... on ReviewRequestedEvent {
                createdAt
                requestedReviewer {
                  __typename
                  ... on User { login }
                }
              }
            }
          }
        }
      }
    }
    reviewed: search(type: ISSUE, query: $reviewed, first: ${REVIEWED}) {
      nodes {
        ... on PullRequest {
          number
          title
          url
          repository { nameWithOwner }
          author { login }
          reviews(author: $login, last: 1) {
            nodes { state submittedAt }
          }
          commits(last: 30) {
            nodes { commit { committedDate } }
          }
        }
      }
    }
  }
`;

const actor = z.object({ login: z.string() }).nullable();

const requestSchema = z.object({
  createdAt: z.string(),
  requestedReviewer: z
    .object({ __typename: z.string(), login: z.string().optional() })
    .nullable(),
});

const askedSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  isDraft: z.boolean(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  repository: z.object({ nameWithOwner: z.string() }),
  author: actor,
  timelineItems: z.object({ nodes: z.array(z.unknown()) }),
});

const reviewedSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  repository: z.object({ nameWithOwner: z.string() }),
  author: actor,
  reviews: z.object({
    nodes: z.array(z.object({ state: z.string(), submittedAt: z.string().nullable() })),
  }),
  commits: z.object({
    nodes: z.array(z.object({ commit: z.object({ committedDate: z.string() }) })),
  }),
});

const responseSchema = z.object({
  asked: z.object({ issueCount: z.number().int(), nodes: z.array(z.unknown()) }),
  reviewed: z.object({ nodes: z.array(z.unknown()) }),
});

type Request = z.infer<typeof requestSchema>;

/**
 * When you were asked. The newest request naming you wins; failing that the
 * newest one to a team (the search matched, so it was one of yours); failing
 * that, the pull request's own age.
 */
export function askedAt(
  requests: readonly Request[],
  login: string,
  createdAt: string,
): { at: string; viaTeam: boolean } {
  const me = login.toLowerCase();
  const newest = (list: readonly Request[]) =>
    list.reduce<string | null>((best, item) => (best == null || item.createdAt > best ? item.createdAt : best), null);
  const mine = newest(
    requests.filter((item) => item.requestedReviewer?.login?.toLowerCase() === me),
  );
  if (mine) return { at: mine, viaTeam: false };
  const team = newest(requests.filter((item) => item.requestedReviewer?.__typename === 'Team'));
  if (team) return { at: team, viaTeam: true };
  return { at: createdAt, viaTeam: false };
}

/** Commits dated after your review. */
export function commitsSince(dates: readonly string[], reviewedAt: string): number {
  const at = Date.parse(reviewedAt);
  return dates.filter((date) => Date.parse(date) > at).length;
}

export function readQueue(data: z.infer<typeof responseSchema>, login: string): Queue {
  const asked: QueuedPull[] = [];
  for (const raw of data.asked.nodes) {
    const parsed = askedSchema.safeParse(raw);
    if (!parsed.success) continue;
    const pr = parsed.data;
    const requests = pr.timelineItems.nodes
      .map((node) => requestSchema.safeParse(node))
      .flatMap((result) => (result.success ? [result.data] : []));
    const when = askedAt(requests, login, pr.createdAt);
    asked.push({
      repo: pr.repository.nameWithOwner,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author?.login ?? 'ghost',
      askedAt: when.at,
      viaTeam: when.viaTeam,
      draft: pr.isDraft,
      additions: pr.additions,
      deletions: pr.deletions,
      files: pr.changedFiles,
    });
  }
  // Longest wait first: the queue is read from the front.
  asked.sort((a, b) => a.askedAt.localeCompare(b.askedAt));

  const waiting = new Set(asked.map((pr) => pr.url));
  const reviewed: ReviewedPull[] = [];
  for (const raw of data.reviewed.nodes) {
    const parsed = reviewedSchema.safeParse(raw);
    if (!parsed.success) continue;
    const pr = parsed.data;
    // Asked again after reviewing: it is in the queue, not in this list.
    if (waiting.has(pr.url)) continue;
    const last = pr.reviews.nodes[pr.reviews.nodes.length - 1];
    if (!last?.submittedAt) continue;
    reviewed.push({
      repo: pr.repository.nameWithOwner,
      number: pr.number,
      title: pr.title,
      url: pr.url,
      author: pr.author?.login ?? 'ghost',
      state: last.state,
      reviewedAt: last.submittedAt,
      since: commitsSince(
        pr.commits.nodes.map((node) => node.commit.committedDate),
        last.submittedAt,
      ),
    });
  }
  // What has moved since you looked comes first, then the most recent look.
  reviewed.sort((a, b) =>
    (b.since > 0 ? 1 : 0) - (a.since > 0 ? 1 : 0) || b.reviewedAt.localeCompare(a.reviewedAt),
  );

  return { asked, askedTotal: data.asked.issueCount, reviewed };
}

export async function fetchQueue(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<Queue> {
  const data = await executeQuery(token, QUERY, responseSchema, signal, {
    asked: `is:pr is:open archived:false review-requested:${login} sort:created-asc`,
    reviewed: `is:pr is:open archived:false reviewed-by:${login} -author:${login} sort:updated-desc`,
    login,
  });
  return readQueue(data, login);
}
