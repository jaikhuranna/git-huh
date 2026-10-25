/**
 * A file proposal that may have stopped halfway.
 *
 * Forking, creating a branch, committing the file and opening the pull
 * request are four writes. If the last one fails, the earlier ones have
 * already happened, and starting again would make a second branch and a
 * second commit of the same change. The progress is the identifiers those
 * writes returned, keyed by the file the proposal started from, so a later
 * attempt can finish only the steps that have not happened yet.
 *
 * A step whose reply was lost is `unknown`. That is not the same as
 * "not started": the write may already be on GitHub, and the next attempt
 * has to read it back before sending anything else.
 *
 * Cancellation stops the wait. It does not delete a branch or undo a commit:
 * those are already on GitHub, and rolling them back would hide work the
 * person asked for.
 */

import { composeKey } from './cacheKey';

/** A remote write that this proposal may already have performed. */
export type ProposalAction = 'fork' | 'branch' | 'commit' | 'pull';

/**
 * `not-started` has not been sent. `in-flight` was persisted immediately
 * before dispatch. `unknown` was dispatched and the reply was lost, so it
 * must be read back before any new write. `confirmed` came back, or was
 * found by that read.
 */
export type StepState = 'not-started' | 'in-flight' | 'unknown' | 'confirmed';

/** Where each write of a proposal stands, and the ids GitHub gave back. */
export interface ProposalSteps {
  fork: StepState;
  branch: StepState;
  commit: StepState;
  pull: StepState;
}

/**
 * The coarse point the screen still speaks in. It is the last action that
 * is confirmed, which is what "the branch is there" means. An unknown step
 * is not described as finished.
 */
export type ProposalStep = 'forked' | 'branched' | 'committed';

/**
 * Where a half-finished proposal survives a restart. The app registers the
 * disk-backed one (`proposalsStore.ts`); everything else — including the pure
 * modules the unit tests import — keeps it in memory, so no test has to load
 * `expo-file-system` to import `writes.ts`.
 *
 * `write` may reject. A proposal that could not be saved must say so: a
 * restart cannot finish a write the device never recorded.
 */
export interface ProposalStore {
  read(key: string): Promise<ProposalProgress | null>;
  write(key: string, value: ProposalProgress): void | Promise<void>;
  remove(key: string): void | Promise<void>;
}

/** The proposal this session is looking at, ahead of whatever the box holds. */
const current = new Map<string, ProposalProgress>();

const memoryStore: ProposalStore = {
  async read(key) {
    return current.get(key) ?? null;
  },
  write(key, value) {
    current.set(key, value);
  },
  remove(key) {
    current.delete(key);
  },
};

let backing: ProposalStore = memoryStore;

/** Called once by the app to keep proposals on the device. */
export function installProposalStore(store: ProposalStore): void {
  backing = store;
  // A new backing is a new session: the in-memory view ahead of it belongs to
  // the store being replaced, not this one.
  current.clear();
}

/** Stable name for one proposal's writes, so a retry reconciles the same one. */
export function operationId(key: string, action: ProposalAction): string {
  return `${key}:${action}`;
}

export function freshSteps(): ProposalSteps {
  return { fork: 'not-started', branch: 'not-started', commit: 'not-started', pull: 'not-started' };
}

/** The screen's word for the last confirmed write. Null until one lands. */
export function confirmedStep(steps: ProposalSteps): ProposalStep | null {
  if (steps.commit === 'confirmed') return 'committed';
  if (steps.branch === 'confirmed') return 'branched';
  if (steps.fork === 'confirmed') return 'forked';
  return null;
}

export interface ProposalProgress {
  /** Identity of this proposal's writes. Retries reuse it; they do not mint another. */
  operation: string;
  repo: string;
  path: string;
  /** Blob sha the commit was based on. A different sha is a different proposal. */
  sha: string;
  base: string;
  /** The words that were about to be sent. Later edits do not rewrite a commit already made. */
  message: string;
  text: string;
  /** Last confirmed write, when there is one. Kept so older screens can still read it. */
  step: ProposalStep | null;
  steps: ProposalSteps;
  headRepo: string;
  headOwner: string | null;
  branch: string | null;
  /** Blob sha the commit was meant to replace. A replay must not send this once the new blob exists. */
  baseSha: string | null;
  commitSha: string | null;
  /** Blob sha of the committed text, when the commit was confirmed or reconciled. */
  blobSha: string | null;
  pullNumber: number | null;
}

export function proposalKey(account: string | null, repo: string, ref: string, path: string, sha: string): string {
  return composeKey(account, 'proposal', repo, ref, path, sha);
}

export function readProposal(key: string): ProposalProgress | null {
  return current.get(key) ?? null;
}

function asProgress(value: ProposalProgress): ProposalProgress {
  const steps = value.steps ?? stepsFrom(value.step);
  return {
    ...value,
    operation: value.operation || keyOperation(value),
    step: value.step ?? confirmedStep(steps),
    steps,
    baseSha: value.baseSha ?? value.sha,
    blobSha: value.blobSha ?? null,
    pullNumber: value.pullNumber ?? null,
  };
}

/** A record written before per-step state existed still names the last write that landed. */
function stepsFrom(step: ProposalStep | null): ProposalSteps {
  const steps = freshSteps();
  if (step === 'forked' || step === 'branched' || step === 'committed') steps.fork = 'confirmed';
  if (step === 'branched' || step === 'committed') steps.branch = 'confirmed';
  if (step === 'committed') steps.commit = 'confirmed';
  return steps;
}

function keyOperation(value: Pick<ProposalProgress, 'repo' | 'path' | 'sha'>): string {
  return composeKey(null, 'proposal-op', value.repo, value.path, value.sha);
}

export function saveProposal(key: string, progress: ProposalProgress): void {
  const stored = asProgress(progress);
  current.set(key, stored);
  // Fire-and-forget callers still need the failure. Swallowing it would
  // promise a restart the device cannot keep.
  void Promise.resolve(backing.write(key, stored)).catch((error: unknown) => {
    console.warn('The proposal could not be saved. A restart cannot finish it.', error);
  });
}

/**
 * Persist before a write leaves the device. Rejects when the store rejects,
 * so the caller can stop instead of promising a restart it cannot keep.
 */
export async function saveProposalNow(key: string, progress: ProposalProgress): Promise<ProposalProgress> {
  const stored = asProgress(progress);
  current.set(key, stored);
  await backing.write(key, stored);
  return stored;
}

export function clearProposal(key: string): void {
  current.delete(key);
  void Promise.resolve(backing.remove(key)).catch(() => {});
}

export async function loadProposal(key: string): Promise<ProposalProgress | null> {
  const held = current.get(key);
  if (held) return asProgress(held);
  const saved = await backing.read(key);
  if (!saved) return null;
  const progress = asProgress(saved);
  current.set(key, progress);
  return progress;
}

/** What a partially finished proposal still needs, in the words of the screen. */
export function proposalLeft(progress: ProposalProgress): string {
  const steps = progress.steps ?? stepsFrom(progress.step);
  if (steps.pull === 'unknown') return 'the pull request may already be open · check it before trying again';
  if (steps.commit === 'unknown') return 'the file may already be committed · check it before trying again';
  if (steps.branch === 'unknown') return 'the branch may already exist · check it before trying again';
  if (steps.commit === 'confirmed' || progress.step === 'committed') {
    return 'the branch and the commit are there · the pull request was not opened';
  }
  if (steps.branch === 'confirmed' || progress.step === 'branched') {
    return 'the branch is there · the file was not committed';
  }
  return 'the fork is there · the branch was not created';
}
