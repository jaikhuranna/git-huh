import { Pressable, StyleSheet, View } from 'react-native';

import { colors, space, themed } from '../theme';
import { Label } from './Type';

/**
 * The second level: the few views inside one section.
 *
 * Apple's rule is the one that decides the shape here — a segmented control
 * switches between views of *the same* content, so it sits at the top of the
 * section it belongs to and never carries more than four or five words. The
 * section itself is the bar at the bottom.
 *
 * Selected is the pin03 tab: the word in ink with a 2px rule under it. The
 * bottom bar keeps the filled black pill, so the two levels never read as
 * the same control.
 *
 * The row **wraps, it does not scroll**: every view is inside the section's
 * horizontal pager, and a nested horizontal scroller loses its drag to the
 * page swipe. This has been fixed twice; see LANGUAGE §7.
 */
export function Segments({
  items,
  current,
  onSelect,
}: {
  items: readonly string[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.row}>
      {items.map((label, index) => {
        const on = index === current;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            key={label}
            onPress={() => onSelect(index)}
            style={[styles.item, on && styles.itemOn]}
          >
            <Label style={on ? styles.labelOn : styles.label}>{label}</Label>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 18,
      paddingBottom: 10,
      paddingHorizontal: space.gutter,
      paddingTop: 2,
    },
    item: {
      borderBottomColor: 'transparent',
      borderBottomWidth: 2,
      paddingBottom: 4,
    },
    itemOn: {
      borderBottomColor: colors.ink,
    },
    label: {
      color: colors.ink40,
    },
    labelOn: {
      color: colors.ink,
    },
  }),
);
