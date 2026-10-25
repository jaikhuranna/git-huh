import { useMemo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Data, Heading, Label, Title } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { Card } from '../components/Card';
import { colors, themed } from '../theme';
import { Block, fmt, ScreenHead } from './shared';

/**
 * The year as a budget. Ribbons branching left to right,
 * bold percentages with the grey absolute tucked underneath. Here the budget
 * is your year: total contributions fan into what kind of work they were, and
 * the commits go on to fan into the repositories that absorbed them.
 *
 * **Weight, not colour.** Each kind of work is one of the widget's weights of
 * ink, and the legend repeats it as a dot of the same weight beside the
 * name, so a band can be identified where it is drawn without a hue.
 *
 * **The private bucket.** GitHub's four typed totals cover public work only;
 * everything done in a repository the profile does not expose arrives as a
 * single opaque `restrictedContributionsCount`. It is already inside the
 * calendar total, so leaving it out of this diagram made the screen contradict
 * every other screen in the app — a year of 441 contributions drawn as a flow
 * of 10. It is now its own band, and it is grey because that is the truth of
 * it: GitHub will tell you how much there was and nothing whatever about what
 * it was — so it is the faintest band.
 *
 * Labels sit in rows beneath the diagram rather than on top of it — drawn over
 * the ribbons they were unreadable, and the repo names collided with the
 * percentages.
 */

/**
 * One weight of ink per kind of work — the widget's own steps, heaviest for
 * the biggest kind of work there usually is. Private work is the faintest,
 * because that is the truth of it: GitHub says how much and nothing else.
 */
const CATEGORY_WEIGHT: Record<string, number> = {
  commits: 1,
  'pull requests': 0.72,
  reviews: 0.52,
  issues: 0.36,
  private: 0.16,
};

const CHART_HEIGHT = 300;
const GAP = 8;
/** A band nobody can see is worse than a band that rounds up a little. */
const MIN_BAND = 3;

interface Band<T> {
  entry: T;
  y: number;
  height: number;
  /** Opacity of the ink this band is drawn in. */
  weight: number;
}

/** Stack values down a column, each keeping its share of the usable height. */
function stack<T>(
  entries: T[],
  value: (entry: T) => number,
  weight: (entry: T) => number,
  height: number,
): Band<T>[] {
  const total = entries.reduce((sum, entry) => sum + value(entry), 0) || 1;
  const usable = height - GAP * Math.max(entries.length - 1, 0);
  return entries.reduce<Band<T>[]>((bands, entry) => {
    const previous = bands[bands.length - 1];
    const y = previous ? previous.y + previous.height + GAP : 0;
    return [
      ...bands,
      {
        entry,
        y,
        height: Math.max((value(entry) / total) * usable, MIN_BAND),
        weight: weight(entry),
      },
    ];
  }, []);
}

