import { z } from 'zod';

const ENDPOINT = 'https://api.github.com/graphql';

const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query Contributions {
    viewer {
      login
      contributionsCollection {
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
      contributionCalendar: z.object({
        totalContributions: z.number().int().nonnegative(),
        weeks: z.array(
          z.object({ contributionDays: z.array(contributionDaySchema) }),
        ),
      }),
    }),
  }),
});

const verifySchema = z.object({
  viewer: z.object({ login: z.string() }),
});

export type ContributionDay = z.infer<typeof contributionDaySchema>;
export type ContributionWeek = { contributionDays: ContributionDay[] };

export interface Contributions {
  login: string;
  totalContributions: number;
  weeks: ContributionWeek[];
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
    }),
  );
}

/** Cheap liveness check used before persisting a new token. */
export async function verifyToken(token: string): Promise<string> {
  const { viewer } = await executeQuery(token, VERIFY_QUERY, verifySchema);
  return viewer.login;
}
