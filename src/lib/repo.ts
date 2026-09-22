import { Buffer } from 'buffer';
import { z } from 'zod';

import { executeQuery, GitHubError } from './github';
import { rest } from './rest';
import { encodePath } from './writes';

/**
 * One repository, from the inside: its files, a search through its code,
 * its releases, its open issues, its discussions and its security alerts.
 *
 * Every one of these was a link out of GitHub's own app at some point, and
 * most still are — the website is where you go when the phone gives up.
 */

export interface RepoInfo {
  nameWithOwner: string;
  description: string;
  url: string;
  defaultBranch: string;
  stars: number;
  forks: number;
  isPrivate: boolean;
  language: { name: string; color: string } | null;
  /** ADMIN · MAINTAIN · WRITE · TRIAGE · READ — what this token may do here. */
  permission: string | null;
  openIssues: number;
  discussionsEnabled: boolean;
}

const infoSchema = z.object({
  repository: z
    .object({
      nameWithOwner: z.string(),
      description: z.string().nullable(),
      url: z.string(),
      defaultBranchRef: z.object({ name: z.string() }).nullable(),
      stargazerCount: z.number(),
      forkCount: z.number(),
      isPrivate: z.boolean(),
      viewerPermission: z.string().nullable(),
      hasDiscussionsEnabled: z.boolean(),
      primaryLanguage: z.object({ name: z.string(), color: z.string().nullable() }).nullable(),
      issues: z.object({ totalCount: z.number() }),
    })
    .nullable(),
});

export async function fetchRepoInfo(
  token: string,
  repo: string,
  signal?: AbortSignal,
): Promise<RepoInfo | null> {
  const [owner, name] = repo.split('/');
  const data = await executeQuery(
    token,
    /* GraphQL */ `
      query Repo {
        repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          nameWithOwner description url stargazerCount forkCount isPrivate
          viewerPermission hasDiscussionsEnabled
          defaultBranchRef { name }
          primaryLanguage { name color }
          issues(states: OPEN) { totalCount }
        }
      }
    `,
    infoSchema,
    signal,
  );
  const repository = data.repository;
  if (!repository) return null;
  return {
    nameWithOwner: repository.nameWithOwner,
    description: repository.description ?? '',
    url: repository.url,
    defaultBranch: repository.defaultBranchRef?.name ?? 'main',
    stars: repository.stargazerCount,
    forks: repository.forkCount,
    isPrivate: repository.isPrivate,
    language: repository.primaryLanguage
      ? { name: repository.primaryLanguage.name, color: repository.primaryLanguage.color ?? '#93918B' }
      : null,
    permission: repository.viewerPermission,
    openIssues: repository.issues.totalCount,
    discussionsEnabled: repository.hasDiscussionsEnabled,
  };
}

// --- files ------------------------------------------------------------------

/** An empty ref means the default branch, which is what GitHub assumes too. */
function refQuery(ref: string): string {
  return ref ? `?ref=${encodeURIComponent(ref)}` : '';
}

export interface Entry {
  name: string;
  path: string;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  size: number;
}

const entriesSchema = z.array(
  z.object({
    name: z.string(),
    path: z.string(),
    type: z.enum(['file', 'dir', 'symlink', 'submodule']),
    size: z.number(),
  }),
);

