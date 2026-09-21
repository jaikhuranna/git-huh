import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Body, Data, Label } from '../components/Type';
import { prAge, type PullRequest } from '../lib/prs';
import type { PrsState } from '../hooks/useOpenPrs';
import { colors, space } from '../theme';

type Filter = 'open' | 'draft';

/** An empty slot, and the gap under every card in the drawer. */
const SLOT = 26;
const GAP = 4;

/**
 * pin03 — "Correspondence Storage, Figure 2-14: Speed Index". Stacked filing
 * cards stepping to the right, each with a black tab carrying its number,
 * typewriter labels throughout, and a few rows inverted to solid black.
 * The correspondence is your open pull requests.
 *
 * The screen is the drawer, edge to edge: masthead at the top, the lip and
 * its plate at the bottom, and the cards filed between them. It used to be a
 * short list floating in half a page of nothing with the caption riding up
 * under it — the pin is a *full* drawer, and an empty slot is part of that
 * picture in a way that empty canvas is not.
 */
export function IndexScreen({
  state,
  onOpen,
}: {
  state: PrsState;
  onOpen: (pr: PullRequest) => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');
  // The drawer fills whatever the page leaves it. Both halves are measured
  // rather than guessed: a card is one or two lines deep depending on its
  // title, so the number of empty slots under the stack cannot be a constant.
  const [drawer, setDrawer] = useState(0);
  const [stack, setStack] = useState(0);

  const all = state.status === 'ready' ? state.prs : [];
  const rows = all.filter((pr) => (filter === 'open' ? !pr.draft : pr.draft));
  const slots =
    drawer > 0 ? Math.max(0, Math.floor((drawer - stack - 12) / (SLOT + GAP))) : 0;

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
        onLayout={(event) => setDrawer(event.nativeEvent.layout.height)}
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
              {rows.map((pr, index) => (
                <Row
                  index={index}
                  key={`${pr.repo}-${pr.number}`}
                  onOpen={onOpen}
                  pr={pr}
                />
              ))}
              {rows.length === 0 && (
                <Label style={styles.note}>
                  nothing filed under {filter} · go ship
                </Label>
              )}
            </View>
            {/* Empty card slots down to the lip: the drawer has depth whether
                or not you filled it, and a faint slot reads as room for more
                where blank canvas read as a broken screen. */}
            {Array.from({ length: slots }, (_, index) => (
              <View
                key={`slot-${index}`}
                style={[styles.slot, { marginLeft: step(rows.length + index) }]}
              >
                <View style={styles.slotTab} />
              </View>
            ))}
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

/** Cards step right the way the pin's do, capped so long lists stay on page. */
function step(index: number): number {
  return Math.min(index, 6) * 9;
}

function Row({
  pr,
  index,
  onOpen,
}: {
  pr: PullRequest;
  index: number;
  onOpen: (pr: PullRequest) => void;
}) {
  const draft = pr.draft;

  return (
    <Pressable
      accessibilityHint="opens the pull request"
      accessibilityRole="button"
      onPress={() => onOpen(pr)}
      style={[styles.row, draft && styles.rowDraft, { marginLeft: step(index) }]}
    >
      <View style={[styles.tab, draft && styles.tabDraft]}>
        <Data style={[styles.tabText, draft && styles.tabTextDraft]}>
          {pr.number}
        </Data>
      </View>

      <View style={styles.rowBody}>
        <Data style={[styles.repo, draft && styles.onDark]}>{pr.repo}</Data>
        <Body numberOfLines={2} style={[styles.prTitle, draft && styles.onDark]}>
          {pr.title}
        </Body>
      </View>

      <View style={[styles.dateBlock, draft && styles.dateBlockDraft]}>
        <Data style={[styles.dateText, draft && styles.tabTextDraft]}>
          {prAge(pr.createdAt)}
        </Data>
      </View>
    </Pressable>
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
    paddingBottom: 8,
    paddingTop: 10,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.hairStrong,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 4,
    paddingRight: 8,
    paddingVertical: 7,
  },
  // The spec's inverted card: drafts are the pin's solid black rows.
  rowDraft: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  onDark: {
    color: colors.onBlack,
  },
  slot: {
    borderColor: colors.hair,
    borderWidth: 1,
    flexDirection: 'row',
    height: SLOT,
    marginBottom: GAP,
  },
  slotTab: {
    backgroundColor: colors.hair,
    width: 34,
  },
  tab: {
    alignSelf: 'stretch',
    backgroundColor: colors.black,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabDraft: {
    backgroundColor: colors.onBlack,
  },
  tabText: {
    color: colors.onBlack,
    fontSize: 11,
  },
  tabTextDraft: {
    color: colors.black,
  },
  rowBody: {
    flex: 1,
    gap: 1,
  },
  repo: {
    color: colors.ink70,
    fontSize: 9,
  },
  prTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  dateBlock: {
    backgroundColor: colors.black,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  dateBlockDraft: {
    backgroundColor: colors.onBlack,
  },
  dateText: {
    color: colors.onBlack,
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
