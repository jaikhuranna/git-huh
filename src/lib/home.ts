import type { SocialEvent } from './social';

/**
 * What the `you` page lists under the greeting.
 *
 * The page used to end in a stretch of empty paper with two buttons at the
 * bottom. It now carries a short feed, and which kinds of thing go in it is
 * a setting (on the account page) rather than a decision made here: the list
 * below is the whole menu, and adding a kind means adding a line to it.
 * Comments on your pull requests are the only thing on by default.
 */
export type HomeBlock = 'pr-comments' | 'reviews' | 'review-requests' | 'mentions';

export const HOME_BLOCKS: { key: HomeBlock; label: string }[] = [
  { key: 'pr-comments', label: 'pr comments' },
  { key: 'reviews', label: 'reviews' },
  { key: 'review-requests', label: 'review requests' },
  { key: 'mentions', label: 'mentions' },
];

export interface HomeSettings {
  blocks: HomeBlock[];
}

export const DEFAULT_HOME: HomeSettings = { blocks: ['pr-comments'] };

/** How many rows the page shows before pointing at the inbox. */
export const HOME_ROWS = 8;

export function blockOf(event: SocialEvent): HomeBlock | null {
  switch (event.kind) {
    case 'comment':
      return 'pr-comments';
    case 'review':
      return 'reviews';
    case 'review-request':
      return 'review-requests';
    case 'mention':
      return 'mentions';
    case 'open':
      return null;
  }
}

/** The rows for the page, newest first, from whatever the inbox already fetched. */
export function homeEvents(events: readonly SocialEvent[], settings: HomeSettings): SocialEvent[] {
  const on = new Set(settings.blocks);
  return events
    .filter((event) => {
      const block = blockOf(event);
      return block != null && on.has(block);
    })
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** A saved setting from an older version (or a hand-edited file) is read defensively. */
export function readHome(raw: unknown): HomeSettings {
  const keys = new Set<string>(HOME_BLOCKS.map((block) => block.key));
  if (raw && typeof raw === 'object' && Array.isArray((raw as HomeSettings).blocks)) {
    return {
      blocks: (raw as HomeSettings).blocks.filter((key): key is HomeBlock => keys.has(key)),
    };
  }
  return DEFAULT_HOME;
}
