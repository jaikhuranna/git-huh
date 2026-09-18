import { useEffect, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, View } from 'react-native';

import { DotText } from '../components/DotText';
import { FadeIn } from '../components/FadeIn';
import { Glyph } from '../components/Glyph';
import { StatCard } from '../components/StatCard';
import type { WidgetModel } from '../lib/contributions';
import { colors } from '../theme';

interface HomeViewProps {
  model: WidgetModel;
}

/** Home, after the budgeting-insights reference: shapes, giant number, card row. */
export function HomeView({ model }: HomeViewProps) {
  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <FadeIn>
        <View style={styles.circles}>
          <View style={styles.circle} />
          <View style={[styles.circle, styles.circleMiddle]} />
          <View style={styles.circle} />
        </View>
      </FadeIn>

      <FadeIn delay={80}>
        <DotText style={styles.caption}>
          total contributions · @{model.login.toLowerCase()}
        </DotText>
        <CountUp value={model.total} />
      </FadeIn>

      <FadeIn delay={160}>
        <View style={styles.row}>
          <StatCard
            value={String(model.todayCommits)}
            label="today"
            accent={model.todayCommits > 0}
          />
          <StatCard value={format(model.totalCommits)} label="commits" />
          <StatCard value={String(model.openPrs)} label="open prs" />
          <StatCard value={String(model.todayCount)} label="all today" />
        </View>
      </FadeIn>

      <FadeIn delay={240}>
        <View style={[styles.card, { flexDirection: 'row', gap: 16 }]}>
          <Glyph />
          <View style={{ flex: 1, gap: 4 }}>
            <DotText style={styles.cardValue}>
              {format(model.total)}
            </DotText>
            <DotText style={styles.cardLabel}>
              contributions in the last year
            </DotText>
          </View>
        </View>
      </FadeIn>
    </ScrollView>
  );
}

function format(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

/** Rolling number — the balance reveal from the reference. */
function CountUp({ value }: { value: number }) {
  const [progress] = useState(() => new Animated.Value(0));
  const [shown, setShown] = useState(0);

  useEffect(() => {
    const id = progress.addListener(({ value: v }) => {
      setShown(Math.round(value * v));
    });
    Animated.timing(progress, {
      toValue: 1,
      duration: 800,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => progress.removeListener(id);
  }, [progress, value]);

  return <DotText style={styles.total}>{format(shown)}</DotText>;
}

const styles = StyleSheet.create({
  content: {
    gap: 24,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  circles: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 8,
  },
  circle: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    height: 72,
    width: 72,
  },
  circleMiddle: {
    marginHorizontal: -14,
  },
  caption: {
    color: colors.text.faint,
    fontSize: 11,
    letterSpacing: 1,
  },
  total: {
    fontSize: 56,
    letterSpacing: 2,
    lineHeight: 62,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.outline,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  cardValue: {
    fontSize: 22,
    lineHeight: 26,
  },
  cardLabel: {
    color: colors.text.secondary,
    fontSize: 10,
    letterSpacing: 1,
  },
});
