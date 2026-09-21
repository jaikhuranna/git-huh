import { useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Body, Data, Label } from '../components/Type';
import { prAge, type PullRequest } from '../lib/prs';
import type { PrsState } from '../hooks/useOpenPrs';
import { colors } from '../theme';
import { Page } from './shared';

type Filter = 'open' | 'draft';

/**
 * pin03 — "Correspondence Storage, Figure 2-14: Speed Index". Stacked filing
 * cards stepping to the right, each with a black tab carrying its number,
 * typewriter labels throughout, and a few rows inverted to solid black.
 * The correspondence is your open pull requests.
 */
export function IndexScreen({ state }: { state: PrsState }) {
  const [filter, setFilter] = useState<Filter>('open');

  const all = state.status === 'ready' ? state.prs : [];
  const rows = all.filter((pr) => (filter === 'open' ? !pr.draft : pr.draft));

  return (
    <Page>
      <View style={styles.masthead}>
        <Data style={styles.chapter}>Ch. 3 /</Data>
        <Data style={styles.title}>PULL REQUESTS</Data>
        <Data style={styles.chapter}>/ {all.length}</Data>
      </View>

      <View style={styles.tabs}>
        {(['open', 'draft'] as const).map((value) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === value }}
            key={value}
            onPress={() => setFilter(value)}
            style={[styles.filterTab, filter === value && styles.filterTabOn]}
          >
            <Label style={filter === value ? styles.filterLabelOn : undefined}>
              {value}
            </Label>
          </Pressable>
        ))}
      </View>

      {state.status === 'loading' && <Label style={styles.note}>reading the drawer…</Label>}
      {state.status === 'error' && (
        <Body style={styles.error}>could not load pull requests</Body>
      )}

      {state.status === 'ready' && (
        <View style={styles.drawer}>
          {rows.map((pr, index) => (
            <Row index={index} key={`${pr.repo}-${pr.number}`} pr={pr} />
          ))}
          {rows.length === 0 && (
            <Label style={styles.note}>nothing filed here · go ship</Label>
          )}
          <View style={styles.lip} />
          <Data style={styles.figure}>
            Figure 3-1. Open pull requests
          </Data>
        </View>
      )}
    </Page>
  );
}

function Row({ pr, index }: { pr: PullRequest; index: number }) {
  // Rows step right the way the pin's cards step, capped so long lists
  // don't march off the page.
  const step = Math.min(index, 6) * 10;
  const draft = pr.draft;

  return (
    <View style={[styles.rowWrap, { paddingLeft: step }]}>
      <Pressable
        accessibilityRole="link"
        onPress={() => Linking.openURL(pr.htmlUrl).catch(() => {})}
        style={[styles.row, draft && styles.rowDraft]}
      >
        <View style={styles.tab}>
          <Data style={styles.tabText}>{pr.number}</Data>
        </View>

        <View style={styles.rowBody}>
          <Data style={[styles.repo, draft && styles.onDark]}>{pr.repo}</Data>
          <Body numberOfLines={2} style={[styles.prTitle, draft && styles.onDark]}>
            {pr.title}
          </Body>
        </View>

        <View style={[styles.dateBlock, draft && styles.dateBlockDraft]}>
          <Data style={styles.dateText}>{prAge(pr.createdAt)}</Data>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
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
  drawer: {
    marginTop: 10,
  },
  rowWrap: {
    marginBottom: 4,
  },
  row: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.hairStrong,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    paddingRight: 8,
    paddingVertical: 8,
  },
  rowDraft: {
    backgroundColor: colors.black,
    borderColor: colors.black,
  },
  tab: {
    backgroundColor: colors.black,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  tabText: {
    color: colors.onBlack,
    fontSize: 11,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  repo: {
    color: colors.ink70,
    fontSize: 9,
  },
  prTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  onDark: {
    color: colors.onBlack,
  },
  dateBlock: {
    backgroundColor: colors.black,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dateBlockDraft: {
    backgroundColor: colors.onBlack25,
  },
  dateText: {
    color: colors.onBlack,
    fontSize: 10,
  },
  lip: {
    backgroundColor: colors.ink,
    height: 2,
    marginTop: 12,
  },
  figure: {
    color: colors.ink70,
    fontSize: 11,
    marginTop: 10,
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
