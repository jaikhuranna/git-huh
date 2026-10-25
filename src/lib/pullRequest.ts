import { z } from 'zod';

import { executeQuery } from './github';

/** The identity shared by lists, links, notifications and the detail loader. */
export interface PullRef {
  repo: string;
  number: number;
}

/**
 * Fields shared by the activity sample and an opened PR. The description is
 * not here: a list of thirty requests must not download every body. A screen
 * that previews one asks `fetchPullBody` for that request alone.
 */
export const PULL_SUMMARY_FIELDS = /* GraphQL */ `
  number title url state isDraft createdAt mergedAt
  additions deletions changedFiles reviewDecision
  labels(first: 20) { nodes { name color } }
  commits { totalCount }
`;

export const pullSummarySchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  state: z.enum(['OPEN', 'MERGED', 'CLOSED']),
  isDraft: z.boolean(),
  createdAt: z.string(),
  mergedAt: z.string().nullable(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  changedFiles: z.number().int().nonnegative(),
  reviewDecision: z.string().nullable(),
  labels: z.object({ nodes: z.array(z.object({ name: z.string(), color: z.string() })) }).nullable(),
  commits: z.object({ totalCount: z.number().int().nonnegative() }),
});

export interface PullSummary extends PullRef {
  title: string;
  url: string;
  /**
   * The description, when this object was loaded on its own. Bulk samples
   * leave it empty; that is not the same as a pull request with no description.
   */
  body: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  isDraft: boolean;
  createdAt: string;
  mergedAt: string | null;
  additions: number;
  deletions: number;
  changedFiles: number;
  commits: number;
  reviewDecision: string | null;
  labels: { name: string; color: string }[];
}

export function toPullSummary(
  pr: z.infer<typeof pullSummarySchema> & { body?: string },
  repo: string,
): PullSummary {
  return {
    repo, number: pr.number, title: pr.title, url: pr.url, body: pr.body ?? '',
    state: pr.state, isDraft: pr.isDraft, createdAt: pr.createdAt, mergedAt: pr.mergedAt,
    additions: pr.additions, deletions: pr.deletions, changedFiles: pr.changedFiles,
    commits: pr.commits.totalCount, reviewDecision: pr.reviewDecision, labels: pr.labels?.nodes ?? [],
  };
}

const bodySchema = z.object({
  repository: z.object({
    pullRequest: z.object({ body: z.string() }).nullable(),
  }).nullable(),
});

/**
 * One pull request's description. The brief and the sequential reader call
 * this for the request on screen; the activity sample does not.
 */
export function fetchPullBody(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<string> {
  const [owner, name] = repo.split('/');
  const query = /* GraphQL */ `
    query PullBody($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) { body }
      }
    }
  `;
  return executeQuery(token, query, bodySchema, signal, { owner, name, number }).then(
    (data) => data.repository?.pullRequest?.body ?? '',
  );
}

/** Identity shared by every open-PR read: owner/name plus number, nothing else. */
export function pullIdentity(repo: string, number: number): string {
  return `${repo.toLowerCase()}#${number}`;
}

interface RememberedPull {
  repo: string;
  number: number;
  title: string;
  htmlUrl: string;
  createdAt: string;
  draft: boolean;
  /** Which query produced this. Different memberships are not interchangeable. */
  membership: string;
  at: number;
}

const remembered = new Map<string, RememberedPull>();

/**
 * Remember a pull request seen by one query so a later query with the same
 * identity can reuse the entity fields. Membership stays on the record: a
 * review request is not an authored pull request, and this map does not
 * decide which list a request belongs to.
 */
export function rememberPull(pull: Omit<RememberedPull, 'at'>, at = Date.now()): void {
  remembered.set(pullIdentity(pull.repo, pull.number), { ...pull, at });
}

export function rememberedPull(
  repo: string,
  number: number,
  membership: string,
): RememberedPull | null {
  const found = remembered.get(pullIdentity(repo, number));
  if (!found || found.membership !== membership) return null;
  return found;
}
