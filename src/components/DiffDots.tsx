import { StyleSheet, View } from 'react-native';

import { fmt } from '../screens/shared';
import { colors, themed } from '../theme';
import { Data } from './Type';

/** How many dots the row is made of. */
const DOTS = 24;

/**
 * Additions against deletions as one row of the widget's dots, split in
 * proportion — the machine's yes for what was added, its no for what went —
 * with both numbers under it, so the split never rests on the colour.
 */
export function DiffDots({ additions, deletions }: { additions: number; deletions: number }) {
  const total = Math.max(1, additions + deletions);
  const added =
    additions === 0
      ? 0
      : Math.max(1, Math.min(DOTS - (deletions ? 1 : 0), Math.round((additions / total) * DOTS)));

  return (
    <View style={styles.diff}>
      <View style={styles.track}>
        {Array.from({ length: DOTS }, (_, index) => (
          <View
            key={index}
            style={[
              styles.dot,
              {
                backgroundColor:
                  index < added ? colors.yes : deletions ? colors.no : colors.ink20,
              },
            ]}
          />
        ))}
      </View>
      <View style={styles.labels}>
        <Data style={styles.add}>+{fmt(additions)}</Data>
        <Data style={styles.del}>−{fmt(deletions)}</Data>
      </View>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    diff: {
      gap: 7,
    },
    track: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    dot: {
      borderRadius: 3.5,
      height: 7,
      width: 7,
    },
    labels: {
      flexDirection: 'row',
      gap: 14,
    },
    add: {
      color: colors.yes,
    },
    del: {
      color: colors.no,
    },
  }),
);
