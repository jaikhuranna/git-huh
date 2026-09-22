import { z } from 'zod';

import { executeQuery } from './github';

/**
 * An issue or a discussion, read in full: the opening post, the replies, and
 * for a discussion the replies to replies. It is the same shape either way,
 * which is why one screen draws both — and why an issue in the inbox no
 * longer leaves for the browser.
 */

export interface ThreadComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  url: string;
  /** Discussions only: the reply marked as the answer. */
  isAnswer?: boolean;
  replies: ThreadComment[];
}

export interface Thread {
  type: 'issue' | 'discussion';
  /** Node id — what a reply is attached to. */
  id: string;
  number: number;
  repo: string;
  title: string;
  url: string;
  body: string;
  /** OPEN · CLOSED for issues; ANSWERED · OPEN for discussions. */
  state: string;
  author: string;
  createdAt: string;
  labels: { name: string; color: string }[];
  category: string | null;
  comments: ThreadComment[];
  /** Replies GitHub has that were not fetched. */
  moreComments: number;
}

const COMMENTS = 40;

const actor = z.object({ login: z.string() }).nullable();
const comment = z.object({
  id: z.string(),
  author: actor,
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
});

const issueSchema = z.object({
  repository: z
    .object({
      issue: z
        .object({
          id: z.string(),
          number: z.number().int(),
          title: z.string(),
          url: z.string(),
          body: z.string(),
          state: z.string(),
          createdAt: z.string(),
          author: actor,
          labels: z.object({ nodes: z.array(z.object({ name: z.string(), color: z.string() })) }).nullable(),
          comments: z.object({ totalCount: z.number(), nodes: z.array(comment) }),
        })
        .nullable(),
    })
    .nullable(),
});

const discussionSchema = z.object({
  repository: z
    .object({
      discussion: z
        .object({
          id: z.string(),
          number: z.number().int(),
          title: z.string(),
          url: z.string(),
          body: z.string(),
          createdAt: z.string(),
          author: actor,
          isAnswered: z.boolean().nullable(),
          answer: z.object({ id: z.string() }).nullable(),
          category: z.object({ name: z.string() }),
          comments: z.object({
            totalCount: z.number(),
            nodes: z.array(comment.extend({ replies: z.object({ nodes: z.array(comment) }) })),
          }),
        })
        .nullable(),
    })
    .nullable(),
});

function toComment(node: z.infer<typeof comment>): ThreadComment {
  return {
    id: node.id,
    author: node.author?.login ?? 'ghost',
    body: node.body,
    createdAt: node.createdAt,
    url: node.url,
    replies: [],
  };
}

export async function fetchThread(
  token: string,
  repo: string,
  number: number,
  type: 'issue' | 'discussion',
  signal?: AbortSignal,
): Promise<Thread | null> {
  const [owner, name] = repo.split('/');
  if (!owner || !name) return null;
  const where = `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)})`;

  if (type === 'issue') {
    const data = await executeQuery(
      token,
      /* GraphQL */ `
        query Issue {
          ${where} {
            issue(number: ${number}) {
              id number title url body state createdAt
              author { login }
              labels(first: 8) { nodes { name color } }
              comments(last: ${COMMENTS}) {
                totalCount
                nodes { id author { login } body createdAt url }
              }
            }
          }
        }
      `,
      issueSchema,
      signal,
    );
    const issue = data.repository?.issue;
    if (!issue) return null;
    return {
      type,
      id: issue.id,
      number: issue.number,
      repo,
      title: issue.title,
      url: issue.url,
      body: issue.body,
      state: issue.state,
      author: issue.author?.login ?? 'ghost',
      createdAt: issue.createdAt,
      labels: issue.labels?.nodes ?? [],
      category: null,
      comments: issue.comments.nodes.map(toComment),
      moreComments: Math.max(0, issue.comments.totalCount - issue.comments.nodes.length),
    };
  }

  const data = await executeQuery(
    token,
    /* GraphQL */ `
      query Discussion {
        ${where} {
          discussion(number: ${number}) {
            id number title url body createdAt isAnswered
            author { login }
            answer { id }
            category { name }
            comments(first: ${COMMENTS}) {
              totalCount
              nodes {
                id author { login } body createdAt url
                replies(first: 10) { nodes { id author { login } body createdAt url } }
              }
            }
          }
        }
      }
    `,
    discussionSchema,
    signal,
  );
  const discussion = data.repository?.discussion;
  if (!discussion) return null;
  return {
    type,
    id: discussion.id,
    number: discussion.number,
    repo,
    title: discussion.title,
    url: discussion.url,
    body: discussion.body,
    state: discussion.isAnswered ? 'ANSWERED' : 'OPEN',
    author: discussion.author?.login ?? 'ghost',
    createdAt: discussion.createdAt,
    labels: [],
    category: discussion.category.name,
    comments: discussion.comments.nodes.map((node) => ({
      ...toComment(node),
      isAnswer: discussion.answer?.id === node.id,
      replies: node.replies.nodes.map(toComment),
    })),
    moreComments: Math.max(0, discussion.comments.totalCount - discussion.comments.nodes.length),
  };
}
