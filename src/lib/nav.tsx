import { createContext, useContext } from 'react';

/**
 * Everything that opens *over* the sections: a pull request, an issue or a
 * discussion, a repository, a file, the new-issue form, a second account.
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
  | { kind: 'add-account' };

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
 * A github.com link, read as somewhere inside the app. Anything this cannot
 * place stays a link and leaves for the browser, once, on purpose.
 */
export function routeForUrl(url: string): Route | null {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(pull|issues|discussions)\/(\d+))?/.exec(
    url,
  );
  if (!match) return null;
  const repo = `${match[1]}/${match[2]}`;
  const number = Number(match[4]);
  switch (match[3]) {
    case 'pull':
      return { kind: 'pull', repo, number };
    case 'issues':
      return { kind: 'thread', repo, number, type: 'issue' };
    case 'discussions':
      return { kind: 'thread', repo, number, type: 'discussion' };
    default:
      return { kind: 'repo', repo };
  }
}
