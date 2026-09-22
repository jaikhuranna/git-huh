import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radii, space } from '../theme';
import { Label } from './Type';

export interface TabItem {
  key: string;
  /** Mono label, lower case, one word — it is on screen at all times. */
  label: string;
  /** Count of things in that section that want you. 0 draws nothing. */
  badge?: number;
}

/**
 * The app's top level: five sections, always visible, always in the same
 * order, one tap from each other.
 *
 * This replaced a thirteen-name scrolling rail. A rail that scrolls has the
 * same fault as a hamburger — where you can go depends on where you already
 * are — and Apple's guidance is the one this app follows: a flat bar of
 * three to five persistent destinations, labelled, never hidden, never a
 * place to put an action.
 *
 * Selected is a filled black pill, which is what selected means everywhere
 * else in this app (see LANGUAGE §5). The tap target is the whole fifth of
 * the bar; the pill inside it only hugs the word.
 */
export function TabBar({
  tabs,
  current,
  onSelect,
}: {
  tabs: readonly TabItem[];
  current: number;
  onSelect: (index: number) => void;
}) {
  return (
    <View accessibilityRole="tablist" style={styles.bar}>
      {tabs.map((tab, index) => {
        const on = index === current;
        return (
          <Pressable
            accessibilityLabel={
              tab.badge ? `${tab.label}, ${tab.badge} waiting` : tab.label
            }
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            key={tab.key}
            onPress={() => onSelect(index)}
            style={styles.hit}
          >
            <View style={[styles.pill, on && styles.pillOn]}>
              <Label style={on ? styles.labelOn : styles.label}>
                {tab.label}
              </Label>
              {tab.badge ? (
                <Label style={on ? styles.badgeOn : styles.badge}>
                  {tab.badge > 99 ? '99+' : tab.badge}
                </Label>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.hair,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingBottom: 10,
    paddingHorizontal: space.gutter - 8,
    paddingTop: 8,
  },
  hit: {
    alignItems: 'center',
    // Equal fifths, so every destination has the same reach, and the whole
    // fifth is tappable rather than just the word.
    flex: 1,
    paddingVertical: 4,
  },
  pill: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radii.pill,
    // The border is not decoration: on Android a view whose *only* changing
    // property is `backgroundColor` is repainted without its corner radius,
    // so the selected tab came back as a hard black rectangle every time
    // after the first paint. Toggling a border colour alongside the fill —
    // which is what every chip in this app already does — makes the radius
    // survive the update.
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pillOn: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  label: {
    color: colors.ink40,
  },
  labelOn: {
    color: colors.onBlack,
  },
  badge: {
    color: colors.ink,
  },
  badgeOn: {
    color: colors.onBlack55,
  },
});
