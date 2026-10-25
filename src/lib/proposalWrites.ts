/**
 * The resumable file proposal: fork if needed, branch, commit, open the pull.
 *
 * Each write is recorded before it is sent, and again when the answer comes
 * back. A reply that never arrives leaves that step `unknown`. The next
 * attempt reads GitHub for that exact branch, blob or pull request and
 * continues from what it finds. It does not send the write again on the
 * hope that the first one failed.
 *
 * `writes.ts` still exports `proposeChange` and `resumeProposal`. Callers
 * do not import this module; it is the only place the four-step protocol lives.
 */

import { Buffer } from 'buffer';
import { z } from 'zod';

import { firstFreePatchName, patchStem, timestampPatchName } from './branchName';
import { encodePath } from './encodePath';
import { forkOf, type Fork } from './forkRepo';
import { GitHubError, outcomeUnknown } from './github';
import {
  clearProposal,
  confirmedStep,
  freshSteps,
  loadProposal,
  operationId,
  proposalKey,
  saveProposalNow,
  type ProposalAction,
  type ProposalProgress,
  type StepState,
} from './proposals';
import { rest } from './rest';
import type { Proposal, ProposalResult, ProposeOptions } from './writes';

/** How many new names a genuine "reference already exists" may try. */
export const BRANCH_ATTEMPTS = 5;

const refSchema = z.object({
  object: z.object({ sha: z.string() }).optional(),
});
const contentWrite = z.object({
  commit: z.object({ sha: z.string() }),
  content: z.object({ sha: z.string() }).optional(),
});
const contentRead = z.object({
  sha: z.string(),
  content: z.string().optional(),
  encoding: z.string().optional(),
});
const commitList = z.array(z.object({ sha: z.string() }));
const pullMade = z.object({ number: z.number().int() });
const pullList = z.array(pullMade);
const forkSchema = z.object({
  full_name: z.string(),
  owner: z.object({ login: z.string() }),
  default_branch: z.string(),
});
const repoSchema = z.object({ default_branch: z.string() });
const matchingRefs = z.array(z.object({
  ref: z.string(),
  object: z.object({ sha: z.string() }).optional(),
}));

/**
 * Commit onto a fresh branch and open a pull request from it.
 *
 * If the token cannot create a branch in the repository, the change goes
 * through a fork. Calling this again for the same file finishes the request
 * instead of repeating a write whose reply was lost.
 */
export async function proposeChange(
  token: string,
  proposal: Proposal,
  options: ProposeOptions = {},
): Promise<ProposalResult> {
  const key = proposalKey(options.account ?? proposal.login, proposal.repo, proposal.base, proposal.path, proposal.sha);
  const held = await loadProposal(key);
  const captured = held ?? await capture(token, key, proposal, options.signal);
  // A commit already sent keeps the words that were sent, even if the editor moved on.
  const commitStarted = captured.steps.commit !== 'not-started';
  const sent = commitStarted && captured.text !== proposal.text
    ? { ...proposal, text: captured.text, message: captured.message, sha: captured.baseSha ?? captured.sha }
    : proposal;
  return run(token, sent, key, captured, options.signal);
}

/** Same path as proposing again: only the steps that are not confirmed run. */
export async function resumeProposal(
  token: string,
  proposal: Proposal,
  options: ProposeOptions = {},
): Promise<ProposalResult> {
  return proposeChange(token, proposal, options);
}

/**
 * The branch a file was read from, by name. A file opened from a code search
 * result was read from the default branch without naming it.
 */
async function baseOf(token: string, proposal: Proposal, signal?: AbortSignal): Promise<string> {
  if (proposal.base) return proposal.base;
  const repo = await rest(token, `/repos/${proposal.repo}`, { schema: repoSchema, signal });
  return repo.default_branch;
}

