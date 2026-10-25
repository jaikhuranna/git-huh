import { Buffer } from 'buffer';
import { z } from 'zod';

import { encodePath } from './encodePath';
import { forkOf } from './forkRepo';
import { executeMutation } from './github';
import type { ReactionContent } from './reactions';
import { rest } from './rest';

export { encodePath };

/**
 * Everything the app can change on GitHub, in one place.
 *
 * An app that only reads makes triage end in "open the laptop" — the most
 * common reason people give for a phone app being half a tool. These are
 * the writes that finish a triage: reply, review, comment on a
 * line, open an issue, close one, and make the small change yourself. Each
 * one is a single request the person has pressed a named button for; none
 * of them happen in the background.
 */

const ok = z.unknown();

/** A reply at the bottom of a pull request's or an issue's conversation. */
export async function addComment(token: string, subjectId: string, body: string) {
  await executeMutation(
    token,
    /* GraphQL */ `
      mutation Reply($subjectId: ID!, $body: String!) {
        addComment(input: { subjectId: $subjectId, body: $body }) { clientMutationId }
      }
    `,
    ok,
    { subjectId, body },
  );
}

export type ReviewEvent = 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';

/** A whole review: approve, request changes, or a review-level comment. */
export async function submitReview(
  token: string,
  pullRequestId: string,
  event: ReviewEvent,
  body: string,
) {
  await executeMutation(
    token,
    /* GraphQL */ `
      mutation Review($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String) {
        addPullRequestReview(
          input: { pullRequestId: $pullRequestId, event: $event, body: $body }
        ) { clientMutationId }
      }
    `,
    ok,
    { pullRequestId, event, body: body || null },
  );
}

/**
 * A comment on one line of the diff — any line, including the unchanged
 * ones around a change, which is where half of review comments belong and
 * which GitHub's own phone app could not do until 2025.
 */
export async function commentOnLine(
  token: string,
  repo: string,
  number: number,
  target: { commitId: string; path: string; line: number; side: 'LEFT' | 'RIGHT' },
  body: string,
) {
  await rest(token, `/repos/${repo}/pulls/${number}/comments`, {
    method: 'POST',
    body: {
      body,
      commit_id: target.commitId,
      path: target.path,
      line: target.line,
      side: target.side,
    },
  });
}

export async function addDiscussionComment(
  token: string,
  discussionId: string,
  body: string,
) {
  await executeMutation(
    token,
    /* GraphQL */ `
      mutation Discuss($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
          clientMutationId
        }
      }
    `,
    ok,
    { discussionId, body },
  );
}

export async function setIssueState(
  token: string,
  repo: string,
  number: number,
  state: 'open' | 'closed',
) {
  await rest(token, `/repos/${repo}/issues/${number}`, {
    method: 'PATCH',
    body: { state },
  });
}

const createdIssue = z.object({ number: z.number().int(), html_url: z.string() });

export async function createIssue(
  token: string,
  repo: string,
  issue: { title: string; body: string; labels: string[] },
): Promise<{ number: number; url: string }> {
  const made = await rest(token, `/repos/${repo}/issues`, {
    method: 'POST',
    body: {
      title: issue.title,
      body: issue.body,
      ...(issue.labels.length > 0 ? { labels: issue.labels } : {}),
    },
    schema: createdIssue,
  });
  return { number: made.number, url: made.html_url };
}

// ---------------------------------------------------------------------------
// The small change: edit a file, and either commit it or propose it.

export interface Proposal {
  repo: string;
  path: string;
  /** Blob sha of the file as it was read — GitHub refuses a stale write. */
  sha: string;
  /** The branch the file was read from. */
  base: string;
  text: string;
  message: string;
  login: string;
}

export type ProposalResult =
  | { kind: 'committed'; sha: string; branch: string }
  | { kind: 'pull'; repo: string; number: number };

