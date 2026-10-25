import { z } from 'zod';

import { GitHubError } from './github';
import { rest } from './rest';
import { tailLines } from './textTail';

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
  /**
   * True when the download was refused because the log is larger than this
   * phone should hold. The caller should send the person to GitHub.
   */
  tooLarge?: boolean;
}

/** Forty lines is what the panel draws; eight of those may be called out as errors. */
const LOG_TAIL_LINES = 40;
const LOG_ERROR_LINES = 8;

/**
 * Stop before a log can occupy tens of megabytes of JS string.
 *
 * The jobs logs API answers with a redirect to a short-lived blob URL.
 * That host does not advertise `Accept-Ranges`, so a `Range` request cannot
 * be relied on to fetch only the end. The bound is therefore the download
 * itself: refuse when `Content-Length` already says the file is over this
 * cap, and stop reading once the body passes it.
 */
const LOG_BYTE_CAP = 2 * 1024 * 1024;

/**
 * The end of a job's log, trimmed to what a phone can show: the timestamps
 * off, the error annotations pulled out, and the last forty lines.
 *
 * A log past the byte cap is not downloaded into a line array at all.
 */
export async function fetchLogTail(
  token: string,
  repo: string,
  jobId: number,
  signal?: AbortSignal,
): Promise<LogTail> {
  const text = await downloadLog(token, `/repos/${repo}/actions/jobs/${jobId}/logs`, signal);
  if (text == null) return { errors: [], tail: [], tooLarge: true };
  return tailLines(text, { lines: LOG_TAIL_LINES, errors: LOG_ERROR_LINES });
}

const API = 'https://api.github.com';

/**
 * Download a job log only while it stays under the byte cap.
 *
 * `Content-Length`, when the redirected blob sends one, refuses the body
 * before it is read. The running total is the backstop for a missing or
 * lying length. Either way the returned string is at most the cap, and a
 * log that would exceed it is reported as too large instead.
 */
async function downloadLog(token: string, path: string, signal?: AbortSignal): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GitHubError('network', 'Could not reach GitHub.');
  }
  if (!response.ok) throw await logFailure(response);

  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > LOG_BYTE_CAP) {
    await response.body?.cancel().catch(() => {});
    return null;
  }
  if (!response.body) {
    const text = await response.text();
    return text.length > LOG_BYTE_CAP ? null : text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      received += value.byteLength;
      if (received > LOG_BYTE_CAP) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GitHubError('network', 'Could not reach GitHub.');
  }

  const body = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function logFailure(response: Response): Promise<GitHubError> {
  let message = `GitHub responded with ${response.status}.`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) message = body.message;
  } catch {
    // A failed log redirect is often not JSON; the status is enough.
  }
  if (response.status === 401) return new GitHubError('invalid-token', message);
  if (response.status === 403) return new GitHubError('forbidden', message);
  if (response.status === 404) return new GitHubError('missing', message);
  return new GitHubError('api', message);
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

// --- a repository's actions -------------------------------------------------

/** Every job again, not just the red ones. */
export async function rerunAll(token: string, repo: string, runId: number) {
  await rest(token, `/repos/${repo}/actions/runs/${runId}/rerun`, { method: 'POST' });
}

export async function cancelRun(token: string, repo: string, runId: number) {
  await rest(token, `/repos/${repo}/actions/runs/${runId}/cancel`, { method: 'POST' });
}

export interface Workflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

const workflowsSchema = z.object({
  workflows: z.array(
    z.object({ id: z.number(), name: z.string(), path: z.string(), state: z.string() }),
  ),
});

export async function listWorkflows(
  token: string,
  repo: string,
  signal?: AbortSignal,
): Promise<Workflow[]> {
  const data = await rest(token, `/repos/${repo}/actions/workflows?per_page=50`, {
    schema: workflowsSchema,
    signal,
  });
  return data.workflows;
}

export interface RepoRun extends WorkflowRun {
  branch: string;
  title: string;
  createdAt: string;
  actor: string;
}

const repoRunsSchema = z.object({
  workflow_runs: z.array(
    z.object({
      id: z.number(),
      name: z.string().nullable(),
      status: z.string().nullable(),
      conclusion: z.string().nullable(),
      event: z.string(),
      html_url: z.string(),
      head_branch: z.string().nullable(),
      display_title: z.string().nullable().optional(),
      created_at: z.string(),
      actor: z.object({ login: z.string() }).nullable(),
    }),
  ),
});

export async function listRuns(token: string, repo: string, signal?: AbortSignal): Promise<RepoRun[]> {
  const data = await rest(token, `/repos/${repo}/actions/runs?per_page=20`, {
    schema: repoRunsSchema,
    signal,
  });
  return data.workflow_runs.map((run) => ({
    id: run.id,
    name: run.name ?? 'workflow',
    status: run.status ?? 'unknown',
    conclusion: run.conclusion,
    event: run.event,
    url: run.html_url,
    branch: run.head_branch ?? '',
    title: run.display_title ?? run.name ?? '',
    createdAt: run.created_at,
    actor: run.actor?.login ?? 'ghost',
  }));
}

/**
 * Run a workflow that has a `workflow_dispatch` trigger, on a branch. Inputs
 * are passed as written; a workflow with required inputs that are missing is
 * refused by GitHub with a message that says which.
 */
export async function dispatchWorkflow(
  token: string,
  repo: string,
  workflowId: number,
  ref: string,
  inputs: Record<string, string> = {},
) {
  await rest(token, `/repos/${repo}/actions/workflows/${workflowId}/dispatches`, {
    method: 'POST',
    body: { ref, inputs },
  });
}

/** `key=value` lines, the way a dispatch's inputs are typed on a phone. */
export function parseInputs(text: string): Record<string, string> {
  const inputs: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const at = line.indexOf('=');
    if (at <= 0) continue;
    const key = line.slice(0, at).trim();
    if (key) inputs[key] = line.slice(at + 1).trim();
  }
  return inputs;
}