export function FlowScreen({ model, onShare }: { model: GitHubModel; onShare: () => void }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 36 - 36;

  /**
   * Band heights are a function of the breakdown and the top five
   * repositories. Horizontal placement uses the chart width directly, below.
   * Year re-renders for reasons that change neither (a share handler, a
   * sibling block), and rebuilding the bands would hand SVG a new object
   * graph for a diagram that has not moved. The Sankey is small; this only
   * keeps that identity stable.
   */
  const flow = useMemo(
    () => sankey(model.breakdown, model.topRepos),
    [model.breakdown, model.topRepos],
  );
  const { total, catBands, trunkOffsets, repoBands, repoSources, commitsBand } = flow;

  const trunkX = 0;
  const trunkW = 8;
  const midX = chartWidth * 0.46;
  const midW = 8;
  const rightX = chartWidth - 8;

  return (
    <Block>
      <ScreenHead
        action={{ hint: 'makes the split an image to post', label: 'share', onPress: onShare }}
        left="where it went"
        right="last 12 months"
      />

      <Card>
      <View style={styles.trunkRow}>
        <Title>100%</Title>
        <Label style={styles.trunkValue}>{fmt(total)} contributions</Label>
      </View>

      <Svg height={CHART_HEIGHT} width={chartWidth}>
        {catBands.map((band, index) => (
          <Path
            d={ribbon(
              trunkX + trunkW,
              trunkOffsets[index],
              trunkOffsets[index] + band.height,
              midX,
              band.y,
              band.y + band.height,
            )}
            fill={colors.ink}
            key={band.entry.label}
            opacity={band.weight * 0.42}
          />
        ))}

        {repoBands.map((band, index) => {
          const source = repoSources[index];
          if (!commitsBand || !source) return null;
          return (
            <Path
              d={ribbon(
                midX + midW,
                source.y,
                source.y + source.height,
                rightX,
                band.y,
                band.y + band.height,
              )}
              fill={colors.ink}
              key={band.entry.nameWithOwner}
              opacity={band.weight * 0.36}
            />
          );
        })}

        <Rect fill={colors.ink} height={CHART_HEIGHT} rx={trunkW / 2} width={trunkW} x={trunkX} y={0} />
        {catBands.map((band) => (
          <Rect
            fill={colors.ink}
            height={band.height}
            key={band.entry.label}
            opacity={band.weight}
            rx={midW / 2}
            width={midW}
            x={midX}
            y={band.y}
          />
        ))}
        {repoBands.map((band) => (
          <Rect
            fill={colors.ink}
            height={band.height}
            key={band.entry.nameWithOwner}
            opacity={band.weight}
            rx={3}
            width={6}
            x={rightX}
            y={band.y}
          />
        ))}
      </Svg>
      </Card>

      <Card style={styles.legend}>
        {catBands.map((band) => (
          <View key={band.entry.label} style={styles.legendRow}>
            <View style={[styles.swatch, { opacity: band.weight }]} />
            <Heading style={styles.pct}>
              {((band.entry.value / total) * 100).toFixed(1)}%
            </Heading>
            <Data style={styles.legendName}>{band.entry.label}</Data>
            <Data style={styles.legendValue}>{fmt(band.entry.value)}</Data>
          </View>
        ))}
      </Card>

      {model.breakdown.private > 0 && (
        <Label style={styles.footnote}>
          github reports private work as a count and nothing else
        </Label>
      )}

      <Card style={styles.legend} title="commits into">
        {repoBands.map((band) => (
          <View key={band.entry.nameWithOwner} style={styles.legendRow}>
            <View style={[styles.swatch, { opacity: band.weight }]} />
            <Data style={styles.legendName}>
              {shorten(band.entry.nameWithOwner)}
            </Data>
            <Data style={styles.legendValue}>{fmt(band.entry.count)}</Data>
          </View>
        ))}
      </Card>
    </Block>
  );
}

interface Category {
  label: string;
  value: number;
}

interface RepoSlice {
  nameWithOwner: string;
  count: number;
}

/**
 * Repos step down in weight by rank; `others` is the ghost.
 */
function repoWeight(nameWithOwner: string, rank: number): number {
  return nameWithOwner === 'others' ? 0.16 : Math.max(0.3, 1 - rank * 0.18);
}

/**
 * The Sankey: category bands off the trunk, then the commit band fanning
 * into the repositories that actually absorbed those commits.
 */
