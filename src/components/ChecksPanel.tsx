import { useMemo, useRef, useState } from 'react';
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
import { Icon } from './Icon';
import { Data, Label, Micro } from './Type';

const TONE = themed<Record<CheckTone, string>>(() => ({
  fail: colors.no,
  waiting: colors.ink70,
  running: colors.ink,
  pass: colors.yes,
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
  const [flight, setFlight] = useState<{ key: string; phase: 'armed' | 'sending' } | null>(null);
  // A second tap can arrive before the sending render, so the ref is what
  // actually refuses the duplicate write.
  const inflight = useRef<string | null>(null);

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

  const act = async (key: string, label: string, run: () => Promise<void>, after?: () => void) => {
    if (inflight.current != null) return;
    if (flight?.key === key && flight.phase === 'armed') {
      if (nav.demo) {
        setFlight(null);
        setNote({ ok: true, text: 'demo account · nothing was sent' });
        return;
      }
      inflight.current = key;
      setFlight({ key, phase: 'sending' });
      try {
        await run();
        setNote({ ok: true, text: label });
        checks.reload();
        after?.();
      } catch (error) {
        setNote({ ok: false, text: explain(error, 'that') });
      } finally {
        inflight.current = null;
        setFlight(null);
      }
      return;
    }
    setFlight({ key, phase: 'armed' });
    setNote(null);
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
        flight={flight}
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
  flight,
  onAct,
}: {
  repo: string;
  workflows: WorkflowRun[];
  flight: { key: string; phase: 'armed' | 'sending' } | null;
  onAct: (key: string, label: string, run: () => Promise<void>, after?: () => void) => void;
}) {
  const nav = useNav();
  const failed = workflows.filter((run) => run.conclusion === 'failure');
  const held = workflows.filter((run) => run.status === 'action_required' || run.conclusion === 'action_required');
  const waiting = workflows.filter((run) => run.status === 'waiting');
  if (failed.length + held.length + waiting.length === 0) return null;

  return (
    <View style={styles.actions}>
      {failed.map((run) => (
        <ActionButton
          confirm="re-run the failed jobs?"
          flight={flight}
          key={`rerun-${run.id}`}
          label={`re-run failed · ${run.name}`}
          onPress={() =>
            onAct(`rerun-${run.id}`, `re-running the failed jobs in ${run.name}`, () =>
              rerunFailed(nav.token ?? '', repo, run.id),
            )
          }
          operation={`rerun-${run.id}`}
        />
      ))}
      {held.map((run) => (
        <ActionButton
          confirm="approve this run?"
          flight={flight}
          key={`approve-${run.id}`}
          label={`approve and run · ${run.name}`}
          onPress={() =>
            onAct(`approve-${run.id}`, `${run.name} is allowed to run`, () =>
              approveRun(nav.token ?? '', repo, run.id),
            )
          }
          operation={`approve-${run.id}`}
        />
      ))}
      {waiting.map((run) => (
        <Deployment flight={flight} key={`deploy-${run.id}`} onAct={onAct} repo={repo} run={run} />
      ))}
    </View>
  );
}

function Deployment({
  repo,
  run,
  flight,
  onAct,
}: {
  repo: string;
  run: WorkflowRun;
  flight: { key: string; phase: 'armed' | 'sending' } | null;
  onAct: (key: string, label: string, action: () => Promise<void>, after?: () => void) => void;
}) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoPending() : undefined), [nav.demo]);
  const pending = useRemote(
    nav.token ? `${nav.token}|pending|${repo}|${run.id}` : null,
    (signal) => fetchPendingDeployments(nav.token ?? '', repo, run.id, signal),
    { demo },
  );
  if (pending.status === 'loading' || pending.status === 'idle') {
    return <Micro style={styles.waitingNote}>checking who can approve {run.name}…</Micro>;
  }
  if (pending.status === 'error' || pending.failure) {
    return (
      <Micro style={styles.failed}>
        {explain(pending.status === 'error' ? pending.error : pending.failure, 'reading the pending deployment')}
      </Micro>
    );
  }
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
      <ActionButton
        confirm={`approve deploy to ${names}?`}
        flight={flight}
        label={`approve deploy · ${names}`}
        onPress={() =>
          onAct(
            `deploy-approve-${run.id}`,
            `deploying to ${names}`,
            () => reviewDeployments(nav.token ?? '', repo, run.id, ids, 'approved', 'approved from git-huh'),
            () => pending.reload(),
          )
        }
        operation={`deploy-approve-${run.id}`}
      />
      <ActionButton
        confirm="reject this deploy?"
        flight={flight}
        ghost
        label="reject"
        onPress={() =>
          onAct(
            `deploy-reject-${run.id}`,
            `the deploy to ${names} was stopped`,
            () => reviewDeployments(nav.token ?? '', repo, run.id, ids, 'rejected', 'rejected from git-huh'),
            () => pending.reload(),
          )
        }
        operation={`deploy-reject-${run.id}`}
      />
    </View>
  );
}

function ActionButton({
  operation,
  label,
  confirm,
  flight,
  onPress,
  ghost,
}: {
  operation: string;
  label: string;
  confirm: string;
  flight: { key: string; phase: 'armed' | 'sending' } | null;
  onPress: () => void;
  ghost?: boolean;
}) {
  const mine = flight?.key === operation;
  const sending = mine && flight.phase === 'sending';
  const locked = flight?.phase === 'sending';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: sending, disabled: locked && !sending }}
      disabled={locked}
      onPress={onPress}
      style={ghost ? styles.ghost : styles.solid}
    >
      <Label style={ghost ? styles.ghostLabel : styles.solidLabel}>
        {sending ? 'sending…' : mine ? confirm : label}
      </Label>
    </Pressable>
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
          {canOpen && (
            <View style={styles.moreRow}>
              <Icon color={colors.ink70} name={open ? 'collapse' : 'expand'} size={14} />
              <Micro style={styles.more}>{open ? 'hide the log' : 'why · the end of the log'}</Micro>
            </View>
          )}
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
  if (log.data.tooLarge) {
    return (
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(url).catch(() => {})}>
        <Micro style={styles.logNote}>log too large · open it on github</Micro>
      </Pressable>
    );
  }

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
    moreRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 4,
      marginTop: 4,
    },
    more: {
      color: colors.ink70,
    },
    log: {
      backgroundColor: colors.recess,
      borderRadius: radii.tile,
      gap: 2,
      marginBottom: 10,
      padding: 10,
    },
    errorLine: {
      color: colors.no,
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
      color: colors.yes,
      marginBottom: 10,
    },
    failed: {
      color: colors.no,
      marginBottom: 10,
    },
    note: {
      marginTop: 16,
    },
    error: {
      color: colors.no,
      marginTop: 16,
    },
  }),
);
