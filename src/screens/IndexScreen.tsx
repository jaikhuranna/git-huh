import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Svg, { G, Line, Rect } from 'react-native-svg';

import { Body, Data, Label } from '../components/Type';
import { prAge, type PullRequest } from '../lib/prs';
import type { PrsState } from '../hooks/useOpenPrs';
import { colors, space } from '../theme';

type Filter = 'open' | 'draft';

/** How far each folder, and each card inside it, steps right. */
const FOLDER_STEP = 8;
const CARD_STEP = 12;
const MAX_STEPS = 4;
/** Pitch of the empty card edges drawn under the last folder. */
const EDGE = 15;

/**
 * pin03 — "Correspondence Storage, Figure 2-14: Speed Index".
 *
 * The pin is a *drawer*, and the thing that makes it read as one is not the
 * rows: it is the black guide tabs standing above them, each naming the
 * group of cards filed behind it. This screen files by repository. One black
 * tab per repo with its count, the pull requests as cards behind it, the
 * whole stack stepping right, and the drawer's own lip across the bottom
 * with its plate under it.
 *
 * Two earlier passes got this wrong. The first left a short list floating in
 * half a page of nothing. The second filled that space with grey slot bars
 * and inverted every draft row to solid black, which turned the draft tab
 * into a black wall. Inversion now lives on the guide tabs alone — one
 * strong black element per group instead of one per row — and the space
 * under the last folder is the receding edges of empty cards, which is what
 * the bottom of a half-full drawer actually looks like.
 */
export function IndexScreen({
  state,
  onOpen,
}: {
  state: PrsState;
  onOpen: (pr: PullRequest) => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  // The drawer fills whatever the page leaves it, and how much the folders
  // take is measured rather than guessed — a card is one or two lines deep
  // depending on its title.
  const [drawer, setDrawer] = useState({ width: 0, height: 0 });
  const [stack, setStack] = useState(0);

  const all = state.status === 'ready' ? state.prs : [];
  const rows = useMemo(
    () => all.filter((pr) => (filter === 'open' ? !pr.draft : pr.draft)),
    [all, filter],
  );
  const folders = useMemo(() => byRepo(rows), [rows]);
  const floor = Math.max(0, drawer.height - stack - 10);

  return (
    <View style={styles.screen}>
      <View style={styles.masthead}>
        <Data style={styles.chapter}>Ch. 3 /</Data>
        <Data style={styles.title}>PULL REQUESTS</Data>
        <Data style={styles.chapter}>/ {all.length}</Data>
      </View>

      <View style={styles.tabs}>
        {(['open', 'draft'] as const).map((value) => {
          const count = all.filter((pr) =>
            value === 'open' ? !pr.draft : pr.draft,
          ).length;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: filter === value }}
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.filterTab, filter === value && styles.filterTabOn]}
            >
              <Label style={filter === value ? styles.filterLabelOn : undefined}>
                {value} {count}
              </Label>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.drawer}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setDrawer((current) =>
            current.width === width && current.height === height
              ? current
              : { width, height },
          );
        }}
        showsVerticalScrollIndicator={false}
        style={styles.drawerScroll}
      >
        {state.status === 'loading' && (
          <Label style={styles.note}>reading the drawer…</Label>
        )}
        {state.status === 'error' && (
          <Body style={styles.error}>could not load pull requests</Body>
        )}

        {state.status === 'ready' && (
          <>
            <View onLayout={(event) => setStack(event.nativeEvent.layout.height)}>
              {folders.map((folder, index) => (
                <Folder
                  folder={folder}
                  index={index}
                  key={folder.repo}
                  onOpen={onOpen}
                />
              ))}
              {folders.length === 0 && (
                <Label style={styles.note}>
                  nothing filed under {filter} · go ship
                </Label>
              )}
            </View>

            {/* What is left of the drawer, drawn as the top edges of the
                empty cards behind the last folder. Receding, so the eye
                reads depth rather than a list of grey bars. */}
            {floor > EDGE && drawer.width > 0 && (
              <Svg height={floor} width={drawer.width}>
                <Floor
                  from={folders.length}
                  height={floor}
                  width={drawer.width}
                />
              </Svg>
            )}
          </>
        )}
      </ScrollView>

      <View style={styles.lip} />
      <Data style={styles.figure}>
        Figure 3-1. {filter === 'open' ? 'Open' : 'Draft'} pull requests
      </Data>
    </View>
  );
}

interface Group {
  repo: string;
  prs: PullRequest[];
}

/**
 * Pull requests filed by repository, newest repository first. The search
 * comes back newest-first, so first appearance is already the right order
 * and a `Map` preserves it.
 */
function byRepo(prs: PullRequest[]): Group[] {
  const groups = new Map<string, PullRequest[]>();
  for (const pr of prs) {
    const filed = groups.get(pr.repo);
    if (filed) filed.push(pr);
    else groups.set(pr.repo, [pr]);
  }
  return [...groups.entries()].map(([repo, list]) => ({ repo, prs: list }));
}

