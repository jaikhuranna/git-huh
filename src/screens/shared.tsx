import type { ReactElement, ReactNode } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, View, type ListRenderItem } from 'react-native';

import { IconButton, type Glyph } from '../components/Icon';
import { FormScrollView } from '../components/FormScrollView';
import { Label } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { GitHubError } from '../lib/github';
import { colors, radii, space, themed } from '../theme';

/**
 * Every block opens with the same two-part caption — a name on the left and
 * a figure on the right — which is what lets ten very different pin layouts
 * still read as one app. On a section's page it is also what divides one
 * block from the next.
 *
 * `action` is the one thing the block can do — `share` on a chart — and sits
 * after the figure as a round glyph button, the way a phone draws share.
 */
export function ScreenHead({
  left,
  right,
  action,
}: {
  left: string;
  right?: string;
  action?: { label: string; hint: string; onPress: () => void; icon?: Glyph };
}) {
  return (
    <View style={styles.head}>
      <Label numberOfLines={1} style={styles.headLeft}>
        {left}
      </Label>
      {right ? <Label numberOfLines={1}>{right}</Label> : null}
      {action ? <ActionPill {...action} /> : null}
    </View>
  );
}

/** What each head action is drawn as, when it does not say. */
const ACTION_GLYPHS: Record<string, Glyph> = {
  share: 'share',
  change: 'settings',
  edit: 'edit',
};

/**
 * The one thing a block can do — `share`, `change` — as a round glyph
 * button. The word stays as its accessibility label.
 */
export function ActionPill({
  label,
  hint,
  onPress,
  icon,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  icon?: Glyph;
}) {
  const glyph = icon ?? ACTION_GLYPHS[label];
  if (glyph) {
    return (
      <IconButton
        icon={glyph}
        label={`${label} · ${hint}`}
        onPress={onPress}
        size={30}
      />
    );
  }
  return (
    <Pressable
      accessibilityHint={hint}
      accessibilityRole="button"
      hitSlop={8}
      onPress={onPress}
      style={styles.action}
    >
      <Label style={styles.actionLabel}>{label}</Label>
    </Pressable>
  );
}

/**
 * The way from a block's head to the whole list: `all 12 waiting →`. A
 * section's page shows the first few of anything long and pushes the rest,
 * so the page stays one page.
 */
export function More({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.more}>
      <Label style={styles.moreLabel}>{label} →</Label>
    </Pressable>
  );
}

/**
 * One block on a section's page: its head and its cards, ten apart. The page
 * puts more room between blocks than a block puts between its cards, so the
 * heads read as the dividers they are.
 */
export function Block({ children }: { children: ReactNode }) {
  return <View style={styles.block}>{children}</View>;
}

/**
 * A screen's filter: outlined pills, the one in force filled, each carrying
 * its count (LANGUAGE §7 — the count belongs on the control). They wrap,
 * so every choice is in view; they never scroll sideways.
 */
