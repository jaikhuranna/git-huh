import { useCallback, useMemo } from 'react';

import { demoPullDetail } from '../lib/demo';
import { eventually } from '../lib/eventually';
import { GitHubError, type GitHubErrorKind } from '../lib/github';
import { optionalRead, type ReadFailure } from '../lib/optionalRead';
import {
  fetchPullConversation,
  fetchPullCore,
  fetchPullDetails,
  fetchPullFiles,
  withDetails,
  type DiffFile,
  type PullComment,
  type PullDetailFull,
  type PullSection,
} from '../lib/pullDetail';
import { DEMO_TOKEN } from '../lib/token';
import { invalidateResource, invalidateResourceWhere, refreshResource, useRemote } from './useRemote';

const PULL_CORE_STALE_AFTER_MS = 60_000;
const PULL_SECTION_STALE_AFTER_MS = 2 * 60_000;

/**
 * Pull requests, issues and discussions this process just made.
 *
 * A following open may retry a missing core read for a short while, because
 * GitHub's reads lag its writes. An ordinary open is not in the set, so a
 * genuine miss fails on the first read. Memory is enough: a restart is
 * already past the window where the lag matters.
 */
const RECENT_MS = 30_000;
const created = new Map<string, number>();

function recentKey(kind: string, repo: string, number: number): string {
  return `${kind}:${repo.toLowerCase()}#${number}`;
}

/** Call after a confirmed create, before navigating to the new object. */
export function noteCreated(kind: string, repo: string, number: number): void {
  const now = Date.now();
  for (const [key, at] of created) {
    if (now - at > RECENT_MS) created.delete(key);
  }
  created.set(recentKey(kind, repo, number), now);
}

export function wasJustCreated(kind: string, repo: string, number: number): boolean {
  const at = created.get(recentKey(kind, repo, number));
  if (at == null) return false;
  if (Date.now() - at > RECENT_MS) {
    created.delete(recentKey(kind, repo, number));
    return false;
  }
  return true;
}

export interface PullSectionState<T> {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data: T | null;
  failure: ReadFailure | null;
  reload: () => void;
}

export interface PullDetailState {
  status: 'loading' | 'ready' | 'error';
  pull: PullDetailFull | null;
  savedAt: number | null;
  offline: boolean;
  error: unknown;
  conversation: PullSectionState<PullComment[]>;
  details: PullSectionState<DetailsShape>;
  files: PullSectionState<DiffFile[]>;
  reload: () => void;
  /** Refresh the sections a confirmed write actually changed, and drop related lists. */
  afterMutation: (effect: PullMutation) => void;
}

type DetailsShape = Awaited<ReturnType<typeof fetchPullDetails>>;

export type PullMutation =
  | 'comment'
  | 'review'
  | 'reaction'
  | 'details'
  | 'merge';

const SECTION_FOR: Record<PullMutation, readonly PullSection[]> = {
  comment: ['conversation'],
  review: ['conversation', 'details'],
  reaction: ['conversation'],
  details: ['details'],
  merge: ['details'],
};

/**
 * One pull request, asked for in pieces.
 *
 * The header is the only read that starts immediately. Talk, merge controls
 * and patches each have their own key, so a stalled diff does not hold the
 * title back and a brief visit never downloads the files. A miss is retried
 * only on the core read, and only when this process just created the pull
 * request.
 */
