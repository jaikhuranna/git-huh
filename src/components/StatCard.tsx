import { Pressable, StyleSheet, View } from 'react-native';

import { DotText } from './DotText';
import { colors } from '../theme';

interface StatCardProps {
  value: string;
  label: string;
  accent?: boolean;
  onPress?: () => void;
  flex?: number;
}

/** Mini stat card, the Uber/Netflix row from the reference home. */
export function StatCard({
  value,
  label,
  accent = false,
  onPress,
  flex = 1,
}: StatCardProps) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        styles.card,
        { flex },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[
          styles.dot,
          { backgroundColor: accent ? colors.accent : colors.text.primary },
        ]}
      />
      <DotText
        style={[styles.value, accent && { color: colors.accent }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </DotText>
      <DotText style={styles.label}>{label}</DotText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  dot: {
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  value: {
    fontSize: 20,
    lineHeight: 24,
  },
  label: {
    color: colors.text.secondary,
    fontSize: 10,
    letterSpacing: 1,
  },
});
