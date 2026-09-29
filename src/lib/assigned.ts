import { z } from 'zod';

import { executeQuery } from './github';

/**
 * What is yours to do: open issues and pull requests assigned to you, and the
 * issues you filed that are still open — across every repository, which is
 * the one view GitHub's own app keeps behind a search box.
 *
 * Each row carries when the thread last moved, because an assignment that
 * has been quiet for a month is a different thing from one argued about
 * this morning.
 */

export interface Task {
  kind: 'issue' | 'pull';
  repo: string;
  number: number;
  title: string;
  url: string;
  author: string;
  createdAt: string;
  updatedAt: string;
  replies: number;
  labels: string[];
  milestone: { title: string; dueOn: string | null } | null;
  draft: boolean;
}

export interface Tasks {
  assigned: Task[];
  assignedTotal: number;
  filed: Task[];
  filedTotal: number;
}

const PAGE = 40;

const FIELDS = /* GraphQL */ `
  __typename
  number
  title
  url
  createdAt
  updatedAt
  repository { nameWithOwner }
  author { login }
  comments { totalCount }
  labels(first: 4) { nodes { name } }
  milestone { title dueOn }
`;

const QUERY = /* GraphQL */ `
  query Tasks($assigned: String!, $filed: String!) {
    assigned: search(type: ISSUE, query: $assigned, first: ${PAGE}) {
      issueCount
      nodes {
        ... on Issue { ${FIELDS} }
        ... on PullRequest { ${FIELDS} isDraft }
      }
    }
    filed: search(type: ISSUE, query: $filed, first: ${PAGE}) {
      issueCount
      nodes {
        ... on Issue { ${FIELDS} }
      }
    }
  }
`;

const taskSchema = z.object({
  __typename: z.enum(['Issue', 'PullRequest']),
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  repository: z.object({ nameWithOwner: z.string() }),
  author: z.object({ login: z.string() }).nullable(),
  comments: z.object({ totalCount: z.number().int().nonnegative() }),
  labels: z.object({ nodes: z.array(z.object({ name: z.string() })) }).nullable(),
  milestone: z.object({ title: z.string(), dueOn: z.string().nullable() }).nullable(),
  isDraft: z.boolean().optional(),
});

const searchSchema = z.object({ issueCount: z.number().int(), nodes: z.array(z.unknown()) });
const responseSchema = z.object({ assigned: searchSchema, filed: searchSchema });

export function readTasks(nodes: readonly unknown[]): Task[] {
  const out: Task[] = [];
  for (const raw of nodes) {
    const parsed = taskSchema.safeParse(raw);
    // An empty `{}` is something the token cannot see.
    if (!parsed.success) continue;
    const node = parsed.data;
    out.push({
      kind: node.__typename === 'PullRequest' ? 'pull' : 'issue',
      repo: node.repository.nameWithOwner,
      number: node.number,
      title: node.title,
      url: node.url,
      author: node.author?.login ?? 'ghost',
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
      replies: node.comments.totalCount,
      labels: node.labels?.nodes.map((label) => label.name) ?? [],
      milestone: node.milestone,
      draft: node.isDraft ?? false,
    });
  }
  return out;
}

/**
 * Where a milestone's date stands, in words: `due in 3d`, `due today`,
 * `3d overdue`. Null when it has no date.
 */
export function dueLine(dueOn: string | null, now: Date = new Date()): string | null {
  if (!dueOn) return null;
  // GitHub stores the due date as a midnight UTC; compare calendar days.
  const due = Date.UTC(
    Number(dueOn.slice(0, 4)),
    Number(dueOn.slice(5, 7)) - 1,
    Number(dueOn.slice(8, 10)),
  );
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((due - today) / 86_400_000);
  if (days === 0) return 'due today';
  if (days > 0) return `due in ${days}d`;
  return `${-days}d overdue`;
}

export async function fetchTasks(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<Tasks> {
  const data = await executeQuery(token, QUERY, responseSchema, signal, {
    assigned: `is:open archived:false assignee:${login} sort:updated-desc`,
    filed: `is:open is:issue archived:false author:${login} sort:updated-desc`,
  });
  return {
    assigned: readTasks(data.assigned.nodes),
    assignedTotal: data.assigned.issueCount,
    filed: readTasks(data.filed.nodes),
    filedTotal: data.filed.issueCount,
  };
}
