import { z } from 'zod';

const ENDPOINT = 'https://api.github.com/graphql';

/**
 * Calendar + profile + "last year" totals in one shot. Kept separate from
 * the heavier per-year/repo query below so the grid can render the moment
 * this settles, even if the second query is slow or fails.
 */
const CONTRIBUTIONS_QUERY = /* GraphQL */ `
  query Contributions {
    viewer {
      login
      name
      avatarUrl
      bio
      createdAt
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
    login: z.string(),
    name: z.string().nullable(),
    avatarUrl: z.string(),
    bio: z.string().nullable(),
    createdAt: z.string(),
    contributionsCollection: z.object({
      contributionYears: z.array(z.number().int()),
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
  }),
});

/** One aliased `viewer` block per contribution year — commits + full calendar. */
const yearBucketSchema = z.object({
  contributionsCollection: z.object({
    totalCommitContributions: z.number().int().nonnegative(),
    contributionCalendar: calendarSchema,
  }),
});

const statsSchema = z
  .object({
    today: todayBucketSchema,
    prs: z.object({ issueCount: z.number().int().nonnegative() }),
    social: z.object({
      followers: z.object({ totalCount: z.number().int().nonnegative() }),
      following: z.object({ totalCount: z.number().int().nonnegative() }),
      repositories: z.object({ totalCount: z.number().int().nonnegative() }),
    }),
    repos: z.object({
      repositories: z.object({ nodes: z.array(repoNodeSchema) }),
    }),
  })
  .catchall(yearBucketSchema);

const verifySchema = z.object({
  viewer: z.object({ login: z.string() }),
});

export type ContributionDay = z.infer<typeof contributionDaySchema>;
export type ContributionWeek = { contributionDays: ContributionDay[] };

export interface Contributions {
  login: string;
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
  totalContributions: number;
  weeks: ContributionWeek[];
}

export interface ContributionStats {
  /** Commits made today (UTC day boundary, same rule as the dot grid). */
  todayCommits: number;
  /** Commits summed across the capped year list below. */
  totalCommits: number;
  openPrs: number;
  followers: number;
  following: number;
  /** Sum of stargazers across the owner's top 100 non-fork repos. */
  stars: number;
  /** Every owned non-fork repo, not just the 100 detailed below. */
  repoCount: number;
  repos: RepoNode[];
  /** Per-year commit totals + full calendars, oldest first. Capped to 12 years. */
  years: YearStats[];
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

/** Fetch the token owner's profile, last-year calendar and type breakdown. */
export function fetchContributions(
  token: string,
  signal?: AbortSignal,
): Promise<Contributions> {
  return executeQuery(token, CONTRIBUTIONS_QUERY, contributionsSchema, signal).then(
    ({ viewer }) => ({
      login: viewer.login,
      name: viewer.name,
      avatarUrl: viewer.avatarUrl,
      bio: viewer.bio,
      createdAt: viewer.createdAt,
      totalContributions:
        viewer.contributionsCollection.contributionCalendar.totalContributions,
      weeks: viewer.contributionsCollection.contributionCalendar.weeks,
      years: viewer.contributionsCollection.contributionYears,
      totalCommitContributions:
        viewer.contributionsCollection.totalCommitContributions,
      totalPullRequestContributions:
        viewer.contributionsCollection.totalPullRequestContributions,
      totalIssueContributions:
        viewer.contributionsCollection.totalIssueContributions,
      totalPullRequestReviewContributions:
        viewer.contributionsCollection.totalPullRequestReviewContributions,
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

/**
 * Fetch lifetime commits (per year), open PRs, social counts and owned repos
 * in one request: one aliased contributionsCollection per active year, plus
 * search/social/repository buckets. Needs the login and year list from
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

  // The per-year calendar is the expensive part of this query; long-lived
  // accounts cap at the most recent 12 years so the request stays inside
  // GitHub's node-count limits and one flaky year can't sink the rest.
  const recentYears = [...years].sort((a, b) => b - a).slice(0, 12);

  const parts = [
    `today: viewer { contributionsCollection(from: "${todayStart}", to: "${now.toISOString()}") { totalCommitContributions } }`,
    ...recentYears.map(
      (year) =>
        `y${year}: viewer { contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${year}-12-31T23:59:59Z") { totalCommitContributions contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } } } }`,
    ),
    `prs: search(type: ISSUE, query: "is:pr is:open author:${login}", first: 1) { issueCount }`,
    `social: viewer { followers { totalCount } following { totalCount } repositories(ownerAffiliations: OWNER, isFork: false) { totalCount } }`,
    `repos: viewer { repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: PUSHED_AT, direction: DESC}) { nodes { name nameWithOwner description stargazerCount forkCount isPrivate pushedAt url primaryLanguage { name color } languages(first: 8, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name color } } } } } }`,
  ];

  return executeQuery(
    token,
    `query Stats { ${parts.join(' ')} }`,
    statsSchema,
    signal,
  ).then((data) => {
    let totalCommits = 0;
    const years: YearStats[] = [];
    for (const [key, bucket] of Object.entries(data)) {
      if (key === 'today' || key === 'prs' || key === 'social' || key === 'repos') {
        continue;
      }
      const { totalCommitContributions, contributionCalendar } = (
        bucket as z.infer<typeof yearBucketSchema>
      ).contributionsCollection;
      totalCommits += totalCommitContributions;
      years.push({
        year: Number(key.slice(1)),
        totalCommits: totalCommitContributions,
        totalContributions: contributionCalendar.totalContributions,
        weeks: contributionCalendar.weeks,
      });
    }
    years.sort((a, b) => a.year - b.year);

    const repos: RepoNode[] = data.repos.repositories.nodes.map((node) => ({
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
    const stars = repos.reduce((sum, repo) => sum + repo.stargazerCount, 0);

    return {
      todayCommits: data.today.contributionsCollection.totalCommitContributions,
      totalCommits,
      openPrs: data.prs.issueCount,
      followers: data.social.followers.totalCount,
      following: data.social.following.totalCount,
      stars,
      repoCount: data.social.repositories.totalCount,
      repos,
      years,
    };
  });
}

/** Cheap liveness check used before persisting a new token. */
export async function verifyToken(token: string): Promise<string> {
  const { viewer } = await executeQuery(token, VERIFY_QUERY, verifySchema);
  return viewer.login;
}
