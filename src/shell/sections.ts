import type { AndroidSymbol } from 'expo-symbols';
import type { SFSymbol } from 'sf-symbols-typescript';

export type ScreenName =
  | 'hey'
  | 'now'
  | 'weather'
  | 'clock'
  | 'inbox'
  | 'index'
  | 'brief'
  | 'review'
  | 'cards'
  | 'poster'
  | 'flow'
  | 'orbit'
  | 'archive'
  | 'dots';

export interface SectionView {
  name: ScreenName;
  /** What the segmented control calls it — one word wherever possible. */
  label: string;
}

export interface Section {
  key: 'today' | 'inbox' | 'work' | 'year' | 'lab';
  /** The route file under `app/(tabs)/` — `index` is the first tab. */
  route: string;
  views: readonly SectionView[];
  /** iOS SF Symbol, outline and filled. */
  sf: { default: SFSymbol; selected: SFSymbol };
  /** Android Material Symbol. */
  md: AndroidSymbol;
}

/**
 * Five sections, and every screen belongs to exactly one.
 *
 * Thirteen equal pages behind a scrolling rail make the answer to "where is
 * the thing I want" "swipe until it turns up". These are the four questions
 * the screens actually answer — what today
 * looks like, what wants me, what I am shipping, what the year was — plus
 * `lab`, which is where an artefact lives until it has earned a place in one
 * of the other four.
 *
 * The grouping, the count and the shape all follow Apple's guidance: a flat
 * bar of persistent, labelled destinations (three to five), content and not
 * actions, no drawer, nothing behind a menu. Views *inside* a section are a
 * segmented control at the top, because they are views of one subject.
 */
export const SECTIONS: readonly Section[] = [
  {
    key: 'today',
    route: 'index',
    views: [
      { name: 'hey', label: 'you' },
      { name: 'now', label: 'now' },
      { name: 'weather', label: 'weather' },
      { name: 'clock', label: 'hours' },
    ],
    sf: { default: 'sun.max', selected: 'sun.max.fill' },
    md: 'light_mode',
  },
  {
    key: 'inbox',
    route: 'inbox',
    views: [{ name: 'inbox', label: 'recent' }],
    sf: { default: 'tray', selected: 'tray.fill' },
    md: 'inbox',
  },
  {
    key: 'work',
    route: 'work',
    views: [
      { name: 'index', label: 'pulls' },
      { name: 'brief', label: 'brief' },
      { name: 'review', label: 'cycle' },
      { name: 'cards', label: 'repos' },
    ],
    sf: { default: 'arrow.triangle.pull', selected: 'arrow.triangle.pull' },
    md: 'merge',
  },
  {
    key: 'year',
    route: 'year',
    views: [
      { name: 'poster', label: 'weeks' },
      { name: 'flow', label: 'split' },
      { name: 'orbit', label: 'languages' },
      { name: 'archive', label: 'years' },
    ],
    sf: { default: 'calendar', selected: 'calendar' },
    md: 'calendar_month',
  },
  {
    key: 'lab',
    route: 'lab',
    views: [{ name: 'dots', label: 'join the dots' }],
    sf: { default: 'flask', selected: 'flask.fill' },
    md: 'science',
  },
];

/** The path a section lives at. */
export function hrefOf(index: number): '/' | `/${string}` {
  const route = SECTIONS[index]?.route ?? 'index';
  return route === 'index' ? '/' : `/${route}`;
}

/** Which section a path is, or 0 for anything else. */
export function sectionOfPath(pathname: string): number {
  const found = SECTIONS.findIndex((_, index) => hrefOf(index) === pathname);
  return found >= 0 ? found : 0;
}

/** Every view in reading order — used by the `#demo/n` web shortcut. */
export const FLAT = SECTIONS.flatMap((section, tab) =>
  section.views.map((_, page) => ({ tab, page })),
);
