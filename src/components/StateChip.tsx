import { StyleSheet, View } from 'react-native';

import { colors, radii, themed } from '../theme';
import { Data } from './Type';

/**
 * Where a pull request or an issue stands: the word in an outlined pill with
 * one of the widget's dots in front of it. The dot carries the tone — the
 * machine's yes for approved, its no for closed or changes requested, ink
 * for everything else — and the word always says it, so the tone is never
 * the only signal.
 */
export function StateChip({ text, tone }: { text: string; tone: string }) {
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Data style={styles.text}>{text}</Data>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    chip: {
      alignItems: 'center',
      alignSelf: 'flex-start',
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    dot: {
      borderRadius: 3.5,
      height: 7,
      width: 7,
    },
    text: {
      color: colors.ink,
      fontSize: 11,
      lineHeight: 14,
    },
  }),
);
