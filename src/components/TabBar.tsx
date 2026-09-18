import { Pressable, StyleSheet, View } from 'react-native';

import { DotText } from './DotText';
import { colors } from '../theme';

export const TABS = ['~home', '~dots', '~prs'] as const;
export type Tab = (typeof TABS)[number];

interface TabBarProps {
  active: Tab;
  onChange: (tab: Tab) => void;
}

/** Bottom pill bar — active pill inverts, like the reference filter row. */
export function TabBar({ active, onChange }: TabBarProps) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab === active;
        return (
          <Pressable
            accessibilityRole="button"
            key={tab}
            onPress={() => onChange(tab)}
            style={({ pressed }) => [
              styles.pill,
              isActive && styles.pillActive,
              pressed && styles.pressed,
            ]}
          >
            <DotText
              style={[styles.label, isActive && styles.labelActive]}
            >
              {tab}
            </DotText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  pill: {
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  pillActive: {
    backgroundColor: colors.text.primary,
  },
  pressed: {
    opacity: 0.7,
  },
  label: {
    color: colors.text.secondary,
    fontSize: 12,
    letterSpacing: 1,
  },
  labelActive: {
    color: '#0D0D0D',
  },
});
