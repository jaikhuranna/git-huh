import type { ReactElement } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Data, Label } from '../components/Type';
import { repoMonths, type Activity, type MonthBar } from '../lib/activity';
import type { GitHubModel, RepoSummary } from '../lib/contributions';
import { colors, fonts, radii } from '../theme';
import { ago, fmt, hash, Page, ScreenHead } from './shared';

const CARD_HEIGHT = 176;
const CHART_HEIGHT = 58;
const AXIS_HEIGHT = 14;
/**
 * The deck should read as fanned cards, not one black slab: at the old
 * overlap the canvas never showed between them and the stack merged into a
 * single shape. This leaves a clear band of background at every seam while
 * still stacking, and keeps each card's footer clear of the one below.
 */
const OVERLAP = 16;

/**
 * pin08 — the Urbit ID cards. A fanned deck of black cards, each with a
 * sigil generated from its name, a monospace handle, and that repository's
 * own commit history drawn month by month.
 */
export function CardsScreen({
  model,
  activity,
}: {
  model: GitHubModel;
  activity: Activity;
}) {
  const { width } = useWindowDimensions();
  const cardWidth = width - 52;

  return (
    <Page>
      <ScreenHead left="repositories" right={`${fmt(model.repoCount)} owned`} />

      <View style={styles.deck}>
        {model.repos.slice(0, 12).map((repo, index) => (
          <RepoCard
            index={index}
            key={repo.nameWithOwner}
            months={repoMonths(activity.commits, repo.nameWithOwner, 12)}
            repo={repo}
            width={cardWidth}
          />
        ))}
        {model.repos.length === 0 && <Label>no repositories to show</Label>}
      </View>
    </Page>
  );
}

function RepoCard({
  repo,
  index,
  width,
  months,
}: {
  repo: RepoSummary;
  index: number;
  width: number;
  months: MonthBar[];
}) {
  const seed = hash(repo.nameWithOwner);
  // A small, stable tilt per card — the pin's deck is never square.
  const tilt = ((seed % 5) - 2) * 0.9;
  const total = months.reduce((sum, month) => sum + month.count, 0);

  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => Linking.openURL(repo.url).catch(() => {})}
      style={[
        styles.card,
        {
          marginTop: index === 0 ? 0 : -OVERLAP,
          transform: [{ rotate: `${tilt}deg` }],
          width,
          zIndex: index,
        },
      ]}
    >
      <View style={styles.cardHead}>
        <Svg height={26} width={26}>
          <Sigil seed={seed} size={26} />
        </Svg>
        <Data style={styles.handle}>
          ~{repo.owner.toLowerCase()}-{repo.name.toLowerCase()}
        </Data>
        {months.length > 0 && (
          <Data style={styles.headCount}>
            {fmt(total)} in {months.length}mo
          </Data>
        )}
      </View>

      {months.length > 0 ? (
        <Svg height={CHART_HEIGHT + AXIS_HEIGHT} width={width - 36}>
          <MonthChart months={months} width={width - 36} />
        </Svg>
      ) : (
        <View style={styles.noChart}>
          <Data style={styles.metaText}>no commits in the sampled window</Data>
        </View>
      )}

      <View style={styles.meta}>
        <Data style={styles.metaText}>★ {fmt(repo.stars)}</Data>
        <Data style={styles.metaText}>⑂ {fmt(repo.forks)}</Data>
        {repo.language && (
          <View style={styles.langRow}>
            <LanguageChip
              color={repo.language.color}
              name={repo.language.name}
              size={14}
            />
            <Data style={styles.metaText}>{repo.language.name}</Data>
          </View>
        )}
        <Data style={styles.metaText}>{ago(repo.pushedAt)}</Data>
        {repo.isPrivate && <Data style={styles.metaText}>private</Data>}
      </View>
    </Pressable>
  );
}

/**
 * The repository's commit history, one bar per month, oldest on the left.
 * The busiest month is drawn solid and carries its count; the rest step down
 * in opacity. A month with no commits still gets a baseline tick, so a gap in
 * the work reads as a gap rather than as missing data.
 */