const refSchema = z.object({ object: z.object({ sha: z.string() }) });
const contentWrite = z.object({ commit: z.object({ sha: z.string() }) });
const pullMade = z.object({ number: z.number().int() });
const repoSchema = z.object({ default_branch: z.string() });

function encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

/**
 * The branch a file was read from, by name. A file opened from a code search
 * result was read from the default branch without naming it.
 */
async function baseOf(token: string, proposal: Proposal): Promise<string> {
  if (proposal.base) return proposal.base;
  const repo = await rest(token, `/repos/${proposal.repo}`, { schema: repoSchema });
  return repo.default_branch;
}

/** Commit straight onto the branch the file came from. One write, not a proposal. */
export async function commitDirect(token: string, proposal: Proposal): Promise<ProposalResult> {
  const branch = await baseOf(token, proposal);
  const written = await rest(token, `/repos/${proposal.repo}/contents/${encodePath(proposal.path)}`, {
    method: 'PUT',
    body: {
      message: proposal.message,
      content: encode(proposal.text),
      sha: proposal.sha,
      branch,
    },
    schema: contentWrite,
  });
  return { kind: 'committed', sha: written.commit.sha, branch };
}

export interface ProposeOptions {
  /** Stops a wait. A branch or commit already made is left where it is. */
  signal?: AbortSignal;
  /** Who the unfinished proposal belongs to, so a later open can finish it. */
  account?: string | null;
}

/**
 * Commit onto a fresh branch and open a pull request from it — the default,
 * because a change made on a phone deserves a second look.
 *
 * The fork, branch, commit and pull request are one resumable operation.
 * `proposalWrites` owns that protocol; these stay the names screens call.
 * Proposing again for the same file, or opening the pull request for one
 * whose branch or commit already exists, runs only the steps that have not
 * happened — and a step whose reply was lost is read back before it is sent.
 */
export { proposeChange, resumeProposal } from './proposalWrites';

// ---------------------------------------------------------------------------
// Everything else a person does to an issue, a pull request or a discussion
// once they have read it: react, edit what they said, take it back, label,
// assign, lock, follow, and — for a pull request — merge.

async function mutate(token: string, mutation: string, variables: Record<string, unknown>) {
  await executeMutation(token, mutation, ok, variables);
}

/** Any reactable thing: an issue, a pull request, a comment, a discussion. */
export async function setReaction(
  token: string,
  subjectId: string,
  content: ReactionContent,
  on: boolean,
) {
  await mutate(
    token,
    on
      ? /* GraphQL */ `mutation React($subjectId: ID!, $content: ReactionContent!) {
          addReaction(input: { subjectId: $subjectId, content: $content }) { clientMutationId }
        }`
      : /* GraphQL */ `mutation Unreact($subjectId: ID!, $content: ReactionContent!) {
          removeReaction(input: { subjectId: $subjectId, content: $content }) { clientMutationId }
        }`,
    { subjectId, content },
  );
}

/**
 * Which kind of comment a node is decides which mutation edits it: GitHub has
 * one per kind and no generic one.
 */
export type CommentKind = 'issue' | 'review' | 'discussion';

const EDIT: Record<CommentKind, string> = {
  issue: 'updateIssueComment',
  review: 'updatePullRequestReviewComment',
  discussion: 'updateDiscussionComment',
};
const EDIT_FIELD: Record<CommentKind, string> = {
  issue: 'id',
  review: 'pullRequestReviewCommentId',
  discussion: 'commentId',
};
const DELETE: Record<CommentKind, string> = {
  issue: 'deleteIssueComment',
  review: 'deletePullRequestReviewComment',
  discussion: 'deleteDiscussionComment',
};

export async function editComment(token: string, kind: CommentKind, id: string, body: string) {
  await mutate(
    token,
    `mutation Edit($id: ID!, $body: String!) {
      ${EDIT[kind]}(input: { ${EDIT_FIELD[kind]}: $id, body: $body }) { clientMutationId }
    }`,
    { id, body },
  );
}

