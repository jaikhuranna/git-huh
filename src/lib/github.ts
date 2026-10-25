import { z } from 'zod';

import { maySend, noteRateLimit, type RequestPriority } from './rateLimit';
import {
  composeDeadline,
  deadlineError,
  DEFAULT_READ_TIMEOUT_MS,
  readBounded,
  type ResponseBudget,
} from './requestBudget';

export type { RequestPriority };

const ENDPOINT = 'https://api.github.com/graphql';

/**
 * Calendar + profile + "last year" totals in one shot. Kept separate from
 * the heavier per-year/repo query below so the grid can render the moment
 * this settles, even if the second query is slow or fails.
 */
const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query Contributions {
    viewer {
      id
      login
      name
      avatarUrl
      bio
      createdAt
      contributionsCollection {
        contributionYears
        restrictedContributionsCount
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
          }
        }
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
        commitContributionsByRepository(maxRepositories: 10) {
          repository {
            nameWithOwner
          }
          contributions {
            totalCount
          }
        }
      }
    }
  }
`;

const VERIFY_QUERY = /* GraphQL */ `
  query Verify {
    viewer {
      login
    }
  }
`;

const contributionDaySchema = z.object({
  date: z.string(),
  contributionCount: z.number().int().nonnegative(),
});

const calendarSchema = z.object({
  totalContributions: z.number().int().nonnegative(),
  weeks: z.array(z.object({ contributionDays: z.array(contributionDaySchema) })),
});

const commitByRepoSchema = z.object({
  repository: z.object({ nameWithOwner: z.string() }),
  contributions: z.object({ totalCount: z.number().int().nonnegative() }),
});

const contributionsSchema = z.object({
  viewer: z.object({
    id: z.string(),
    login: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string(),
    bio: z.string().nullable(),
    createdAt: z.string(),
    contributionsCollection: z.object({
      contributionYears: z.array(z.number().int()),
      restrictedContributionsCount: z.number().int().nonnegative(),
      contributionCalendar: calendarSchema,
      totalCommitContributions: z.number().int().nonnegative(),
      totalPullRequestContributions: z.number().int().nonnegative(),
      totalIssueContributions: z.number().int().nonnegative(),
      totalPullRequestReviewContributions: z.number().int().nonnegative(),
      commitContributionsByRepository: z.array(commitByRepoSchema),
    }),
  }),
});

const languageNodeSchema = z.object({
  name: z.string(),
  color: z.string().nullable(),
});

const repoNodeSchema = z.object({
  name: z.string(),
  nameWithOwner: z.string(),
  description: z.string().nullable(),
  stargazerCount: z.number().int().nonnegative(),
  forkCount: z.number().int().nonnegative(),
  isPrivate: z.boolean(),
  pushedAt: z.string().nullable(),
  url: z.string(),
  primaryLanguage: languageNodeSchema.nullable(),
  languages: z.object({
    edges: z.array(
      z.object({
        size: z.number().int().nonnegative(),
        node: languageNodeSchema,
      }),
    ),
  }),
});

const todayBucketSchema = z.object({
  contributionsCollection: z.object({
    totalCommitContributions: z.number().int().nonnegative(),
    restrictedContributionsCount: z.number().int().nonnegative(),
  }),
});

/** One aliased `viewer` block per contribution year — commits + full calendar. */
const yearBucketSchema = z.object({
  contributionsCollection: z.object({
    totalCommitContributions: z.number().int().nonnegative(),
    restrictedContributionsCount: z.number().int().nonnegative(),
    contributionCalendar: calendarSchema,
  }),
});

const verifySchema = z.object({
  viewer: z.object({ login: z.string() }),
});

export type ContributionDay = z.infer<typeof contributionDaySchema>;
export type ContributionWeek = { contributionDays: ContributionDay[] };

export interface Contributions {
  login: string;
  /**
   * The viewer's GraphQL node id. Commit history can filter by this on the
   * server; without it a sample has to download other people's commits too.
   */
  id: string;
  /** Display name, nullable on GitHub when unset. */
  name: string | null;
  avatarUrl: string;
  bio: string | null;
  createdAt: string;
  totalContributions: number;
  weeks: ContributionWeek[];
  /** Every year the account has contributed, unbounded (poster/archive chips). */
  years: number[];
  /** Totals for the default "last year" window, split by contribution type. */
  totalCommitContributions: number;
  totalPullRequestContributions: number;
  totalIssueContributions: number;
  totalPullRequestReviewContributions: number;
  /**
   * Work in private repositories, which GitHub reports as a single opaque
   * count rather than as commits/PRs/issues. The calendar already includes
   * it; the four typed totals above do not, so without this the breakdown
   * adds up to a small fraction of the year.
   */
  restrictedContributions: number;
  /** Top 10 repos by commit count in the default window, for the flow Sankey. */
  commitContributionsByRepository: { nameWithOwner: string; count: number }[];
}

export interface RepoNode {
  name: string;
  nameWithOwner: string;
  description: string | null;
  stargazerCount: number;
  forkCount: number;
  isPrivate: boolean;
  pushedAt: string | null;
  url: string;
  primaryLanguage: { name: string; color: string | null } | null;
  languages: { name: string; color: string | null; size: number }[];
}

export interface YearStats {
  year: number;
  totalCommits: number;
  /** That year's private-repository contributions. */
  restricted: number;
  totalContributions: number;
  weeks: ContributionWeek[];
}

/**
 * Whether a subsection has a real answer.
 *
 * `loading` has not arrived. `ready` is a genuine answer, including a valid
 * zero. `unavailable` is a failed read that must not be stored as zeros.
 * `stale` is the last successful answer, kept with `at`, after a later read
 * failed.
 */
export type SliceStatus = 'loading' | 'ready' | 'unavailable' | 'stale';

export interface Slice<T> {
  status: SliceStatus;
  value: T;
  /** When `value` was last known to be true, if it ever was. */
  at: number | null;
}

function loadingSlice<T>(value: T): Slice<T> {
  return { status: 'loading', value, at: null };
}

export interface TodaySlice {
  /**
   * Work done today (UTC day boundary, same rule as the dot grid): public
   * commits plus the private-repo count, because a day spent in a private
   * repository is still a day of work.
   */
  todayCommits: number;
  /** Open pull requests authored by the account. A count, not the list. */
  openPrs: number;
}

export interface WorkSlice {
  followers: number;
  following: number;
  /** Every owned non-fork repo, not just the ones detailed below. */
  repoCount: number;
}

/** Repositories and languages Today draws. Independent of the year archive. */
export interface ReposSlice {
  /** Sum of stargazers across the owner's top 100 non-fork repos. */
  stars: number;
  repos: RepoNode[];
}

/** Older calendars, requested when a year is opened. The rolling year is not here. */
export interface ArchiveSlice {
  /** Commits summed across the capped year list below. */
  totalCommits: number;
  /** Private-repo contributions summed across the same years. */
  totalPrivate: number;
  /** Per-year commit totals + full calendars, oldest first. Capped to 12 years. */
  years: YearStats[];
}

export interface ContributionStats {
  today: Slice<TodaySlice>;
  work: Slice<WorkSlice>;
  repos: Slice<ReposSlice>;
  archive: Slice<ArchiveSlice>;
}

/**
 * `forbidden` is a token that is valid but not allowed to do this particular
 * thing — the missing scope, the repository it cannot write to. It is its
 * own kind because the fix is different: not "sign in again" but "mint a
 * token that can". `missing` is GitHub saying the thing is not there, which
 * for a private repository is also how it says "not for you".
 */
export type GitHubErrorKind =
  | 'invalid-token'
  | 'network'
  | 'api'
  | 'forbidden'
  | 'missing';

/**
 * How sure we are about a write that failed in transit.
 *
 * `unsent` never left the device. `rejected` is an answer from GitHub saying
 * no. `unknown` is the dangerous one: the request was dispatched and then the
 * reply was lost, so the write may already exist and must not be replayed as
 * if it did not. `timeout` is a deadline, which for a write is also unknown.
 */
export type Outcome =
  | 'unsent'
  | 'rejected'
  | 'unknown'
  | 'timeout'
  | 'rate-limited'
  | 'bounded';

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;
  /**
   * A finer label than `kind`. Existing switches keep matching `kind`; this
   * is what a write uses to avoid claiming the action never left.
   */
  readonly outcome: Outcome;

  constructor(kind: GitHubErrorKind, message: string, outcome: Outcome = 'rejected') {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
    this.outcome = outcome;
  }
}

/** True when a write may already have landed and must not be replayed blindly. */
export function outcomeUnknown(error: unknown): boolean {
  return error instanceof GitHubError && (error.outcome === 'unknown' || error.outcome === 'timeout');
}

interface GraphQLResponse {
  data?: unknown;
  errors?: { message: string; type?: string; extensions?: { code?: string } }[];
}

export interface QueryOptions {
  signal?: AbortSignal;
  variables?: Record<string, unknown>;
  /**
   * Keep the data when every error is a NOT_FOUND: a query that asks for a
   * login as both a user and an organisation always gets one of each.
   */
  missingIsAnswer?: boolean;
  /** How long to wait before treating the query as unanswered. */
  timeoutMs?: number;
  /** Background work waits out a known rate-limit window instead of storming it. */
  priority?: RequestPriority;
  /**
   * True for a mutation. A dropped reply is then an unknown outcome, not
   * "could not reach GitHub" as if nothing was sent.
   */
  mutation?: boolean;
  budget?: ResponseBudget;
}

/** A write always retains mutation intent when it enters the shared transport. */
export async function executeMutation<T>(
  token: string,
  mutation: string,
  schema: z.ZodType<T>,
  variables: Record<string, unknown>,
  options?: Omit<QueryOptions, 'mutation' | 'variables'>,
): Promise<T> {
  if (options?.signal?.aborted) {
    const error = new Error('The operation was aborted.');
    error.name = 'AbortError';
    throw error;
  }
  return executeQuery(token, mutation, schema, { ...options, mutation: true, variables });
}

/**
 * Shared by activity.ts, which runs its own queries against the same rules.
 *
 * The positional form stays, so existing callers do not change. A seventh
 * argument, or fields passed as the sixth when it is an options object, adds
 * a deadline and a priority without a new function.
 */
export async function executeQuery<T>(
  token: string,
  query: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal | QueryOptions,
  variables?: Record<string, unknown>,
  missingIsAnswer?: boolean,
  options?: QueryOptions,
): Promise<T> {
  const opts: QueryOptions =
    signal != null && typeof signal === 'object' && !('aborted' in signal)
      ? signal
      : { signal: signal as AbortSignal | undefined, variables, missingIsAnswer, ...options };
  const priority = opts.priority ?? 'interactive';
  if (!maySend(token, priority)) {
    throw new GitHubError(
      'api',
      'GitHub is rate-limiting this account. Waiting for the window to pass.',
      'rate-limited',
    );
  }

  const deadline = composeDeadline(opts.signal, opts.timeoutMs ?? DEFAULT_READ_TIMEOUT_MS);
  const mutation = opts.mutation === true;
  // A mutation's reply can be lost after GitHub applied it. Marking the
  // call as entered is what stops that from being described as unsent.
  let response: Response;
  const open = mutation && opts.signal?.aborted !== true;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(opts.variables ? { query, variables: opts.variables } : { query }),
      signal: deadline.signal,
    }).catch((error: unknown) => {
      throw graphqlTransportFailure(error, deadline.timedOut(), mutation, open);
    });

    if (response.status === 401) {
      throw new GitHubError('invalid-token', 'GitHub rejected this token.');
    }
    if (response.status === 403 || response.status === 429) {
      throw graphqlLimit(response, token);
    }
    if (!response.ok) {
      throw new GitHubError('api', `GitHub responded with ${response.status}.`);
    }

    const bounded = await readBounded(response, opts.budget, deadline.signal).catch(
      (error: unknown) => {
        throw graphqlTransportFailure(error, deadline.timedOut(), mutation, open);
      },
    );
    if (bounded.truncated) {
      throw new GitHubError('api', 'The answer was larger than this screen can hold.', 'bounded');
    }
    let body: GraphQLResponse;
    try {
      body = JSON.parse(bounded.text) as GraphQLResponse;
    } catch {
      throw unexpected();
    }
    const onlyMissing =
      opts.missingIsAnswer &&
      body.data != null &&
      body.errors?.every((error) => error.type === 'NOT_FOUND');
    if (body.errors?.length && !onlyMissing) {
      const first = body.errors[0];
      const message = first?.message ?? 'Unknown GraphQL error.';
      const code = first?.extensions?.code ?? '';
      if (code === 'RATE_LIMITED' || /rate limit/i.test(message)) {
        throw new GitHubError('api', message, 'rate-limited');
      }
      const kind: GitHubErrorKind = /bad credentials/i.test(message)
        ? 'invalid-token'
        : first?.type === 'FORBIDDEN' || first?.type === 'INSUFFICIENT_SCOPES'
          ? 'forbidden'
          : first?.type === 'NOT_FOUND'
            ? 'missing'
            : 'api';
      throw new GitHubError(kind, message);
    }

    return parseAs(schema, body.data);
  } finally {
    deadline.dispose();
  }
}


function graphqlTransportFailure(
  error: unknown,
  timedOut: boolean,
  mutation: boolean,
  dispatched: boolean,
): GitHubError {
  if (timedOut) {
    return mutation
      ? new GitHubError(
          'network',
          'GitHub did not answer in time. The change may already have landed.',
          'timeout',
        )
      : deadlineError();
  }
  if (error instanceof Error && error.name === 'AbortError') throw error;
  return new GitHubError(
    'network',
    dispatched ? 'The reply was lost. Check before trying again.' : 'Could not reach GitHub.',
    dispatched ? 'unknown' : 'unsent',
  );
}

function graphqlLimit(response: Response, token: string): GitHubError {
  const retryAfter = Number(response.headers.get('retry-after'));
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const until = Number.isFinite(retryAfter) && retryAfter > 0
    ? Date.now() + retryAfter * 1000
    : Number.isFinite(reset) && reset > 0
      ? reset * 1000
      : Date.now() + 60_000;
  noteRateLimit(token, until);
  return new GitHubError(
    'api',
    'GitHub is rate-limiting this account.',
    'rate-limited',
  );
}

function unexpected(): GitHubError {
  return new GitHubError('api', 'GitHub sent back something this app does not understand.');
}

/**
 * Validate a response against its schema. A shape GitHub has changed is an
 * API failure like any other — screens handle `GitHubError`, never a raw
 * ZodError.
 */
export function parseAs<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw unexpected();
  return parsed.data;
}

/**
 * `contributionYears` filtered down to years the account could actually have
 * contributed in.
 *
 * GitHub derives the list from commit *author* dates, and those are just a
 * field in the object: an import, a wrong system clock or a `git commit
 * --date` puts a commit — and therefore a whole contribution year — decades
 * before the account existed. That is where a 2016 account grows a "1999".
 * The account's own createdAt is the honest floor, and today is the ceiling.
 */
export function plausibleYears(
  years: number[],
  createdAt: string,
  now: Date = new Date(),
): number[] {
  const created = new Date(createdAt).getFullYear();
  const floor = Number.isFinite(created) ? created : now.getFullYear();
  const kept = years.filter((year) => year >= floor && year <= now.getFullYear());
  // An account that only ever committed with a bad clock would filter down to
  // nothing; it still has to appear somewhere on the poster.
  return kept.length > 0 ? kept : [now.getFullYear()];
}

/** Fetch the token owner's profile, last-year calendar and type breakdown. */
export function fetchContributions(
  token: string,
  signal?: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<Contributions> {
  return executeQuery(token, CONTRIBUTIONS_QUERY, contributionsSchema, {
    signal,
    priority,
  }).then(
    ({ viewer }) => ({
      id: viewer.id,
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      bio: viewer.bio,
      createdAt: viewer.createdAt,
      totalContributions:
        viewer.contributionsCollection.contributionCalendar.totalContributions,
      weeks: viewer.contributionsCollection.contributionCalendar.weeks,
      years: plausibleYears(
        viewer.contributionsCollection.contributionYears,
        viewer.createdAt,
      ),
      totalCommitContributions:
        viewer.contributionsCollection.totalCommitContributions,
      totalPullRequestContributions:
        viewer.contributionsCollection.totalPullRequestContributions,
      totalIssueContributions:
        viewer.contributionsCollection.totalIssueContributions,
      totalPullRequestReviewContributions:
        viewer.contributionsCollection.totalPullRequestReviewContributions,
      restrictedContributions:
        viewer.contributionsCollection.restrictedContributionsCount,
      commitContributionsByRepository:
        viewer.contributionsCollection.commitContributionsByRepository.map(
          (entry) => ({
            nameWithOwner: entry.repository.nameWithOwner,
            count: entry.contributions.totalCount,
          }),
        ),
    }),
  );
}

const EMPTY_TODAY: TodaySlice = { todayCommits: 0, openPrs: 0 };
const EMPTY_WORK: WorkSlice = { followers: 0, following: 0, repoCount: 0 };
const EMPTY_REPOS: ReposSlice = { stars: 0, repos: [] };
const EMPTY_ARCHIVE: ArchiveSlice = { totalCommits: 0, totalPrivate: 0, years: [] };

/** A model that has only the rolling calendar. Nothing here pretends to be a count. */
export function pendingStats(): ContributionStats {
  return {
    today: loadingSlice(EMPTY_TODAY),
    work: loadingSlice(EMPTY_WORK),
    repos: loadingSlice(EMPTY_REPOS),
    archive: loadingSlice(EMPTY_ARCHIVE),
  };
}

/** The most recent twelve contribution years. Older ones stay listed, not fetched. */
export function recentContributionYears(years: number[]): number[] {
  return [...years].sort((a, b) => b - a).slice(0, 12);
}

const todaySchema = z.object({
  today: todayBucketSchema,
  prs: z.object({ issueCount: z.number().int().nonnegative() }),
});

const workSchema = z.object({
  social: z.object({
    followers: z.object({ totalCount: z.number().int().nonnegative() }),
    following: z.object({ totalCount: z.number().int().nonnegative() }),
    repositories: z.object({ totalCount: z.number().int().nonnegative() }),
  }),
});

const reposSchema = z.object({
  repos: z.object({
    repositories: z.object({ nodes: z.array(repoNodeSchema) }),
  }),
});

function ready<T>(value: T, at = Date.now()): Slice<T> {
  return { status: 'ready', value, at };
}

function toRepos(nodes: z.infer<typeof repoNodeSchema>[]): RepoNode[] {
  return nodes.map((node) => ({
    name: node.name,
    nameWithOwner: node.nameWithOwner,
    description: node.description,
    stargazerCount: node.stargazerCount,
    forkCount: node.forkCount,
    isPrivate: node.isPrivate,
    pushedAt: node.pushedAt,
    url: node.url,
    primaryLanguage: node.primaryLanguage,
    languages: node.languages.edges.map((edge) => ({
      name: edge.node.name,
      color: edge.node.color,
      size: edge.size,
    })),
  }));
}

/**
 * Today's commit count and the open-PR count. Small on purpose: Today must
 * not wait for twelve calendars or a hundred repositories to know whether
 * anything is waiting.
 */
export function fetchToday(
  token: string,
  login: string,
  signal?: AbortSignal,
  now: Date = new Date(),
  priority: RequestPriority = 'interactive',
): Promise<Slice<TodaySlice>> {
  const todayStart = `${now.toISOString().slice(0, 10)}T00:00:00Z`;
  const query = /* GraphQL */ `
    query Today {
      today: viewer {
        contributionsCollection(from: "${todayStart}", to: "${now.toISOString()}") {
          totalCommitContributions
          restrictedContributionsCount
        }
      }
      prs: search(type: ISSUE, query: "is:pr is:open author:${login}", first: 1) {
        issueCount
      }
    }
  `;
  return executeQuery(token, query, todaySchema, { signal, priority }).then((data) =>
    ready({
      todayCommits:
        data.today.contributionsCollection.totalCommitContributions +
        data.today.contributionsCollection.restrictedContributionsCount,
      openPrs: data.prs.issueCount,
    }),
  );
}

/** Followers and the owned-repository count. Not the repository list. */
export function fetchWork(
  token: string,
  signal?: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<Slice<WorkSlice>> {
  const query = /* GraphQL */ `
    query Work {
      social: viewer {
        followers { totalCount }
        following { totalCount }
        repositories(ownerAffiliations: OWNER, isFork: false) { totalCount }
      }
    }
  `;
  return executeQuery(token, query, workSchema, { signal, priority }).then((data) =>
    ready({
      followers: data.social.followers.totalCount,
      following: data.social.following.totalCount,
      repoCount: data.social.repositories.totalCount,
    }),
  );
}

/**
 * The repository and language list Today draws. Kept off the year archive so
 * a stalled calendar for 2014 cannot hold the language chart.
 */
export function fetchRepos(
  token: string,
  signal?: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<Slice<ReposSlice>> {
  const query = /* GraphQL */ `
    query Repos {
      repos: viewer {
        repositories(
          first: 100
          ownerAffiliations: OWNER
          isFork: false
          orderBy: { field: PUSHED_AT, direction: DESC }
        ) {
          nodes {
            name
            nameWithOwner
            description
            stargazerCount
            forkCount
            isPrivate
            pushedAt
            url
            primaryLanguage { name color }
            languages(first: 8, orderBy: { field: SIZE, direction: DESC }) {
              edges { size node { name color } }
            }
          }
        }
      }
    }
  `;
  return executeQuery(token, query, reposSchema, { signal, priority }).then((data) => {
    const repos = toRepos(data.repos.repositories.nodes);
    return ready({
      stars: repos.reduce((sum, repo) => sum + repo.stargazerCount, 0),
      repos,
    });
  });
}

/**
 * Older contribution calendars, reduced by the caller. Requested when a year
 * is opened, not before the rolling calendar can paint.
 */
export function fetchArchive(
  token: string,
  years: number[],
  signal?: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<Slice<ArchiveSlice>> {
  const recentYears = recentContributionYears(years);
  if (recentYears.length === 0) return Promise.resolve(ready(EMPTY_ARCHIVE));
  const parts = recentYears.map(
    (year) =>
      `y${year}: viewer { contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { totalCommitContributions restrictedContributionsCount contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } }`,
  );
  return executeQuery(
    token,
    `query Archive { ${parts.join(' ')} }`,
    z.object({}).catchall(yearBucketSchema),
    { signal, priority },
  ).then((data) => {
    let totalCommits = 0;
    let totalPrivate = 0;
    const collected: YearStats[] = [];
    for (const [key, bucket] of Object.entries(data)) {
      const { totalCommitContributions, restrictedContributionsCount, contributionCalendar } =
        bucket.contributionsCollection;
      totalCommits += totalCommitContributions;
      totalPrivate += restrictedContributionsCount;
      collected.push({
        year: Number(key.slice(1)),
        totalCommits: totalCommitContributions,
        restricted: restrictedContributionsCount,
        totalContributions: contributionCalendar.totalContributions,
        weeks: contributionCalendar.weeks,
      });
    }
    collected.sort((a, b) => a.year - b.year);
    return ready({ totalCommits, totalPrivate, years: collected });
  });
}

/**
 * Kept so a caller that still wants every slice can ask for them together.
 * `loadModel` does not use this: the rolling calendar must not wait on it.
 */
export async function fetchStats(
  token: string,
  login: string,
  years: number[],
  signal?: AbortSignal,
): Promise<ContributionStats> {
  const [today, work, repos, archive] = await Promise.all([
    fetchToday(token, login, signal),
    fetchWork(token, signal),
    fetchRepos(token, signal),
    fetchArchive(token, years, signal),
  ]);
  return { today, work, repos, archive };
}

/**
 * What the token is actually allowed to see.
 *
 * This is the difference between a widget full of dots and an empty one.
 * `contributionsCollection` is scoped to the token, not to the account: a PAT
 * without `repo` is answered with the *public* half of your year, so an
 * account whose work lives in private repositories gets a flat grid, a today
 * count of zero and a breakdown totalling a handful of contributions — with
 * no error anywhere, because GitHub considers that a complete answer.
 *
 * Only classic PATs report their scopes (`x-oauth-scopes`). Fine-grained
 * tokens send no such header, and there is nothing to infer from that, so
 * they resolve to null and the app stays quiet rather than guessing.
 */
export async function fetchTokenScopes(
  token: string,
  signal?: AbortSignal,
  priority: RequestPriority = 'interactive',
): Promise<string[] | null> {
  if (!maySend(token, priority)) {
    throw new GitHubError(
      'api',
      'GitHub is rate-limiting this account. Waiting for the window to pass.',
      'rate-limited',
    );
  }
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal,
    });
    if (!response.ok) return null;
    const header = response.headers.get('x-oauth-scopes');
    if (header == null) return null;
    return header
      .split(',')
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return null;
  }
}

/** True when we know for certain the token cannot see private work. */
export function seesPrivateWork(scopes: string[] | null): boolean | null {
  if (scopes == null) return null;
  return scopes.includes('repo');
}

/** Cheap liveness check used before persisting a new token. */
export async function verifyToken(
  token: string,
  priority: RequestPriority = 'interactive',
): Promise<string> {
  const { viewer } = await executeQuery(token, VERIFY_QUERY, verifySchema, { priority });
  return viewer.login;
}