/** The proposal as it will be sent, recorded before any of its writes. */
async function capture(
  token: string,
  key: string,
  proposal: Proposal,
  signal?: AbortSignal,
): Promise<ProposalProgress> {
  const base = await baseOf(token, proposal, signal);
  return saveProposalNow(key, {
    operation: key,
    repo: proposal.repo,
    path: proposal.path,
    sha: proposal.sha,
    base,
    message: proposal.message,
    text: proposal.text,
    step: null,
    steps: freshSteps(),
    headRepo: proposal.repo,
    headOwner: null,
    branch: null,
    baseSha: proposal.sha,
    commitSha: null,
    blobSha: null,
    pullNumber: null,
  });
}

async function run(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  let current = progress;
  current = await ensureBranch(token, proposal, key, current, signal);
  current = await ensureCommit(token, proposal, key, current, signal);
  return openPull(token, proposal, key, current, signal);
}

async function ensureBranch(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<ProposalProgress> {
  if (progress.steps.branch === 'confirmed' && progress.branch) return progress;

  const base = await rest(token, `/repos/${proposal.repo}/git/ref/heads/${encodePath(progress.base)}`, {
    schema: refSchema,
    signal,
  });
  const sha = base.object?.sha;
  if (!sha) throw new GitHubError('missing', 'The branch this file was read from is gone.');

  if (needsReconcile(progress.steps.branch)) {
    const found = await findOperationBranch(token, progress, sha, signal);
    if (found) {
      return remember(key, progress, {
        steps: { ...progress.steps, branch: 'confirmed' },
        branch: found,
      });
    }
    // The read did not find it. The lost reply did not land, so one new write is allowed.
    if (!progress.branch) {
      progress = await remember(key, progress, {
        steps: { ...progress.steps, branch: 'not-started' },
      });
    }
  }

  try {
    return await writeBranch(token, proposal, key, progress, progress.headRepo, sha, signal);
  } catch (error) {
    if (!needsFork(error) || progress.headRepo !== proposal.repo || progress.steps.fork === 'confirmed') {
      throw error;
    }
    const fork = await ensureFork(token, proposal, key, progress, signal);
    return writeBranch(token, proposal, key, fork, fork.headRepo, sha, signal);
  }
}

function needsFork(error: unknown): boolean {
  // A 404 on creating a ref is "this repository will not take the branch",
  // which is when the website forks. A 403 is a permission answer and stops;
  // calling it a fork hides the real outcome and starts another write.
  return error instanceof GitHubError && error.kind === 'missing' && error.outcome === 'rejected';
}

function needsReconcile(state: StepState): boolean {
  return state === 'unknown' || state === 'in-flight';
}

async function ensureFork(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<ProposalProgress> {
  if (needsReconcile(progress.steps.fork)) {
    const found = await readFork(token, proposal, progress, signal);
    if (found) {
      return remember(key, progress, {
        steps: { ...progress.steps, fork: 'confirmed', branch: 'not-started' },
        headRepo: found.full_name,
        headOwner: found.owner.login,
        branch: null,
      });
    }
  }

  const marked = await mark(key, progress, 'fork', 'in-flight');
  try {
    const fork = await forkOf(token, proposal.repo, signal, operationId(marked.operation, 'fork'));
    return remember(key, marked, {
      steps: { ...marked.steps, fork: 'confirmed', branch: 'not-started' },
      headRepo: fork.full_name,
      headOwner: fork.owner.login,
      branch: null,
    });
  } catch (error) {
    if (outcomeUnknown(error)) await mark(key, marked, 'fork', 'unknown');
    throw error;
  }
}

async function readFork(
  token: string,
  proposal: Proposal,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<Fork | null> {
  const owner = progress.headOwner;
  const name = proposal.repo.split('/')[1];
  if (!owner || !name) return null;
  try {
    return await rest(token, `/repos/${owner}/${name}`, { schema: forkSchema, signal });
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'missing') return null;
    throw error;
  }
}

async function writeBranch(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  repo: string,
  sha: string,
  signal?: AbortSignal,
): Promise<ProposalProgress> {
  const intended = progress.steps.branch === 'not-started' ? null : progress.branch;
  if (intended && needsReconcile(progress.steps.branch)) {
    const found = await findNamedBranch(token, repo, intended, sha, signal);
    if (found) {
      return remember(key, progress, {
        steps: { ...progress.steps, branch: 'confirmed' },
        branch: found,
        headRepo: repo,
      });
    }
  }

  const chosen = await chooseBranchName(token, repo, proposal.login, signal);
  const marked = await remember(key, progress, {
    steps: { ...progress.steps, branch: 'in-flight' },
    branch: chosen,
    headRepo: repo,
  });
  try {
    throwIfAborted(signal);
    const branch = await createRef(token, repo, chosen, sha, signal, marked.operation, proposal.login);
    const confirmed = await remember(key, marked, {
      steps: { ...marked.steps, branch: 'confirmed' },
      branch,
      headRepo: repo,
    });
    throwIfAborted(signal);
    return confirmed;
  } catch (error) {
    const aborted = rethrowAbort(error, signal);
    if (aborted !== error) throw aborted;
    if (outcomeUnknown(error)) {
      await remember(key, marked, {
        steps: { ...marked.steps, branch: 'unknown' },
        branch: chosen,
        headRepo: repo,
      });
    }
    throw error;
  }
}

/** The name about to be created, so a lost reply knows which ref to read back. */
async function chooseBranchName(
  token: string,
  repo: string,
  login: string,
  signal?: AbortSignal,
): Promise<string> {
  const stem = patchStem(login);
  const refs = await rest(token, `/repos/${repo}/git/matching-refs/heads/${encodePath(stem)}-`, {
    schema: matchingRefs,
    signal,
  });
  return firstFreePatchName(stem, refs.map((entry) => entry.ref)) ?? timestampPatchName(stem);
}

async function findOperationBranch(
  token: string,
  progress: ProposalProgress,
  sha: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!progress.branch) return null;
  // The operation branch is one name. matching-refs must see that name, and
  // seeing it is what stops a second branch from being created.
  const stem = progress.branch.replace(/\d+$/, '');
  const refs = await rest(token, `/repos/${progress.headRepo}/git/matching-refs/heads/${encodePath(stem)}`, {
    schema: matchingRefs,
    signal,
  });
  const hit = refs.find((entry) => entry.ref === `refs/heads/${progress.branch}`);
  if (!hit) return null;
  if (hit.object?.sha && sha && hit.object.sha !== sha) return null;
  return progress.branch;
}

async function findNamedBranch(
  token: string,
  repo: string,
  name: string,
  sha: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const stem = name.replace(/\d+$/, '');
  try {
    const refs = await rest(token, `/repos/${repo}/git/matching-refs/heads/${encodePath(stem)}`, {
      schema: matchingRefs,
      signal,
    });
    const hit = refs.find((entry) => entry.ref === `refs/heads/${name}`);
    if (hit) {
      if (hit.object?.sha && sha && hit.object.sha !== sha) return null;
      return name;
    }
  } catch (error) {
    if (!(error instanceof GitHubError) || error.kind !== 'missing') throw error;
  }
  try {
    const ref = await rest(token, `/repos/${repo}/git/ref/heads/${encodePath(name)}`, {
      schema: refSchema,
      signal,
    });
    if (ref.object?.sha == null || ref.object.sha === sha) return name;
    return null;
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'missing') return null;
    throw error;
  }
}

