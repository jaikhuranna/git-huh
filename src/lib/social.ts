import { z } from 'zod';

import { executeQuery } from './github';

/**
 * The social half of GitHub: who replied to you, who reviewed you, who
 * pulled you into a thread.
 *
 * This deliberately does **not** use GitHub's notifications API. That needs a
 * `notifications` scope the app never asks for, it only reports what the web
 * UI has not yet marked read, and it hands back thread stubs that need a
 * second request each to become readable. Search plus the pull request's own
 * comment and review connections gives the same feed from the scopes the
 * token already has, with the text attached.
 *
 * The same feed drives the background check in `notify.ts`, which is how the
 * app notifies without a server.
 */

const MINE = 15;
const OTHERS = 10;

const actorSchema = z.object({ login: z.string() }).nullable();

const commentSchema = z.object({
  id: z.string(),
  author: actorSchema,
  bodyText: z.string(),
  createdAt: z.string(),
  url: z.string(),
});

const reviewSchema = z.object({
  id: z.string(),
  author: actorSchema,
  state: z.string(),
  bodyText: z.string(),
  submittedAt: z.string().nullable(),
  url: z.string(),
  comments: z.object({ nodes: z.array(commentSchema) }).nullable(),
});

const threadSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  updatedAt: z.string(),
  repository: z.object({ nameWithOwner: z.string() }),
  author: actorSchema,
});

const minePrSchema = threadSchema.extend({
  id: z.string(),
  isDraft: z.boolean(),
  reviewDecision: z.string().nullable(),
  comments: z.object({ nodes: z.array(commentSchema) }).nullable(),
  reviews: z.object({ nodes: z.array(reviewSchema) }).nullable(),
});

const loose = z.object({ nodes: z.array(z.unknown()) });

const socialSchema = z.object({
  mine: loose,
  requested: loose,
  mentioned: loose,
});

export type SocialKind =
  | 'comment'
  | 'review'
  | 'review-request'
  | 'mention'
  | 'open';

export interface SocialEvent {
  /** GitHub node id, which is what keeps the three searches from doubling up. */
  id: string;
  kind: SocialKind;
  /** Whoever acted — the other person, except on your own open pull requests. */
  actor: string;
  /** APPROVED · CHANGES_REQUESTED · COMMENTED, on reviews only. */
  state?: string;
  title: string;
  repo: string;
  number: number;
  url: string;
  at: string;
  /** First line or so of what they wrote. */
  excerpt?: string;
}

function query(login: string): string {
  return /* GraphQL */ `
    query Social {
      mine: search(
        type: ISSUE
        query: "is:pr is:open author:${login} sort:updated-desc"
        first: ${MINE}
      ) {
        nodes {
          ... on PullRequest {
            id
            number
            title
            url
            updatedAt
            isDraft
            reviewDecision
            repository { nameWithOwner }
            author { login }
            comments(last: 3) {
              nodes { id author { login } bodyText createdAt url }
            }
            reviews(last: 3) {
              nodes {
                id
                author { login }
                state
                bodyText
                submittedAt
                url
                comments(first: 2) {
                  nodes { id author { login } bodyText createdAt url }
                }
              }
            }
          }
        }
      }
      requested: search(
        type: ISSUE
        query: "is:pr is:open review-requested:${login} sort:updated-desc"
        first: ${OTHERS}
      ) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            updatedAt
            repository { nameWithOwner }
            author { login }
          }
        }
      }
      mentioned: search(
        type: ISSUE
        query: "mentions:${login} sort:updated-desc"
        first: ${OTHERS}
      ) {
        nodes {
          ... on PullRequest {
            number
            title
            url
            updatedAt
            repository { nameWithOwner }
            author { login }
          }
          ... on Issue {
            number
            title
            url
            updatedAt
            repository { nameWithOwner }
            author { login }
          }
        }
      }
    }
  `;
}

