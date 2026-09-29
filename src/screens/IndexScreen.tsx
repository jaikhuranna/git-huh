import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '../components/Card';
import { Body, Label, Micro } from '../components/Type';
import { WaitDot } from '../components/WaitDot';
import type { PrsState } from '../hooks/useOpenPrs';
import { prAge, type PullRequest } from '../lib/prs';
import { colors, radii, themed } from '../theme';
import { Page, ScreenHead } from './shared';

/** One empty list for every render without data, so memos keyed on it hold. */
const NO_PRS: PullRequest[] = [];

type Filter = 'open' | 'draft';

/**
 * Your open pull requests, filed by repository: one of the widget's cards
 * per repository with its count in the corner, and the pull requests as
 * rows inside it, each with its number, its title and how long it has been
 * waiting. A dot for how old it is — bigger and brighter the longer it has
 * sat — so the one that has been waiting a month stands out of the pile the
 * way a peak day stands out of the widget.
 */
export function IndexScreen({
  state,
  onOpen,
}: {
  state: PrsState;
  onOpen: (pr: PullRequest) => void;
}) {
  const [filter, setFilter] = useState<Filter>('open');

  const all = state.status === 'ready' ? state.prs : NO_PRS;
  const rows = useMemo(
    () => all.filter((pr) => (filter === 'open' ? !pr.draft : pr.draft)),
    [all, filter],
  );
  const folders = useMemo(() => byRepo(rows), [rows]);

  return (
    <Page>
      <ScreenHead left="pull requests" right={`${all.length} yours`} />

      <View style={styles.tabs}>
        {(['open', 'draft'] as const).map((value) => {
          const count = all.filter((pr) => (value === 'open' ? !pr.draft : pr.draft)).length;
          const on = filter === value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Label style={on ? styles.chipLabelOn : styles.chipLabel}>
                {value} {count}
              </Label>
            </Pressable>
          );
        })}
      </View>

      {state.status === 'loading' && <Label style={styles.note}>reading the drawer…</Label>}
      {state.status === 'error' && <Body style={styles.error}>could not load pull requests</Body>}
      {state.status === 'ready' && folders.length === 0 && (
        <Label style={styles.note}>nothing filed under {filter} · go ship</Label>
      )}

      {folders.map((folder) => (
        <Card key={folder.repo} padded={false} style={styles.folder}>
          <View style={styles.folderHead}>
            <Label numberOfLines={1} style={styles.folderName}>
              {folder.repo}
            </Label>
            <Label style={styles.folderCount}>{folder.prs.length}</Label>
          </View>
          {folder.prs.map((pr, index) => (
            <Row first={index === 0} key={pr.number} onOpen={onOpen} pr={pr} />
          ))}
        </Card>
      ))}
    </Page>
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

function Row({
  pr,
  first,
  onOpen,
}: {
  pr: PullRequest;
  first: boolean;
  onOpen: (pr: PullRequest) => void;
}) {
  return (
    <Pressable
      accessibilityHint="opens the pull request"
      accessibilityRole="button"
      onPress={() => onOpen(pr)}
      style={[styles.row, !first && styles.rowRule]}
    >
      <View style={styles.markCell}>
        <WaitDot since={pr.createdAt} />
      </View>
      <View style={styles.rowBody}>
        <Body numberOfLines={2} style={styles.title}>
          {pr.title}
        </Body>
        <Micro style={styles.meta}>
          #{pr.number} · waiting {prAge(pr.createdAt)}
        </Micro>
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tabs: {
      flexDirection: 'row',
      gap: 6,
      marginBottom: 4,
    },
    chip: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 6,
    },
    chipOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    chipLabel: {
      color: colors.ink,
    },
    chipLabelOn: {
      color: colors.onBlack,
    },
    folder: {
      paddingBottom: 4,
    },
    folderHead: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
      paddingBottom: 4,
      paddingHorizontal: 18,
      paddingTop: 16,
    },
    folderName: {
      color: colors.ink,
      flex: 1,
    },
    folderCount: {
      color: colors.ink40,
    },
    row: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: 18,
      paddingVertical: 11,
    },
    rowRule: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
    },
    markCell: {
      alignItems: 'center',
      width: 12,
    },
    rowBody: {
      flex: 1,
      gap: 3,
    },
    title: {
      color: colors.ink,
      lineHeight: 18,
    },
    meta: {
      color: colors.ink40,
    },
    note: {
      marginTop: 18,
      textAlign: 'center',
    },
    error: {
      color: colors.no,
      marginTop: 18,
      textAlign: 'center',
    },
  }),
);
