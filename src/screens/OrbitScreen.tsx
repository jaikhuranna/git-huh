import { useMemo, type ReactElement } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Data, Label } from '../components/Type';
import { useTicker } from '../hooks/useTicker';
import type { GitHubModel, LanguageShare } from '../lib/contributions';
import { languageMark } from '../lib/languageMarks';
import { colors, fonts } from '../theme';
import { onColor, Page, ScreenHead } from './shared';

/** Turns of the spiral from the centre to the outer end. */
const TURNS = 2.35;
const THETA_MAX = TURNS * 2 * Math.PI;
/** Points sampled along the spiral before it is cut into arc segments. */
const STEPS = 200;
/** Revolutions per second — one turn every fifty seconds. */
const SPIN_HZ = 0.02;
const ON_SPIRAL = 14;
/** Top languages that get a filled colour chip, as in the pin. */
const CHIPS = 6;

/**
 * pin06 — letters strung along a single spiral, the line breaking around
 * each one, a handful of them lifted out into filled colour chips. The
 * letters are your languages; the chip colour is GitHub's own colour for
 * that language, and distance from the centre is its rank.
 *
 * The spiral turns. It is the one screen in the app whose subject is
 * literally an orbit, and a still frame of it was only ever half the pin —
 * the eye is supposed to be walked inward along the line.
 */
export function OrbitScreen({
  model,
  active = true,
}: {
  model: GitHubModel;
  active?: boolean;
}) {
  const { width } = useWindowDimensions();
  const size = Math.min(width - 40, 340);
  const languages = model.languages.slice(0, ON_SPIRAL);
  // Parked while the page is off screen: thirteen screens are mounted at
  // once and only the one being looked at should be burning frames.
  const seconds = useTicker(active && languages.length > 0);
  const spin = seconds * SPIN_HZ * 2 * Math.PI;

  return (
    <Page>
      <ScreenHead left="languages" right={`${model.languages.length} in play`} />

      <View style={styles.stage}>
        <Svg height={size} width={size}>
          <Spiral languages={languages} size={size} spin={spin} />
        </Svg>
      </View>

      <View style={styles.legend}>
        {model.languages.slice(0, 8).map((language) => (
          <View key={language.name} style={styles.legendRow}>
            <LanguageChip
              color={language.color}
              name={language.name}
              size={20}
            />
            <Data style={styles.legendName}>{language.name}</Data>
            <Data style={styles.legendShare}>
              {(language.share * 100).toFixed(1)}%
            </Data>
          </View>
        ))}
        {model.languages.length === 0 && (
          <Label>no language data on these repos</Label>
        )}
      </View>
    </Page>
  );
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
  spin,
}: {
  languages: LanguageShare[];
  size: number;
  spin: number;
}) {
  const cx = size / 2;
  const cy = size / 2;
  // The outer end has to clear the largest chip, or the top language is
  // sliced off by the edge of the canvas — which is what used to happen.
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

  // The line is geometry, not animation: it is drawn once and the whole
  // group is rotated, so a frame costs one transform string rather than two
  // hundred re-projected points.
  const segments = useMemo(
    () => arcs(cx, cy, inner, outer, seats),
    [cx, cy, inner, outer, seats],
  );

  const degrees = (spin * 180) / Math.PI;

  return (
    <>
      <G transform={`rotate(${degrees.toFixed(2)} ${cx} ${cy})`}>
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
      </G>

      {/* Marks ride the same rotation but stay upright: a spinning devicon
          reads as a glitch, not as an orbit. */}
      {seats.map((seat) => {
        const angle = seat.angle + spin;
        const x = cx + Math.cos(angle) * seat.radius;
        const y = cy + Math.sin(angle) * seat.radius;
        return <Mark key={seat.language.name} seat={seat} x={x} y={y} />;
      })}
    </>
  );
}

function Mark({ seat, x, y }: { seat: Seat; x: number; y: number }) {
  const { language, rank, half } = seat;

  if (rank >= CHIPS) {
    // Off-chip languages get the mark in ink, or their initials when
    // devicon has no icon for them.
    return mark(language.name, x, y, half * 1.9, colors.ink, language.name.slice(0, 2));
  }

  // Squares and circles alternating, exactly as the pin alternates them.
  return (
    <G>
      {rank % 2 === 0 ? (
        <Rect
          fill={language.color}
          height={half * 2}
          width={half * 2}
          x={x - half}
          y={y - half}
        />
      ) : (
        <Circle cx={x} cy={y} fill={language.color} r={half} />
      )}
      {mark(language.name, x, y, half * 1.1, onColor(language.color))}
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
        fontFamily={fonts.sansBold}
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

const styles = StyleSheet.create({
  stage: {
    alignItems: 'center',
  },
  legend: {
    gap: 2,
    marginTop: 18,
  },
  legendRow: {
    alignItems: 'center',
    borderTopColor: colors.hair,
    borderTopWidth: 1,
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
});
