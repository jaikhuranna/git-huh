import { z } from 'zod';

import { rest, restText } from './rest';

/**
 * CI, from the phone: what ran on a pull request's head commit, why the red
 * one is red, and the two buttons people otherwise open a laptop for —
 * re-run what failed, and approve what is waiting on you.
 *
 * Two lists because GitHub keeps two. Check *runs* are every check from every
 * app, which is what the status line is made of. Workflow *runs* are Actions'
 * own grouping, and only they can be re-run or approved. An Actions check
 * run's id is its job id, which is how a red row finds its log.
 */

export interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  app: string;
  /** Only GitHub Actions jobs have a log this app can fetch. */
  isActions: boolean;
  summary: string | null;
}

export interface WorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  event: string;
  url: string;
}

export interface Checks {
  runs: CheckRun[];
  workflows: WorkflowRun[];
}

export type CheckTone = 'pass' | 'fail' | 'running' | 'waiting' | 'neutral';

const checkRunsSchema = z.object({
  check_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      status: z.string(),
      conclusion: z.string().nullable(),
      html_url: z.string().nullable(),
      app: z.object({ slug: z.string() }).nullable(),
      output: z.object({ title: z.string().nullable(), summary: z.string().nullable() }).nullable(),
    }),
  ),
});

const workflowRunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullable(),
      status: z.string().nullable(),
      conclusion: z.string().nullable(),
      event: z.string(),
      html_url: z.string(),
    }),
  ),
});

export async function fetchChecks(
  token: string,
  repo: string,
  sha: string,
  signal?: AbortSignal,
): Promise<Checks> {
  const [runs, workflows] = await Promise.all([
    rest(token, `/repos/${repo}/commits/${sha}/check-runs?per_page=60`, {
      schema: checkRunsSchema,
      signal,
    }),
    rest(token, `/repos/${repo}/actions/runs?head_sha=${sha}&per_page=20`, {
      schema: workflowRunsSchema,
      signal,
    }).catch(() => ({ workflow_runs: [] })),
  ]);

  return {
    runs: runs.check_runs
      .map((run) => ({
        id: run.id,
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        url: run.html_url ?? '',
        app: run.app?.slug ?? 'check',
        isActions: run.app?.slug === 'github-actions',
        summary: run.output?.title ?? null,
      }))
      .sort((a, b) => rank(toneOf(a)) - rank(toneOf(b)) || a.name.localeCompare(b.name)),
    workflows: workflows.workflow_runs.map((run) => ({
      id: run.id,
      name: run.name ?? 'workflow',
      status: run.status ?? 'unknown',
      conclusion: run.conclusion,
      event: run.event,
      url: run.html_url,
    })),
  };
}

export function toneOf(run: { status: string; conclusion: string | null }): CheckTone {
  if (run.status === 'waiting' || run.status === 'action_required') return 'waiting';
  if (run.conclusion === 'action_required') return 'waiting';
  if (run.status !== 'completed') return 'running';
  if (run.conclusion === 'success') return 'pass';
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out' || run.conclusion === 'startup_failure') {
    return 'fail';
  }
  return 'neutral';
}

/** Red first, then what needs you, then what is still going, then green. */
function rank(tone: CheckTone): number {
  return { fail: 0, waiting: 1, running: 2, neutral: 3, pass: 4 }[tone];
}

export interface LogTail {
  /** The lines that say why — the runner's own error annotations first. */
  errors: string[];
  /** The last lines of the job, which is where a failure usually ends. */
  tail: string[];
}

/**
 * The end of a job's log, trimmed to what a phone can show: the timestamps
 * off, the error annotations pulled out, and the last forty lines.
 */
export async function fetchLogTail(
  token: string,
  repo: string,
  jobId: number,
  signal?: AbortSignal,
): Promise<LogTail> {
  const text = await restText(token, `/repos/${repo}/actions/jobs/${jobId}/logs`, signal);
  return tailOf(text);
}

function tailOf(text: string): LogTail {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\r$/, ''))
    .filter((line) => line.trim().length > 0 && !line.startsWith('##[group]') && line !== '##[endgroup]');
  const errors = lines
    .filter((line) => /##\[error\]|^error[:\s]|\bERR!|\bFAIL(ED)?\b|Error:/.test(line))
    .map((line) => line.replace('##[error]', ''))
    .slice(-8);
  return { errors, tail: lines.slice(-40) };
}

export async function rerunFailed(token: string, repo: string, runId: number) {
  await rest(token, `/repos/${repo}/actions/runs/${runId}/rerun-failed-jobs`, { method: 'POST' });
}

/** A run from a first-time contributor's fork, held until someone lets it run. */
export async function approveRun(token: string, repo: string, runId: number) {
  await rest(token, `/repos/${repo}/actions/runs/${runId}/approve`, { method: 'POST' });
}

export interface PendingDeployment {
  environmentId: number;
  environment: string;
  canApprove: boolean;
}

const pendingSchema = z.array(
  z.object({
    environment: z.object({ id: z.number(), name: z.string() }),
    current_user_can_approve: z.boolean(),
  }),
);

export async function fetchPendingDeployments(
  token: string,
  repo: string,
  runId: number,
  signal?: AbortSignal,
): Promise<PendingDeployment[]> {
  const pending = await rest(token, `/repos/${repo}/actions/runs/${runId}/pending_deployments`, {
    schema: pendingSchema,
    signal,
  });
  return pending.map((item) => ({
    environmentId: item.environment.id,
    environment: item.environment.name,
    canApprove: item.current_user_can_approve,
  }));
}

/** Let a deployment through to its environment, or stop it there. */
export async function reviewDeployments(
  token: string,
  repo: string,
  runId: number,
  environmentIds: number[],
  state: 'approved' | 'rejected',
  comment: string,
) {
  await rest(token, `/repos/${repo}/actions/runs/${runId}/pending_deployments`, {
    method: 'POST',
    body: { environment_ids: environmentIds, state, comment: comment || state },
  });
}
