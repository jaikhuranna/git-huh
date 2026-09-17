import { z } from 'zod';

const ENDPOINT = 'https://api.github.com/graphql';

const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query Contributions {
    viewer {
      login
      contributionsCollection {
        contributionYears
        contributionCalendar {
          totalContributions
          weeks {
            contributionDays {
              date
              contributionCount
            }
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

const contributionsSchema = z.object({
  viewer: z.object({
    login: z.string(),
    contributionsCollection: z.object({
      contributionYears: z.array(z.number().int()),
      contributionCalendar: z.object({
        totalContributions: z.number().int().nonnegative(),
        weeks: z.array(
          z.object({ contributionDays: z.array(contributionDaySchema) }),
        ),
      }),
    }),
  }),
});

const commitBucketSchema = z.object({
  contributionsCollection: z.object({
    totalCommitContributions: z.number().int().nonnegative(),
  }),
});

const statsSchema = z
  .object({ prs: z.object({ issueCount: z.number().int().nonnegative() }) })
  .catchall(commitBucketSchema);

const verifySchema = z.object({
  viewer: z.object({ login: z.string() }),
});

export type ContributionDay = z.infer<typeof contributionDaySchema>;
export type ContributionWeek = { contributionDays: ContributionDay[] };

export interface Contributions {
  login: string;
  totalContributions: number;
  weeks: ContributionWeek[];
  years: number[];
}

export interface ContributionStats {
  /** Commits made today (UTC day boundary, same rule as the dot grid). */
  todayCommits: number;
  /** Commits across every year the account has been active. */
  totalCommits: number;
  openPrs: number;
}

export type GitHubErrorKind = 'invalid-token' | 'network' | 'api';

export class GitHubError extends Error {
  readonly kind: GitHubErrorKind;

  constructor(kind: GitHubErrorKind, message: string) {
    super(message);
    this.name = 'GitHubError';
    this.kind = kind;
  }
}

interface GraphQLResponse {
  data?: unknown;
  errors?: { message: string }[];
}

async function executeQuery<T>(
  token: string,
  query: string,
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GitHubError('network', 'Could not reach GitHub.');
  }

  if (response.status === 401) {
    throw new GitHubError('invalid-token', 'GitHub rejected this token.');
  }
  if (!response.ok) {
    throw new GitHubError('api', `GitHub responded with ${response.status}.`);
  }

  const body = (await response.json()) as GraphQLResponse;
  if (body.errors?.length) {
    const message = body.errors[0]?.message ?? 'Unknown GraphQL error.';
    const kind: GitHubErrorKind = /bad credentials/i.test(message)
      ? 'invalid-token'
      : 'api';
    throw new GitHubError(kind, message);
  }

  return schema.parse(body.data);
}

/** Fetch the token owner's last year of contributions. */
export function fetchContributions(
  token: string,
  signal?: AbortSignal,
): Promise<Contributions> {
  return executeQuery(token, CONTRIBUTIONS_QUERY, contributionsSchema, signal).then(
    ({ viewer }) => ({
      login: viewer.login,
      totalContributions:
        viewer.contributionsCollection.contributionCalendar.totalContributions,
      weeks: viewer.contributionsCollection.contributionCalendar.weeks,
      years: viewer.contributionsCollection.contributionYears,
    }),
  );
}

/**
 * Fetch lifetime commits, today's commits and open PR count in a single
 * request: one aliased contributionsCollection per active year, plus a
 * search bucket for open PRs. Needs the login and year list from
 * fetchContributions, so it always runs after it.
 */
export function fetchStats(
  token: string,
  login: string,
  years: number[],
  signal?: AbortSignal,
): Promise<ContributionStats> {
  const now = new Date();
  const todayStart = `${now.toISOString().slice(0, 10)}T00:00:00Z`;

  const parts = [
    `today: viewer { contributionsCollection(from: "${todayStart}", to: "${now.toISOString()}") { totalCommitContributions } }`,
    ...years.map(
      (year) =>
        `y${year}: viewer { contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { totalCommitContributions } }`,
    ),
    `prs: search(type: ISSUE, query: "is:pr is:open author:${login}") { issueCount }`,
  ];

  return executeQuery(
    token,
    `query Stats { ${parts.join(' ')} }`,
    statsSchema,
    signal,
  ).then((data) => {
    let todayCommits = 0;
    let totalCommits = 0;
    for (const [key, bucket] of Object.entries(data)) {
      if (key === 'prs') continue;
      const commits = (bucket as z.infer<typeof commitBucketSchema>)
        .contributionsCollection.totalCommitContributions;
      if (key === 'today') todayCommits = commits;
      else totalCommits += commits;
    }
    return { todayCommits, totalCommits, openPrs: data.prs.issueCount };
  });
}

/** Cheap liveness check used before persisting a new token. */
export async function verifyToken(token: string): Promise<string> {
  const { viewer } = await executeQuery(token, VERIFY_QUERY, verifySchema);
  return viewer.login;
}
