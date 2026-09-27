import { createContext, useContext } from 'react';

import type { ScreenName } from '../shell/sections';

/**
 * Everything that opens *over* the sections: a pull request, an issue or a
 * discussion, a repository, a file, the new-issue form, a second account,
 * the account page, and a view made into an image to share.
 *
 * These are a stack, the way detail views are on every phone: each one
 * pushes over the last and `back` pops it, so a pull request opened from a
 * repository opened from the inbox goes back the way it came. They sit over
 * the sections rather than inside them for the reason `pull` always did —
 * they have horizontal scrollers of their own, and nested inside a pager
 * every one of them loses its drag to the page swipe.
 */
export type Route =
  | { kind: 'pull'; repo: string; number: number }
  | { kind: 'thread'; repo: string; number: number; type: 'issue' | 'discussion' }
  | { kind: 'repo'; repo: string }
  | {
      kind: 'file';
      repo: string;
      path: string;
      ref?: string;
      /** A search term to find as soon as the file opens. */
      find?: string;
    }
  | { kind: 'new-issue'; repo: string }
  | { kind: 'add-account' }
  /** Accounts, which of them are added together, notifications, the home feed. */
  | { kind: 'account' }
  /** A view as a 4:3 image, to post somewhere. */
  | { kind: 'share'; view: ScreenName };

export interface Nav {
  open: (route: Route) => void;
  /** Swap the top of the stack — a file becomes the pull request it proposed. */
  replace: (route: Route) => void;
  close: () => void;
  token: string | null;
  login: string | null;
  demo: boolean;
}

export const NavContext = createContext<Nav>({
  open: () => {},
  replace: () => {},
  close: () => {},
  token: null,
  login: null,
  demo: false,
});

export function useNav(): Nav {
  return useContext(NavContext);
}

/**
 * First path segments on github.com that are GitHub's own pages rather than
 * an owner — `github.com/settings/tokens` is not a repository called
 * `settings/tokens`.
 */
const RESERVED = new Set([
  'about',
  'apps',
  'codespaces',
  'collections',
  'enterprise',
  'events',
  'explore',
  'features',
  'issues',
  'login',
  'marketplace',
  'new',
  'notifications',
  'orgs',
  'organizations',
  'pricing',
  'pulls',
  'search',
  'settings',
  'sponsors',
  'topics',
  'trending',
]);

const GITHUB_PATH = /^https?:\/\/(?:www\.)?github\.com\/([^/?#]+)\/([^/?#]+)(\/[^?#]*)?/;

/**
 * A github.com link, read as somewhere inside the app. Anything this cannot
 * place stays a link and leaves for the browser, once, on purpose.
 */
export function routeForUrl(url: string): Route | null {
  const match = GITHUB_PATH.exec(url);
  if (!match || RESERVED.has(match[1].toLowerCase())) return null;
  const repo = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
  const [, section, ...rest] = (match[3] ?? '').split('/');

  if (!section) return { kind: 'repo', repo };
  const number = Number(rest[0]);
  switch (section) {
    case 'pull':
      return Number.isInteger(number) && number > 0 ? { kind: 'pull', repo, number } : null;
    case 'issues':
      return Number.isInteger(number) && number > 0
        ? { kind: 'thread', repo, number, type: 'issue' }
        : null;
    case 'discussions':
      return Number.isInteger(number) && number > 0
        ? { kind: 'thread', repo, number, type: 'discussion' }
        : null;
    case 'blob': {
      // `blob/<ref>/<path>`. A ref with a slash in it is ambiguous in the URL
      // itself; the first segment is by far the common case.
      const [ref, ...path] = rest;
      if (!ref || path.length === 0) return null;
      try {
        return { kind: 'file', repo, ref, path: decodeURIComponent(path.join('/')) };
      } catch {
        return null;
      }
    }
    default:
      // Actions, releases, wikis and the rest have no page here.
      return null;
  }
}
