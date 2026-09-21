import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

import { Label, Title } from '../components/Type';
import type { GitHubModel } from '../lib/contributions';
import { colors, fonts } from '../theme';
import { fmt, Page, ScreenHead } from './shared';

/**
 * pin05 — the Madrid culture-budget Sankey. Monochrome ribbons branching
 * left to right, bold percentages with the grey absolute tucked underneath.
 * Here the budget is your year: total contributions fan into what kind of
 * work they were, then into the repositories that absorbed them.
 */
export function FlowScreen({ model }: { model: GitHubModel }) {
  const { width } = useWindowDimensions();
  const chartWidth = width - 40;
  const chartHeight = 430;

  const total =
    model.breakdown.commits +
    model.breakdown.pullRequests +
    model.breakdown.issues +
    model.breakdown.reviews;

  const categories = [
    { label: 'commits', value: model.breakdown.commits },
    { label: 'pull requests', value: model.breakdown.pullRequests },
    { label: 'issues', value: model.breakdown.issues },
    { label: 'reviews', value: model.breakdown.reviews },
  ].filter((entry) => entry.value > 0);

  const repos = model.topRepos.slice(0, 5);
  const repoTotal = repos.reduce((sum, repo) => sum + repo.count, 0) || 1;

  // Three columns: the trunk, the kinds of work, the repositories.
  const trunkX = 6;
  const trunkW = 14;
  const midX = chartWidth * 0.44;
  const midW = 12;
  const rightX = chartWidth * 0.72;

  const gap = 10;
  const usable = chartHeight - gap * Math.max(categories.length - 1, 1);

  let cursor = 0;
  const catBands = categories.map((entry) => {
    const height = total > 0 ? (entry.value / total) * usable : 0;
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
        {/* Trunk into each kind of work. */}
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
              opacity={0.88}
            />
          );
        })}

        {/* Each kind of work into the repositories that absorbed it. */}
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
              opacity={band.nameWithOwner === 'others' ? 0.25 : 0.5}
            />
          );
        })}

        {/* Nodes. */}
        <Path
          d={`M${trunkX} 0H${trunkX + trunkW}V${chartHeight}H${trunkX}Z`}
          fill={colors.ink}
        />
        {catBands.map((band) => (
          <Path
            d={`M${midX} ${band.y}H${midX + midW}V${band.y + band.height}H${midX}Z`}
            fill={colors.ink}
            key={band.label}
          />
        ))}

        {/* Labels: bold share above, grey absolute below, as in the pin. */}
        {catBands.map((band) => (
          <SvgText
            fill={colors.ink}
            fontFamily={fonts.sansBold}
            fontSize={15}
            key={band.label}
            x={midX + midW + 8}
            y={band.y + 14}
          >
            {`${((band.value / Math.max(total, 1)) * 100).toFixed(1)}%`}
          </SvgText>
        ))}
        {catBands.map((band) => (
          <SvgText
            fill={colors.ink40}
            fontFamily={fonts.mono}
            fontSize={9}
            key={`${band.label}-sub`}
            x={midX + midW + 8}
            y={band.y + 27}
          >
            {`${band.label} · ${fmt(band.value)}`}
          </SvgText>
        ))}

        {repoBands.map((band) => (
          <SvgText
            fill={colors.ink70}
            fontFamily={fonts.mono}
            fontSize={9}
            key={band.nameWithOwner}
            x={rightX + 6}
            y={band.y + band.height / 2 + 3}
          >
            {shorten(band.nameWithOwner)}
          </SvgText>
        ))}
      </Svg>
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
  return name.length > 18 ? `${name.slice(0, 17)}…` : name;
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
});
