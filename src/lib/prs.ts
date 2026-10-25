import { z } from 'zod';

import { rememberPull, rememberedPull } from './pullRequest';
import type { RequestPriority } from './rateLimit';
import { rest } from './rest';

export interface PullRequest {
  number: number;
  title: string;
  repo: string;
  createdAt: string;
  draft: boolean;
  htmlUrl: string;
}

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
  priority: RequestPriority = 'interactive',
): Promise<PullRequest[]> {
  const query = encodeURIComponent(`is:pr is:open author:${login}`);
  const data = await rest(token, `/search/issues?q=${query}&sort=created&order=desc&per_page=20`, {
    schema: searchSchema,
    signal,
    priority,
  });
  return data.items.map((item) => {
    const repo = repoOf(item.repository_url);
    const pull = {
      number: item.number,
      title: item.title,
      repo,
      createdAt: item.created_at,
      draft: item.draft ?? false,
      htmlUrl: item.html_url,
    };
    const prior = rememberedPull(repo, item.number, 'authored-open');
    rememberPull({
      repo,
      number: item.number,
      title: item.title,
      htmlUrl: item.html_url,
      createdAt: item.created_at,
      draft: item.draft ?? false,
      membership: 'authored-open',
    });
    return prior
      ? { ...pull, title: prior.title, htmlUrl: prior.htmlUrl, createdAt: prior.createdAt, draft: prior.draft }
      : pull;
  });
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
