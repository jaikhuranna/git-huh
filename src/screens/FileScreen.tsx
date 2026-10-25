import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { FormScrollView } from '../components/FormScrollView';
import { Composer } from '../components/Composer';
import { OverlayFrame, SavedNote } from '../components/Overlay';
import { Body, Label, Micro } from '../components/Type';
import { useRemote } from '../hooks/useRemote';
import { composeKey } from '../lib/cacheKey';
import { demoFile, demoRepoInfo } from '../lib/demo';
import { clearDraft, loadDraft, saveDraft } from '../lib/drafts';
import { captureFileSnapshot, fileMovedOn, type FileSnapshot } from '../lib/fileSnapshot';
import { pullRoute, useNav } from '../lib/nav';
import { loadProposal, proposalKey, proposalLeft, type ProposalProgress } from '../lib/proposals';
import { explain } from '../lib/rest';
import { fetchFile, fetchRepoInfo, type RepoFile } from '../lib/repo';
import {
  commitDirect,
  deleteFile,
  encodePath,
  proposeChange,
  resumeProposal,
  type ProposalResult,
} from '../lib/writes';
import { colors, fonts, radii, space, themed, tint } from '../theme';

/** IBM Plex Mono at 11pt, measured — the width of one column of code. */
const CHAR = 6.62;
const ROW = 17;
const GUTTER = 44;
const MAX_COLUMNS = 220;
/** Past this a phone keyboard is the wrong tool, and the screen says so. */
const EDIT_LIMIT = 200_000;
/** A search that reports more than this is no longer something to step through. */
const MATCH_CAP = 200;
/** How long a keystroke waits before the whole file is scanned again. */
const SEARCH_WAIT = 120;

/**
 * One file, readable: line numbers, no wrapping, and a find bar — the
 * complaint was a thousand-line file on a phone with no way to move through
 * it. Then `edit`, because the other complaint was that the phone could see
 * the typo and not fix it: change the text, write a message, and either
 * commit it or — the default — put it on a new branch and open a pull
 * request, through a fork if this account cannot push here.
 */
