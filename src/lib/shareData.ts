import type { Breakdown, LanguageShare, YearSummary } from './contributions';

/**
 * What goes on a 4:3 share card, worked out before anything is drawn.
 *
 * A screen is laid out for a phone held upright and scrolls; an image posted
 * to a timeline is a landscape frame that does neither. So a card is not a
 * screenshot of its screen — it is the same data recomposed for the frame,
 * and every list on it is capped here, so no account (forty languages,
 * fifteen years, one very long login) can push anything off the edge.
 */

export type ShareKind = 'year' | 'weeks' | 'split' | 'languages' | 'years' | 'hours';

/** Which card each view shares as; null for views that are lists, not charts. */
export function shareKindOf(view: string): ShareKind | null {
  switch (view) {
    case 'hey':
    case 'now':
    case 'weather':
    case 'dots':
      return 'year';
    case 'poster':
      return 'weeks';
    case 'flow':
      return 'split';
    case 'orbit':
      return 'languages';
    case 'archive':
      return 'years';
    case 'clock':
      return 'hours';
    default:
      return null;
  }
}

export interface Slice {
  label: string;
  value: number;
  share: number;
  color: string;
}

/** The top languages by bytes, the rest folded into one `other`. */
export function topLanguages(
  languages: readonly LanguageShare[],
  count: number,
  otherColor: string,
): Slice[] {
  const total = languages.reduce((sum, language) => sum + language.bytes, 0);
  if (total <= 0) return [];
  const top = languages.slice(0, count).map((language) => ({
    label: language.name,
    value: language.bytes,
    share: language.bytes / total,
    color: language.color,
  }));
  const rest = languages.slice(count).reduce((sum, language) => sum + language.bytes, 0);
  return rest > 0
    ? [...top, { label: 'other', value: rest, share: rest / total, color: otherColor }]
    : top;
}

/** The kinds of work in a year, largest first, nothing that is zero. */
export function splitOf(
  breakdown: Breakdown,
  palette: Record<keyof Breakdown, string>,
): Slice[] {
  const entries: [keyof Breakdown, string][] = [
    ['commits', 'commits'],
    ['pullRequests', 'pull requests'],
    ['reviews', 'reviews'],
    ['issues', 'issues'],
    ['private', 'private'],
  ];
  const total = entries.reduce((sum, [key]) => sum + breakdown[key], 0);
  if (total <= 0) return [];
  return entries
    .filter(([key]) => breakdown[key] > 0)
    .map(([key, label]) => ({
      label,
      value: breakdown[key],
      share: breakdown[key] / total,
      color: palette[key],
    }))
    .sort((a, b) => b.value - a.value);
}

/** The most recent `count` years, oldest first, so a bar chart reads left to right. */
export function recentYears(years: readonly YearSummary[], count: number): YearSummary[] {
  return [...years].sort((a, b) => a.year - b.year).slice(-count);
}

/** A share of one, as the card prints it: `42%`, `<1%`. */
export function percent(share: number): string {
  if (share <= 0) return '0%';
  if (share < 0.01) return '<1%';
  return `${Math.round(share * 100)}%`;
}

/** Big figures kept to a width a card can hold: `9,876`, `12.3k`, `1.2m`. */
export function compact(value: number): string {
  const rounded = Math.round(value);
  if (Math.abs(rounded) < 10_000) return rounded.toLocaleString('en-US');
  if (Math.abs(rounded) < 1_000_000) return `${(rounded / 1000).toFixed(rounded < 100_000 ? 1 : 0)}k`;
  return `${(rounded / 1_000_000).toFixed(1)}m`;
}