export function usePullDetail(
  token: string | null,
  login: string | null,
  repo: string,
  number: number,
  wanted: { details: boolean; conversation: boolean; files: boolean },
): PullDetailState {
  const demo = useMemo(
    () => (token === DEMO_TOKEN ? demoPullDetail(repo, number) : undefined),
    [number, repo, token],
  );
  const owner = login && token !== DEMO_TOKEN ? login.toLowerCase() : null;
  const recent = wasJustCreated('pull', repo, number);
  const coreKey = token ? `${token}|pull|${repo}#${number}|core` : null;

  const core = useRemote(
    coreKey,
    async (signal) => {
      const pr = await eventually(
        () => fetchPullCore(token ?? '', repo, number, signal),
        { signal, recent },
      );
      if (!pr) throw new GitHubError('missing', 'Not found.');
      return pr.pull;
    },
    {
      // pull4: the core answer no longer carries conversation, details or files.
      cacheKey: owner ? `${owner}-pull4-${repo}-${number}-core` : null,
      demo: demo ?? undefined,
      staleAfterMs: PULL_CORE_STALE_AFTER_MS,
    },
  );

  const conversation = useSection(
    token && wanted.conversation ? `${token}|pull|${repo}#${number}|conversation` : null,
    owner ? `${owner}-pull4-${repo}-${number}-talk` : null,
    (signal) => fetchPullConversation(token ?? '', repo, number, signal),
    demo?.comments,
  );
  const details = useSection(
    token && wanted.details ? `${token}|pull|${repo}#${number}|details` : null,
    owner ? `${owner}-pull4-${repo}-${number}-details` : null,
    (signal) => fetchPullDetails(token ?? '', repo, number, signal),
    demo
      ? {
          assignees: { nodes: demo.assignees.map((login) => ({ login })) },
          reviewRequests: { nodes: demo.reviewers.map((login) => ({ requestedReviewer: { login } })) },
          milestone: demo.milestone,
          mergeable: demo.mergeable,
          mergeStateStatus: demo.mergeState,
          viewerCanUpdate: demo.canUpdate,
          viewerCanUpdateBranch: demo.canUpdateBranch,
          autoMergeRequest: demo.autoMergeOn ? { enabledAt: demo.createdAt } : null,
          headRepository: demo.headRepo ? { nameWithOwner: demo.headRepo } : null,
          headRef: demo.headRefExists ? { id: 'demo' } : null,
          repository: {
            mergeCommitAllowed: demo.mergeMethods.includes('MERGE'),
            squashMergeAllowed: demo.mergeMethods.includes('SQUASH'),
            rebaseMergeAllowed: demo.mergeMethods.includes('REBASE'),
            autoMergeAllowed: demo.autoMergeAllowed,
            viewerPermission: demo.permission,
          },
        }
      : undefined,
  );
  const files = useSection(
    token && wanted.files ? `${token}|pull|${repo}#${number}|files` : null,
    owner ? `${owner}-pull4-${repo}-${number}-files` : null,
    (signal) => fetchPullFiles(token ?? '', repo, number, signal),
    demo?.files,
  );

  const reload = useCallback(() => {
    if (coreKey) refreshResource(coreKey);
    conversation.reload();
    details.reload();
    files.reload();
  }, [conversation, coreKey, details, files]);

  const afterMutation = useCallback(
    (effect: PullMutation) => {
      const sections = SECTION_FOR[effect];
      // A merge or a deploy is not done because the request returned. The
      // next read is the only thing allowed to say the pull request moved.
      if (sections.includes('conversation')) conversation.reload();
      if (sections.includes('details')) details.reload();
      if (effect === 'reaction' && coreKey) refreshResource(coreKey);
      if (effect === 'details' && coreKey) refreshResource(coreKey);
      invalidateRelated(token, login, repo, number);
    },
    [conversation, coreKey, details, login, number, repo, token],
  );

  if (core.status === 'error') {
    return {
      status: 'error',
      pull: null,
      savedAt: null,
      offline: false,
      error: core.error,
      conversation,
      details,
      files,
      reload,
      afterMutation,
    };
  }
  if (core.status !== 'ready') {
    return {
      status: 'loading',
      pull: null,
      savedAt: null,
      offline: false,
      error: null,
      conversation,
      details,
      files,
      reload,
      afterMutation,
    };
  }

  const unavailable: Partial<Record<PullSection, ReadFailure>> = {};
  if (conversation.failure) unavailable.conversation = conversation.failure;
  if (details.failure) unavailable.details = details.failure;
  if (files.failure) unavailable.files = files.failure;

  const base = withDetails(core.data, details.status === 'ready' ? details.data : null);
  const pull: PullDetailFull = {
    ...base,
    comments: conversation.data ?? [],
    files: files.data ?? [],
    moreFiles: Math.max(0, base.changedFiles - (files.data?.length ?? 0)),
    unavailable,
  };

  return {
    status: 'ready',
    pull,
    savedAt: core.savedAt,
    offline: core.offline,
    error: null,
    conversation,
    details,
    files,
    reload,
    afterMutation,
  };
}

function useSection<T>(
  key: string | null,
  cacheKey: string | null,
  read: (signal: AbortSignal) => Promise<T>,
  demo: T | undefined,
): PullSectionState<T> {
  const remote = useRemote(
    key,
    async (signal) => {
      const result = await optionalRead(read(signal));
      if (result.error) throw Object.assign(new Error(result.error.message), { readFailure: result.error });
      return result.data as T;
    },
    { cacheKey, demo, staleAfterMs: PULL_SECTION_STALE_AFTER_MS },
  );
  const reload = useCallback(() => {
    if (key) refreshResource(key);
  }, [key]);
  if (!key) return { status: 'idle', data: null, failure: null, reload };
  if (remote.status === 'ready') return { status: 'ready', data: remote.data, failure: null, reload };
  if (remote.status === 'error') {
    const failure = failureOf(remote.error);
    return { status: 'error', data: null, failure, reload };
  }
  return { status: 'loading', data: null, failure: null, reload };
}

function failureOf(error: unknown): ReadFailure {
  const tagged = error as { readFailure?: ReadFailure };
  if (tagged?.readFailure) return tagged.readFailure;
  if (error instanceof GitHubError) return { kind: error.kind, message: error.message };
  return { kind: 'network' as GitHubErrorKind, message: 'The request failed.' };
}

/**
 * Lists that mention this pull request are no longer trustworthy. They are
 * dropped rather than patched, because their keys and shapes belong to other
 * screens; the next time those screens are showing, they read again.
 */
export function invalidateRelated(
  token: string | null,
  login: string | null,
  repo: string,
  number: number,
): void {
  const owner = login?.toLowerCase() ?? '';
  invalidateResourceWhere((key) => {
    if (token && key.startsWith(`${token}|`) && (key.includes('|prs') || key.includes('queue') || key.includes('activity') || key.includes('social') || key.includes('tasks'))) {
      return true;
    }
    if (!owner) return false;
    return (
      key.startsWith(`${owner}-prs`) ||
      key.startsWith(`${owner}-queue`) ||
      key.startsWith(`${owner}-activity`) ||
      key.startsWith(`${owner}-social`) ||
      key.startsWith(`${owner}-tasks`) ||
      key.includes(`${repo}#${number}`)
    );
  });
  if (token) invalidateResource(`${token}|pull|${repo}#${number}|body`);
}
