import type { z } from 'zod';

import { GitHubError, parseAs } from './github';

const API = 'https://api.github.com';

/**
 * GitHub's REST half, with the same error rules as the GraphQL half.
 *
 * Everything that *changes* something goes through here or through a
 * GraphQL mutation, and the difference between the failures matters more for
 * a write than for a read: "no connection, nothing was sent" and "this token
 * cannot write to that repository" ask for different things from the person
 * holding the phone, and "something went wrong" asks for nothing at all.
 */
export async function rest<T = unknown>(
  token: string,
  /** Relative to the API root, so the token is only ever sent to GitHub. */
  path: string,
  {
    method = 'GET',
    body,
    accept = 'application/vnd.github+json',
    schema,
    signal,
  }: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    accept?: string;
    schema?: z.ZodType<T>;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: accept,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    throw new GitHubError('network', 'Could not reach GitHub.');
  }

  if (!response.ok) throw await failure(response);
  if (response.status === 204) return undefined as T;

  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('json')) return (await response.text()) as T;

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new GitHubError('api', 'GitHub sent back something this app does not understand.');
  }
  return schema ? parseAs(schema, data) : (data as T);
}

/** Plain text from an endpoint that answers with a redirect to a file. */
export async function restText(
  token: string,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
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
  if (!response.ok) throw await failure(response);
  return response.text();
}

async function failure(response: Response): Promise<GitHubError> {
  let message = `GitHub responded with ${response.status}.`;
  try {
    const body = (await response.json()) as {
      message?: string;
      errors?: { message?: string; code?: string; field?: string }[];
    };
    const detail = body.errors?.find((error) => error.message)?.message;
    if (body.message) message = detail ? `${body.message}: ${detail}` : body.message;
  } catch {
    // Not every error body is JSON; the status line is enough.
  }

  if (response.status === 401) return new GitHubError('invalid-token', message);
  if (response.status === 403) return new GitHubError('forbidden', message);
  if (response.status === 404) return new GitHubError('missing', message);
  return new GitHubError('api', message);
}

/**
 * What to tell a person when a write did not happen. Lower case, no
 * apology, and always the one thing that would change the outcome.
 */
export function explain(error: unknown, doing = 'that'): string {
  if (error instanceof GitHubError) {
    switch (error.kind) {
      case 'network':
        return `no connection · ${doing} was not sent`;
      case 'invalid-token':
        return 'github rejected this token · sign in again';
      case 'forbidden':
        return `this token is not allowed to do ${doing} here · it needs more scope`;
      case 'missing':
        return 'github could not find it · or this token cannot see it';
      case 'api':
        return error.message.toLowerCase().replace(/\.$/, '');
    }
  }
  return `${doing} did not go through`;
}
