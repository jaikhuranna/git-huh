import type { ReactElement } from 'react';
import { Linking, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

import { Data, Label } from '../components/Type';
import type { GitHubModel, RepoSummary } from '../lib/contributions';
import { colors, radii } from '../theme';
import { ago, fmt, hash, Page, ScreenHead } from './shared';

const CARD_HEIGHT = 158;
/** Cards overlap so the deck reads as a fan, like the pin's stacked IDs. */
const OVERLAP = 58;

/**
 * pin08 — the Urbit ID cards. A fanned deck of black cards, each with a
 * sigil generated from its name, a monospace handle, and a halftone field
 * whose density is that repository's recent activity.
 */
export function CardsScreen({ model }: { model: GitHubModel }) {
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
}: {
  repo: RepoSummary;
  index: number;
  width: number;
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

      <Svg height={54} width={width - 36}>
        <Halftone repo={repo} seed={seed} width={width - 36} />
      </Svg>

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
 * White dots whose radius follows a per-repo activity field. Peak cells go
 * square, which is the detail that makes the pin's cards read as halftone
 * rather than as a scatter.
 */
function Halftone({
  repo,
  seed,
  width,
}: {
  repo: RepoSummary;
  seed: number;
  width: number;
}) {
  const rows = 7;
  const columns = Math.floor(width / 9);
  const pitch = width / columns;

  // Recency drives overall density: a repo pushed today is a brighter card.
  const age = Math.max(
    0,
    (Date.now() - new Date(repo.pushedAt).getTime()) / 86_400_000,
  );
  const vigour = Math.max(0.18, 1 - age / 240);

  const cells: ReactElement[] = [];
  for (let c = 0; c < columns; c++) {
    for (let r = 0; r < rows; r++) {
      const local = hash(`${seed}:${c}:${r}`) % 1000;
      const level = Math.min(4, Math.floor((local / 1000) * 5 * vigour));
      const x = c * pitch + pitch / 2;
      const y = r * 7.6 + 4;
      if (level === 4) {
        cells.push(
          <Rect
            fill={colors.onBlack}
            height={4.4}
            key={`${c}-${r}`}
            width={4.4}
            x={x - 2.2}
            y={y - 2.2}
          />,
        );
      } else {
        cells.push(
          <Circle
            cx={x}
            cy={y}
            fill={colors.onBlack}
            key={`${c}-${r}`}
            opacity={[0.1, 0.3, 0.55, 0.8][level]}
            r={[0.7, 1.2, 1.8, 2.4][level]}
          />,
        );
      }
    }
  }
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