export function FileScreen({
  repo,
  path,
  refName,
  find,
}: {
  repo: string;
  path: string;
  refName?: string;
  find?: string;
}) {
  const nav = useNav();
  const demo = useMemo(() => (nav.demo ? demoFile(path) : undefined), [nav.demo, path]);
  const state = useRemote(
    nav.token ? `${nav.token}|file|${repo}|${refName ?? ''}|${path}` : null,
    (signal) => fetchFile(nav.token ?? '', repo, path, refName ?? '', signal),
    {
      cacheKey: nav.login ? `${nav.login.toLowerCase()}-file-${repo}-${refName ?? ''}-${path}` : null,
      demo,
    },
  );
  // Whether this account can push here, which is who may delete a file. The
  // repository page saved the same answer under the same key.
  const infoDemo = useMemo(() => (nav.demo ? demoRepoInfo(repo) : undefined), [nav.demo, repo]);
  const info = useRemote(
    nav.token ? `${nav.token}|info|${repo}` : null,
    (signal) => fetchRepoInfo(nav.token ?? '', repo, signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-repo2-${repo}` : null, demo: infoDemo },
  );
  const canWrite =
    info.status === 'ready' && ['ADMIN', 'MAINTAIN', 'WRITE'].includes(info.data?.permission ?? '');
  const [editing, setEditing] = useState(false);
  // Taken when editing starts, and kept: a refresh must not change the sha
  // a draft will be saved against.
  const [base, setBase] = useState<FileSnapshot | null>(null);
  const file = state.status === 'ready' ? state.data : null;
  const name = path.split('/').pop() ?? path;
  const draftId = composeKey(nav.login, 'file-edit', repo, refName ?? '', path);

  const editable = file?.text != null && file.size <= EDIT_LIMIT;

  return (
    <OverlayFrame
      footer={
        file && !editing ? (
          <View style={styles.footer}>
            {editable && (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  const snapshot = captureFileSnapshot(file, repo);
                  if (!snapshot) return;
                  setBase(snapshot);
                  setEditing(true);
                }}
                style={styles.solid}
              >
                <Label style={styles.solidLabel}>edit</Label>
              </Pressable>
            )}
            <Pressable
              accessibilityRole="link"
              onPress={() =>
                Linking.openURL(
                  `https://github.com/${repo}/blob/${file.ref || 'HEAD'}/${encodePath(path)}`,
                ).catch(() => {})
              }
              style={styles.ghost}
            >
              <Label style={styles.ghostLabel}>open on github</Label>
            </Pressable>
            {!editable && file.text != null && (
              <Micro style={styles.footNote}>too big to edit on a phone</Micro>
            )}
            {canWrite && (
            <View style={styles.footDelete}>
              <Composer
                actions={[{ key: 'delete', label: 'delete', confirm: `delete ${name}?` }]}
                bare
                demo={nav.demo}
                doing="that delete"
                onSubmit={async () => {
                  await deleteFile(nav.token ?? '', repo, {
                    path,
                    sha: file.sha,
                    message: `Delete ${name}`,
                    branch: file.ref,
                  });
                  nav.close();
                  return 'deleted';
                }}
              />
            </View>
            )}
          </View>
        ) : null
      }
      onBack={editing ? () => setEditing(false) : nav.close}
      where={`${repo} · ${name}`}
    >
      {state.status === 'ready' && <SavedNote offline={state.offline} savedAt={state.savedAt} />}
      {state.status === 'loading' && <Label style={styles.note}>opening the file…</Label>}
      {state.status === 'error' && (
        <Body style={styles.error}>{explain(state.error, 'opening this file')}</Body>
      )}

      {file && file.text == null && (
        <Label style={styles.note}>
          {file.reason === 'too-large' ? 'too big to open on a phone' : 'binary, or not text github could send'}
        </Label>
      )}

      {file && file.text != null && !editing && <Reader find={find} text={file.text} />}

      {base && editing && (
        <Editor
          account={nav.login}
          draftId={draftId}
          file={file}
          name={name}
          onCancel={() => {
            clearDraft(nav.login, 'file', draftId);
            setEditing(false);
            setBase(null);
          }}
          onDone={(result) => {
            clearDraft(nav.login, 'file', draftId);
            setBase(null);
            if (result.kind === 'pull') {
              nav.replace(pullRoute(result));
            } else {
              setEditing(false);
              state.reload();
            }
          }}
          onRebase={() => {
            if (!file || file.text == null) return;
            const snapshot = captureFileSnapshot(file, repo);
            if (!snapshot) return;
            clearDraft(nav.login, 'file', draftId);
            setBase(snapshot);
          }}
          repo={repo}
          snapshot={base}
        />
      )}
    </OverlayFrame>
  );
}

// --- reading -----------------------------------------------------------------

