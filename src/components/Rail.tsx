import { useEffect, useRef } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, space } from '../theme';
import { Label } from './Type';

/**
 * Bottom navigation. Ten screens is too many for dots — an anonymous dot
 * strip tells you nothing about where you are or where you are going — so
 * the rail names every screen and scrolls the active one into view.
 */
export function Rail({
  names,
  page,
  onSelect,
}: {
  names: readonly string[];
  page: number;
  onSelect: (index: number) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef<number[]>([]);

  useEffect(() => {
    const x = offsets.current[page];
    if (x != null) {
      scroller.current?.scrollTo({ animated: true, x: Math.max(0, x - 90) });
    }
  }, [page]);

  return (
    <View style={styles.rail}>
      <ScrollView
        contentContainerStyle={styles.strip}
        horizontal
        ref={scroller}
        showsHorizontalScrollIndicator={false}
      >
        {names.map((name, index) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: index === page }}
            key={name}
            onLayout={(event) => {
              offsets.current[index] = event.nativeEvent.layout.x;
            }}
            onPress={() => onSelect(index)}
            style={[styles.item, index === page && styles.itemOn]}
          >
            <Label style={index === page ? styles.labelOn : undefined}>
              {name}
            </Label>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    backgroundColor: colors.canvas,
    borderTopColor: colors.hair,
    borderTopWidth: 1,
  },
  strip: {
    gap: 18,
    paddingBottom: 12,
    paddingHorizontal: space.gutter,
    paddingTop: 10,
  },
  item: {
    borderBottomColor: 'transparent',
    borderBottomWidth: 2,
    paddingBottom: 4,
  },
  itemOn: {
    borderBottomColor: colors.ink,
  },
  labelOn: {
    color: colors.ink,
  },
});