/** One line of what someone wrote, with the markdown noise taken off. */
function excerpt(body: string): string | undefined {
  const line = body
    .split('\n')
    .map((part) => part.trim())
    .find((part) => part.length > 0 && !part.startsWith('>'));
  if (!line) return undefined;
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

/**
 * The events on a page of your own pull requests: who commented, who
 * reviewed, and what they wrote inline. `withOpen` adds the pull request
 * itself as a row, which the inbox wants and the history does not.
 */
function eventsFromPrs(nodes: readonly unknown[], login: string, withOpen: boolean): SocialEvent[] {
  const me = login.toLowerCase();
  const out: SocialEvent[] = [];
  const add = (event: SocialEvent) => out.push(event);

  for (const raw of nodes) {
    const parsed = minePrSchema.safeParse(raw);
    // The search union returns issues too, and an empty `{}` for anything the
    // token cannot see; either way there is nothing to draw.
    if (!parsed.success) continue;
    const pr = parsed.data;
    const repo = pr.repository.nameWithOwner;

    if (withOpen) {
      add({
        id: pr.id,
        kind: 'open',
        actor: login,
        title: pr.title,
        repo,
        number: pr.number,
        url: pr.url,
        at: pr.updatedAt,
        excerpt: pr.isDraft
          ? 'draft'
          : pr.reviewDecision === 'APPROVED'
            ? 'approved · ready to merge'
            : pr.reviewDecision === 'CHANGES_REQUESTED'
              ? 'changes requested'
              : 'waiting on review',
      });
    }

    for (const comment of pr.comments?.nodes ?? []) {
      // Your own replies are not news.
      if (!comment.author || comment.author.login.toLowerCase() === me) continue;
      add({
        id: comment.id,
        kind: 'comment',
        actor: comment.author.login,
        title: pr.title,
        repo,
        number: pr.number,
        url: comment.url,
        at: comment.createdAt,
        excerpt: excerpt(comment.bodyText),
      });
    }

    for (const review of pr.reviews?.nodes ?? []) {
      if (!review.author || review.author.login.toLowerCase() === me) continue;
      if (review.submittedAt) {
        add({
          id: review.id,
          kind: 'review',
          actor: review.author.login,
          state: review.state,
          title: pr.title,
          repo,
          number: pr.number,
          url: review.url,
          at: review.submittedAt,
          excerpt: excerpt(review.bodyText),
        });
      }
      // Inline comments on the diff — the ones that actually ask for changes.
      for (const comment of review.comments?.nodes ?? []) {
        if (!comment.author || comment.author.login.toLowerCase() === me) continue;
        add({
          id: comment.id,
          kind: 'comment',
          actor: comment.author.login,
          title: pr.title,
          repo,
          number: pr.number,
          url: comment.url,
          at: comment.createdAt,
          excerpt: excerpt(comment.bodyText),
        });
      }
    }
  }

  return out;
}

export async function fetchSocial(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<SocialEvent[]> {
  const data = await executeQuery(token, query(login), socialSchema, signal);
  const me = login.toLowerCase();
  const events = new Map<string, SocialEvent>();

  const add = (event: SocialEvent) => {
    if (!events.has(event.id)) events.set(event.id, event);
  };

  for (const event of eventsFromPrs(data.mine.nodes, login, true)) add(event);

  for (const raw of data.requested.nodes) {
    const parsed = threadSchema.safeParse(raw);
    if (!parsed.success) continue;
    const pr = parsed.data;
    add({
      id: `req:${pr.repository.nameWithOwner}#${pr.number}`,
      kind: 'review-request',
      actor: pr.author?.login ?? 'someone',
      title: pr.title,
      repo: pr.repository.nameWithOwner,
      number: pr.number,
      url: pr.url,
      at: pr.updatedAt,
      excerpt: 'wants your review',
    });
  }

  for (const raw of data.mentioned.nodes) {
    const parsed = threadSchema.safeParse(raw);
    if (!parsed.success) continue;
    const thread = parsed.data;
    // Mentioning yourself in your own description is not a mention.
    if (thread.author?.login.toLowerCase() === me) continue;
    add({
      id: `men:${thread.repository.nameWithOwner}#${thread.number}`,
      kind: 'mention',
      actor: thread.author?.login ?? 'someone',
      title: thread.title,
      repo: thread.repository.nameWithOwner,
      number: thread.number,
      url: thread.url,
      at: thread.updatedAt,
      excerpt: 'mentioned you',
    });
  }

  return [...events.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Pull requests per page of history, and how much of each one is read. */
const HISTORY_PAGE = 10;

const historySchema = z.object({
  search: z.object({
    pageInfo: z.object({ hasNextPage: z.boolean(), endCursor: z.string().nullable() }),
    nodes: z.array(z.unknown()),
  }),
});

const HISTORY_QUERY = /* GraphQL */ `
  query History($q: String!, $after: String) {
    search(type: ISSUE, query: $q, first: ${HISTORY_PAGE}, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        ... on PullRequest {
          id
          number
          title
          url
          updatedAt
          isDraft
          reviewDecision
          repository { nameWithOwner }
          author { login }
          comments(last: 20) {
            nodes { id author { login } bodyText createdAt url }
          }
          reviews(last: 10) {
            nodes {
              id
              author { login }
              state
              bodyText
              submittedAt
              url
              comments(first: 6) {
                nodes { id author { login } bodyText createdAt url }
              }
            }
          }
        }
      }
    }
  }
`;

export interface SocialPage {
  events: SocialEvent[];
  /** Where the next page starts; null when there is nothing older. */
  cursor: string | null;
}

/**
 * Older conversation on your pull requests, a page at a time.
 *
 * The inbox's feed is deliberately short — your *open* pull requests and the
 * last few words on each — because it is also the background check. Under
 * the greeting that made the page stop after a screenful. This walks back
 * through every pull request you have written, open or not, newest activity
 * first, and reads far more of each one; the `you` page asks for the next
 * page as it is scrolled.
 */
export async function fetchSocialPage(
  token: string,
  login: string,
  after: string | null,
  signal?: AbortSignal,
): Promise<SocialPage> {
  const data = await executeQuery(token, HISTORY_QUERY, historySchema, signal, {
    q: `is:pr author:${login} sort:updated-desc`,
    after,
  });
  const { pageInfo, nodes } = data.search;
  return {
    events: eventsFromPrs(nodes, login, false),
    cursor: pageInfo.hasNextPage ? pageInfo.endCursor : null,
  };
}

export const SOCIAL_FILTERS = [
  'all',
  'comments',
  'reviews',
  'mentions',
  'yours',
] as const;

export type SocialFilter = (typeof SOCIAL_FILTERS)[number];

const IN_FILTER: Record<SocialFilter, SocialKind[]> = {
  all: ['comment', 'review', 'review-request', 'mention', 'open'],
  comments: ['comment'],
  reviews: ['review', 'review-request'],
  mentions: ['mention'],
  yours: ['open'],
};

export function filterEvents(
  events: SocialEvent[],
  filter: SocialFilter,
): SocialEvent[] {
  const kinds = IN_FILTER[filter];
  return events.filter((event) => kinds.includes(event.kind));
}
