import { useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { Card } from '../components/Card';
import { DotField } from '../components/DotField';
import { Marquee } from '../components/Marquee';
import { Label, Micro } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import type { CommitLine } from '../lib/messageCache';
import { colors, radii, space, themed } from '../theme';
import { fmt, historyLevels, Page } from './shared';

const WIDGET_ROWS = 7;

/**
 * How far out the card is zoomed. `widget` is the home-screen card exactly:
 * seven rows at its own pitch. Zooming out makes the dots a little smaller
 * and the card *taller* — more rows of the same run of days — until half a
 * year, then the whole of it, is on the card. The rows are not weekdays on
 * the widget either (the field is a run of days ending today), so adding
 * rows shows more of the same field rather than a different chart.
 */
const ZOOMS = [
  { label: 'widget', pitch: 21, days: 0 },
  { label: '6 mo', pitch: 16, days: 183 },
  { label: 'year', pitch: 13, days: Infinity },
] as const;

/**
 * The widget, zoomed out. The same card as on the home screen — commit
 * messages travelling across the top, the days as dots, today the plus in the
 * bottom-right corner, a silence folded into a wave with its length on it —
 * but with room to pull back from a few months to the whole year, which the
 * home screen never has.
 *
 * `year` puts every day since last year's today on the card, and the
 * shape of the year is what is left.
 */
export function DotsScreen({
  model,
  lines,
  active,
}: {
  model: GitHubModel;
  lines: readonly CommitLine[];
  active: boolean;
}) {
  const { width } = useWindowDimensions();
  const derived = insights(model);
  const [zoom, setZoom] = useState(2);
  const days = historyLevels(model);
  const inner = width - space.gutter * 2 - space.card * 2;
  const { pitch, days: wanted } = ZOOMS[zoom];
  const columns = Math.floor(inner / pitch);
  const rows = wanted
    ? Math.max(WIDGET_ROWS, Math.ceil(Math.min(wanted, days.length) / columns))
    : WIDGET_ROWS;
  const shown = Math.min(days.length, columns * rows);

  return (
    <Page>
      <Card figure={`${fmt(shown)} days`} title="the widget, zoomed out">
        <Marquee
          active={active}
          items={lines.map((line) => ({ lead: line.repo, text: line.message }))}
          size={15}
          style={styles.strip}
        />
        <DotField
          days={days}
          height={rows * pitch}
          maxPitch={pitch}
          rows={rows}
          style={styles.field}
          width={inner}
        />
      </Card>

      <View style={styles.zooms}>
        {ZOOMS.map((step, index) => (
          <Pressable
            accessibilityLabel={`zoom ${step.label}`}
            accessibilityRole="button"
            accessibilityState={{ selected: index === zoom }}
            key={step.label}
            onPress={() => setZoom(index)}
            style={[styles.chip, index === zoom && styles.chipOn]}
          >
            <Label style={index === zoom ? styles.chipLabelOn : styles.chipLabel}>{step.label}</Label>
          </Pressable>
        ))}
      </View>

      <Card style={styles.facts}>
        <Fact label="contributions" value={fmt(model.total)} />
        <Fact label="active days" value={fmt(derived.activeDays)} />
        <Fact label="best day" value={fmt(derived.bestDay)} />
        <Fact label="longest run" value={`${fmt(derived.longestStreak)}d`} />
      </Card>

      <Micro style={styles.note}>
        one dot a day · bigger and brighter is busier · the square is a peak ·
        the plus is today · a wave is three weeks or more of nothing
      </Micro>
    </Page>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Label style={styles.factValue}>{value}</Label>
      <Micro>{label}</Micro>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    strip: {
      marginBottom: 14,
    },
    field: {
      alignSelf: 'center',
    },
    zooms: {
      alignSelf: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    chip: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      minWidth: 58,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    chipLabel: {
      color: colors.ink,
      textAlign: 'center',
    },
    chipLabelOn: {
      color: colors.onBlack,
      textAlign: 'center',
    },
    facts: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    fact: {
      gap: 2,
    },
    factValue: {
      color: colors.ink,
      fontSize: 16,
      lineHeight: 20,
    },
    note: {
      color: colors.ink40,
      lineHeight: 14,
      paddingHorizontal: 4,
    },
  }),
);
