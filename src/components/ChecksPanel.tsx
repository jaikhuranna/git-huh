import { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useRemote } from '../hooks/useRemote';
import {
  approveRun,
  fetchChecks,
  fetchLogTail,
  fetchPendingDeployments,
  rerunFailed,
  reviewDeployments,
  toneOf,
  type CheckRun,
  type CheckTone,
  type WorkflowRun,
} from '../lib/checks';
import { demoChecks, demoLog, demoPending } from '../lib/demo';
import { useNav } from '../lib/nav';
import { explain } from '../lib/rest';
import { colors, fonts, radii, themed } from '../theme';
import { Data, Label, Micro } from './Type';

const TONE = themed<Record<CheckTone, string>>(() => ({
  fail: colors.red,
  waiting: colors.yellow,
  running: colors.blue,
  pass: colors.green,
  neutral: colors.ink40,
}));

const WORD: Record<CheckTone, string> = {
  fail: 'failed',
  waiting: 'waiting on you',
  running: 'running',
  pass: 'passed',
  neutral: 'skipped',
};

/**
 * The pull request's `checks` tab: every check on the head commit, red
 * first, and the actions that otherwise mean a laptop — the failing job's
 * log, `re-run failed jobs`, and approving a run or a deployment that is
 * held for you. Each state is a colour *and* a word, like everything else.
 */
export function ChecksPanel({ repo, sha }: { repo: string; sha: string }) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoChecks() : undefined), [nav.demo]);
  const checks = useRemote(
    nav.token ? `${nav.token}|checks|${repo}|${sha}` : null,
    (signal) => fetchChecks(nav.token ?? '', repo, sha, signal),
    { demo },
  );
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);

  if (checks.status === 'loading') return <Label style={styles.note}>reading the checks…</Label>;
  if (checks.status === 'error') {
    return <Label style={styles.error}>{explain(checks.error, 'reading the checks')}</Label>;
  }
  if (checks.status !== 'ready') return null;
  const { runs, workflows } = checks.data;
  if (runs.length === 0) return <Label style={styles.note}>nothing ran on this commit</Label>;

  const tally = (['fail', 'waiting', 'running', 'pass', 'neutral'] as const)
    .map((tone) => [tone, runs.filter((run) => toneOf(run) === tone).length] as const)
    .filter(([, count]) => count > 0);

  const act = async (label: string, run: () => Promise<void>) => {
    if (nav.demo) {
      setNote({ ok: true, text: 'demo account · nothing was sent' });
      return;
    }
    try {
      await run();
      setNote({ ok: true, text: label });
      checks.reload();
    } catch (error) {
      setNote({ ok: false, text: explain(error, 'that') });
    }
  };

  return (
    <View>
      <View style={styles.tally}>
        {tally.map(([tone, count]) => (
          <View key={tone} style={styles.tallyItem}>
            <View style={[styles.dot, { backgroundColor: TONE[tone] }]} />
            <Data style={styles.tallyText}>
              {count} {WORD[tone]}
            </Data>
          </View>
        ))}
      </View>

      <Workflows
        onAct={act}
        repo={repo}
        workflows={workflows}
      />
      {note && <Micro style={note.ok ? styles.sent : styles.failed}>{note.text}</Micro>}

      {runs.map((run) => (
        <Run key={run.id} repo={repo} run={run} />
      ))}
    </View>
  );
}

/** The buttons: re-run what failed, let a held run go, approve a deployment. */
function Workflows({
  repo,
  workflows,
  onAct,
}: {
  repo: string;
  workflows: WorkflowRun[];
  onAct: (label: string, run: () => Promise<void>) => void;
}) {
  const nav = useNav();
  const failed = workflows.filter((run) => run.conclusion === 'failure');
  const held = workflows.filter((run) => run.status === 'action_required' || run.conclusion === 'action_required');
  const waiting = workflows.filter((run) => run.status === 'waiting');
  if (failed.length + held.length + waiting.length === 0) return null;

  return (
    <View style={styles.actions}>
      {failed.map((run) => (
        <Pressable
          accessibilityRole="button"
          key={`rerun-${run.id}`}
          onPress={() =>
            onAct(`re-running the failed jobs in ${run.name}`, () =>
              rerunFailed(nav.token ?? '', repo, run.id),
            )
          }
          style={styles.solid}
        >
          <Label style={styles.solidLabel}>re-run failed · {run.name}</Label>
        </Pressable>
      ))}
      {held.map((run) => (
        <Pressable
          accessibilityRole="button"
          key={`approve-${run.id}`}
          onPress={() =>
            onAct(`${run.name} is allowed to run`, () => approveRun(nav.token ?? '', repo, run.id))
          }
          style={styles.solid}
        >
          <Label style={styles.solidLabel}>approve and run · {run.name}</Label>
        </Pressable>
      ))}
      {waiting.map((run) => (
        <Deployment key={`deploy-${run.id}`} onAct={onAct} repo={repo} run={run} />
      ))}
    </View>
  );
}

