import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Text as SvgText } from 'react-native-svg';

import { Data, Heading, Label, Title } from '../components/Type';
import {
  hourHistogram,
  ledger,
  type Activity,
} from '../lib/activity';
import { colors, fonts, themed } from '../theme';
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
  const size = Math.min(width - 40, 340);
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
          <View style={styles.stage}>
            <Svg height={size} width={size}>
              <Dial hours={hours} peak={peak} size={size} />
            </Svg>
          </View>

          <Title style={styles.verdict}>
            {nightShare > 0.35 ? 'Night owl' : nightShare < 0.12 ? 'Early bird' : 'Daylight hours'}
          </Title>
          <Label style={styles.verdictSub}>
            peak at {String(peakHour).padStart(2, '0')}:00 ·{' '}
            {Math.round(nightShare * 100)}% after dark
          </Label>

          <View style={styles.ledger}>
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
          </View>
        </>
      )}
    </Page>
  );
}

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
  const inner = size * 0.17;
  const outer = size * 0.39;

  return (
    <>
      <Circle
        cx={cx}
        cy={cy}
        fill="none"
        r={outer}
        stroke={colors.hairStrong}
        strokeWidth={1}
      />
      <Circle
        cx={cx}
        cy={cy}
        fill="none"
        r={(inner + outer) / 2}
        stroke={colors.hair}
        strokeWidth={1}
      />

      {hours.map((count, hour) => {
        // Midnight at the top, clockwise, like a real clock face.
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        const length = inner + (count / peak) * (outer - inner);
        const isNight = hour >= 22 || hour < 5;
        return (
          <Line
            key={hour}
            stroke={colors.ink}
            strokeLinecap="round"
            strokeWidth={size * 0.026}
            opacity={count === 0 ? 0.12 : isNight ? 1 : 0.55}
            x1={cx + Math.cos(angle) * inner}
            x2={cx + Math.cos(angle) * length}
            y1={cy + Math.sin(angle) * inner}
            y2={cy + Math.sin(angle) * length}
          />
        );
      })}

      {[0, 6, 12, 18].map((hour) => {
        const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
        const r = outer + 17;
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

      <Circle cx={cx} cy={cy} fill={colors.black} r={inner * 0.82} />
      <SvgText
        fill={colors.onBlack}
        fontFamily={fonts.sansBold}
        fontSize={inner * 0.5}
        textAnchor="middle"
        x={cx}
        y={cy + inner * 0.18}
      >
        {peak}
      </SvgText>
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    stage: {
      alignItems: 'center',
      marginTop: 8,
    },
    verdict: {
      marginTop: 18,
    },
    verdictSub: {
      marginTop: 4,
    },
    ledger: {
      marginTop: 22,
    },
    ledgerRow: {
      alignItems: 'baseline',
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 12,
      paddingVertical: 9,
    },
    plus: {
      color: colors.green,
      fontSize: 16,
      minWidth: 92,
    },
    minus: {
      color: colors.red,
      fontSize: 16,
      minWidth: 92,
    },
    net: {
      fontSize: 16,
      minWidth: 92,
    },
    ledgerName: {
      color: colors.ink70,
      flex: 1,
    },
    note: {
      marginTop: 24,
      textAlign: 'center',
    },
  }),
);
