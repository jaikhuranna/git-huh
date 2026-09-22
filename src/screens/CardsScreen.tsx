import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import { LanguageChip } from '../components/LanguageChip';
import { Data, Label } from '../components/Type';
import {
  lastCommitAt,
  monthWindow,
  repoMonths,
  type Activity,
  type CommitSample,
  type MonthBar,
} from '../lib/activity';
import type { GitHubModel, RepoSummary } from '../lib/contributions';
import { useRemote } from '../hooks/useRemote';
import { demoSearch } from '../lib/demo';
import { useNav } from '../lib/nav';
import { searchCode } from '../lib/repo';
import { colors, fonts, radii } from '../theme';
import { SearchField, SearchResults } from './RepoScreen';
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
/** Months every card's axis covers — see `monthWindow`. */
const MONTHS = 12;

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
  // One axis for the whole deck. Every card is drawn against the same twelve
  // months, including the ones the commit sample never reached, so a bar on
  // one card sits over the same month as the bar above it.
  const axis = useMemo(() => monthWindow(MONTHS), []);

  // Newest work on top. GitHub hands the list back in `pushedAt` order and
  // that is not the same question — see `lastTouched`.
  const deck = useMemo(
    () =>
      model.repos
        .map((repo) => ({ repo, at: lastTouched(repo, activity.commits) }))
        .sort((a, b) => b.at - a.at)
        .slice(0, 12),
    [activity.commits, model.repos],
  );

  // A search through the code of everything this account owns. While it has
  // an answer, the answer replaces the deck; `clear` puts the deck back.
  const nav = useNav();
  const [draft, setDraft] = useState('');
  const [terms, setTerms] = useState('');
  const searchDemo = useMemo(
    () => (nav.demo && terms ? demoSearch(terms) : undefined),
    [nav.demo, terms],
  );
  const search = useRemote(
    nav.token && terms ? `${nav.token}|search|user|${terms}` : null,
    (signal) => searchCode(nav.token ?? '', terms, { user: model.login }, signal),
    { demo: searchDemo },
  );

  return (
    <Page>
      <ScreenHead left="repositories" right={`${fmt(model.repoCount)} owned`} />

      <SearchField
        draft={draft}
        onChange={setDraft}
        onClear={() => {
          setDraft('');
          setTerms('');
        }}
        onSubmit={() => setTerms(draft.trim())}
        placeholder="search the code in all of them"
        searching={terms.length > 0}
      />
      {terms.length > 0 && <SearchResults state={search} terms={terms} />}

      <View style={[styles.deck, terms.length > 0 && styles.hidden]}>
        {deck.map(({ repo, at }, index) => (
          <RepoCard
            axis={axis}
            index={index}
            key={repo.nameWithOwner}
            months={repoMonths(activity.commits, repo.nameWithOwner, MONTHS)}
            repo={repo}
            touched={at}
            width={cardWidth}
          />
        ))}
        {model.repos.length === 0 && <Label>no repositories to show</Label>}
      </View>
    </Page>
  );
}

/**
 * When a repository last had a commit written in it, as epoch ms.
 *
 * Not `pushedAt`: GitHub bumps that for anything that moves a ref — a tag, a
 * branch deletion, a fork sync — so a deck sorted by it can open on a
 * repository nobody has written a line in for a year. The sampled history
 * has the real answer wherever it reaches, and `pushedAt` is the fallback for
 * the repos below the sample.
 */
function lastTouched(repo: RepoSummary, commits: CommitSample[]): number {
  const sampled = lastCommitAt(commits, repo.nameWithOwner);
  if (sampled !== null) return sampled;
  return repo.pushedAt ? Date.parse(repo.pushedAt) : 0;
}

function RepoCard({
  repo,
  index,
  width,
  months,
  axis,
  touched,
}: {
  repo: RepoSummary;
  index: number;
  width: number;
  months: MonthBar[];
  axis: MonthBar[];
  /** Epoch ms of the last commit — the same value the deck is sorted by. */
  touched: number;
}) {
  const seed = hash(repo.nameWithOwner);
  // A small, stable tilt per card — the pin's deck is never square.
  const tilt = ((seed % 5) - 2) * 0.9;
  const sampled = months.length > 0;
  const bars = sampled ? months : axis;
  const total = months.reduce((sum, month) => sum + month.count, 0);

  const nav = useNav();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => nav.open({ kind: 'repo', repo: repo.nameWithOwner })}
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
        <Data style={styles.headCount}>
          {sampled ? `${fmt(total)} in ${MONTHS}mo` : 'not in the sample'}
        </Data>
      </View>

      <Svg height={CHART_HEIGHT + AXIS_HEIGHT} width={width - 36}>
        <MonthChart months={bars} sampled={sampled} width={width - 36} />
      </Svg>

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
        <Data style={styles.metaText}>
          {touched > 0 ? ago(new Date(touched).toISOString()) : '—'}
        </Data>
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
function MonthChart({
  months,
  sampled,
  width,
}: {
  months: MonthBar[];
  sampled: boolean;
  width: number;
}) {
  const peak = Math.max(...months.map((month) => month.count), 1);
  const peakIndex = sampled ? months.findIndex((month) => month.count === peak) : -1;
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
      {!sampled && (
        <SvgText
          fill={colors.onBlack}
          fontFamily={fonts.mono}
          fontSize={9}
          opacity={0.45}
          textAnchor="middle"
          x={width / 2}
          y={base - tallest / 2}
        >
          outside the commit sample
        </SvgText>
      )}
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
      {peakIndex >= 0 && (
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
      )}
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
    paddingTop: 14,
  },
  hidden: {
    display: 'none',
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
