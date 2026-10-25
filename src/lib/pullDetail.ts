import { z } from 'zod';

import { scanPatch } from './boundedPatch';
import { executeQuery, GitHubError } from './github';
import { optionalRead, type ReadFailure } from './optionalRead';
import { PULL_SUMMARY_FIELDS, pullSummarySchema, toPullSummary, type PullSummary } from './pullRequest';
import { REACTION_FIELDS, reactionGroupsSchema, toReactions, type Reaction } from './reactions';
import { rest } from './rest';

/**
 * The single detail loader for every PR entry point. The core is required;
 * conversation, management details and patches fail independently and carry
 * their errors to the UI. A forbidden extra must never hide a readable PR.
 */

const FILE_LIMIT = 20;
const COMMENT_LIMIT = 25;
const THREAD_LIMIT = 15;

export type CommentKind = 'comment' | 'review' | 'thread';

export interface PullComment {
  id: string;
  kind: CommentKind;
  author: string;
  /** Raw markdown — the screen renders it. */
  body: string;
  createdAt: string;
  url: string;
  /** APPROVED · CHANGES_REQUESTED · COMMENTED, on reviews only. */
  state?: string;
  /** The file a review thread is anchored to. */
  path?: string;
  /** The few lines of diff the thread is about. */
  diffHunk?: string;
  /** Threads only: whether the conversation was settled. */
  resolved?: boolean;
  /** Replies inside a review thread, oldest first. */
  replies?: PullComment[];
  /**
   * The comment's own node — what a reaction, an edit or a delete is aimed
   * at. For a thread, its first comment; `id` is the thread.
   */
  subjectId: string;
  /** Which mutation edits it: top-level talk is an issue comment, a thread is a review comment. */
  editKind: 'issue' | 'review' | null;
  canEdit: boolean;
  canDelete: boolean;
  reactions: Reaction[];
  /** Threads only. */
  canResolve?: boolean;
  canUnresolve?: boolean;
  canReply?: boolean;
}

export type DiffKind = 'add' | 'del' | 'context' | 'meta';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
  /** True when the patch was longer than `PATCH_LINES`. */
  truncated: boolean;
  /** Binary files and very large diffs come back from GitHub with no patch. */
  hasPatch: boolean;
}

export interface PullDetailFull extends PullSummary {
  /** Node id — what a reply or a review is attached to. */
  id: string;
  /** The head commit: where line comments land and where checks ran. */
  headSha: string;
  /** GitHub will not let you approve your own pull request. */
  viewerIsAuthor: boolean;
  author: string;
  baseRefName: string;
  headRefName: string;
  assignees: string[];
  /** People asked for a review who have not given one yet. */
  reviewers: string[];
  milestone: { number: number; title: string } | null;
  /** MERGEABLE · CONFLICTING · UNKNOWN (GitHub is still working it out). */
  mergeable: string;
  /** CLEAN · BEHIND · BLOCKED · DIRTY · UNSTABLE · DRAFT · HAS_HOOKS · UNKNOWN. */
  mergeState: string;
  /** The ways this repository allows a merge, in GitHub's order. */
  mergeMethods: ('MERGE' | 'SQUASH' | 'REBASE')[];
  autoMergeAllowed: boolean;
  autoMergeOn: boolean;
  /** Title, body, labels, state: what `viewerCanUpdate` guards. */
  canUpdate: boolean;
  canUpdateBranch: boolean;
  /** ADMIN · MAINTAIN · WRITE · TRIAGE · READ. */
  permission: string | null;
  locked: boolean;
  /** Where the head branch lives, and whether it still does. */
  headRepo: string | null;
  headRefExists: boolean;
  reactions: Reaction[];
  comments: PullComment[];
  files: DiffFile[];
  /** True when the file list was capped at `FILE_LIMIT`. */
  moreFiles: number;
  unavailable: Partial<Record<PullSection, ReadFailure>>;
}

export type PullSection = 'conversation' | 'details' | 'files';

const actor = z.object({ login: z.string() }).nullable();

const commentNode = z.object({
  id: z.string(),
  author: actor,
  body: z.string(),
  createdAt: z.string(),
  url: z.string(),
  viewerCanUpdate: z.boolean().optional(),
  viewerCanDelete: z.boolean().optional(),
  reactionGroups: reactionGroupsSchema,
});

const threadCommentNode = commentNode.extend({
  path: z.string().nullable(),
  diffHunk: z.string().nullable(),
});

const coreSchema = pullSummarySchema.extend({
  body: z.string(),
  id: z.string(),
  headRefOid: z.string(),
  viewerDidAuthor: z.boolean(),
  author: actor,
  baseRefName: z.string(),
  headRefName: z.string(),
  locked: z.boolean(),
  reactionGroups: reactionGroupsSchema,
});

