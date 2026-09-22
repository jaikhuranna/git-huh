import { Buffer } from 'buffer';
import { z } from 'zod';

import { executeQuery, GitHubError } from './github';
import { rest } from './rest';

/**
 * Everything the app can change on GitHub, in one place.
 *
 * git-huh read and never wrote, which made triage end in "open the laptop"
 * — the most common reason people give for the phone app being half a tool.
 * These are the writes that finish a triage: reply, review, comment on a
 * line, open an issue, close one, and make the small change yourself. Each
 * one is a single request the person has pressed a named button for; none
 * of them happen in the background.
 */

const ok = z.unknown();

/** A reply at the bottom of a pull request's or an issue's conversation. */
export async function addComment(token: string, subjectId: string, body: string) {
  await executeQuery(
    token,
    /* GraphQL */ `
      mutation Reply($subjectId: ID!, $body: String!) {
        addComment(input: { subjectId: $subjectId, body: $body }) { clientMutationId }
      }
    `,
    ok,
    undefined,
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
  await executeQuery(
    token,
    /* GraphQL */ `
      mutation Review($pullRequestId: ID!, $event: PullRequestReviewEvent!, $body: String) {
        addPullRequestReview(
          input: { pullRequestId: $pullRequestId, event: $event, body: $body }
        ) { clientMutationId }
      }
    `,
    ok,
    undefined,
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
  await executeQuery(
    token,
    /* GraphQL */ `
      mutation Discuss($discussionId: ID!, $body: String!) {
        addDiscussionComment(input: { discussionId: $discussionId, body: $body }) {
          clientMutationId
        }
      }
    `,
    ok,
    undefined,
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
const forkSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  default_branch: z.string(),
});

function encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function putFile(
  token: string,
  repo: string,
  proposal: Proposal,
  branch: string,
): Promise<string> {
  const written = await rest(token, `/repos/${repo}/contents/${encodePath(proposal.path)}`, {
    method: 'PUT',
    body: {
      message: proposal.message,
      content: encode(proposal.text),
      sha: proposal.sha,
      branch,
    },
    schema: contentWrite,
  });
  return written.commit.sha;
}

/** Commit straight onto the branch the file came from. */
export async function commitDirect(token: string, proposal: Proposal): Promise<ProposalResult> {
  const sha = await putFile(token, proposal.repo, proposal, proposal.base);
  return { kind: 'committed', sha, branch: proposal.base };
}

/**
 * Commit onto a fresh branch and open a pull request from it — the default,
 * because a change made on a phone deserves a second look.
 *
 * If the token cannot create a branch in the repository, the change goes
 * through a fork, which is what the website does for anyone who is not a
 * collaborator: fork, branch, commit, and a pull request back upstream.
 */
export async function proposeChange(token: string, proposal: Proposal): Promise<ProposalResult> {
  const branch = await freshBranchName(token, proposal);

  let headRepo = proposal.repo;
  let headOwner: string | null = null;
  try {
    await createBranch(token, proposal.repo, proposal.base, branch);
  } catch (error) {
    if (!(error instanceof GitHubError) || (error.kind !== 'forbidden' && error.kind !== 'missing')) {
      throw error;
    }
    const fork = await forkOf(token, proposal.repo);
    headRepo = fork.full_name;
    headOwner = fork.owner.login;
    await createBranch(token, headRepo, proposal.base, branch);
  }

  await putFile(token, headRepo, proposal, branch);

  const pull = await rest(token, `/repos/${proposal.repo}/pulls`, {
    method: 'POST',
    body: {
      title: proposal.message.split('\n')[0],
      head: headOwner ? `${headOwner}:${branch}` : branch,
      base: proposal.base,
      body: proposal.message.includes('\n')
        ? proposal.message.split('\n').slice(1).join('\n').trim()
        : '',
    },
    schema: pullMade,
  });
  return { kind: 'pull', repo: proposal.repo, number: pull.number };
}

async function createBranch(token: string, repo: string, from: string, branch: string) {
  const base = await rest(token, `/repos/${repo}/git/ref/heads/${encodePath(from)}`, {
    schema: refSchema,
  });
  await rest(token, `/repos/${repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${branch}`, sha: base.object.sha },
  });
}

/** `login-patch-1`, the website's own naming, bumped until it is free. */
async function freshBranchName(token: string, proposal: Proposal): Promise<string> {
  const stem = `${proposal.login.toLowerCase()}-patch`;
  for (let n = 1; n <= 30; n++) {
    const name = `${stem}-${n}`;
    try {
      await rest(token, `/repos/${proposal.repo}/git/ref/heads/${name}`);
    } catch (error) {
      if (error instanceof GitHubError && error.kind === 'missing') return name;
      throw error;
    }
  }
  return `${stem}-${Date.now().toString(36)}`;
}

/** Fork, then wait for GitHub to finish making it — it answers before it has. */
async function forkOf(token: string, repo: string) {
  const fork = await rest(token, `/repos/${repo}/forks`, {
    method: 'POST',
    body: { default_branch_only: true },
    schema: forkSchema,
  });
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      await rest(token, `/repos/${fork.full_name}/git/ref/heads/${encodePath(fork.default_branch)}`);
      return fork;
    } catch (error) {
      if (!(error instanceof GitHubError) || error.kind !== 'missing') throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }
  throw new GitHubError('api', 'The fork is still being made. Try again in a minute.');
}

export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}