export async function deleteComment(token: string, kind: CommentKind, id: string) {
  await mutate(
    token,
    `mutation Delete($id: ID!) { ${DELETE[kind]}(input: { id: $id }) { clientMutationId } }`,
    { id },
  );
}

/** Title and body of an issue or a pull request — both live on the issues endpoint. */
export async function editIssue(
  token: string,
  repo: string,
  number: number,
  change: { title?: string; body?: string },
) {
  await rest(token, `/repos/${repo}/issues/${number}`, { method: 'PATCH', body: change });
}

/** Close as done or as not planned, or open again — issues and pull requests alike. */
export async function closeIssue(
  token: string,
  repo: string,
  number: number,
  reason: 'completed' | 'not_planned',
) {
  await rest(token, `/repos/${repo}/issues/${number}`, {
    method: 'PATCH',
    body: { state: 'closed', state_reason: reason },
  });
}

/** The whole set of labels, replacing what was there. */
export async function setLabels(token: string, repo: string, number: number, labels: string[]) {
  await rest(token, `/repos/${repo}/issues/${number}/labels`, {
    method: 'PUT',
    body: { labels },
  });
}

export async function setAssignees(
  token: string,
  repo: string,
  number: number,
  before: string[],
  after: string[],
) {
  const added = after.filter((login) => !before.includes(login));
  const removed = before.filter((login) => !after.includes(login));
  if (added.length > 0) {
    await rest(token, `/repos/${repo}/issues/${number}/assignees`, {
      method: 'POST',
      body: { assignees: added },
    });
  }
  if (removed.length > 0) {
    await rest(token, `/repos/${repo}/issues/${number}/assignees`, {
      method: 'DELETE',
      body: { assignees: removed },
    });
  }
}

/** A milestone by its number, or none. */
export async function setMilestone(
  token: string,
  repo: string,
  number: number,
  milestone: number | null,
) {
  await rest(token, `/repos/${repo}/issues/${number}`, { method: 'PATCH', body: { milestone } });
}

export async function setLocked(token: string, repo: string, number: number, locked: boolean) {
  await rest(token, `/repos/${repo}/issues/${number}/lock`, {
    method: locked ? 'PUT' : 'DELETE',
  });
}

export async function setPinned(token: string, issueId: string, pinned: boolean) {
  await mutate(
    token,
    `mutation Pin($issueId: ID!) {
      ${pinned ? 'pinIssue' : 'unpinIssue'}(input: { issueId: $issueId }) { clientMutationId }
    }`,
    { issueId },
  );
}

export type Watch = 'watching' | 'participating' | 'ignoring';

/**
 * Watch a repository, watch only what involves you, or ignore it. The REST
 * endpoint, because GraphQL's `updateSubscription` needs the `notifications`
 * scope, which this app never asks for — and so following one thread is not
 * something it can do.
 */
export async function setWatch(token: string, repo: string, watch: Watch) {
  if (watch === 'participating') {
    await rest(token, `/repos/${repo}/subscription`, { method: 'DELETE' });
  } else {
    await rest(token, `/repos/${repo}/subscription`, {
      method: 'PUT',
      body: { subscribed: watch === 'watching', ignored: watch === 'ignoring' },
    });
  }
}

// --- pull requests ----------------------------------------------------------

export type MergeMethod = 'MERGE' | 'SQUASH' | 'REBASE';

/**
 * Merge, pinned to the head the person was looking at: if someone pushed
 * while they read, GitHub refuses rather than merging what nobody reviewed.
 */
export async function mergePull(
  token: string,
  pullRequestId: string,
  method: MergeMethod,
  expectedHeadOid: string,
) {
  await mutate(
    token,
    /* GraphQL */ `mutation Merge($pullRequestId: ID!, $method: PullRequestMergeMethod!, $head: GitObjectID) {
      mergePullRequest(
        input: { pullRequestId: $pullRequestId, mergeMethod: $method, expectedHeadOid: $head }
      ) { clientMutationId }
    }`,
    { pullRequestId, method, head: expectedHeadOid },
  );
}

