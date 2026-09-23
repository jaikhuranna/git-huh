import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Label } from '../components/Type';
import { colors, space, themed } from '../theme';

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

/** Scrolling page body with the app's standard gutters. */
export function Page({
  children,
  background,
  gutter = true,
  fill = false,
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
}) {
  return (
    <ScrollView
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
      paddingBottom: 14,
    },
    headLeft: {
      color: colors.ink,
    },
    page: {
      paddingBottom: 28,
      paddingTop: 4,
    },
    fill: {
      flexGrow: 1,
    },
  }),
);
