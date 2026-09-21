import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { Data, Heading, Label, Title } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { colors } from '../theme';
import { fmt, Page, ScreenHead } from './shared';

/**
 * pin05 — the Madrid culture-budget Sankey. Monochrome ribbons branching
 * left to right, bold percentages with the grey absolute tucked underneath.
 * Here the budget is your year: total contributions fan into what kind of
 * work they were, then into the repositories that absorbed them.
 *
 * Labels sit in rows beneath the diagram rather than on top of it — drawn
 * over the ribbons they were unreadable, and the repo names collided with
 * the percentages.
 */
export function FlowScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 40;
  const chartHeight = 300;

  const categories = [
    { label: 'commits', value: model.breakdown.commits },
    { label: 'pull requests', value: model.breakdown.pullRequests },
    { label: 'issues', value: model.breakdown.issues },
    { label: 'reviews', value: model.breakdown.reviews },
  ].filter((entry) => entry.value > 0);

  const total = categories.reduce((sum, entry) => sum + entry.value, 0) || 1;
  const repos = model.topRepos.slice(0, 5);
  const repoTotal = repos.reduce((sum, repo) => sum + repo.count, 0) || 1;

  const trunkX = 0;
  const trunkW = 8;
  const midX = chartWidth * 0.46;
  const midW = 8;
  const rightX = chartWidth - 8;

  const gap = 8;
  const usable = chartHeight - gap * Math.max(categories.length - 1, 1);

  let cursor = 0;
  const catBands = categories.map((entry) => {
    const height = (entry.value / total) * usable;
    const band = { ...entry, y: cursor, height };
    cursor += height + gap;
    return band;
  });

  let repoCursor = 0;
  const repoUsable = chartHeight - gap * Math.max(repos.length - 1, 1);
  const repoBands = repos.map((repo) => {
    const height = (repo.count / repoTotal) * repoUsable;
    const band = { ...repo, y: repoCursor, height };
    repoCursor += height + gap;
    return band;
  });

  return (
    <Page>
      <ScreenHead left="where it went" right="last 12 months" />

      <View style={styles.trunkRow}>
        <Title>100%</Title>
        <Label style={styles.trunkValue}>{fmt(total)} contributions</Label>
      </View>

      <Svg height={chartHeight} width={chartWidth}>
        {catBands.map((band, index) => {
          let trunkY = 0;
          for (let i = 0; i < index; i++) trunkY += catBands[i].height;
          return (
            <Path
              d={ribbon(
                trunkX + trunkW,
                trunkY,
                trunkY + band.height,
                midX,
                band.y,
                band.y + band.height,
              )}
              fill={colors.ink}
              key={band.label}
              opacity={0.85}
            />
          );
        })}

        {repoBands.map((band, index) => {
          const source = catBands[Math.min(index, catBands.length - 1)];
          if (!source) return null;
          return (
            <Path
              d={ribbon(
                midX + midW,
                source.y + source.height * 0.1,
                source.y + source.height * 0.9,
                rightX,
                band.y,
                band.y + band.height,
              )}
              fill={colors.ink}
              key={band.nameWithOwner}
              opacity={band.nameWithOwner === 'others' ? 0.18 : 0.4}
            />
          );
        })}

        <Rect fill={colors.ink} height={chartHeight} width={trunkW} x={trunkX} y={0} />
        {catBands.map((band) => (
          <Rect
            fill={colors.ink}
            height={band.height}
            key={band.label}
            width={midW}
            x={midX}
            y={band.y}
          />
        ))}
        {repoBands.map((band) => (
          <Rect
            fill={colors.ink70}
            height={band.height}
            key={band.nameWithOwner}
            width={6}
            x={rightX}
            y={band.y}
          />
        ))}
      </Svg>

      <View style={styles.legend}>
        {catBands.map((band) => (
          <View key={band.label} style={styles.legendRow}>
            <Heading style={styles.pct}>
              {((band.value / total) * 100).toFixed(1)}%
            </Heading>
            <Data style={styles.legendName}>{band.label}</Data>
            <Data style={styles.legendValue}>{fmt(band.value)}</Data>
          </View>
        ))}
      </View>

      <Label style={styles.repoHead}>into</Label>
      <View style={styles.legend}>
        {repoBands.map((band) => (
          <View key={band.nameWithOwner} style={styles.legendRow}>
            <Data style={styles.legendName}>{shorten(band.nameWithOwner)}</Data>
            <Data style={styles.legendValue}>{fmt(band.count)}</Data>
          </View>
        ))}
      </View>
    </Page>
  );
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

const styles = StyleSheet.create({
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
    marginTop: 10,
  },
  legendRow: {
    alignItems: 'baseline',
    borderTopColor: colors.hair,
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 8,
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
  repoHead: {
    marginTop: 18,
  },
});