function Deployment({
  repo,
  run,
  onAct,
}: {
  repo: string;
  run: WorkflowRun;
  onAct: (label: string, action: () => Promise<void>) => void;
}) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoPending() : undefined), [nav.demo]);
  const pending = useRemote(
    nav.token ? `${nav.token}|pending|${repo}|${run.id}` : null,
    (signal) => fetchPendingDeployments(nav.token ?? '', repo, run.id, signal),
    { demo },
  );
  if (pending.status !== 'ready' || pending.data.length === 0) return null;
  const mine = pending.data.filter((item) => item.canApprove);
  if (mine.length === 0) {
    return (
      <Micro style={styles.waitingNote}>
        {run.name} is waiting on a reviewer for {pending.data.map((item) => item.environment).join(', ')} · not you
      </Micro>
    );
  }
  const names = mine.map((item) => item.environment).join(', ');
  const ids = mine.map((item) => item.environmentId);
  return (
    <View style={styles.deploy}>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          onAct(`deploying to ${names}`, () =>
            reviewDeployments(nav.token ?? '', repo, run.id, ids, 'approved', 'approved from git-huh'),
          )
        }
        style={styles.solid}
      >
        <Label style={styles.solidLabel}>approve deploy · {names}</Label>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() =>
          onAct(`the deploy to ${names} was stopped`, () =>
            reviewDeployments(nav.token ?? '', repo, run.id, ids, 'rejected', 'rejected from git-huh'),
          )
        }
        style={styles.ghost}
      >
        <Label style={styles.ghostLabel}>reject</Label>
      </Pressable>
    </View>
  );
}

function Run({ repo, run }: { repo: string; run: CheckRun }) {
  const tone = toneOf(run);
  const [open, setOpen] = useState(false);
  const canOpen = tone === 'fail' && run.isActions;

  return (
    <View style={styles.run}>
      <Pressable
        accessibilityRole={canOpen ? 'button' : 'text'}
        accessibilityState={canOpen ? { expanded: open } : undefined}
        disabled={!canOpen}
        onPress={() => setOpen((value) => !value)}
        style={styles.runHead}
      >
        <View style={[styles.rule, { backgroundColor: TONE[tone] }]} />
        <View style={styles.runBody}>
          <View style={styles.runTop}>
            <Data numberOfLines={1} style={styles.runName}>
              {run.name}
            </Data>
            <Micro style={[styles.word, { color: TONE[tone] }]}>{WORD[tone]}</Micro>
          </View>
          {run.summary ? (
            <Micro numberOfLines={2} style={styles.summary}>
              {run.summary}
            </Micro>
          ) : null}
          {canOpen && <Micro style={styles.more}>{open ? 'hide the log' : 'why · show the end of the log'}</Micro>}
        </View>
      </Pressable>
      {open && <Log jobId={run.id} repo={repo} url={run.url} />}
    </View>
  );
}

function Log({ repo, jobId, url }: { repo: string; jobId: number; url: string }) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoLog() : undefined), [nav.demo]);
  const log = useRemote(
    nav.token ? `${nav.token}|log|${repo}|${jobId}` : null,
    (signal) => fetchLogTail(nav.token ?? '', repo, jobId, signal),
    { demo },
  );

  if (log.status === 'loading') return <Micro style={styles.logNote}>fetching the log…</Micro>;
  if (log.status === 'error') {
    return (
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})}>
        <Micro style={styles.logNote}>{explain(log.error, 'reading the log')} · open it on github</Micro>
      </Pressable>
    );
  }
  if (log.status !== 'ready') return null;

  return (
    <View style={styles.log}>
      {log.data.errors.map((line, index) => (
        <Data key={`e${index}`} style={styles.errorLine}>
          {line}
        </Data>
      ))}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          {log.data.tail.map((line, index) => (
            <Data key={`t${index}`} numberOfLines={1} style={styles.tailLine}>
              {line}
            </Data>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    tally: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 14,
      marginBottom: 12,
    },
    tallyItem: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
    },
    dot: {
      borderRadius: 4,
      height: 8,
      width: 8,
    },
    tallyText: {
      fontSize: 11,
    },
    actions: {
      gap: 8,
      marginBottom: 12,
    },
    deploy: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    waitingNote: {
      color: colors.ink40,
    },
    run: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
    },
    runHead: {
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 10,
    },
    rule: {
      borderRadius: 2,
      width: 3,
    },
    runBody: {
      flex: 1,
      gap: 3,
    },
    runTop: {
      alignItems: 'baseline',
      flexDirection: 'row',
      gap: 10,
      justifyContent: 'space-between',
    },
    runName: {
      flex: 1,
      fontSize: 12,
    },
    word: {
      fontFamily: fonts.monoMedium,
    },
    summary: {
      color: colors.ink70,
    },
    more: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
    log: {
      backgroundColor: colors.recess,
      borderRadius: radii.tile,
      gap: 2,
      marginBottom: 10,
      padding: 10,
    },
    errorLine: {
      color: colors.red,
      fontSize: 10,
      lineHeight: 14,
    },
    tailLine: {
      color: colors.ink70,
      fontFamily: fonts.mono,
      fontSize: 9,
      lineHeight: 13,
    },
    logNote: {
      color: colors.ink40,
      marginBottom: 10,
    },
    solid: {
      alignSelf: 'flex-start',
      backgroundColor: colors.black,
      borderColor: colors.black,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    ghost: {
      alignSelf: 'flex-start',
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    ghostLabel: {
      color: colors.ink,
    },
    sent: {
      color: colors.green,
      marginBottom: 10,
    },
    failed: {
      color: colors.red,
      marginBottom: 10,
    },
    note: {
      marginTop: 16,
    },
    error: {
      color: colors.red,
      marginTop: 16,
    },
  }),
);