function Folder({
  folder,
  index,
  onOpen,
}: {
  folder: Group;
  index: number;
  onOpen: (pr: PullRequest) => void;
}) {
  const step = Math.min(index, MAX_STEPS) * FOLDER_STEP;

  return (
    <View style={[styles.folder, { marginLeft: step }]}>
      <View style={styles.folderHead}>
        <View style={styles.folderTab}>
          <Data style={styles.folderName} numberOfLines={1}>
            {folder.repo}
          </Data>
          <Data style={styles.folderCount}>{folder.prs.length}</Data>
        </View>
        {/* The tab's baseline carried to the page edge — the top of the
            folder the cards are filed in. */}
        <View style={styles.folderRule} />
      </View>

      {folder.prs.map((pr) => (
        <Card key={pr.number} onOpen={onOpen} pr={pr} />
      ))}
    </View>
  );
}

function Card({
  pr,
  onOpen,
}: {
  pr: PullRequest;
  onOpen: (pr: PullRequest) => void;
}) {
  return (
    <Pressable
      accessibilityHint="opens the pull request"
      accessibilityRole="button"
      onPress={() => onOpen(pr)}
      style={styles.card}
    >
      <View style={styles.numberTab}>
        <Data style={styles.numberText}>{pr.number}</Data>
      </View>
      <Body numberOfLines={2} style={styles.cardTitle}>
        {pr.title}
      </Body>
      <Data style={styles.cardAge}>{prAge(pr.createdAt)}</Data>
    </Pressable>
  );
}

/**
 * Empty cards seen from above.
 *
 * One hairline per card edge, each one stepping right and pulling in from
 * the right as it goes back, so the stack recedes instead of reading as
 * ruled paper. Every fourth edge carries a tab notch, which is where the
 * next guide card would stand once you file something under it.
 */
function Floor({
  width,
  height,
  from,
}: {
  width: number;
  height: number;
  from: number;
}) {
  const count = Math.floor(height / EDGE);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const y = i * EDGE + 0.5;
        const depth = Math.min(from + i, MAX_STEPS * 3);
        const left = depth * FOLDER_STEP * 0.55;
        const right = width - Math.min(i * 2.4, width * 0.22);
        // Further back is fainter; the last edges all but disappear.
        const fade = 0.5 * (1 - i / count) ** 1.4;
        return (
          <G key={i}>
            <Line
              opacity={fade}
              stroke={colors.ink}
              strokeWidth={1}
              x1={left}
              x2={right}
              y1={y}
              y2={y}
            />
            {i % 4 === 3 && (
              <Rect
                fill={colors.ink}
                height={3}
                opacity={fade * 1.5}
                width={34}
                x={left}
                y={y - 3}
              />
            )}
          </G>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: space.gutter,
    paddingTop: 4,
  },
  masthead: {
    alignItems: 'baseline',
    borderBottomColor: colors.ink,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  chapter: {
    color: colors.ink70,
    fontSize: 11,
  },
  title: {
    fontSize: 12,
    letterSpacing: 1.6,
  },
  tabs: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  filterTab: {
    borderColor: colors.hair,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 7,
  },
  filterTabOn: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  filterLabelOn: {
    color: colors.onBlack,
  },
  drawerScroll: {
    flex: 1,
  },
  drawer: {
    paddingBottom: 6,
    paddingTop: 12,
  },
  folder: {
    marginBottom: 14,
  },
  folderHead: {
    alignItems: 'flex-end',
    flexDirection: 'row',
  },
  folderTab: {
    alignItems: 'center',
    backgroundColor: colors.black,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
    flexDirection: 'row',
    gap: 10,
    maxWidth: '80%',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  folderName: {
    color: colors.onBlack,
    flexShrink: 1,
    fontSize: 11,
  },
  folderCount: {
    color: colors.onBlack55,
    fontSize: 10,
  },
  folderRule: {
    backgroundColor: colors.ink,
    flex: 1,
    height: 2,
  },
  card: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.hairStrong,
    borderTopWidth: 0,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginLeft: CARD_STEP,
    paddingRight: 10,
    paddingVertical: 8,
  },
  numberTab: {
    alignSelf: 'stretch',
    backgroundColor: colors.black,
    justifyContent: 'center',
    marginLeft: -1,
    marginVertical: -8,
    paddingHorizontal: 8,
  },
  numberText: {
    color: colors.onBlack,
    fontSize: 11,
  },
  cardTitle: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
  },
  cardAge: {
    color: colors.ink40,
    fontSize: 10,
  },
  lip: {
    backgroundColor: colors.ink,
    height: 2,
  },
  figure: {
    color: colors.ink70,
    fontSize: 11,
    paddingBottom: 6,
    paddingTop: 10,
    textAlign: 'center',
  },
  note: {
    marginTop: 18,
    textAlign: 'center',
  },
  error: {
    color: colors.red,
    marginTop: 18,
    textAlign: 'center',
  },
});
