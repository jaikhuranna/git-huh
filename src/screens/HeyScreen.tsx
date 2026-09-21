import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CrossField } from '../components/CrossField';
import { Body, Display, Label, Serif } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, fonts, radii } from '../theme';
import { fmt, Page } from './shared';

/**
 * pin04 — Pantom's landing page. A serif greeting, a field of plus glyphs
 * standing in for the contribution year, and one sentence that carries five
 * statistics in five colours. This is the app's front door.
 */
export function HeyScreen({
  model,
  onDisconnect,
}: {
  model: GitHubModel;
  onDisconnect: () => void;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);

  // Two days per column keeps the crosses far enough apart to read as
  // separate marks rather than merging into bars, the way pin04's do.
  const levels = bucket(model.columns.flat().map((day) => day.level), 2);
  const columns = Math.min(28, Math.floor((width - 40) / 13));

  return (
    <Page>
      <Display>Hey,</Display>
      <Display style={styles.handle}>~{model.login.toLowerCase()}</Display>

      <CrossField
        columns={columns}
        days={levels.slice(-columns * 7)}
        height={196}
        style={styles.field}
      />

      <Body style={styles.sentence}>
        You shipped <Text style={styles.blue}>{fmt(model.breakdown.commits)}</Text>{' '}
        commits across <Text style={styles.green}>{fmt(model.repoCount)}</Text>{' '}
        repos. <Text style={styles.red}>{fmt(model.openPrs)}</Text> pull requests
        are open, <Text style={styles.yellow}>{fmt(model.stars)}</Text> stars
        landed, and <Text style={styles.purple}>{fmt(model.followers)}</Text>{' '}
        people follow along.
      </Body>

      <Serif style={styles.since}>
        since {model.since} · {fmt(derived.activeDays)} active days ·{' '}
        {derived.currentStreak > 0
          ? `${derived.currentStreak} day streak`
          : 'no streak today'}
      </Serif>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="link"
          onPress={() =>
            Linking.openURL(`https://github.com/${model.login}`).catch(() => {})
          }
          style={[styles.pill, styles.solid]}
        >
          <Label style={styles.solidLabel}>open github →</Label>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onDisconnect}
          style={styles.pill}
        >
          <Label style={styles.pillLabel}>disconnect</Label>
        </Pressable>
      </View>
    </Page>
  );
}

/** Collapse `size` consecutive days into their peak, preserving intensity. */
function bucket(levels: number[], size: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < levels.length; i += size) {
    out.push(Math.max(...levels.slice(i, i + size)));
  }
  return out;
}

const styles = StyleSheet.create({
  handle: {
    marginTop: -6,
  },
  field: {
    alignSelf: 'center',
    marginBottom: 26,
    marginTop: 26,
  },
  sentence: {
    fontSize: 17,
    lineHeight: 26,
  },
  blue: { color: colors.blue },
  green: { color: colors.green },
  red: { color: colors.red },
  yellow: { color: colors.yellow },
  purple: { color: colors.purple },
  since: {
    color: colors.ink40,
    fontFamily: fonts.serifItalic,
    fontSize: 13,
    marginTop: 16,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 26,
  },
  pill: {
    alignItems: 'center',
    borderColor: colors.hair,
    borderRadius: radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  pillLabel: {
    color: colors.ink,
  },
  solid: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  solidLabel: {
    color: colors.onBlack,
  },
});
