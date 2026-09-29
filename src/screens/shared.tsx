import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Label } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { GitHubError } from '../lib/github';
import { colors, radii, space, themed } from '../theme';

/**
 * Every screen opens with the same two-part caption — a name on the left and
 * a figure on the right — which is what lets ten very different pin layouts
 * still read as one app.
 */
export function ScreenHead({ left, right }: { left: string; right?: string }) {
  return (
    <View style={styles.head}>
      <Label style={styles.headLeft}>{left}</Label>
      {right ? <Label>{right}</Label> : null}
    </View>
  );
}

/**
 * A screen's filter: outlined pills, the one in force filled, each carrying
 * its count (LANGUAGE §7 — the count belongs on the control). They wrap;
 * they never scroll sideways inside a pager.
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

/** Scrolling page body with the app's standard gutters. */
export function Page({
  children,
  background,
  gutter = true,
  fill = false,
  onEnd,
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
   * `you` page's feed pages in older history with it.
   */
  onEnd?: () => void;
}) {
  return (
    <ScrollView
      onScroll={
        onEnd
          ? ({ nativeEvent: { contentOffset, contentSize, layoutMeasurement } }) => {
              if (contentOffset.y + layoutMeasurement.height * 2 >= contentSize.height) onEnd();
            }
          : undefined
      }
      scrollEventThrottle={onEnd ? 250 : undefined}
      contentContainerStyle={[
        styles.page,
        fill && styles.fill,
        gutter && { paddingHorizontal: space.gutter },
      ]}
      showsVerticalScrollIndicator={false}
      style={background ? { backgroundColor: background } : undefined}
    >
      {children}
    </ScrollView>
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
      alignItems: 'baseline',
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingBottom: 12,
      paddingHorizontal: 4,
    },
    headLeft: {
      color: colors.ink,
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