/** Merge on its own once the checks and reviews it is waiting on are done. */
export async function setAutoMerge(
  token: string,
  pullRequestId: string,
  method: MergeMethod | null,
) {
  if (method) {
    await mutate(
      token,
      /* GraphQL */ `mutation Auto($pullRequestId: ID!, $method: PullRequestMergeMethod!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId, mergeMethod: $method }) {
          clientMutationId
        }
      }`,
      { pullRequestId, method },
    );
  } else {
    await mutate(
      token,
      /* GraphQL */ `mutation NoAuto($pullRequestId: ID!) {
        disablePullRequestAutoMerge(input: { pullRequestId: $pullRequestId }) { clientMutationId }
      }`,
      { pullRequestId },
    );
  }
}

export async function setPullOpen(token: string, pullRequestId: string, open: boolean) {
  await mutate(
    token,
    `mutation State($pullRequestId: ID!) {
      ${open ? 'reopenPullRequest' : 'closePullRequest'}(input: { pullRequestId: $pullRequestId }) {
        clientMutationId
      }
    }`,
    { pullRequestId },
  );
}

export async function setDraft(token: string, pullRequestId: string, draft: boolean) {
  await mutate(
    token,
    `mutation Draft($pullRequestId: ID!) {
      ${draft ? 'convertPullRequestToDraft' : 'markPullRequestReadyForReview'}(
        input: { pullRequestId: $pullRequestId }
      ) { clientMutationId }
    }`,
    { pullRequestId },
  );
}

/** Bring the base branch into the head: GitHub's `update branch`. */
export async function updatePullBranch(token: string, pullRequestId: string, rebase = false) {
  await mutate(
    token,
    /* GraphQL */ `mutation Update($pullRequestId: ID!, $method: PullRequestBranchUpdateMethod) {
      updatePullRequestBranch(input: { pullRequestId: $pullRequestId, updateMethod: $method }) {
        clientMutationId
      }
    }`,
    { pullRequestId, method: rebase ? 'REBASE' : 'MERGE' },
  );
}

export async function requestReviewers(
  token: string,
  repo: string,
  number: number,
  before: string[],
  after: string[],
) {
  const added = after.filter((login) => !before.includes(login));
  const removed = before.filter((login) => !after.includes(login));
  if (added.length > 0) {
    await rest(token, `/repos/${repo}/pulls/${number}/requested_reviewers`, {
      method: 'POST',
      body: { reviewers: added },
    });
  }
  if (removed.length > 0) {
    await rest(token, `/repos/${repo}/pulls/${number}/requested_reviewers`, {
      method: 'DELETE',
      body: { reviewers: removed },
    });
  }
}

/** A reply inside a review thread, under the line it is about. */
export async function replyToThread(token: string, threadId: string, body: string) {
  await mutate(
    token,
    /* GraphQL */ `mutation ThreadReply($threadId: ID!, $body: String!) {
      addPullRequestReviewThreadReply(input: { pullRequestReviewThreadId: $threadId, body: $body }) {
        clientMutationId
      }
    }`,
    { threadId, body },
  );
}

export async function setThreadResolved(token: string, threadId: string, resolved: boolean) {
  await mutate(
    token,
    `mutation Resolve($threadId: ID!) {
      ${resolved ? 'resolveReviewThread' : 'unresolveReviewThread'}(input: { threadId: $threadId }) {
        clientMutationId
      }
    }`,
    { threadId },
  );
}

/** Take back a review that asked for changes, with the reason. */
export async function dismissReview(token: string, reviewId: string, message: string) {
  await mutate(
    token,
    /* GraphQL */ `mutation Dismiss($reviewId: ID!, $message: String!) {
      dismissPullRequestReview(input: { pullRequestReviewId: $reviewId, message: $message }) {
        clientMutationId
      }
    }`,
    { reviewId, message },
  );
}

