import { StyleSheet, Text } from 'react-native';

import { colors, fonts, themed } from '../theme';

/**
 * "git-huh?" set in the board's display serif, in ink — the app has no single
 * brand accent, only the six categorical brights.
 */
export function Wordmark({ size = 20 }: { size?: number }) {
  return <Text style={[styles.mark, { fontSize: size, lineHeight: size * 1.05 }]}>git-huh?</Text>;
}

const styles = themed(() =>
  StyleSheet.create({
    mark: {
      color: colors.ink,
      fontFamily: fonts.serif,
      letterSpacing: -0.2,
    },
  }),
);