export async function listDirectory(
  token: string,
  repo: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<Entry[]> {
  const entries = await rest(token, `/repos/${repo}/contents/${encodePath(path)}${refQuery(ref)}`, {
    schema: entriesSchema,
    signal,
  });
  // Folders first, the way every file browser has always done it.
  return entries.sort(
    (a, b) => Number(b.type === 'dir') - Number(a.type === 'dir') || a.name.localeCompare(b.name),
  );
}

export interface RepoFile {
  path: string;
  /** Blob sha, needed to write the file back. */
  sha: string;
  size: number;
  ref: string;
  /** null for a binary file, or one too big for GitHub to hand over inline. */
  text: string | null;
}

const fileSchema = z.object({
  path: z.string(),
  sha: z.string(),
  size: z.number(),
  encoding: z.string().optional(),
  content: z.string().optional(),
});

export async function fetchFile(
  token: string,
  repo: string,
  path: string,
  ref: string,
  signal?: AbortSignal,
): Promise<RepoFile> {
  const file = await rest(token, `/repos/${repo}/contents/${encodePath(path)}${refQuery(ref)}`, {
    schema: fileSchema,
    signal,
  });
  let text: string | null = null;
  if (file.encoding === 'base64' && file.content) {
    const bytes = Buffer.from(file.content, 'base64');
    // A NUL in the first few KB is how git itself decides a file is binary.
    text = bytes.subarray(0, 8000).includes(0) ? null : bytes.toString('utf8');
  }
  return { path: file.path, sha: file.sha, size: file.size, ref, text };
}

// --- code search ------------------------------------------------------------

export interface CodeHit {
  repo: string;
  path: string;
  /** The lines around the match, as GitHub quoted them. */
  fragments: string[];
}

const searchSchema = z.object({
  total_count: z.number(),
  items: z.array(
    z.object({
      path: z.string(),
      repository: z.object({ full_name: z.string() }),
      text_matches: z.array(z.object({ fragment: z.string() })).optional(),
    }),
  ),
});

/**
 * GitHub's REST code search, scoped to one repository or to everything an
 * account owns. It indexes default branches only and answers ten searches a
 * minute, and the screen says both rather than pretending to be grep.
 */
export async function searchCode(
  token: string,
  terms: string,
  scope: { repo: string } | { user: string },
  signal?: AbortSignal,
): Promise<{ total: number; hits: CodeHit[] }> {
  const qualifier = 'repo' in scope ? `repo:${scope.repo}` : `user:${scope.user}`;
  const q = encodeURIComponent(`${terms} ${qualifier}`);
  const data = await rest(token, `/search/code?q=${q}&per_page=30`, {
    accept: 'application/vnd.github.text-match+json',
    schema: searchSchema,
    signal,
  });
  return {
    total: data.total_count,
    hits: data.items.map((item) => ({
      repo: item.repository.full_name,
      path: item.path,
      fragments: (item.text_matches ?? []).map((match) => match.fragment).slice(0, 2),
    })),
  };
}

// --- releases ---------------------------------------------------------------

export interface Release {
  id: number;
  name: string;
  tag: string;
  body: string;
  publishedAt: string | null;
  prerelease: boolean;
  draft: boolean;
  url: string;
  assets: number;
}

const releasesSchema = z.array(
  z.object({
    id: z.number(),
    name: z.string().nullable(),
    tag_name: z.string(),
    body: z.string().nullable(),
    published_at: z.string().nullable(),
    prerelease: z.boolean(),
    draft: z.boolean(),
    html_url: z.string(),
    assets: z.array(z.unknown()),
  }),
);

export async function listReleases(token: string, repo: string, signal?: AbortSignal): Promise<Release[]> {
  const releases = await rest(token, `/repos/${repo}/releases?per_page=12`, {
    schema: releasesSchema,
    signal,
  });
  return releases.map((release) => ({
    id: release.id,
    name: release.name || release.tag_name,
    tag: release.tag_name,
    body: release.body ?? '',
    publishedAt: release.published_at,
    prerelease: release.prerelease,
    draft: release.draft,
    url: release.html_url,
    assets: release.assets.length,
  }));
}

// --- issues and discussions -------------------------------------------------

export interface IssueRow {
  number: number;
  title: string;
  author: string;
  comments: number;
  createdAt: string;
  labels: { name: string; color: string }[];
}

const issuesSchema = z.array(
  z.object({
    number: z.number(),
    title: z.string(),
    user: z.object({ login: z.string() }).nullable(),
    comments: z.number(),
    created_at: z.string(),
    labels: z.array(z.object({ name: z.string(), color: z.string() })),
    pull_request: z.unknown().optional(),
  }),
);

export async function listIssues(token: string, repo: string, signal?: AbortSignal): Promise<IssueRow[]> {
  const issues = await rest(token, `/repos/${repo}/issues?state=open&per_page=30`, {
    schema: issuesSchema,
    signal,
  });
  // The issues endpoint returns pull requests too; they have their own drawer.
  return issues
    .filter((issue) => issue.pull_request === undefined)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      author: issue.user?.login ?? 'ghost',
      comments: issue.comments,
      createdAt: issue.created_at,
      labels: issue.labels,
    }));
}

