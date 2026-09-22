import { Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { CrossField } from '../components/CrossField';
import { Body, Display, Label, Serif } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, fonts, radii } from '../theme';
import { fmt, Page } from './shared';

/**
 * pin04 — Pantom's landing page. A serif greeting, a field of plus glyphs
 * standing in for the contribution year, and one sentence that carries five
 * statistics in five colours.
 *
 * This is also where the account lives: the handle, the link out, and the
 * one destructive action in the app. The activity feed used to sit under all
 * of it and is now the `inbox` section — a feed below the fold of a greeting
 * is a feed nobody reads twice, and the account is not something to hide
 * behind a menu either.
 */
export function HeyScreen({
  model,
  demo,
  onDisconnect,
}: {
  model: GitHubModel;
  /** Demo data is not a connection, so the button says what it undoes. */
  demo: boolean;
  onDisconnect: () => void;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);

  // Two days per column keeps the crosses far enough apart to read as
  // separate marks rather than merging into bars, the way pin04's do.
  const levels = bucket(model.columns.flat().map((day) => day.level), 2);

  return (
    <Page fill>
      <Display>Hey,</Display>
      <Display style={styles.handle}>~{model.login.toLowerCase()}</Display>

      <CrossField
        days={levels}
        height={132}
        style={styles.field}
        width={width - 40}
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
          <Label style={styles.pillLabel}>
            {demo ? 'exit demo' : 'disconnect'}
          </Label>
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
    marginBottom: 20,
    marginTop: 18,
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
    // Pushed to the foot of the page: with the feed gone this screen is a
    // title page, and a title page's buttons sit on the bottom margin
    // rather than halfway up an empty sheet.
    marginTop: 'auto',
    paddingTop: 26,
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
