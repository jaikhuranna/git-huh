import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';

import { DotText } from '../components/DotText';
import { FadeIn } from '../components/FadeIn';
import { PullRequestCard } from '../components/PullRequestCard';
import type { PrsState } from '../hooks/useOpenPrs';
import { colors } from '../theme';

interface PrsViewProps {
  state: PrsState;
}

type Filter = 'open' | 'draft';

/** Open PRs as a stack of date-card rows — the calendar reference, monochrome. */
export function PrsView({ state }: PrsViewProps) {
  const [filter, setFilter] = useState<Filter>('open');

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <FadeIn>
        <View style={styles.filters}>
          <Pill label="open" active={filter === 'open'} onPress={() => setFilter('open')} />
          <Pill label="draft" active={filter === 'draft'} onPress={() => setFilter('draft')} />
        </View>
      </FadeIn>

      {state.status === 'loading' && (
        <DotText style={styles.note}>loading prs…</DotText>
      )}
      {state.status === 'error' && (
        <DotText style={[styles.note, { color: colors.accent }]}>
          could not load prs
        </DotText>
      )}
      {state.status === 'ready' && (
        <View style={styles.list}>
          {state.prs
            .filter((pr) => (filter === 'open' ? !pr.draft : pr.draft))
            .map((pr, index) => (
              <FadeIn key={`${pr.repo}-${pr.number}`} delay={index * 60} offset={14}>
                <PullRequestCard
                  pr={pr}
                  index={index}
                  onPress={() => Linking.openURL(pr.htmlUrl).catch(() => {})}
                />
              </FadeIn>
            ))}
          {state.prs.filter((pr) => (filter === 'open' ? !pr.draft : pr.draft))
            .length === 0 && (
            <DotText style={styles.note}>nothing here · go ship</DotText>
          )}
        </View>
      )}
    </ScrollView>
  );
}

function Pill({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <DotText
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.pill, active && styles.pillActive]}
    >
      {label}
    </DotText>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  filters: {
    flexDirection: 'row',
    gap: 10,
  },
  pill: {
    borderColor: colors.outline,
    borderRadius: 999,
    borderWidth: 1,
    color: colors.text.secondary,
    fontSize: 12,
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  pillActive: {
    backgroundColor: colors.text.primary,
    borderColor: colors.text.primary,
    color: '#0D0D0D',
  },
  list: {
    gap: 12,
  },
  note: {
    color: colors.text.faint,
    fontSize: 12,
    letterSpacing: 1,
    marginTop: 8,
    textAlign: 'center',
  },
});