const detailsSchema = z.object({
  assignees: z.object({ nodes: z.array(z.object({ login: z.string() })) }),
  reviewRequests: z
    .object({
      nodes: z.array(
        z.object({
          requestedReviewer: z
            .object({ login: z.string().optional(), slug: z.string().optional() })
            .nullable(),
        }),
      ),
    })
    .nullable(),
  milestone: z.object({ number: z.number().int(), title: z.string() }).nullable(),
  mergeable: z.string(),
  mergeStateStatus: z.string(),
  viewerCanUpdate: z.boolean(),
  viewerCanUpdateBranch: z.boolean(),
  autoMergeRequest: z.object({ enabledAt: z.string().nullable() }).nullable(),
  headRepository: z.object({ nameWithOwner: z.string() }).nullable(),
  headRef: z.object({ id: z.string() }).nullable(),
  repository: z.object({
    mergeCommitAllowed: z.boolean(),
    squashMergeAllowed: z.boolean(),
    rebaseMergeAllowed: z.boolean(),
    autoMergeAllowed: z.boolean(),
    viewerPermission: z.string().nullable(),
  }),
});

const conversationSchema = z.object({
  comments: z.object({ nodes: z.array(commentNode) }),
  reviews: z.object({
    nodes: z.array(
      commentNode.extend({ state: z.string(), submittedAt: z.string().nullable() }),
    ),
  }),
  reviewThreads: z.object({
    nodes: z.array(
      z.object({
        id: z.string(),
        isResolved: z.boolean(),
        viewerCanResolve: z.boolean(),
        viewerCanUnresolve: z.boolean(),
        viewerCanReply: z.boolean(),
        path: z.string().nullable(),
        comments: z.object({ nodes: z.array(threadCommentNode) }),
      }),
    ),
  }),
});

/** All PR queries use the same identity and strict response validation. */
async function readPull<T>(
  token: string, repo: string, number: number, operation: string,
  fields: string, schema: z.ZodType<T>, signal?: AbortSignal,
): Promise<T | null> {
  const [owner, name] = repo.split('/');
  const data = await executeQuery(token, `
    query ${operation}($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) { ${fields} }
      }
    }
  `, z.object({ repository: z.object({ pullRequest: schema.nullable() }).nullable() }),
  signal, { owner, name, number });
  return data.repository?.pullRequest ?? null;
}

async function requireSection<T>(read: Promise<T | null>): Promise<T> {
  const value = await read;
  if (value == null) throw new GitHubError('missing', 'GitHub did not return this part of the pull request.');
  return value;
}

const filesSchema = z.array(
  z.object({
    filename: z.string(),
    status: z.string(),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
    patch: z.string().optional(),
  }),
);

/**
 * The header of one pull request, with its description. `PULL_SUMMARY_FIELDS`
 * is shared with the thirty-request activity sample and deliberately omits the
 * body; a single opened request adds it back, because this read is for exactly
 * the one being drawn.
 */
const CORE_FIELDS = /* GraphQL */ `
  ${PULL_SUMMARY_FIELDS}
  body
  id headRefOid viewerDidAuthor author { login }
  baseRefName headRefName locked
  ${REACTION_FIELDS}
`;

const DETAILS_FIELDS = /* GraphQL */ `
  assignees(first: 10) { nodes { login } }
  reviewRequests(first: 10) {
    nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
  }
  milestone { number title }
  mergeable
  mergeStateStatus
  viewerCanUpdate
  viewerCanUpdateBranch
  autoMergeRequest { enabledAt }
  headRepository { nameWithOwner }
  headRef { id }
  repository {
    mergeCommitAllowed squashMergeAllowed rebaseMergeAllowed autoMergeAllowed viewerPermission
  }
`;

const CONVERSATION_FIELDS = /* GraphQL */ `
  comments(last: ${COMMENT_LIMIT}) {
    nodes {
      id author { login } body createdAt url viewerCanUpdate viewerCanDelete
      ${REACTION_FIELDS}
    }
  }
  reviews(last: ${COMMENT_LIMIT}) {
    nodes { id author { login } body createdAt url state submittedAt ${REACTION_FIELDS} }
  }
  reviewThreads(last: ${THREAD_LIMIT}) {
    nodes {
      id
      isResolved
      viewerCanResolve
      viewerCanUnresolve
      viewerCanReply
      path
      comments(first: 6) {
        nodes {
          id author { login } body createdAt url path diffHunk viewerCanUpdate viewerCanDelete
          ${REACTION_FIELDS}
        }
      }
    }
  }
`;

/**
 * The patch text GitHub sends for one file, turned into numbered lines.
 *
 * A unified diff carries its line numbers only in the `@@` headers; every
 * line after one is implicitly the next. Recovering them is the difference
 * between a diff you can talk about and a wall of green and red. The scan
 * stops at the retained-line cap rather than splitting the whole patch into
 * an array first, so a very large file never allocates every row.
 */
