import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { Card } from '../components/Card';
import { dot } from '../components/DotField';

import { Data, Heading, Label, Title } from '../components/Type';
import {
  hourHistogram,
  ledger,
  type Activity,
} from '../lib/activity';
import { colors, fonts, levels, themed } from '../theme';
import { fmt, Page, ScreenHead } from './shared';

/**
 * Derived from pin02's analog dial, opened out to twenty-four hours: when do
 * you actually commit? The contribution calendar only has day granularity, so
 * this is the one screen built on real commit timestamps.
 */
export function ClockScreen({
  activity,
  loading,
}: {
  activity: Activity;
  loading: boolean;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 72, 320);
  const hours = hourHistogram(activity.commits);
  const totals = ledger(activity.commits);
  const peak = Math.max(...hours, 1);
  const peakHour = hours.indexOf(peak);
  const sampled = activity.commits.length;

  // Anything from 22:00 to 05:00 counts as night; the split is what makes
  // the verdict line meaningful rather than decorative.
  const night = hours.reduce(
    (sum, count, hour) => (hour >= 22 || hour < 5 ? sum + count : sum),
    0,
  );
  const nightShare = sampled > 0 ? night / sampled : 0;

  return (
    <Page>
      <ScreenHead
        left="when you commit"
        right={sampled > 0 ? `${fmt(sampled)} commits` : ''}
      />

      {loading && <Label style={styles.note}>reading commit history…</Label>}

      {!loading && sampled === 0 && (
        <Label style={styles.note}>
          no commit timestamps available for these repos
        </Label>
      )}

      {sampled > 0 && (
        <>
          <Card style={styles.stage}>
            <Svg height={size} width={size}>
              <Dial hours={hours} peak={peak} size={size} />
            </Svg>
            <Title style={styles.verdict}>
              {nightShare > 0.35 ? 'night owl' : nightShare < 0.12 ? 'early bird' : 'daylight hours'}
            </Title>
            <Label style={styles.verdictSub}>
              peak at {String(peakHour).padStart(2, '0')}:00 ·{' '}
              {Math.round(nightShare * 100)}% after dark
            </Label>
          </Card>

          <Card style={styles.ledger}>
            <View style={styles.ledgerRow}>
              <Heading style={styles.plus}>+{fmt(totals.additions)}</Heading>
              <Data style={styles.ledgerName}>lines added</Data>
            </View>
            <View style={styles.ledgerRow}>
              <Heading style={styles.minus}>−{fmt(totals.deletions)}</Heading>
              <Data style={styles.ledgerName}>lines removed</Data>
            </View>
            <View style={styles.ledgerRow}>
              <Heading style={styles.net}>
                {totals.net >= 0 ? '+' : '−'}
                {fmt(Math.abs(totals.net))}
              </Heading>
              <Data style={styles.ledgerName}>
                net · median diff {fmt(totals.medianDiff)}
              </Data>
            </View>
          </Card>
        </>
      )}
    </Page>
  );
}

/**
 * Twenty-four spokes of the widget's dots, midnight at the top, clockwise.
 * Each spoke is a short run of dots outward from the centre, as many lit as
 * the hour's share of the peak, the outermost lit one carrying the weight; an
 * hour with nothing in it is a single ghost. The night hours (22–05) are in
 * full ink and the day a step back, which is what the verdict under the dial
 * is about.
 */
function Dial({
  hours,
  peak,
  size,
}: {
  hours: number[];
  peak: number;
  size: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const inner = size * 0.2;
  const outer = size * 0.4;
  const STEPS = 6;
  const pitch = (outer - inner) / (STEPS - 1);
  const cell = Math.min(pitch * 0.8, size * 0.035);

  const night: string[] = [];
  const day: string[] = [];
  const ghost: string[] = [];
  hours.forEach((count, hour) => {
    const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
    const lit = count === 0 ? 0 : Math.max(1, Math.round((count / peak) * STEPS));
    const isNight = hour >= 22 || hour < 5;
    for (let step = 0; step < STEPS; step++) {
      const r = inner + step * pitch;
      const x = cx + Math.cos(angle) * r;
      const y = cy + Math.sin(angle) * r;
      if (step < lit) {
        const scale = levels.scale[Math.min(4, 1 + Math.floor((step / STEPS) * 4))];
        (isNight ? night : day).push(dot(x, y, cell * scale, count === peak && step === lit - 1));
      } else {
        ghost.push(dot(x, y, cell * levels.scale[0], false));
      }
    }
  });

  return (
    <>
      <Path d={ghost.join('')} fill={colors.ink} opacity={levels.alpha[0] * 0.5} />
      <Path d={day.join('')} fill={colors.ink} opacity={levels.alpha[2]} />
      <Path d={night.join('')} fill={colors.ink} />

      {[0, 6, 12, 18].map((hour) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        const r = outer + 18;
        return (
          <SvgText
            fill={colors.ink40}
            fontFamily={fonts.mono}
            fontSize={10}
            key={hour}
            textAnchor="middle"
            x={cx + Math.cos(angle) * r}
            y={cy + Math.sin(angle) * r + 3}
          >
            {String(hour).padStart(2, '0')}
          </SvgText>
        );
      })}

      <SvgText
        fill={colors.ink}
        fontFamily={fonts.light}
        fontSize={inner * 0.62}
        textAnchor="middle"
        x={cx}
        y={cy + inner * 0.2}
      >
        {peak}
      </SvgText>
      <SvgText
        fill={colors.ink40}
        fontFamily={fonts.mono}
        fontSize={9}
        textAnchor="middle"
        x={cx}
        y={cy + inner * 0.52}
      >
        at peak
      </SvgText>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    stage: {
      alignItems: 'center',
    },
    verdict: {
      marginTop: 6,
    },
    verdictSub: {
      marginTop: 4,
    },
    ledger: {
      paddingVertical: 6,
    },
    ledgerRow: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 9,
    },
    plus: {
      color: colors.yes,
      fontSize: 15,
      minWidth: 92,
    },
    minus: {
      color: colors.no,
      fontSize: 15,
      minWidth: 92,
    },
    net: {
      fontSize: 15,
      minWidth: 92,
    },
    ledgerName: {
      color: colors.ink40,
      flex: 1,
    },
    note: {
      marginTop: 24,
      textAlign: 'center',
    },
  }),
);
