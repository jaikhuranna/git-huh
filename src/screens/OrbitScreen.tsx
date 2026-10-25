import { useEffect, useMemo, useState, type ReactElement } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Card } from '../components/Card';
import { Data, Label } from '../components/Type';
import type { GitHubModel, LanguageShare } from '../lib/contributions';
import { languageMark } from '../lib/languageMarks';
import { colors, fonts, themed } from '../theme';
import { Block, ScreenHead } from './shared';

/** Turns of the spiral from the centre to the outer end. */
const TURNS = 2.35;
const THETA_MAX = TURNS * 2 * Math.PI;
/** Points sampled along the spiral before it is cut into arc segments. */
const STEPS = 200;
/** One turn every fifty seconds. */
const PERIOD_MS = 50_000;
const ON_SPIRAL = 14;
/** Top languages that get a filled colour chip, as in the pin. */
const CHIPS = 6;

/**
 * Your languages strung along a single spiral, the line breaking around
 * each one, the top six lifted out into the widget's dots with the language's
 * mark cut out of them — the first squared off, as a peak is — and distance
 * from the centre is rank.
 *
 * The spiral turns. It is the one block in the app whose subject is
 * literally an orbit, and a still frame of it was only ever half the pin —
 * the eye is supposed to be walked inward along the line.
 */
export function OrbitScreen({
  model,
  active = true,
  onShare,
}: {
  model: GitHubModel;
  active?: boolean;
  onShare: () => void;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 72, 320);
  const languages = useMemo(() => model.languages.slice(0, ON_SPIRAL), [model.languages]);
  // Parked while the section is out of sight, the app is backgrounded, or
  // the platform asks for reduced motion. The animated value itself is not
  // rebuilt when those flags change.
  const motion = useMotionAllowed();
  const turn = useTurn(active && motion && languages.length > 0);

  return (
    <Block>
      <ScreenHead
        action={{ hint: 'makes your languages an image to post', label: 'share', onPress: onShare }}
        left="languages"
        right={`${model.languages.length} in play`}
      />

      <Card style={styles.stage}>
        <Spiral languages={languages} size={size} turn={turn} />
      </Card>

      <Card style={styles.legend}>
        {model.languages.slice(0, 8).map((language) => (
          <View key={language.name} style={styles.legendRow}>
            <LanguageChip name={language.name} size={22} />
            <Data style={styles.legendName}>{language.name.toLowerCase()}</Data>
            <Data style={styles.legendShare}>
              {(language.share * 100).toFixed(1)}%
            </Data>
          </View>
        ))}
        {model.languages.length === 0 && (
          <Label>no language data on these repos</Label>
        )}
      </Card>
    </Block>
  );
}

/**
 * Decorative motion is allowed only while the app is foregrounded and the
 * platform has not asked for reduced motion. The turn value is owned by
 * `useTurn`; this only reports whether a lap should be in flight.
 */

/**
 * One turn, 0 → 1, over and over, on the native driver: the spiral is drawn
 * once and the views holding it are rotated, so a frame costs nothing on the
 * JavaScript thread — which matters on a page you are scrolling. Each lap
 * resumes from where the last one was parked.
 */
function useMotionAllowed(): boolean {
  const [foreground, setForeground] = useState(() => AppState.currentState === 'active');
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      setForeground(next === 'active');
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        if (!cancelled) setReduce(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, []);

  return foreground && !reduce;
}

function useTurn(active: boolean): Animated.Value {
  const [turn] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return;
    let parked = false;
    const lap = (from: number) => {
      turn.setValue(from);
      Animated.timing(turn, {
        duration: (1 - from) * PERIOD_MS,
        easing: Easing.linear,
        isInteraction: false,
        toValue: 1,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !parked) lap(0);
      });
    };
    turn.stopAnimation((value) => lap(value % 1));
    return () => {
      parked = true;
      turn.stopAnimation();
    };
  }, [active, turn]);

  return turn;
}

interface Seat {
  language: LanguageShare;
  rank: number;
  /** Position along the spiral, 0 at the centre and 1 at the outer end. */
  t: number;
  radius: number;
  angle: number;
  /** Half-width of the mark, which is also the gap it cuts in the line. */
  half: number;
}