export async function createPull(
  token: string,
  repo: string,
  pull: { title: string; body: string; head: string; base: string; draft: boolean },
): Promise<number> {
  const made = await rest(token, `/repos/${repo}/pulls`, {
    method: 'POST',
    body: pull,
    schema: pullMade,
  });
  return made.number;
}

// --- discussions ------------------------------------------------------------

/** A reply to one reply, which is as deep as GitHub nests a discussion. */
export async function replyInDiscussion(
  token: string,
  discussionId: string,
  replyToId: string,
  body: string,
) {
  await mutate(
    token,
    /* GraphQL */ `mutation Nested($discussionId: ID!, $replyToId: ID!, $body: String!) {
      addDiscussionComment(input: { discussionId: $discussionId, replyToId: $replyToId, body: $body }) {
        clientMutationId
      }
    }`,
    { discussionId, replyToId, body },
  );
}

export async function setAnswer(token: string, commentId: string, answer: boolean) {
  await mutate(
    token,
    `mutation Answer($id: ID!) {
      ${answer ? 'markDiscussionCommentAsAnswer' : 'unmarkDiscussionCommentAsAnswer'}(input: { id: $id }) {
        clientMutationId
      }
    }`,
    { id: commentId },
  );
}

/** A discussion or one of its replies, voted up. */
export async function setUpvote(token: string, subjectId: string, on: boolean) {
  await mutate(
    token,
    `mutation Vote($subjectId: ID!) {
      ${on ? 'addUpvote' : 'removeUpvote'}(input: { subjectId: $subjectId }) { clientMutationId }
    }`,
    { subjectId },
  );
}

export async function setDiscussionOpen(token: string, discussionId: string, open: boolean) {
  await mutate(
    token,
    open
      ? `mutation Reopen($id: ID!) { reopenDiscussion(input: { discussionId: $id }) { clientMutationId } }`
      : `mutation Close($id: ID!) {
          closeDiscussion(input: { discussionId: $id, reason: RESOLVED }) { clientMutationId }
        }`,
    { id: discussionId },
  );
}

export async function editDiscussion(
  token: string,
  discussionId: string,
  change: { title?: string; body?: string },
) {
  await mutate(
    token,
    /* GraphQL */ `mutation EditDiscussion($id: ID!, $title: String, $body: String) {
      updateDiscussion(input: { discussionId: $id, title: $title, body: $body }) { clientMutationId }
    }`,
    { id: discussionId, title: change.title ?? null, body: change.body ?? null },
  );
}

const madeDiscussion = z.object({
  createDiscussion: z.object({ discussion: z.object({ number: z.number().int() }) }),
});

export async function createDiscussion(
  token: string,
  repositoryId: string,
  categoryId: string,
  title: string,
  body: string,
): Promise<number> {
  const data = await executeMutation(
    token,
    /* GraphQL */ `mutation NewDiscussion($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
      createDiscussion(
        input: { repositoryId: $repositoryId, categoryId: $categoryId, title: $title, body: $body }
      ) { discussion { number } }
    }`,
    madeDiscussion,
    { repositoryId, categoryId, title, body },
  );
  return data.createDiscussion.discussion.number;
}

// --- repositories -----------------------------------------------------------

export async function setStarred(token: string, starrableId: string, starred: boolean) {
  await mutate(
    token,
    `mutation Star($id: ID!) {
      ${starred ? 'addStar' : 'removeStar'}(input: { starrableId: $id }) { clientMutationId }
    }`,
    { id: starrableId },
  );
}

/** A fork under your own account, once GitHub has finished making it. */
export async function forkRepo(token: string, repo: string): Promise<string> {
  const fork = await forkOf(token, repo);
  return fork.full_name;
}

const madeRepo = z.object({ full_name: z.string() });