function Reader({ text, find }: { text: string; find?: string }) {
  const { width, height } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [query, setQuery] = useState(find ?? '');
  const [cursor, setCursor] = useState(0);

  const lines = useMemo(() => {
    const split = text.split('\n');
    if (split.length > 1 && split[split.length - 1] === '') split.pop();
    return split;
  }, [text]);

  // The scan waits out a burst of keystrokes, and stops once it has enough
  // matches to step through. The lowercase copy lives only for that scan.
  const [needle, setNeedle] = useState(() => (find ?? '').trim().toLowerCase());
  useEffect(() => {
    const next = query.trim().toLowerCase();
    const timer = setTimeout(() => setNeedle(next), SEARCH_WAIT);
    return () => clearTimeout(timer);
  }, [query]);
  const matches = useMemo(() => {
    if (!needle) return [];
    const found: number[] = [];
    for (let index = 0; index < lines.length; index++) {
      if (!lines[index].toLowerCase().includes(needle)) continue;
      found.push(index);
      if (found.length >= MATCH_CAP) break;
    }
    return found;
  }, [lines, needle]);
  const capped = matches.length >= MATCH_CAP;
  const current = matches.length > 0 ? matches[Math.min(cursor, matches.length - 1)] : -1;

  const contentWidth = useMemo(() => {
    let longest = 0;
    const sample = Math.min(lines.length, 400);
    for (let index = 0; index < sample; index++) {
      longest = Math.max(longest, Math.min(lines[index].length, MAX_COLUMNS));
    }
    return Math.max(width, GUTTER + longest * CHAR + space.gutter * 2);
  }, [lines, width]);

  // A phone shows about a screen of rows at once; the window stays a little
  // wider than that so a fling does not run into empty space.
  const windowRows = Math.max(1, Math.ceil(height / ROW));
  const initialRows = Math.min(40, windowRows + 8);

  useEffect(() => {
    if (current < 0) return;
    list.current?.scrollToIndex({ animated: true, index: current, viewPosition: 0.3 });
  }, [current]);

  const step = (by: number) => {
    if (matches.length === 0) return;
    setCursor((value) => (value + by + matches.length) % matches.length);
  };

  return (
    <View style={styles.reader}>
      <View style={styles.findRow}>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(value) => {
            setQuery(value);
            setCursor(0);
          }}
          onSubmitEditing={() => step(1)}
          placeholder={`find in ${lines.length.toLocaleString('en-US')} lines`}
          placeholderTextColor={colors.ink40}
          returnKeyType="next"
          style={styles.find}
          value={query}
        />
        <Micro style={styles.count}>
          {needle
            ? matches.length === 0
              ? 'none'
              : `${Math.min(cursor, matches.length - 1) + 1} / ${matches.length}${capped ? '+' : ''}`
            : ''}
        </Micro>
        <Pressable accessibilityLabel="previous match" accessibilityRole="button" onPress={() => step(-1)} style={styles.step}>
          <Label style={styles.stepLabel}>↑</Label>
        </Pressable>
        <Pressable accessibilityLabel="next match" accessibilityRole="button" onPress={() => step(1)} style={styles.step}>
          <Label style={styles.stepLabel}>↓</Label>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <FlatList
          data={lines}
          getItemLayout={(_, index) => ({ index, length: ROW, offset: ROW * index })}
          initialNumToRender={initialRows}
          keyExtractor={(_, index) => String(index)}
          ref={list}
          renderItem={({ item, index }) => (
            <Line current={index === current} needle={needle} number={index + 1} text={item} />
          )}
          style={{ width: contentWidth }}
          windowSize={7}
        />
      </ScrollView>
    </View>
  );
}

