import { View } from 'react-native';

import { colors } from '../theme';

/** Days since → the widget's level: a day, a week, two weeks, a month. */
export function waitLevel(since: string, now: number = Date.now()): number {
  const days = (now - Date.parse(since)) / 86_400_000;
  if (days < 1) return 0;
  if (days < 7) return 1;
  if (days < 14) return 2;
  if (days < 30) return 3;
  return 4;
}

const WAIT_SIZE = [5, 6.5, 8, 9.5, 11];
const WAIT_ALPHA = [0.3, 0.46, 0.66, 0.84, 1];

/**
 * How long something has been waiting, as one of the widget's dots: bigger
 * and brighter by the day, week, fortnight and month, squared off past a
 * month, so the one that has sat longest stands out of a list the way a peak
 * day stands out of the widget. A pull request waiting on review, one waiting
 * on you, an issue gone quiet.
 */
export function WaitDot({ since }: { since: string }) {
  const level = waitLevel(since);
  const size = WAIT_SIZE[level];
  return (
    <View
      style={{
        backgroundColor: colors.ink,
        borderRadius: level === 4 ? size * 0.22 : size / 2,
        height: size,
        opacity: WAIT_ALPHA[level],
        width: size,
      }}
    />
  );
}
