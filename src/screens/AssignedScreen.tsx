import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '../components/Card';
import { Body, Label, Micro } from '../components/Type';
import { WaitDot } from '../components/WaitDot';
import type { Remote } from '../hooks/useRemote';
import { dueLine, type Task, type Tasks } from '../lib/assigned';
import { savedAge } from '../lib/store';
import { colors, fonts, radii, themed } from '../theme';
import { ago, Chips, fmt, Page, ScreenHead, whyNot } from './shared';

const NO_TASKS: Task[] = [];

type Filter = 'assigned' | 'filed';

/** `moved today`, `quiet 3d` — how long since anyone touched the thread. */
function quiet(iso: string): string {
  const age = ago(iso);
  return age === 'today' ? 'moved today' : `quiet ${age}`;
}

/**
 * `inbox · assigned`: what is yours to do, across every repository.
 *
 * GitHub files an assignment under the repository it lives in, so the only
 * way to see all of yours at once is a search box. This is that search,
 * filed the way `pulls` files your pull requests — one card per repository —
 * with each row's dot saying how long the thread has been quiet, bigger and
 * brighter the longer, so the assignment everyone has forgotten stands out.
 * `filed` is the other half: issues you opened that are still open.
 */
export function AssignedScreen({
  state,
  onOpen,
}: {
  state: Remote<Tasks>;
  onOpen: (task: Task) => void;
}) {
  const [filter, setFilter] = useState<Filter>('assigned');
  const tasks = state.status === 'ready' ? state.data : null;
  const shown = tasks ? (filter === 'assigned' ? tasks.assigned : tasks.filed) : NO_TASKS;
  const total = tasks ? (filter === 'assigned' ? tasks.assignedTotal : tasks.filedTotal) : 0;
  const folders = useMemo(() => byRepo(shown), [shown]);

  return (
    <Page>
      <ScreenHead
        left="yours to do"
        right={tasks ? `${fmt(tasks.assignedTotal)} assigned` : ''}
      />
      {state.status === 'ready' && state.offline && state.savedAt != null && (
        <Micro style={styles.dim}>offline · saved {savedAge(state.savedAt)}</Micro>
      )}

      <Chips
        current={filter}
        items={[
          { key: 'assigned', label: `assigned ${tasks ? fmt(tasks.assignedTotal) : ''}`.trim() },
          { key: 'filed', label: `filed ${tasks ? fmt(tasks.filedTotal) : ''}`.trim() },
        ]}
        onSelect={setFilter}
      />

      {(state.status === 'loading' || state.status === 'idle') && (
        <Label style={styles.note}>reading what is yours…</Label>
      )}
      {state.status === 'error' && (
        <Body style={styles.error}>could not read your assignments · {whyNot(state.error)}</Body>
      )}
      {tasks && shown.length === 0 && (
        <Label style={styles.note}>
          {filter === 'assigned'
            ? 'nothing is assigned to you · the desk is clear'
            : 'no issue you filed is still open'}
        </Label>
      )}

      {folders.map((folder) => (
        <Card key={folder.repo} padded={false} style={styles.folder}>
          <View style={styles.folderHead}>
            <Label numberOfLines={1} style={styles.folderName}>
              {folder.repo}
            </Label>
            <Label style={styles.dim}>{folder.tasks.length}</Label>
          </View>
          {folder.tasks.map((task, index) => (
            <Row first={index === 0} key={task.url} onOpen={onOpen} task={task} />
          ))}
        </Card>
      ))}

      {tasks && shown.length > 0 && (
        <Micro style={styles.foot}>
          the dot is how long a thread has been quiet
          {total > shown.length ? ` · the ${shown.length} most recent of ${fmt(total)}` : ''}
        </Micro>
      )}
    </Page>
  );
}

interface Folder {
  repo: string;
  tasks: Task[];
}

/** Filed by repository, in the order the search found them (most recent first). */
function byRepo(tasks: readonly Task[]): Folder[] {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const filed = groups.get(task.repo);
    if (filed) filed.push(task);
    else groups.set(task.repo, [task]);
  }
  return [...groups.entries()].map(([repo, list]) => ({ repo, tasks: list }));
}

function Row({
  task,
  first,
  onOpen,
}: {
  task: Task;
  first: boolean;
  onOpen: (task: Task) => void;
}) {
  const due = task.milestone ? dueLine(task.milestone.dueOn) : null;
  const overdue = due?.endsWith('overdue') ?? false;
  return (
    <Pressable
      accessibilityHint={task.kind === 'pull' ? 'opens the pull request' : 'opens the issue'}
      accessibilityRole="button"
      onPress={() => onOpen(task)}
      style={[styles.row, !first && styles.rule]}
    >
      <View style={styles.markCell}>
        <WaitDot since={task.updatedAt} />
      </View>
      <View style={styles.rowBody}>
        <Body numberOfLines={2} style={styles.title}>
          {task.title}
        </Body>
        <Micro numberOfLines={1} style={styles.dim}>
          {task.kind === 'pull' ? 'pull' : 'issue'} #{task.number} · {quiet(task.updatedAt)}
          {task.replies > 0 ? ` · ${task.replies} ${task.replies === 1 ? 'reply' : 'replies'}` : ''}
          {task.draft ? ' · draft' : ''}
        </Micro>
        {(task.labels.length > 0 || task.milestone) && (
          <View style={styles.tags}>
            {task.milestone && (
              <Micro style={overdue ? styles.overdue : styles.milestone}>
                {task.milestone.title}
                {due ? ` · ${due}` : ''}
              </Micro>
            )}
            {task.labels.map((label) => (
              <View key={label} style={styles.label}>
                <Micro numberOfLines={1} style={styles.labelText}>
                  {label}
                </Micro>
              </View>
            ))}
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    dim: {
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
    foot: {
      color: colors.ink40,
      paddingHorizontal: 4,
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
    row: {
      alignItems: 'flex-start',
      flexDirection: 'row',
      gap: 12,
      marginHorizontal: 18,
      paddingVertical: 11,
    },
    rule: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
    },
    markCell: {
      alignItems: 'center',
      height: 18,
      justifyContent: 'center',
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
    tags: {
      alignItems: 'center',
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
      marginTop: 4,
    },
    milestone: {
      color: colors.ink70,
    },
    // A date that has passed is a statement, so it is in full ink and medium
    // — weight, not colour, the way the widget marks a peak.
    overdue: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
    label: {
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      maxWidth: 160,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    labelText: {
      color: colors.ink70,
    },
  }),
);
