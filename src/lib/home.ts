import type { SocialEvent } from './social';

/**
 * What `today` lists at its foot, after the year and the hours.
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

/**
 * How much history the feed keeps while scrolling. Older pages are dropped
 * (the next cursor still walks back from the newest retained page) so a long
 * session does not keep every event it has ever drawn.
 */
export const HISTORY_WINDOW = 6;

/** One cursor-addressed page of pull-request conversation. */
export interface HistoryPage {
  /** Cursor this page was requested with; null is the newest page. */
  after: string | null;
  events: SocialEvent[];
  /** Cursor for the page after this one; null when GitHub has nothing older. */
  next: string | null;
}

export interface HistoryWindow {
  pages: HistoryPage[];
}

export const EMPTY_HISTORY: HistoryWindow = { pages: [] };

/** Events still held, newest page first. */
export function historyEvents(window: HistoryWindow): SocialEvent[] {
  const seen = new Set<string>();
  const events: SocialEvent[] = [];
  for (const page of window.pages) {
    for (const event of page.events) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      events.push(event);
    }
  }
  return events;
}

/**
 * Append a page, then drop pages that have scrolled out until only `keep`
 * remain. The cursor to request next is the `next` of the oldest retained page.
 */
export function retainHistory(
  window: HistoryWindow,
  page: HistoryPage,
  keep = HISTORY_WINDOW,
): HistoryWindow {
  const pages = [...window.pages, page];
  const drop = Math.max(0, pages.length - keep);
  const kept = drop > 0 ? pages.slice(drop) : pages;
  return { pages: kept };
}

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

/**
 * The rows for the page, newest first: the inbox's feed and however much of
 * the history has been paged in, the same comment counted once.
 */
/**
 * The rows for the page, newest first. Inbox events come first; history is
 * added only when its id is not already in the inbox or earlier history.
 */
export function homeEvents(
  inbox: readonly SocialEvent[],
  history: readonly SocialEvent[],
  settings: HomeSettings,
): SocialEvent[] {
  const on = new Set(settings.blocks);
  const seen = new Set<string>();
  const rows: SocialEvent[] = [];
  const take = (event: SocialEvent) => {
    const block = blockOf(event);
    if (block == null || !on.has(block) || seen.has(event.id)) return;
    seen.add(event.id);
    rows.push(event);
  };
  for (const event of inbox) take(event);
  for (const event of history) take(event);
  rows.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return rows;
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