export interface DiscussionRow {
  number: number;
  title: string;
  author: string;
  comments: number;
  category: string;
  updatedAt: string;
  answered: boolean;
}

const discussionsSchema = z.object({
  repository: z
    .object({
      discussions: z.object({
        nodes: z.array(
          z.object({
            number: z.number(),
            title: z.string(),
            author: z.object({ login: z.string() }).nullable(),
            comments: z.object({ totalCount: z.number() }),
            category: z.object({ name: z.string() }),
            updatedAt: z.string(),
            isAnswered: z.boolean().nullable(),
          }),
        ),
      }),
    })
    .nullable(),
});

export async function listDiscussions(
  token: string,
  repo: string,
  signal?: AbortSignal,
): Promise<DiscussionRow[]> {
  const [owner, name] = repo.split('/');
  const data = await executeQuery(
    token,
    /* GraphQL */ `
      query Discussions {
        repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
          discussions(first: 20, orderBy: { field: UPDATED_AT, direction: DESC }) {
            nodes {
              number title updatedAt isAnswered
              author { login }
              comments { totalCount }
              category { name }
            }
          }
        }
      }
    `,
    discussionsSchema,
    signal,
  );
  return (data.repository?.discussions.nodes ?? []).map((node) => ({
    number: node.number,
    title: node.title,
    author: node.author?.login ?? 'ghost',
    comments: node.comments.totalCount,
    category: node.category.name,
    updatedAt: node.updatedAt,
    answered: node.isAnswered ?? false,
  }));
}

// --- security ---------------------------------------------------------------

export interface Alert {
  number: number;
  severity: string;
  pkg: string;
  ecosystem: string;
  summary: string;
  vulnerable: string;
  patched: string | null;
  manifest: string;
  url: string;
}

const alertsSchema = z.array(
  z.object({
    number: z.number(),
    html_url: z.string(),
    dependency: z.object({
      package: z.object({ name: z.string(), ecosystem: z.string() }),
      manifest_path: z.string(),
    }),
    security_advisory: z.object({ summary: z.string(), severity: z.string() }),
    security_vulnerability: z.object({
      vulnerable_version_range: z.string(),
      first_patched_version: z.object({ identifier: z.string() }).nullable(),
    }),
  }),
);

/**
 * Open Dependabot alerts. This is the one read here that needs a scope the
 * app did not always ask for (`security_events`), so a refusal is reported
 * as exactly that rather than as an empty, reassuring list.
 */
export async function listAlerts(
  token: string,
  repo: string,
  signal?: AbortSignal,
): Promise<Alert[] | 'no-scope' | 'disabled'> {
  try {
    const alerts = await rest(token, `/repos/${repo}/dependabot/alerts?state=open&per_page=30`, {
      schema: alertsSchema,
      signal,
    });
    const order = ['critical', 'high', 'medium', 'low'];
    return alerts
      .map((alert) => ({
        number: alert.number,
        severity: alert.security_advisory.severity,
        pkg: alert.dependency.package.name,
        ecosystem: alert.dependency.package.ecosystem,
        summary: alert.security_advisory.summary,
        vulnerable: alert.security_vulnerability.vulnerable_version_range,
        patched: alert.security_vulnerability.first_patched_version?.identifier ?? null,
        manifest: alert.dependency.manifest_path,
        url: alert.html_url,
      }))
      .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));
  } catch (error) {
    if (error instanceof GitHubError && error.kind === 'forbidden') {
      return /disabled/i.test(error.message) ? 'disabled' : 'no-scope';
    }
    if (error instanceof GitHubError && error.kind === 'missing') return 'no-scope';
    throw error;
  }
}
