import { Pressable, StyleSheet, View } from 'react-native';

import { prAge, type PullRequest } from '../lib/prs';
import { colors } from '../theme';

import { DotText } from './DotText';

/** Surface tones the cards cycle through — monochrome rhythm, image-2 style. */
const TONES = [
  { bg: colors.elevated, fg: colors.text.primary },
  { bg: colors.surface, fg: colors.text.primary },
  { bg: colors.text.primary, fg: '#0D0D0D' }, // inverted card
];

interface PullRequestCardProps {
  pr: PullRequest;
  index: number;
  onPress?: () => void;
}

export function PullRequestCard({ pr, index, onPress }: PullRequestCardProps) {
  const tone = TONES[index % TONES.length];
  const dim =
    tone.fg === '#0D0D0D'
      ? 'rgba(13,13,13,0.55)'
      : colors.text.secondary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: tone.bg },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.leftBlock}>
        <DotText style={[styles.number, { color: tone.fg }]}>
          {pr.number}
        </DotText>
        <View
          style={[
            styles.chip,
            { borderColor: pr.draft ? dim : tone.fg },
          ]}
        >
          <DotText
            style={[styles.chipLabel, { color: pr.draft ? dim : tone.fg }]}
          >
            {pr.draft ? 'draft' : 'open'}
          </DotText>
        </View>
      </View>

      <View style={styles.right}>
        <DotText style={[styles.title, { color: tone.fg }]} numberOfLines={2}>
          {pr.title}
        </DotText>
        <DotText style={[styles.meta, { color: dim }]}>
          {pr.repo} · {prAge(pr.createdAt)}
        </DotText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    borderColor: colors.outline,
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 96,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pressed: {
    opacity: 0.8,
  },
  leftBlock: {
    alignItems: 'flex-start',
    borderRightWidth: 1,
    borderColor: colors.outline,
    gap: 8,
    paddingHorizontal: 14,
    paddingRight: 16,
  },
  number: {
    fontSize: 26,
    lineHeight: 30,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipLabel: {
    fontSize: 9,
    letterSpacing: 1,
  },
  right: {
    flex: 1,
    gap: 8,
    paddingLeft: 16,
  },
  title: {
    fontSize: 14,
    lineHeight: 20,
  },
  meta: {
    fontSize: 10,
    letterSpacing: 1,
  },
});