export function Chips<T extends string>({
  items,
  current,
  onSelect,
}: {
  items: readonly { key: T; label: string }[];
  current: T;
  onSelect: (key: T) => void;
}) {
  return (
    <View style={styles.chips}>
      {items.map(({ key, label }) => {
        const on = key === current;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            key={key}
            onPress={() => onSelect(key)}
            // Border and fill change together: see the corner-radius trap.
            style={[styles.chip, on && styles.chipOn]}
          >
            <Label style={on ? styles.chipLabelOn : styles.chipLabel}>{label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Shared scroll styling for a page, whether a ScrollView or a FlatList owns it. */
function pageContentStyle(gutter: boolean, fill: boolean, blocks: boolean) {
  return [
    styles.page,
    blocks && styles.blocks,
    fill && styles.fill,
    gutter && { paddingHorizontal: space.gutter },
  ];
}

/**
 * A screen whose rows are virtualized. The list owns the one vertical scroll;
 * `header` is the blocks that used to sit above the rows in `Page`.
 */
export function VirtualPage<T>({
  header,
  data,
  keyExtractor,
  renderItem,
  footer,
  background,
  gutter = true,
  onEnd,
  onDeep,
  blocks = false,
}: {
  header: ReactElement;
  data: readonly T[];
  keyExtractor: (item: T) => string;
  renderItem: ListRenderItem<T>;
  footer?: ReactElement | null;
  background?: string;
  gutter?: boolean;
  onEnd?: () => void;
  onDeep?: () => void;
  blocks?: boolean;
}) {
  return (
    <FlatList
      data={data}
      initialNumToRender={8}
      keyExtractor={keyExtractor}
      ListFooterComponent={footer}
      ListHeaderComponent={header}
      maxToRenderPerBatch={8}
      onEndReached={onEnd}
      onEndReachedThreshold={0.6}
      onScroll={
        onDeep
          ? ({ nativeEvent: { contentOffset, layoutMeasurement } }) => {
              if (contentOffset.y > layoutMeasurement.height / 2) onDeep();
            }
          : undefined
      }
      renderItem={renderItem}
      scrollEventThrottle={onDeep ? 250 : undefined}
      showsVerticalScrollIndicator={false}
      style={background ? { backgroundColor: background } : undefined}
      contentContainerStyle={pageContentStyle(gutter, false, blocks)}
      windowSize={7}
    />
  );
}

/** Scrolling page body with the app's standard gutters. */
export function Page({
  children,
  background,
  gutter = true,
  fill = false,
  onEnd,
  onDeep,
  blocks = false,
  keyboard = false,
}: {
  children: ReactNode;
  background?: string;
  gutter?: boolean;
  /**
   * Let the content claim the whole page rather than stacking at the top.
   * A screen that runs short then pushes its last block (`marginTop: 'auto'`)
   * down to the bottom edge, which reads as laid out rather than unfinished.
   */
  fill?: boolean;
  /**
   * Called as the bottom of the page comes within a screen of view — the
   * `today` page's feed pages in older history with it.
   */
  onEnd?: () => void;
  /**
   * Called once the page has been scrolled half a screen down — the `today`
   * page asks for the commit history its `hours` block needs then, rather
   * than on launch.
   */
  onDeep?: () => void;
  /** Blocks rather than cards: a section's page spaces its blocks wider. */
  blocks?: boolean;
  /** Forms need to scroll their focused field above the keyboard. */
  keyboard?: boolean;
}) {
  const watch = onEnd != null || onDeep != null;
  const Scroll = keyboard ? FormScrollView : ScrollView;
  return (
    <Scroll
      onScroll={
        watch
          ? ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
              if (onDeep && contentOffset.y > layoutMeasurement.height / 2) onDeep();
              if (onEnd && contentOffset.y + layoutMeasurement.height * 2 >= contentSize.height) {
                onEnd();
              }
            }
          : undefined
      }
      scrollEventThrottle={watch ? 250 : undefined}
      contentContainerStyle={pageContentStyle(gutter, fill, blocks)}
      showsVerticalScrollIndicator={false}
      style={background ? { backgroundColor: background } : undefined}
    >
      {children}
    </Scroll>
  );
}

/**
 * The year's days as levels, oldest first and ending on today — what every
 * dot field draws. The calendar can run on past today to the end of the
 * week; those days have not happened and are never drawn.
 */
export function historyLevels(model: Pick<GitHubModel, 'columns'>): number[] {
  const days = model.columns.flat();
  const today = days.findIndex((day) => day.isToday);
  return (today >= 0 ? days.slice(0, today + 1) : days).map((day) => day.level);
}

/**
 * Why a read failed, in the words that say what would fix it — a failure is
 * never drawn as an empty list (LANGUAGE §7).
 */
export function whyNot(error: unknown): string {
  if (!(error instanceof GitHubError)) return 'something went wrong reading it';
  switch (error.kind) {
    case 'network':
      return 'no connection, and nothing saved yet';
    case 'invalid-token':
      return 'github rejected the token';
    case 'forbidden':
      return 'this token is not allowed to read it';
    default:
      return 'github answered with something unexpected';
  }
}

export function fmt(value: number): string {
  return Math.round(value).toLocaleString('en-US');
}

/** Short relative age, matching the voice of the filing-index date blocks. */
export function ago(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d';
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

/** Stable 32-bit hash — drives the repo sigils and the puzzle jitter. */
export function hash(input: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    value ^= input.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** White or ink, whichever stays legible on `background`. */
export function onColor(background: string): string {
  const hex = background.replace('#', '');
  const int = parseInt(hex.length === 3 ? hex.replace(/./g, '$&$&') : hex, 16);
  const [r, g, b] = [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  // Rec. 601 luma is close enough for chip labels and cheaper than WCAG.
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? colors.ink : colors.onBlack;
}

const styles = themed(() =>
  StyleSheet.create({
    head: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      minHeight: 26,
      paddingBottom: 2,
      paddingHorizontal: 4,
    },
    headLeft: {
      color: colors.ink,
      flex: 1,
    },
    action: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 3,
    },
    actionLabel: {
      color: colors.ink,
    },
    more: {
      alignItems: 'center',
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 11,
    },
    moreLabel: {
      color: colors.ink,
    },
    block: {
      gap: 10,
    },
    blocks: {
      gap: 34,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginBottom: 4,
    },
    chip: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    chipLabel: {
      color: colors.ink,
    },
    chipLabelOn: {
      color: colors.onBlack,
    },
    page: {
      gap: 10,
      paddingBottom: 28,
      paddingTop: 6,
    },
    fill: {
      flexGrow: 1,
    },
  }),
);
