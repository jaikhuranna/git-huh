import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';

import { Body, Data, Heading, Label, Numeral } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, radii } from '../theme';
import { fmt } from './shared';

/**
 * pin07 — the weather app. Airy off-white at the top, an ultra-thin hero
 * numeral, a frosted three-stat card, and a full-bleed gradient filling the
 * bottom. Warm while a streak is alive, cold when it is not: your commit
 * weather.
 */
export function WeatherScreen({ model }: { model: GitHubModel }) {
  const { width, height } = useWindowDimensions();
  const derived = insights(model);
  const warm = derived.currentStreak > 0;
  const stops = warm ? colors.warmGradient : colors.coldGradient;

  // A long streak saturates sooner, so the gradient reads as intensity.
  const intensity = Math.min(1, 0.45 + derived.currentStreak / 24);
  const now = new Date();

  const condition = warm
    ? derived.currentStreak >= 7
      ? 'severe shipping expected'
      : 'steady output'
    : 'quiet and overcast';

  return (
    <View style={styles.screen}>
      {/* Full-bleed gradient, fading up into the canvas with no seam. */}
      <View pointerEvents="none" style={styles.gradient}>
        <Svg height={height * 0.62} width={width}>
          <Defs>
            <LinearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
              <Stop offset="0" stopColor={colors.canvas} stopOpacity="0" />
              <Stop offset="0.42" stopColor={stops[0]} stopOpacity={intensity * 0.85} />
              <Stop offset="1" stopColor={stops[1]} stopOpacity={intensity} />
            </LinearGradient>
          </Defs>
          <Rect fill="url(#sky)" height={height * 0.62} width={width} />
        </Svg>
      </View>

      <View style={styles.content}>
        <Heading style={styles.place}>~{model.login.toLowerCase()}</Heading>
        <Data style={styles.stamp}>
          {now.toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          })}
        </Data>

        <Body style={styles.condition}>{condition}</Body>

        <View style={styles.heroRow}>
          <Numeral>{fmt(model.todayCount)}</Numeral>
          <Label style={styles.unit}>c</Label>
        </View>

        <View style={styles.range}>
          <Data style={styles.rangeText}>
            High: <Data style={styles.rangeValue}>{fmt(derived.bestDay)}</Data>
          </Data>
          <Data style={styles.rangeText}>
            Low: <Data style={styles.rangeValue}>{derived.avgPerDay.toFixed(1)}</Data>
          </Data>
        </View>

        <View style={styles.frosted}>
          <Stat
            icon="velocity"
            label="velocity"
            value={`${derived.velocity > 0 ? '+' : ''}${Math.round(derived.velocity)}%`}
          />
          <View style={styles.divider} />
          <Stat
            icon="consistency"
            label="consistency"
            value={`${Math.round(derived.consistency * 100)}%`}
          />
          <View style={styles.divider} />
          <Stat
            icon="pace"
            label="pace"
            value={`${derived.avgPerDay.toFixed(1)}/d`}
          />
        </View>

        <View style={styles.weekStrip}>
          {(model.columns[model.columns.length - 1] ?? []).map((day) => {
            const tall = 34 * (day.count / Math.max(1, derived.bestDay)) + 4;
            return (
              <View
                key={day.date}
                style={[
                  styles.weekBar,
                  { height: tall, opacity: day.isToday ? 1 : 0.5 },
                ]}
              />
            );
          })}
        </View>
        <Label style={styles.weekLabel}>this week</Label>
      </View>
    </View>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: 'velocity' | 'consistency' | 'pace';
  value: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <Svg height={20} width={20}>
        <Path
          d={ICONS[icon]}
          fill="none"
          stroke={colors.ink}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.25}
        />
      </Svg>
      <Heading style={styles.statValue}>{value}</Heading>
      <Label>{label}</Label>
    </View>
  );
}

/** Hairline glyphs in the spirit of the pin's rain / humidity / wind row. */
const ICONS = {
  velocity: 'M3 15 L8 9 L12 12 L17 5 M13 5 H17 V9',
  consistency: 'M10 3 A7 7 0 1 1 9.99 3 M6.5 10 L9 12.5 L13.5 7.5',
  pace: 'M3 14 A8 8 0 0 1 17 14 M10 14 L13.5 9.5',
} as const;

const styles = StyleSheet.create({
  screen: {
    backgroundColor: colors.canvas,
    flex: 1,
  },
  gradient: {
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  place: {
    fontSize: 18,
  },
  stamp: {
    color: colors.ink70,
    marginTop: 4,
  },
  condition: {
    color: colors.ink70,
    marginTop: 34,
  },
  heroRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    marginTop: 2,
  },
  unit: {
    color: colors.ink70,
    marginTop: 18,
  },
  range: {
    flexDirection: 'row',
    gap: 26,
    marginTop: 2,
  },
  rangeText: {
    color: colors.ink70,
  },
  rangeValue: {
    color: colors.ink,
  },
  frosted: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: radii.card,
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 28,
    paddingVertical: 14,
    width: '100%',
  },
  stat: {
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  statValue: {
    fontSize: 16,
  },
  divider: {
    backgroundColor: colors.hair,
    height: 34,
    width: 1,
  },
  weekStrip: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 8,
    height: 42,
    marginTop: 'auto',
  },
  weekBar: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 3,
    width: 16,
  },
  weekLabel: {
    color: colors.ink,
    marginBottom: 18,
    marginTop: 10,
  },
});