function sankey(breakdown: GitHubModel['breakdown'], topRepos: GitHubModel['topRepos']) {
  const categories: Category[] = (
    [
      { label: 'commits', value: breakdown.commits },
      { label: 'pull requests', value: breakdown.pullRequests },
      { label: 'issues', value: breakdown.issues },
      { label: 'reviews', value: breakdown.reviews },
      { label: 'private', value: breakdown.private },
    ] as const
  )
    .filter((entry) => entry.value > 0)
    .map((entry) => ({ ...entry }));

  const total = categories.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const repos: RepoSlice[] = topRepos.slice(0, 5);

  const catBands = stack(
    categories,
    (entry) => entry.value,
    (entry) => CATEGORY_WEIGHT[entry.label],
    CHART_HEIGHT,
  );

  /**
   * The second stage belongs to the commits band alone: `topRepos` is built
   * from commit contributions, and hanging every repository off the whole
   * trunk would draw repos absorbing pull requests and reviews they never
   * saw. They are sized against the commits band, which means a year that
   * was mostly private shows a thin fan. That is the shape of the year, and
   * the legend carries the numbers.
   */
  const commitsBand = catBands.find((band) => band.entry.label === 'commits');
  const commitsHeight = commitsBand?.height ?? 0;
  const repoTotal = repos.reduce((sum, repo) => sum + repo.count, 0) || 1;

  // Where each repo leaves the commits band: contiguous slices of it, since
  // the band itself has no gaps in it.
  const repoSources = repos.reduce<{ y: number; height: number }[]>(
    (slices, repo) => {
      const previous = slices[slices.length - 1];
      const y = previous ? previous.y + previous.height : commitsBand?.y ?? 0;
      return [...slices, { y, height: (repo.count / repoTotal) * commitsHeight }];
    },
    [],
  );

  // Where it arrives: the same quantities, spaced apart and centred on the
  // chart, so the links fan the way the pin's do instead of running flat.
  const repoHeights = repos.map((repo) =>
    Math.max((repo.count / repoTotal) * commitsHeight, MIN_BAND),
  );
  const repoStack =
    repoHeights.reduce((sum, height) => sum + height, 0) +
    GAP * Math.max(repos.length - 1, 0);
  const repoTop = (CHART_HEIGHT - repoStack) / 2;
  const repoBands = repos.map((repo, index) => ({
    entry: repo,
    y:
      repoTop +
      repoHeights.slice(0, index).reduce((sum, height) => sum + height, 0) +
      GAP * index,
    height: repoHeights[index],
    weight: repoWeight(repo.nameWithOwner, index),
  }));

  /** Where each category band leaves the trunk — the trunk has no gaps. */
  const trunkOffsets = catBands.reduce<number[]>((offsets, _band, index) => {
    const previous = index === 0 ? 0 : offsets[index - 1] + catBands[index - 1].height;
    return [...offsets, previous];
  }, []);

  return { total, catBands, trunkOffsets, repoBands, repoSources, commitsBand };
}

/**
 * One ribbon: a closed shape between two cubic curves, so links read as
 * flowing bands rather than trapezoids.
 */
function ribbon(
  x0: number,
  y0Top: number,
  y0Bottom: number,
  x1: number,
  y1Top: number,
  y1Bottom: number,
): string {
  const mid = (x0 + x1) / 2;
  return [
    `M${x0} ${y0Top}`,
    `C${mid} ${y0Top} ${mid} ${y1Top} ${x1} ${y1Top}`,
    `L${x1} ${y1Bottom}`,
    `C${mid} ${y1Bottom} ${mid} ${y0Bottom} ${x0} ${y0Bottom}`,
    'Z',
  ].join(' ');
}

/** Repo labels are long; the owner is always the same, so drop it. */
function shorten(nameWithOwner: string): string {
  const name = nameWithOwner.split('/').pop() ?? nameWithOwner;
  return name.length > 22 ? `${name.slice(0, 21)}…` : name;
}

const styles = themed(() =>
  StyleSheet.create({
    trunkRow: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 10,
      marginBottom: 12,
    },
    trunkValue: {
      color: colors.ink40,
    },
    legend: {
      paddingVertical: 10,
    },
    legendRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 8,
    },
    swatch: {
      backgroundColor: colors.ink,
      borderRadius: 5,
      height: 10,
      width: 10,
    },
    pct: {
      fontSize: 15,
      minWidth: 58,
    },
    legendName: {
      flex: 1,
    },
    legendValue: {
      color: colors.ink40,
    },
    footnote: {
      color: colors.ink40,
      paddingHorizontal: 4,
    },
    repoHead: {
      marginTop: 18,
    },
  }),
);
