import { StyleSheet, View } from 'react-native';

import { colors, fallbacks, fonts } from '../theme';
import { Text } from 'react-native';

/**
 * "git-huh?" set in the board's display serif. The question mark used to be
 * Nothing red; it is ink now — the app has no single brand accent, only the
 * six categorical brights.
 */
export function Wordmark({ size = 20 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.mark,
          { fontSize: size, lineHeight: size * 1.05 },
        ]}
      >
        git-huh?
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: 7,
  },
  mark: {
    color: colors.ink,
    fontFamily: fonts.serif,
    letterSpacing: -0.2,
  },
});

/** Platform fallback if Instrument Serif never loads. */
Wordmark.fallbackFamily = fallbacks.serif;
