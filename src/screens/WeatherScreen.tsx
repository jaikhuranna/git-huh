import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { dot } from '../components/DotField';
import { DotRow } from '../components/DotRow';
import { Data, Heading, Label, Numeral } from '../components/Type';
import { insights, type GitHubModel } from '../lib/contributions';
import { colors, levels, radii, space, themed } from '../theme';
import { fmt, hash } from './shared';

/**
 * Your commit weather: a place (your handle), a date, a condition, one thin
 * numeral for today and a card of readings under it — laid out like a
 * weather app, drawn in the widget's dots.
 *
 * The sky is a field of them rising from the bottom of the page. How high it
 * climbs and how bright it gets is the current streak: a long run fills the
 * page, a quiet spell leaves a low, faint haze. Seeded, so the same streak is
 * the same sky.
 */
export function WeatherScreen({ model }: { model: GitHubModel }) {
  const { width, height } = useWindowDimensions();
  const derived = insights(model);
  const warm = derived.currentStreak > 0;
  // A long streak saturates sooner, so the sky reads as intensity.
  const intensity = warm ? Math.min(1, 0.45 + derived.currentStreak / 24) : 0.22;
  const now = new Date();
  // The last seven days, ending today — not the calendar week, whose
  // unhappened days would be drawn as ghosts of a silence.
  const days = model.columns.flat();
  const todayAt = days.findIndex((day) => day.isToday);
  const week = (todayAt >= 0 ? days.slice(0, todayAt + 1) : days).slice(-7);

  const condition = warm
    ? derived.currentStreak >= 7
      ? 'severe shipping expected'
      : 'steady output'
    : 'quiet and overcast';

  return (
    <View style={styles.screen}>
      <Sky height={height * 0.5} intensity={intensity} width={width} />

      <View style={styles.content}>
        <Heading style={styles.place}>~{model.login.toLowerCase()}</Heading>
        <Data style={styles.stamp}>
          {now
            .toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
            })
            .toLowerCase()}
        </Data>

        <Data style={styles.condition}>{condition}</Data>

        <View style={styles.heroRow}>
          <Numeral style={styles.hero}>{fmt(model.todayCount)}</Numeral>
          <Label style={styles.unit}>today</Label>
        </View>

        <View style={styles.range}>
          <Data style={styles.rangeText}>
            high <Data style={styles.rangeValue}>{fmt(derived.bestDay)}</Data>
          </Data>
          <Data style={styles.rangeText}>
            low <Data style={styles.rangeValue}>{derived.avgPerDay.toFixed(1)}</Data>
          </Data>
        </View>

        <View style={styles.frosted}>
          <Stat
            icon={trend(derived.velocity)}
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

        <View style={styles.weekCard}>
          <Label style={styles.weekLabel}>this week</Label>
          <DotRow
            height={28}
            labels={week.map((day) => WEEKDAY_INITIALS[new Date(`${day.date}T00:00:00`).getDay()])}
            today={week.length - 1}
            values={week.map((day) => day.count)}
            width={width - space.gutter * 2 - 60}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * The sky: dots rising from the bottom edge, thinning and fading as they go
 * up. One path per weight, so a page of dots is five nodes.
 */
function Sky({ width, height, intensity }: { width: number; height: number; intensity: number }) {
  const pitch = 19;
  const paths = useMemo(() => {
    const buckets: string[][] = [[], [], [], [], []];
    const cols = Math.ceil(width / pitch);
    const rows = Math.ceil(height / pitch);
    for (let r = 0; r < rows; r++) {
      // 0 at the bottom edge, 1 at the top of the sky.
      const up = r / rows;
      const reach = Math.max(0, 1 - up / Math.max(0.15, intensity));
      for (let c = 0; c < cols; c++) {
        const roll = (hash(`${c}:${r}`) % 1000) / 1000;
        if (roll > reach * 0.95) continue;
        const level = Math.min(4, Math.floor(reach * 4 * (0.4 + roll * 0.9)));
        const cx = c * pitch + pitch / 2;
        const cy = height - r * pitch - pitch / 2;
        buckets[level].push(dot(cx, cy, pitch * 0.7 * levels.scale[level], false));
      }
    }
    return buckets.map((parts) => parts.join(''));
  }, [height, intensity, width]);

  return (
    <View pointerEvents="none" style={styles.sky}>
      <Svg height={height} width={width}>
        {paths.map((d, level) =>
          d ? (
            <Path d={d} fill={colors.ink} key={level} opacity={levels.alpha[level] * 0.55} />
          ) : null,
        )}
      </Svg>
    </View>
  );
}

/**
 * Which way the velocity glyph points. The stat is signed and the arrow was
 * not: a week that halved still drew a rising line, which is the one thing
 * on this screen that can be read as a lie.
 */
function trend(velocity: number): IconName {
  if (Math.round(velocity) > 0) return 'rising';
  if (Math.round(velocity) < 0) return 'falling';
  return 'level';
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: IconName;
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

const WEEKDAY_INITIALS = ['s', 'm', 't', 'w', 't', 'f', 's'] as const;

/** Hairline glyphs in the spirit of the pin's rain / humidity / wind row. */
const ICONS = {
  rising: 'M3 15 L8 9 L12 12 L17 5 M13 5 H17 V9',
  falling: 'M3 5 L8 11 L12 8 L17 15 M13 15 H17 V11',
  level: 'M3 10 H15 M12 6.5 L15.5 10 L12 13.5',
  consistency: 'M10 3 A7 7 0 1 1 9.99 3 M6.5 10 L9 12.5 L13.5 7.5',
  pace: 'M3 14 A8 8 0 0 1 17 14 M10 14 L13.5 9.5',
} as const;

type IconName = keyof typeof ICONS;

const styles = themed(() =>
  StyleSheet.create({
    screen: {
      backgroundColor: colors.canvas,
      flex: 1,
    },
    sky: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
    },
    content: {
      alignItems: 'center',
      flex: 1,
      paddingHorizontal: space.gutter,
      paddingTop: 12,
    },
    place: {
      fontSize: 17,
    },
    stamp: {
      color: colors.ink40,
      marginTop: 4,
    },
    condition: {
      color: colors.ink70,
      marginTop: 22,
    },
    hero: {
      fontSize: 120,
      lineHeight: 130,
    },
    heroRow: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 4,
      marginTop: 2,
    },
    unit: {
      color: colors.ink40,
      marginTop: 30,
    },
    range: {
      flexDirection: 'row',
      gap: 26,
      marginTop: 2,
    },
    rangeText: {
      color: colors.ink40,
    },
    rangeValue: {
      color: colors.ink,
    },
    frosted: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.card,
      flexDirection: 'row',
      justifyContent: 'space-around',
      marginTop: 26,
      paddingVertical: 16,
      width: '100%',
    },
    stat: {
      alignItems: 'center',
      gap: 5,
      flex: 1,
    },
    statValue: {
      fontSize: 15,
    },
    divider: {
      backgroundColor: colors.hair,
      height: 34,
      width: 1,
    },
    weekCard: {
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radii.card,
      gap: 6,
      marginTop: 10,
      paddingBottom: 12,
      paddingTop: 14,
      width: '100%',
    },
    weekLabel: {
      color: colors.ink,
    },
  }),
);
