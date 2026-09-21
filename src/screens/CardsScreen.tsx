import type { ReactElement } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Data, Label } from '../components/Type';
import { repoDensity, type Activity } from '../lib/activity';
import type { GitHubModel, RepoSummary } from '../lib/contributions';
import { colors, radii } from '../theme';
import { ago, fmt, hash, Page, ScreenHead } from './shared';

const CARD_HEIGHT = 158;
/**
 * The deck should read as fanned cards, not one black slab: at the old
 * overlap the canvas never showed between them and the stack merged into a
 * single shape. This leaves a clear band of background at every seam while
 * still stacking, and keeps each card's footer clear of the one below.
 */
const OVERLAP = 16;

/**
 * pin08 — the Urbit ID cards. A fanned deck of black cards, each with a
 * sigil generated from its name, a monospace handle, and a halftone field
 * whose density is that repository's recent activity.
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
            density={repoDensity(activity.commits, repo.nameWithOwner, 96)}
            index={index}
            key={repo.nameWithOwner}
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
  density,
}: {
  repo: RepoSummary;
  index: number;
  width: number;
  density: number[];
}) {
  const seed = hash(repo.nameWithOwner);
  // A small, stable tilt per card — the pin's deck is never square.
  const tilt = ((seed % 5) - 2) * 0.9;

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
      </View>

      {density.length > 0 ? (
        <Svg height={54} width={width - 36}>
          <Halftone density={density} width={width - 36} />
        </Svg>
      ) : (
        <View style={styles.noField}>
          <Data style={styles.metaText}>no commits in the sampled window</Data>
        </View>
      )}

      <View style={styles.meta}>
        <Data style={styles.metaText}>★ {fmt(repo.stars)}</Data>
        <Data style={styles.metaText}>⑂ {fmt(repo.forks)}</Data>
        {repo.language && (
          <View style={styles.langRow}>
            <View
              style={[styles.langDot, { backgroundColor: repo.language.color }]}
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

/**
 * The repository's own recent days, one mark per day: radius steps with that
 * day's commit count and the busiest days square off.
 *
 * This used to be `hash(repoName, col, row)` — a texture that looked like data
 * and encoded nothing. Every mark here is a real day.
 */
function Halftone({ density, width }: { density: number[]; width: number }) {
  const rows = 6;
  const columns = Math.ceil(density.length / rows);
  const pitch = width / columns;
  const R = [0, 1.1, 1.8, 2.5, 3.1];
  const A = [0.1, 0.42, 0.62, 0.82, 1];

  const cells: ReactElement[] = [];
  density.forEach((level, index) => {
    const col = Math.floor(index / rows);
    const row = index % rows;
    const x = col * pitch + pitch / 2;
    const y = row * 8.6 + 5;
    if (level >= 4) {
      cells.push(
        <Rect
          fill={colors.onBlack}
          height={4.6}
          key={index}
          width={4.6}
          x={x - 2.3}
          y={y - 2.3}
        />,
      );
    } else if (level === 0) {
      cells.push(
        <Circle cx={x} cy={y} fill={colors.onBlack} key={index} opacity={A[0]} r={0.7} />,
      );
    } else {
      cells.push(
        <Circle
          cx={x}
          cy={y}
          fill={colors.onBlack}
          key={index}
          opacity={A[level]}
          r={R[level]}
        />,
      );
    }
  });
  return <>{cells}</>;
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
  noField: {
    height: 54,
    justifyContent: 'center',
  },
  cardHead: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  handle: {
    color: colors.onBlack,
    fontSize: 13,
  },
  meta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginTop: 6,
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
  langDot: {
    borderRadius: 4,
    height: 7,
    width: 7,
  },
});