function MonthChart({ months, width }: { months: MonthBar[]; width: number }) {
  const peak = Math.max(...months.map((month) => month.count), 1);
  const peakIndex = months.findIndex((month) => month.count === peak);
  const pitch = width / months.length;
  const barWidth = Math.max(3, Math.min(pitch - 5, 16));
  const base = CHART_HEIGHT - 1;
  // Leaves room above the tallest bar for its count.
  const tallest = CHART_HEIGHT - 12;

  const bars: ReactElement[] = [];
  months.forEach((month, index) => {
    const x = index * pitch + (pitch - barWidth) / 2;
    const height =
      month.count === 0 ? 2 : Math.max(3, (month.count / peak) * tallest);
    bars.push(
      <Rect
        fill={colors.onBlack}
        height={height}
        key={month.key}
        opacity={month.count === 0 ? 0.18 : index === peakIndex ? 1 : 0.55}
        rx={1.5}
        width={barWidth}
        x={x}
        y={base - height}
      />,
    );
  });

  return (
    <>
      {bars}
      <Line
        stroke={colors.onBlack}
        strokeWidth={1}
        opacity={0.25}
        x1={0}
        x2={width}
        y1={base + 0.5}
        y2={base + 0.5}
      />
      {months.map((month, index) => (
        <SvgText
          fill={colors.onBlack}
          fontFamily={fonts.mono}
          fontSize={8}
          key={`a-${month.key}`}
          opacity={index === peakIndex ? 0.9 : 0.45}
          textAnchor="middle"
          x={index * pitch + pitch / 2}
          y={base + 11}
        >
          {month.initial}
        </SvgText>
      ))}
      <SvgText
        fill={colors.onBlack}
        fontFamily={fonts.mono}
        fontSize={9}
        opacity={0.75}
        textAnchor="middle"
        x={peakIndex * pitch + pitch / 2}
        y={base - tallest - 3}
      >
        {peak}
      </SvgText>
    </>
  );
}

/** The four board primitives, arranged by a hash of the repository name. */
function Sigil({ seed, size }: { seed: number; size: number }) {
  const tile = size / 2;
  const parts: ReactElement[] = [];
  const offset = (seed >> 1) & 3;

  for (let i = 0; i < 4; i++) {
    const slot = (i + offset) & 3;
    const left = (slot & 1) * tile;
    const top = (slot >> 1) * tile;
    const turn = (seed >> (i * 2 + 3)) & 3;

    if (i === 0) {
      parts.push(
        <Path
          d={`M${left} ${top + tile} L${left} ${top} L${left + tile} ${top} A${tile} ${tile} 0 0 1 ${left} ${top + tile} Z`}
          fill={colors.onBlack}
          key={i}
        />,
      );
    } else if (i === 1) {
      const r = tile * 0.14;
      const spread = tile * 0.22;
      const horizontal = turn % 2 === 0;
      parts.push(
        <Circle
          cx={left + tile / 2 - (horizontal ? spread : 0)}
          cy={top + tile / 2 - (horizontal ? 0 : spread)}
          fill={colors.onBlack}
          key={`${i}a`}
          r={r}
        />,
        <Circle
          cx={left + tile / 2 + (horizontal ? spread : 0)}
          cy={top + tile / 2 + (horizontal ? 0 : spread)}
          fill={colors.onBlack}
          key={`${i}b`}
          r={r}
        />,
      );
    } else if (i === 2) {
      const r = tile * 0.4;
      const cx = left + tile / 2;
      const cy = top + tile / 2;
      parts.push(
        <Path
          d={`M${cx - r} ${cy} A${r} ${r} 0 0 1 ${cx + r} ${cy} Z`}
          fill={colors.onBlack}
          key={i}
        />,
      );
    } else {
      parts.push(
        <Circle
          cx={left + tile / 2}
          cy={top + tile / 2}
          fill={colors.onBlack}
          key={i}
          r={tile * 0.3}
        />,
      );
    }
  }

  return <>{parts}</>;
}

const styles = StyleSheet.create({
  deck: {
    alignItems: 'center',
    paddingBottom: 30,
    paddingTop: 6,
  },
  card: {
    backgroundColor: colors.black,
    borderRadius: radii.card,
    height: CARD_HEIGHT,
    padding: 18,
    // A hairline of canvas around every card, so the seams stay visible even
    // where two cards sit almost flush.
    borderColor: colors.canvas,
    borderWidth: 2,
  },
  noChart: {
    height: CHART_HEIGHT + AXIS_HEIGHT,
    justifyContent: 'center',
  },
  cardHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
  },
  handle: {
    color: colors.onBlack,
    flex: 1,
    fontSize: 13,
  },
  headCount: {
    color: colors.onBlack55,
    fontSize: 9,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
  },
  metaText: {
    color: colors.onBlack55,
    fontSize: 10,
  },
  langRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
  },
});