function Line({
  number,
  text,
  needle,
  current,
}: {
  number: number;
  text: string;
  needle: string;
  current: boolean;
}) {
  // A match past the row's width is still a match. The row starts at that
  // column, so what was found is the thing on screen, and the number says
  // how far along the line it sits.
  const at = needle ? text.toLowerCase().indexOf(needle) : -1;
  const start = at > MAX_COLUMNS - needle.length ? Math.max(0, at - 24) : 0;
  const shown = text.slice(start, start + MAX_COLUMNS);
  const parts = useMemo(() => split(shown, needle), [needle, shown]);
  return (
    <View style={[styles.line, current && styles.lineOn]}>
      <Micro style={styles.lineNo}>{number}</Micro>
      <Text numberOfLines={1} style={styles.code}>
        {start > 0 && <Text style={styles.skip}>{`col ${start + 1} · `}</Text>}
        {parts.map((part, index) =>
          part.hit ? (
            <Text key={index} style={styles.hitText}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
        {text.length > start + MAX_COLUMNS ? '…' : ''}
      </Text>
    </View>
  );
}

/** Cut a line around every occurrence of the needle, ignoring case. */
function split(text: string, needle: string): { text: string; hit: boolean }[] {
  if (!needle) return [{ text, hit: false }];
  const lower = text.toLowerCase();
  const out: { text: string; hit: boolean }[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    if (at > from) out.push({ text: text.slice(from, at), hit: false });
    out.push({ text: text.slice(at, at + needle.length), hit: true });
    from = at + needle.length;
  }
  if (from < text.length) out.push({ text: text.slice(from), hit: false });
  return out;
}

// --- editing -----------------------------------------------------------------

function Editor({
  snapshot,
  file,
  name,
  repo,
  account,
  draftId,
  onCancel,
  onDone,
  onRebase,
}: {
  snapshot: FileSnapshot;
  file: RepoFile | null;
  name: string;
  repo: string;
  account: string | null;
  draftId: string;
  onCancel: () => void;
  onDone: (result: ProposalResult) => void;
  onRebase: () => void;
}) {
  const nav = useNav();
  // Restored from the draft when one survived the remount; otherwise the
  // snapshot. Derived rather than written from an effect, so a newer file
  // arriving underneath does not reset the words.
  const [restored, setRestored] = useState<string | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    let live = true;
    loadDraft(account, 'file', draftId).then((draft) => {
      if (!live) return;
      setRestored(draft?.text ?? null);
      setDraftReady(true);
    });
    return () => {
      live = false;
    };
  }, [account, draftId]);
  const [typed, setTyped] = useState<string | null>(null);
  const text = typed ?? restored ?? snapshot.text;
  const [message, setMessage] = useState(`Update ${name}`);
  const [mode, setMode] = useState<'pull' | 'direct'>('pull');
  const [phase, setPhase] = useState<{ kind: 'idle' | 'sending' | 'failed' | 'sent'; note?: string }>({
    kind: 'idle',
  });
  const [pending, setPending] = useState<ProposalProgress | null>(null);
  useEffect(() => {
    const key = proposalKey(account, snapshot.repo, snapshot.ref, snapshot.path, snapshot.sha);
    let live = true;
    loadProposal(key).then((progress) => {
      if (live) setPending(progress);
    });
    return () => {
      live = false;
    };
  }, [account, snapshot]);
  const changed = text !== snapshot.text;
  const newer = fileMovedOn(snapshot, file);
  const branch = snapshot.ref || 'the default branch';

  const change = (value: string) => {
    setTyped(value);
    if (draftReady) saveDraft(account, 'file', draftId, value === snapshot.text ? '' : value);
  };

  const proposalOf = () => ({
    repo,
    path: snapshot.path,
    sha: snapshot.sha,
    base: snapshot.ref,
    text,
    message: message.trim(),
    login: nav.login ?? 'git-huh',
  });

  const save = async () => {
    if (!changed || !message.trim() || phase.kind === 'sending' || newer) return;
    if (nav.demo) {
      setPhase({ kind: 'sent', note: 'demo account · nothing was committed' });
      return;
    }
    setPhase({ kind: 'sending' });
    const proposal = proposalOf();
    try {
      const result =
        mode === 'pull'
          ? await proposeChange(nav.token ?? '', proposal, { account })
          : await commitDirect(nav.token ?? '', proposal);
      onDone(result);
    } catch (error) {
      const key = proposalKey(account, snapshot.repo, snapshot.ref, snapshot.path, snapshot.sha);
      const progress = await loadProposal(key);
      setPending(progress);
      setPhase({ kind: 'failed', note: explain(error, mode === 'pull' ? 'that change' : 'that commit') });
    }
  };

  const resume = async () => {
    if (phase.kind === 'sending' || !pending) return;
    setPhase({ kind: 'sending' });
    try {
      const result = await resumeProposal(nav.token ?? '', proposalOf(), { account });
      onDone(result);
    } catch (error) {
      setPhase({ kind: 'failed', note: explain(error, 'that pull request') });
    }
  };

  return (
    <FormScrollView
      contentContainerStyle={styles.editPage}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        onChangeText={change}
        scrollEnabled={false}
        spellCheck={false}
        style={styles.editor}
        textAlignVertical="top"
        value={text}
      />

      <View style={styles.commit}>
        {newer && (
          <View style={styles.modes}>
            <Micro style={styles.failed}>
              a newer version of this file arrived · saving would write over it, so the edit stays on the version it started from
            </Micro>
            <Pressable accessibilityRole="button" onPress={onRebase} style={styles.ghost}>
              <Label style={styles.ghostLabel}>load the newer version</Label>
            </Pressable>
          </View>
        )}
        {pending && pending.step === 'committed' && (
          <View style={styles.modes}>
            <Micro style={styles.explain}>{proposalLeft(pending)}</Micro>
            <Pressable accessibilityRole="button" onPress={resume} style={styles.solid}>
              <Label style={styles.solidLabel}>{phase.kind === 'sending' ? 'sending…' : 'open the pull request'}</Label>
            </Pressable>
          </View>
        )}
        <Label style={styles.commitHead}>{changed ? 'the change' : 'nothing changed yet'}</Label>
        <TextInput
          onChangeText={setMessage}
          placeholder="what changed, in one line"
          placeholderTextColor={colors.ink40}
          style={styles.message}
          value={message}
        />
        <View style={styles.modes}>
          {(
            [
              ['pull', 'new branch + pull request'],
              ['direct', `commit to ${branch}`],
            ] as const
          ).map(([value, label]) => (
            <Pressable
              accessibilityRole="radio"
              accessibilityState={{ checked: mode === value }}
              key={value}
              onPress={() => setMode(value)}
              style={[styles.mode, mode === value && styles.modeOn]}
            >
              <Label style={mode === value ? styles.modeLabelOn : undefined}>{label}</Label>
            </Pressable>
          ))}
        </View>
        <Micro style={styles.explain}>
          {mode === 'pull'
            ? 'goes on a branch of its own, through a fork if you cannot push here, and opens a pull request for a second look'
            : `lands on ${branch} straight away, as you`}
        </Micro>
        <View style={styles.modes}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !changed || phase.kind === 'sending' || newer }}
            disabled={!changed || phase.kind === 'sending' || newer}
            onPress={save}
            style={[styles.solid, (!changed || phase.kind === 'sending' || newer) && styles.disabled]}
          >
            <Label style={styles.solidLabel}>
              {phase.kind === 'sending' ? 'sending…' : mode === 'pull' ? 'propose change' : 'commit'}
            </Label>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onCancel} style={styles.ghost}>
            <Label style={styles.ghostLabel}>discard</Label>
          </Pressable>
        </View>
        {phase.kind === 'failed' && <Micro style={styles.failed}>{phase.note}</Micro>}
        {phase.kind === 'sent' && <Micro style={styles.sent}>{phase.note}</Micro>}
      </View>
    </FormScrollView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    footDelete: {
      marginLeft: 'auto',
      marginTop: -10,
    },
    reader: {
      flex: 1,
    },
    findRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 6,
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
    },
    find: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      color: colors.ink,
      flex: 1,
      fontFamily: fonts.mono,
      fontSize: 12,
      paddingHorizontal: 14,
      paddingVertical: 7,
    },
    count: {
      color: colors.ink40,
      minWidth: 40,
      textAlign: 'right',
    },
    step: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    stepLabel: {
      color: colors.ink,
    },
    line: {
      alignItems: 'center',
      flexDirection: 'row',
      height: ROW,
      paddingLeft: space.gutter - 12,
    },
    lineOn: {
      backgroundColor: tint(colors.ink, 0.12),
    },
    lineNo: {
      color: colors.ink20,
      fontSize: 9,
      marginRight: 10,
      textAlign: 'right',
      width: GUTTER - 10,
    },
    code: {
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 11,
      lineHeight: 15,
    },
    hitText: {
      backgroundColor: tint(colors.ink, 0.3),
      color: colors.ink,
    },
    skip: {
      color: colors.ink40,
    },
    editPage: {
      paddingBottom: 30,
      paddingHorizontal: space.gutter,
    },
    editor: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 11,
      lineHeight: 16,
      minHeight: 280,
      paddingHorizontal: 10,
      paddingVertical: 10,
    },
    commit: {
      borderTopColor: colors.ink,
      borderTopWidth: 1,
      gap: 10,
      marginTop: 18,
      paddingTop: 12,
    },
    commitHead: {
      color: colors.ink,
    },
    message: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    modes: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    mode: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    modeOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    modeLabelOn: {
      color: colors.onBlack,
    },
    explain: {
      color: colors.ink40,
      lineHeight: 13,
    },
    footer: {
      alignItems: 'center',
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      flexDirection: 'row',
      gap: 10,
      paddingBottom: 8,
      paddingHorizontal: space.gutter,
      paddingTop: 10,
    },
    footNote: {
      color: colors.ink40,
      flex: 1,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    ghost: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 16,
      paddingVertical: 9,
    },
    ghostLabel: {
      color: colors.ink,
    },
    disabled: {
      opacity: 0.4,
    },
    failed: {
      color: colors.no,
    },
    sent: {
      color: colors.yes,
    },
    note: {
      marginTop: 26,
      textAlign: 'center',
    },
    error: {
      color: colors.no,
      marginTop: 26,
      paddingHorizontal: space.gutter,
      textAlign: 'center',
    },
  }),
);
