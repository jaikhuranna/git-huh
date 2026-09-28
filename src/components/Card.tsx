import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, space, themed } from '../theme';
import { Label } from './Type';

/**
 * The widget's card: one raised surface with the widget's corner, sitting on
 * a page a step darker. Everything a screen draws lives on one of these, so
 * every screen reads as the home-screen card, zoomed out.
 *
 * `title` and `figure` are the card's own caption row — a name on the left,
 * a number on the right — the same two-part head every screen opens with.
 */
export function Card({
  children,
  title,
  figure,
  padded = true,
  style,
}: {
  children?: ReactNode;
  title?: string;
  figure?: string;
  padded?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {(title || figure) && (
        <View style={styles.head}>
          <Label numberOfLines={1} style={styles.title}>
            {title ?? ''}
          </Label>
          {figure ? <Label style={styles.figure}>{figure}</Label> : null}
        </View>
      )}
      {children}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radii.card,
      overflow: 'hidden',
    },
    padded: {
      padding: space.card,
    },
    head: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    title: {
      color: colors.ink,
      flex: 1,
    },
    figure: {
      color: colors.ink40,
    },
  }),
);