function Spiral({
  languages,
  size,
  turn,
}: {
  languages: LanguageShare[];
  size: number;
  turn: Animated.Value;
}) {
  const cx = size / 2;
  const cy = size / 2;
  // The outer end has to clear the largest chip, or the top language is
  // sliced off by the edge of the canvas.
  const outer = size / 2 - 20;
  const inner = size * 0.1;

  const seats = useMemo<Seat[]>(() => {
    const count = languages.length;
    return languages.map((language, rank) => {
      // Rank 0 sits at the outer end, where there is room for the biggest
      // chip, and the tail walks inward.
      const t = count > 1 ? 1 - rank / (count - 1) : 1;
      return {
        language,
        rank,
        t,
        radius: inner + (outer - inner) * t,
        angle: t * THETA_MAX,
        half: rank < CHIPS ? 15 - rank : 9,
      };
    });
  }, [inner, languages, outer]);

  const segments = useMemo(
    () => arcs(cx, cy, inner, outer, seats),
    [cx, cy, inner, outer, seats],
  );

  const spin = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const upright = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-360deg'] });

  return (
    <View style={{ height: size, width: size }}>
      <Animated.View style={[styles.layer, { transform: [{ rotate: spin }] }]}>
        <Svg height={size} width={size}>
          {segments.map((d, index) => (
            <Path
              d={d}
              fill="none"
              key={index}
              opacity={0.4}
              stroke={colors.ink}
              strokeLinecap="round"
              strokeWidth={1}
            />
          ))}
        </Svg>

        {/* Marks ride the same rotation but turn back against it to stay
            upright: a spinning devicon reads as a glitch, not as an orbit.
            Each is its own small canvas, so the one rotation can be undone
            per mark. */}
        {seats.map((seat) => {
          const box = seat.half * 2 + 4;
          return (
            <Animated.View
              key={seat.language.name}
              style={[
                styles.mark,
                {
                  height: box,
                  left: cx + Math.cos(seat.angle) * seat.radius - box / 2,
                  top: cy + Math.sin(seat.angle) * seat.radius - box / 2,
                  transform: [{ rotate: upright }],
                  width: box,
                },
              ]}
            >
              <Svg height={box} width={box}>
                <Mark seat={seat} x={box / 2} y={box / 2} />
              </Svg>
            </Animated.View>
          );
        })}
      </Animated.View>
    </View>
  );
}

function Mark({ seat, x, y }: { seat: Seat; x: number; y: number }) {
  const { language, rank, half } = seat;
  // The widget's weights, heaviest for the language you write most.
  const weight = [1, 0.9, 0.8, 0.72, 0.64, 0.58][rank] ?? 0.5;

  if (rank >= CHIPS) {
    // Off-chip languages get the mark in ink, or their initials when
    // devicon has no icon for them.
    return mark(language.name, x, y, half * 1.9, colors.ink, language.name.slice(0, 2));
  }

  // Squares and circles alternating, exactly as the pin alternates them.
  return (
    <G>
      {rank === 0 ? (
        // The first language is the peak, and a peak squares off.
        <Rect
          fill={colors.ink}
          height={half * 2}
          opacity={weight}
          rx={half * 0.44}
          width={half * 2}
          x={x - half}
          y={y - half}
        />
      ) : (
        <Circle cx={x} cy={y} fill={colors.ink} opacity={weight} r={half} />
      )}
      {mark(language.name, x, y, half * 1.1, colors.onBlack)}
    </G>
  );
}

/**
 * The spiral, cut into the arc segments between the marks. Points are
 * hidden where they fall inside a mark's gap, and each surviving run becomes
 * one path — which is what gives the pin its broken line.
 */
function arcs(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  seats: Seat[],
): string[] {
  // A gap measured in pixels becomes a gap in `t` by dividing through by how
  // fast arc length grows with t, which on a spiral is about θmax · r.
  const gaps = seats.map((seat) => ({
    t: seat.t,
    span: (seat.half + 5) / Math.max(1, THETA_MAX * seat.radius),
  }));

  const runs: string[] = [];
  let current: string[] = [];

  for (let step = 0; step <= STEPS; step++) {
    const t = step / STEPS;
    const hidden = gaps.some((gap) => Math.abs(t - gap.t) < gap.span);
    if (hidden) {
      if (current.length > 1) runs.push(current.join(' '));
      current = [];
      continue;
    }
    const radius = inner + (outer - inner) * t;
    const angle = t * THETA_MAX;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    current.push(`${current.length === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  if (current.length > 1) runs.push(current.join(' '));

  return runs;
}

/**
 * A language's devicon mark placed on the spiral. Icons are authored on their
 * own viewBox, so they are scaled and translated into position rather than
 * drawn at absolute coordinates.
 */
function mark(
  name: string,
  cx: number,
  cy: number,
  size: number,
  tint: string,
  fallbackLetter?: string,
): ReactElement {
  const icon = languageMark(name);
  if (!icon) {
    return (
      <SvgText
        fill={tint}
        fontFamily={fonts.monoSemi}
        fontSize={11}
        key={`letter-${name}`}
        textAnchor="middle"
        x={cx}
        y={cy + 4}
      >
        {fallbackLetter ?? name.slice(0, 2)}
      </SvgText>
    );
  }
  const box = icon.viewBox.split(/\s+/).map(Number);
  const span = Math.max(box[2] || 128, box[3] || 128);
  const scale = size / span;
  return (
    <G
      key={`mark-${name}`}
      transform={`translate(${cx - size / 2}, ${cy - size / 2}) scale(${scale})`}
    >
      <Path d={icon.d} fill={tint} />
    </G>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    stage: {
      alignItems: 'center',
    },
    layer: {
      bottom: 0,
      left: 0,
      position: 'absolute',
      right: 0,
      top: 0,
    },
    mark: {
      position: 'absolute',
    },
    legend: {
      gap: 2,
      paddingVertical: 10,
    },
    legendRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 7,
    },
    legendName: {
      flex: 1,
    },
    legendShare: {
      color: colors.ink40,
    },
  }),
);