async function ensureCommit(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<ProposalProgress> {
  if (!progress.branch) throw new GitHubError('api', 'The branch for this change was not created.');
  if (progress.steps.commit === 'confirmed' && progress.commitSha) return progress;

  if (needsReconcile(progress.steps.commit)) {
    const found = await readCommittedFile(token, progress, signal);
    if (found) {
      return remember(key, progress, {
        steps: { ...progress.steps, commit: 'confirmed' },
        commitSha: found.commitSha,
        blobSha: found.blobSha,
      });
    }
    progress = await remember(key, progress, {
      steps: { ...progress.steps, commit: 'not-started' },
    });
  }

  const prepared = await remember(key, progress, {
    baseSha: progress.baseSha ?? proposal.sha,
  });
  throwIfAborted(signal);
  const marked = await remember(key, prepared, {
    steps: { ...prepared.steps, commit: 'in-flight' },
  });
  try {
    const written = await putFile(token, marked, signal).catch((error: unknown) => {
      throw rethrowAbort(error, signal);
    });
    return remember(key, marked, {
      steps: { ...marked.steps, commit: 'confirmed' },
      commitSha: written.commitSha,
      blobSha: written.blobSha ?? marked.blobSha,
    });
  } catch (error) {
    if (outcomeUnknown(error)) await mark(key, marked, 'commit', 'unknown');
    throw error;
  }
}

async function readCommittedFile(
  token: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<{ commitSha: string; blobSha: string } | null> {
  if (!progress.branch) return null;
  let file: z.infer<typeof contentRead>;
  try {
    file = await rest(
      token,
      `/repos/${progress.headRepo}/contents/${encodePath(progress.path)}?ref=${encodeURIComponent(progress.branch)}`,
      { schema: contentRead, signal },
    );
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'missing') return null;
    throw error;
  }
  const text = decodeContent(file);
  if (text == null || text !== progress.text) return null;

  if (progress.commitSha) return { commitSha: progress.commitSha, blobSha: file.sha };
  const commits = await rest(
    token,
    `/repos/${progress.headRepo}/commits?sha=${encodeURIComponent(progress.branch)}&path=${encodeURIComponent(progress.path)}&per_page=1`,
    { schema: commitList, signal },
  );
  const commitSha = commits[0]?.sha;
  if (!commitSha) return null;
  return { commitSha, blobSha: file.sha };
}

function decodeContent(file: z.infer<typeof contentRead>): string | null {
  if (file.content == null) return null;
  if (file.encoding === 'base64' || !file.encoding) {
    return Buffer.from(file.content.replace(/\n/g, ''), 'base64').toString('utf8');
  }
  return file.content;
}

async function openPull(
  token: string,
  proposal: Proposal,
  key: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<ProposalResult> {
  if (!progress.branch) throw new GitHubError('api', 'The branch for this change was not created.');
  if (progress.steps.pull === 'confirmed' && progress.pullNumber != null) {
    clearProposal(key);
    return { kind: 'pull', repo: proposal.repo, number: progress.pullNumber };
  }

  if (needsReconcile(progress.steps.pull)) {
    const number = await findPull(token, proposal, progress, signal);
    if (number != null) {
      clearProposal(key);
      return { kind: 'pull', repo: proposal.repo, number };
    }
    progress = await remember(key, progress, {
      steps: { ...progress.steps, pull: 'not-started' },
    });
  }

  const marked = await mark(key, progress, 'pull', 'in-flight');
  const head = marked.headOwner ? `${marked.headOwner}:${marked.branch}` : marked.branch;
  const [title, ...description] = marked.message.split('\n');
  try {
    const pull = await rest(token, `/repos/${proposal.repo}/pulls`, {
      method: 'POST',
      body: {
        title,
        head,
        base: marked.base,
        body: description.join('\n').trim(),
      },
      schema: pullMade,
      signal,
      operationId: operationId(marked.operation, 'pull'),
    });
    clearProposal(key);
    return { kind: 'pull', repo: proposal.repo, number: pull.number };
  } catch (error) {
    if (outcomeUnknown(error)) await mark(key, marked, 'pull', 'unknown');
    throw error;
  }
}

async function findPull(
  token: string,
  proposal: Proposal,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<number | null> {
  if (!progress.branch) return null;
  const owner = progress.headOwner ?? proposal.repo.split('/')[0] ?? '';
  const head = `${owner}:${progress.branch}`;
  const pulls = await rest(
    token,
    `/repos/${proposal.repo}/pulls?head=${encodeURIComponent(head)}&base=${encodeURIComponent(progress.base)}&state=open`,
    { schema: pullList, signal },
  );
  return pulls[0]?.number ?? null;
}

async function putFile(
  token: string,
  progress: ProposalProgress,
  signal?: AbortSignal,
): Promise<{ commitSha: string; blobSha: string | null }> {
  if (!progress.branch) throw new GitHubError('api', 'The branch for this change was not created.');
  const written = await rest(token, `/repos/${progress.headRepo}/contents/${encodePath(progress.path)}`, {
    method: 'PUT',
    body: {
      message: progress.message,
      content: Buffer.from(progress.text, 'utf8').toString('base64'),
      sha: progress.baseSha ?? progress.sha,
      branch: progress.branch,
    },
    schema: contentWrite,
    signal,
    operationId: operationId(progress.operation, 'commit'),
  });
  return { commitSha: written.commit.sha, blobSha: written.content?.sha ?? null };
}

/**
 * Create `name`, and only on a confirmed "reference already exists" try the
 * next free suffix. The ceiling is `BRANCH_ATTEMPTS` including the first
 * post. Permission, rate limit, a lost reply and a server error all stop.
 * A dropped reply is never a reason to mint another name.
 */
async function createRef(
  token: string,
  repo: string,
  name: string,
  sha: string,
  signal: AbortSignal | undefined,
  operation: string,
  login: string,
): Promise<string> {
  const stem = patchStem(login);
  const known = await rest(token, `/repos/${repo}/git/matching-refs/heads/${encodePath(stem)}-`, {
    schema: matchingRefs,
    signal,
  }).catch((error: unknown) => {
    if (error instanceof GitHubError && (error.kind === 'missing' || error.kind === 'forbidden')) return [];
    throw error;
  });
  const taken = known.map((entry) => entry.ref);
  let candidate = name;
  if (taken.some((ref) => ref === `refs/heads/${candidate}` || ref.endsWith(`/${candidate}`))) {
    candidate = firstFreePatchName(stem, taken) ?? timestampPatchName(stem);
  }

  for (let attempt = 0; attempt < BRANCH_ATTEMPTS; attempt++) {
    try {
      await rest(token, `/repos/${repo}/git/refs`, {
        method: 'POST',
        body: { ref: `refs/heads/${candidate}`, sha },
        signal,
        operationId: `${operationId(operation, 'branch')}:${candidate}`,
      });
      return candidate;
    } catch (error) {
      if (signal?.aborted && error instanceof Error && error.name === 'AbortError') return candidate;
      if (!referenceExists(error)) throw error;
      taken.push(`refs/heads/${candidate}`);
      const next = firstFreePatchName(stem, taken) ?? timestampPatchName(stem, Date.now() + attempt);
      if (next === candidate) break;
      candidate = next;
    }
  }
  throw new GitHubError(
    'api',
    'Every patch branch name tried was already taken. Nothing further was created.',
  );
}

/**
 * GitHub's create-ref collision is a confirmed 422 whose message says the
 * reference already exists. `kind === 'api'` is also a 500, a validation
 * failure and a rate limit, so the message and a rejected outcome both have
 * to match. A dropped reply is never treated as "try another name".
 */
export function referenceExists(error: unknown): boolean {
  if (!(error instanceof GitHubError)) return false;
  if (error.kind !== 'api') return false;
  if (error.outcome !== 'rejected') return false;
  return /reference already exists/i.test(error.message);
}

async function mark(
  key: string,
  progress: ProposalProgress,
  action: ProposalAction,
  state: StepState,
): Promise<ProposalProgress> {
  return remember(key, progress, { steps: { ...progress.steps, [action]: state } });
}

async function remember(
  key: string,
  progress: ProposalProgress,
  fields: Partial<Pick<ProposalProgress,
    'steps' | 'headRepo' | 'headOwner' | 'branch' | 'commitSha' | 'base' | 'blobSha' | 'pullNumber' | 'baseSha'>>,
): Promise<ProposalProgress> {
  const steps = fields.steps ?? progress.steps;
  return saveProposalNow(key, {
    ...progress,
    ...fields,
    steps,
    step: confirmedStep(steps),
  });
}

/**
 * REST turns a caller abort during a write into "the reply was lost", because
 * it cannot see whose signal fired. When the proposal's own signal is the one
 * that aborted, the person cancelled: the step already recorded stays, and
 * the error stays an abort.
 */
function rethrowAbort(error: unknown, signal?: AbortSignal): unknown {
  if (signal?.aborted) {
    const abort = new Error('aborted');
    abort.name = 'AbortError';
    return abort;
  }
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const error = new Error('aborted');
  error.name = 'AbortError';
  throw error;
}