export function parsePatch(patch: string): { lines: DiffLine[]; truncated: boolean } {
  return scanPatch(patch);
}

async function fetchFiles(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<DiffFile[]> {
  const files = await rest(token, `/repos/${repo}/pulls/${number}/files?per_page=${FILE_LIMIT}`, {
    schema: filesSchema,
    signal,
  });
  return files.map((file) => {
    const { lines, truncated } = file.patch
      ? parsePatch(file.patch)
      : { lines: [], truncated: false };
    return {
      path: file.filename,
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      lines,
      truncated,
      hasPatch: Boolean(file.patch),
    };
  });
}

/** The part of a pull request the screen is actually showing. */
export type PullSlice = 'core' | PullSection;

function validPull(repo: string, number: number): boolean {
  const [owner, name] = repo.split('/');
  return Boolean(owner && name && Number.isInteger(number) && number > 0);
}

/**
 * Existence and the header, shaped like the full object with the other
 * sections empty. A screen can draw the title the moment this returns.
 * Conversation, merge controls and patches are separate reads.
 */
export async function fetchPullCore(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<{ node: z.infer<typeof coreSchema>; pull: PullDetailFull } | null> {
  if (!validPull(repo, number)) return null;
  const node = await readPull(token, repo, number, 'Pull', CORE_FIELDS, coreSchema, signal);
  if (!node) return null;
  return { node, pull: assemble(node, repo, null, [], [], {}) };
}

/** Talk, without waiting on details or files. */
export async function fetchPullConversation(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<PullComment[]> {
  const talk = await requireSection(
    readPull(token, repo, number, 'PullConversation', CONVERSATION_FIELDS, conversationSchema, signal),
  );
  return commentsFrom(talk);
}

/** Merge and side-column fields, without waiting on talk or files. */
export async function fetchPullDetails(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<z.infer<typeof detailsSchema>> {
  return requireSection(readPull(token, repo, number, 'PullDetails', DETAILS_FIELDS, detailsSchema, signal));
}

/** Fold a details read onto a core object. Missing details stay unknown. */
export function withDetails(core: PullDetailFull, meta: z.infer<typeof detailsSchema> | null): PullDetailFull {
  if (!meta) return core;
  return {
    ...core,
    assignees: meta.assignees.nodes.map((node) => node.login),
    reviewers: (meta.reviewRequests?.nodes ?? []).flatMap((node) => {
      const who = node.requestedReviewer?.login ?? node.requestedReviewer?.slug;
      return who ? [who] : [];
    }),
    milestone: meta.milestone,
    mergeable: meta.mergeable,
    mergeState: meta.mergeStateStatus,
    mergeMethods: [
      ...(meta.repository.mergeCommitAllowed ? (['MERGE'] as const) : []),
      ...(meta.repository.squashMergeAllowed ? (['SQUASH'] as const) : []),
      ...(meta.repository.rebaseMergeAllowed ? (['REBASE'] as const) : []),
    ],
    autoMergeAllowed: meta.repository.autoMergeAllowed,
    autoMergeOn: meta.autoMergeRequest != null,
    canUpdate: meta.viewerCanUpdate,
    canUpdateBranch: meta.viewerCanUpdateBranch,
    permission: meta.repository.viewerPermission,
    headRepo: meta.headRepository?.nameWithOwner ?? null,
    headRefExists: meta.headRef != null,
  };
}

/** Patches for the diff tab. A brief visit never calls this. */
export async function fetchPullFiles(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<DiffFile[]> {
  return fetchFiles(token, repo, number, signal);
}

function commentsFrom(talk: z.infer<typeof conversationSchema> | null): PullComment[] {
  return [
    ...(talk?.comments.nodes ?? []).map((node) => ({
      id: node.id,
      kind: 'comment' as const,
      author: node.author?.login ?? 'ghost',
      body: node.body,
      createdAt: node.createdAt,
      url: node.url,
      subjectId: node.id,
      editKind: 'issue' as const,
      canEdit: node.viewerCanUpdate ?? false,
      canDelete: node.viewerCanDelete ?? false,
      reactions: toReactions(node.reactionGroups),
    })),
    // A review with an empty body is just a state change; the chip for it is
    // already on the header, so an empty card would say nothing twice.
    ...(talk?.reviews.nodes ?? [])
      .filter((node) => node.body.trim().length > 0 || node.state === 'CHANGES_REQUESTED')
      .map((node) => ({
        id: node.id,
        kind: 'review' as const,
        author: node.author?.login ?? 'ghost',
        body: node.body,
        createdAt: node.submittedAt ?? node.createdAt,
        url: node.url,
        state: node.state,
        subjectId: node.id,
        editKind: null,
        canEdit: false,
        canDelete: false,
        reactions: toReactions(node.reactionGroups),
      })),
    ...(talk?.reviewThreads.nodes ?? []).flatMap((thread) => {
      const [head, ...rest] = thread.comments.nodes;
      if (!head) return [];
      return [
        {
          id: thread.id,
          kind: 'thread' as const,
          author: head.author?.login ?? 'ghost',
          body: head.body,
          createdAt: head.createdAt,
          url: head.url,
          path: thread.path ?? head.path ?? undefined,
          diffHunk: head.diffHunk ?? undefined,
          resolved: thread.isResolved,
          subjectId: head.id,
          editKind: 'review' as const,
          canEdit: head.viewerCanUpdate ?? false,
          canDelete: head.viewerCanDelete ?? false,
          reactions: toReactions(head.reactionGroups),
          canResolve: thread.viewerCanResolve,
          canUnresolve: thread.viewerCanUnresolve,
          canReply: thread.viewerCanReply,
          replies: rest.map((reply) => ({
            id: reply.id,
            kind: 'thread' as const,
            author: reply.author?.login ?? 'ghost',
            body: reply.body,
            createdAt: reply.createdAt,
            url: reply.url,
            subjectId: reply.id,
            editKind: 'review' as const,
            canEdit: reply.viewerCanUpdate ?? false,
            canDelete: reply.viewerCanDelete ?? false,
            reactions: toReactions(reply.reactionGroups),
          })),
        },
      ];
    }),
  ].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

type Details = z.infer<typeof detailsSchema> | null;

function assemble(
  pr: z.infer<typeof coreSchema>,
  repo: string,
  meta: Details,
  comments: PullComment[],
  files: DiffFile[],
  unavailable: PullDetailFull['unavailable'],
  reactions: Reaction[] = toReactions(pr.reactionGroups),
): PullDetailFull {
  return {
    ...toPullSummary(pr, repo),
    id: pr.id,
    headSha: pr.headRefOid,
    viewerIsAuthor: pr.viewerDidAuthor,
    author: pr.author?.login ?? 'ghost',
    baseRefName: pr.baseRefName,
    headRefName: pr.headRefName,
    assignees: (meta?.assignees.nodes ?? []).map((node) => node.login),
    reviewers: (meta?.reviewRequests?.nodes ?? []).flatMap((node) => {
      const who = node.requestedReviewer?.login ?? node.requestedReviewer?.slug;
      return who ? [who] : [];
    }),
    milestone: meta?.milestone ?? null,
    mergeable: meta?.mergeable ?? 'UNKNOWN',
    mergeState: meta?.mergeStateStatus ?? 'UNKNOWN',
    mergeMethods: [
      ...(meta?.repository.mergeCommitAllowed ? (['MERGE'] as const) : []),
      ...(meta?.repository.squashMergeAllowed ? (['SQUASH'] as const) : []),
      ...(meta?.repository.rebaseMergeAllowed ? (['REBASE'] as const) : []),
    ],
    autoMergeAllowed: meta?.repository.autoMergeAllowed ?? false,
    autoMergeOn: meta?.autoMergeRequest != null,
    canUpdate: meta?.viewerCanUpdate ?? false,
    canUpdateBranch: meta?.viewerCanUpdateBranch ?? false,
    permission: meta?.repository.viewerPermission ?? null,
    locked: pr.locked,
    headRepo: meta?.headRepository?.nameWithOwner ?? null,
    headRefExists: meta?.headRef != null,
    reactions,
    comments,
    files,
    moreFiles: Math.max(0, pr.changedFiles - files.length),
    unavailable,
  };
}

/**
 * Load the same object, with the same failure rules, from every route.
 *
 * The four reads still start together here so a caller that wants the whole
 * object keeps one answer. The screen does not use this: it asks for core
 * first and for each other section when that tab is the one being drawn.
 */
export async function fetchPullDetail(
  token: string,
  repo: string,
  number: number,
  signal?: AbortSignal,
): Promise<PullDetailFull | null> {
  if (!validPull(repo, number)) return null;

  const [pr, conversation, details, patches] = await Promise.all([
    fetchPullCore(token, repo, number, signal),
    optionalRead(fetchPullConversation(token, repo, number, signal)),
    optionalRead(fetchPullDetails(token, repo, number, signal)),
    optionalRead(fetchPullFiles(token, repo, number, signal)),
  ]);
  if (!pr) return null;

  const unavailable: PullDetailFull['unavailable'] = {};
  if (conversation.error) unavailable.conversation = conversation.error;
  if (details.error) unavailable.details = details.error;
  if (patches.error) unavailable.files = patches.error;

  return assemble(
    pr.node,
    repo,
    details.data,
    conversation.data ?? [],
    patches.data ?? [],
    unavailable,
    pr.pull.reactions,
  );
}
