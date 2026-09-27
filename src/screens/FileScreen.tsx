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

import { OverlayFrame, SavedNote } from '../components/Overlay';
import { Body, Label, Micro } from '../components/Type';
import { useRemote } from '../hooks/useRemote';
import { demoFile } from '../lib/demo';
import { useNav } from '../lib/nav';
import { explain } from '../lib/rest';
import { fetchFile, type RepoFile } from '../lib/repo';
import { commitDirect, encodePath, proposeChange, type ProposalResult } from '../lib/writes';
import { colors, fonts, radii, space, themed } from '../theme';

/** IBM Plex Mono at 11pt, measured — the width of one column of code. */
const CHAR = 6.62;
const ROW = 17;
const GUTTER = 44;
const MAX_COLUMNS = 220;
/** Past this a phone keyboard is the wrong tool, and the screen says so. */
const EDIT_LIMIT = 200_000;

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
  const [editing, setEditing] = useState(false);
  const file = state.status === 'ready' ? state.data : null;
  const name = path.split('/').pop() ?? path;

  const editable = file?.text != null && file.size <= EDIT_LIMIT;

  return (
    <OverlayFrame
      footer={
        file && !editing ? (
          <View style={styles.footer}>
            {editable && (
              <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={styles.solid}>
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
        <Label style={styles.note}>binary, or too big for github to send inline</Label>
      )}

      {file && file.text != null && !editing && <Reader find={find} text={file.text} />}

      {file && file.text != null && editing && (
        <Editor
          file={file}
          name={name}
          onCancel={() => setEditing(false)}
          onDone={(result) => {
            if (result.kind === 'pull') {
              nav.replace({ kind: 'pull', repo: result.repo, number: result.number });
            } else {
              setEditing(false);
              state.reload();
            }
          }}
          repo={repo}
        />
      )}
    </OverlayFrame>
  );
}

// --- reading -----------------------------------------------------------------

function Reader({ text, find }: { text: string; find?: string }) {
  const { width } = useWindowDimensions();
  const list = useRef<FlatList<string>>(null);
  const [query, setQuery] = useState(find ?? '');
  const [cursor, setCursor] = useState(0);

  const lines = useMemo(() => {
    const split = text.split('\n');
    if (split.length > 1 && split[split.length - 1] === '') split.pop();
    return split;
  }, [text]);

  const needle = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      needle
        ? lines.flatMap((line, index) => (line.toLowerCase().includes(needle) ? [index] : []))
        : [],
    [lines, needle],
  );
  const current = matches.length > 0 ? matches[Math.min(cursor, matches.length - 1)] : -1;

  const contentWidth = useMemo(() => {
    const longest = lines.reduce((max, line) => Math.max(max, Math.min(line.length, MAX_COLUMNS)), 0);
    return Math.max(width, GUTTER + longest * CHAR + space.gutter * 2);
  }, [lines, width]);

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
          {needle ? (matches.length === 0 ? 'none' : `${Math.min(cursor, matches.length - 1) + 1} / ${matches.length}`) : ''}
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
          initialNumToRender={60}
          keyExtractor={(_, index) => String(index)}
          ref={list}
          renderItem={({ item, index }) => (
            <Line current={index === current} needle={needle} number={index + 1} text={item} />
          )}
          style={{ width: contentWidth }}
          windowSize={9}
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
  const shown = text.length > MAX_COLUMNS ? `${text.slice(0, MAX_COLUMNS)}…` : text;
  const parts = useMemo(() => split(shown, needle), [needle, shown]);
  return (
    <View style={[styles.line, current && styles.lineOn]}>
      <Micro style={styles.lineNo}>{number}</Micro>
      <Text numberOfLines={1} style={styles.code}>
        {parts.map((part, index) =>
          part.hit ? (
            <Text key={index} style={styles.hitText}>
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )}
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
  file,
  name,
  repo,
  onCancel,
  onDone,
}: {
  file: RepoFile;
  name: string;
  repo: string;
  onCancel: () => void;
  onDone: (result: ProposalResult) => void;
}) {
  const nav = useNav();
  const [text, setText] = useState(file.text ?? '');
  const [message, setMessage] = useState(`Update ${name}`);
  const [mode, setMode] = useState<'pull' | 'direct'>('pull');
  const [phase, setPhase] = useState<{ kind: 'idle' | 'sending' | 'failed' | 'sent'; note?: string }>({
    kind: 'idle',
  });
  const changed = text !== file.text;
  const branch = file.ref || 'the default branch';

  const save = async () => {
    if (!changed || !message.trim() || phase.kind === 'sending') return;
    if (nav.demo) {
      setPhase({ kind: 'sent', note: 'demo account · nothing was committed' });
      return;
    }
    setPhase({ kind: 'sending' });
    const proposal = {
      repo,
      path: file.path,
      sha: file.sha,
      base: file.ref,
      text,
      message: message.trim(),
      login: nav.login ?? 'git-huh',
    };
    try {
      const result =
        mode === 'pull'
          ? await proposeChange(nav.token ?? '', proposal)
          : await commitDirect(nav.token ?? '', proposal);
      onDone(result);
    } catch (error) {
      setPhase({ kind: 'failed', note: explain(error, mode === 'pull' ? 'that change' : 'that commit') });
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.editPage}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        multiline
        onChangeText={setText}
        scrollEnabled={false}
        spellCheck={false}
        style={styles.editor}
        textAlignVertical="top"
        value={text}
      />

      <View style={styles.commit}>
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
            accessibilityState={{ disabled: !changed || phase.kind === 'sending' }}
            disabled={!changed || phase.kind === 'sending'}
            onPress={save}
            style={[styles.solid, (!changed || phase.kind === 'sending') && styles.disabled]}
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
    </ScrollView>
  );
}

const styles = themed(() =>
  StyleSheet.create({
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
      backgroundColor: 'rgba(245,180,38,0.22)',
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
      backgroundColor: 'rgba(245,180,38,0.55)',
      color: colors.ink,
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
      fontFamily: fonts.sans,
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
      color: colors.red,
    },
    sent: {
      color: colors.green,
    },
    note: {
      marginTop: 26,
      textAlign: 'center',
    },
    error: {
      color: colors.red,
      marginTop: 26,
      paddingHorizontal: space.gutter,
      textAlign: 'center',
    },
  }),
);