export async function createRepo(
  token: string,
  repo: { name: string; description: string; private: boolean; readme: boolean },
): Promise<string> {
  const made = await rest(token, '/user/repos', {
    method: 'POST',
    body: {
      name: repo.name,
      description: repo.description,
      private: repo.private,
      auto_init: repo.readme,
    },
    schema: madeRepo,
  });
  return made.full_name;
}

export async function createBranch(token: string, repo: string, name: string, from: string) {
  const base = await rest(token, `/repos/${repo}/git/ref/heads/${encodePath(from)}`, {
    schema: refSchema,
  });
  await rest(token, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${name}`, sha: base.object.sha },
  });
}

export async function deleteBranch(token: string, repo: string, name: string) {
  await rest(token, `/repos/${repo}/git/refs/heads/${encodePath(name)}`, { method: 'DELETE' });
}

/** A file that did not exist, committed onto `branch`. */
export async function createFile(
  token: string,
  repo: string,
  file: { path: string; text: string; message: string; branch: string },
) {
  await rest(token, `/repos/${repo}/contents/${encodePath(file.path)}`, {
    method: 'PUT',
    body: {
      message: file.message,
      content: encode(file.text),
      ...(file.branch ? { branch: file.branch } : {}),
    },
    schema: contentWrite,
  });
}

export async function deleteFile(
  token: string,
  repo: string,
  file: { path: string; sha: string; message: string; branch: string },
) {
  await rest(token, `/repos/${repo}/contents/${encodePath(file.path)}`, {
    method: 'DELETE',
    body: {
      message: file.message,
      sha: file.sha,
      ...(file.branch ? { branch: file.branch } : {}),
    },
  });
}

const madeRelease = z.object({ html_url: z.string() });

export async function createRelease(
  token: string,
  repo: string,
  release: {
    tag: string;
    target: string;
    name: string;
    body: string;
    draft: boolean;
    prerelease: boolean;
    generateNotes: boolean;
  },
): Promise<string> {
  const made = await rest(token, `/repos/${repo}/releases`, {
    method: 'POST',
    body: {
      tag_name: release.tag,
      ...(release.target ? { target_commitish: release.target } : {}),
      name: release.name || release.tag,
      body: release.body,
      draft: release.draft,
      prerelease: release.prerelease,
      generate_release_notes: release.generateNotes,
    },
    schema: madeRelease,
  });
  return made.html_url;
}

export async function deleteRelease(token: string, repo: string, id: number) {
  await rest(token, `/repos/${repo}/releases/${id}`, { method: 'DELETE' });
}

export type DismissReason =
  | 'fix_started'
  | 'inaccurate'
  | 'no_bandwidth'
  | 'not_used'
  | 'tolerable_risk';

export async function setAlertDismissed(
  token: string,
  repo: string,
  number: number,
  reason: DismissReason | null,
  comment = '',
) {
  await rest(token, `/repos/${repo}/dependabot/alerts/${number}`, {
    method: 'PATCH',
    body: reason
      ? { state: 'dismissed', dismissed_reason: reason, dismissed_comment: comment || undefined }
      : { state: 'open' },
  });
}

// --- people and gists -------------------------------------------------------

export async function setFollowing(token: string, login: string, follow: boolean) {
  await rest(token, `/user/following/${encodeURIComponent(login)}`, {
    method: follow ? 'PUT' : 'DELETE',
  });
}

const madeGist = z.object({ id: z.string() });

export async function createGist(
  token: string,
  gist: { description: string; filename: string; text: string; public: boolean },
): Promise<string> {
  const made = await rest(token, '/gists', {
    method: 'POST',
    body: {
      description: gist.description,
      public: gist.public,
      files: { [gist.filename]: { content: gist.text } },
    },
    schema: madeGist,
  });
  return made.id;
}

export async function deleteGist(token: string, id: string) {
  await rest(token, `/gists/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function setGistStarred(token: string, id: string, starred: boolean) {
  await rest(token, `/gists/${encodeURIComponent(id)}/star`, { method: starred ? 'PUT' : 'DELETE' });
}
