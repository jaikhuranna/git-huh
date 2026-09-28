import { StyleSheet, Text } from 'react-native';

import { colors, fonts, themed } from '../theme';

/**
 * "git-huh?" in the widget's face, the question mark a step lighter — the
 * one place the app writes its own name.
 */
export function Wordmark({ size = 17 }: { size?: number }) {
  return (
    <Text style={[styles.mark, { fontSize: size, lineHeight: size * 1.25 }]}>
      git-huh<Text style={styles.query}>?</Text>
    </Text>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    mark: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
      letterSpacing: -0.4,
    },
    query: {
      color: colors.ink40,
    },
  }),
);
