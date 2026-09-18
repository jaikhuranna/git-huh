import { z } from 'zod';

export interface PullRequest {
  number: number;
  title: string;
  repo: string;
  createdAt: string;
  draft: boolean;
  htmlUrl: string;
}

const REST_ENDPOINT = 'https://api.github.com/search/issues';

const searchSchema = z.object({
  total_count: z.number().int().nonnegative(),
  items: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      created_at: z.string(),
      draft: z.boolean().optional(),
      repository_url: z.string(),
      html_url: z.string(),
    }),
  ),
});

function repoOf(repositoryUrl: string): string {
  return repositoryUrl.split('/repos/')[1] ?? repositoryUrl;
}

export async function fetchOpenPrs(
  token: string,
  login: string,
  signal?: AbortSignal,
): Promise<PullRequest[]> {
  const query = encodeURIComponent(`is:pr is:open author:${login}`);
  const response = await fetch(
    `${REST_ENDPOINT}?q=${query}&sort=created&order=desc&per_page=20`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
      },
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub responded with ${response.status}.`);
  }
  const data = searchSchema.parse(await response.json());
  return data.items.map((item) => ({
    number: item.number,
    title: item.title,
    repo: repoOf(item.repository_url),
    createdAt: item.created_at,
    draft: item.draft ?? false,
    htmlUrl: item.html_url,
  }));
}

export function prAge(createdAt: string, now: Date = new Date()): string {
  const days = Math.floor(
    (now.getTime() - new Date(createdAt).getTime()) / 86_400_000,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}
