import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { Card } from '../components/Card';
import { Body, Label } from '../components/Type';
import type { ProjectIdea } from '../lib/ideas';
import { ideasStore } from '../lib/ideasStorage';
import { colors, radii, space, themed, type } from '../theme';
import { ScreenHead } from './shared';

export function IdeasScreen({ demo }: { demo: boolean }) {
  const store = useMemo(() => ideasStore(demo), [demo]);
  const [ideas, setIdeas] = useState<ProjectIdea[] | null>(null);
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const input = useRef<TextInput>(null);

  const load = useCallback(() => store.load().then(
    (saved) => {
      setIdeas(saved);
      setError(null);
    },
    () => {
      setError('could not read saved ideas · try again');
    },
  ), [store]);
  useEffect(() => { void load(); }, [load]);

  const persist = async (next: ProjectIdea[], afterSave: () => void) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    try {
      await store.save(next);
      setIdeas(next);
      afterSave();
    } catch {
      setError('could not save on this device · your changes are still here');
    } finally {
      locked.current = false;
      setBusy(false);
    }
  };

  const reset = () => {
    setText('');
    setEditing(null);
    Keyboard.dismiss();
  };
  const save = () => {
    if (ideas === null || !text.trim()) return;
    const now = Date.now();
    const next = editing
      ? ideas.map((idea) => idea.id === editing ? { ...idea, text: text.trim() } : idea)
      : [{ id: `${now}-${Math.random().toString(36).slice(2)}`, text: text.trim(), createdAt: now }, ...ideas];
    void persist(next, reset);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        ref={scroll}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHead left="project ideas" right={ideas === null ? undefined : `${ideas.length} saved`} />
        <Label>{demo ? 'demo notebook · saved on this device' : 'saved on this device'}</Label>
        {error && <Body accessibilityLiveRegion="polite" style={styles.error}>{error}</Body>}
        {ideas === null ? (
          error ? <Pressable accessibilityRole="button" onPress={load} style={styles.button}>
            <Label style={styles.buttonText}>try again</Label>
          </Pressable> : <Body>opening your ideas…</Body>
        ) : (
          <>
            <Card title={editing ? 'edit idea' : 'something to build'}>
              <TextInput
                accessibilityLabel="project idea"
                editable={!busy}
                multiline
                onChangeText={setText}
                placeholder="a project you’d like to make…"
                placeholderTextColor={colors.ink40}
                ref={input}
                style={styles.input}
                textAlignVertical="top"
                value={text}
              />
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: busy || !text.trim(), busy }}
                  disabled={busy || !text.trim()}
                  onPress={save}
                  style={[styles.button, styles.primary, (busy || !text.trim()) && styles.disabled]}
                >
                  <Label style={styles.primaryText}>{busy ? 'saving…' : editing ? 'save changes' : 'add idea'}</Label>
                </Pressable>
                {editing && <Pressable accessibilityRole="button" disabled={busy} onPress={reset} style={styles.button}>
                  <Label style={styles.buttonText}>cancel</Label>
                </Pressable>}
              </View>
            </Card>
            {ideas.length === 0 && <Body style={styles.empty}>no ideas yet · the next project starts here</Body>}
            {ideas.map((idea) => (
              <Card key={idea.id}>
                <Body selectable>{idea.text}</Body>
                {deleting === idea.id && <Label style={styles.confirm}>delete this idea?</Label>}
                <View style={styles.actions}>
                  {deleting === idea.id ? (
                    <>
                      <Pressable accessibilityLabel={`confirm deletion of idea: ${idea.text}`} accessibilityRole="button" disabled={busy} onPress={() => {
                        void persist(ideas.filter((item) => item.id !== idea.id), () => {
                          setDeleting(null);
                          if (editing === idea.id) reset();
                        });
                      }} style={styles.button}>
                        <Label style={styles.error}>delete</Label>
                      </Pressable>
                      <Pressable accessibilityLabel={`keep idea: ${idea.text}`} accessibilityRole="button" disabled={busy} onPress={() => setDeleting(null)} style={styles.button}>
                        <Label style={styles.buttonText}>keep</Label>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Pressable accessibilityLabel={`edit idea: ${idea.text}`} accessibilityRole="button" disabled={busy} onPress={() => {
                        setEditing(idea.id);
                        setText(idea.text);
                        setDeleting(null);
                        setError(null);
                        scroll.current?.scrollTo({ y: 0, animated: true });
                        input.current?.focus();
                      }} style={styles.button}>
                        <Label style={styles.buttonText}>edit</Label>
                      </Pressable>
                      <Pressable accessibilityLabel={`delete idea: ${idea.text}`} accessibilityRole="button" disabled={busy} onPress={() => setDeleting(idea.id)} style={styles.button}>
                        <Label style={styles.buttonText}>delete</Label>
                      </Pressable>
                    </>
                  )}
                </View>
              </Card>
            ))}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  fill: { flex: 1 },
  page: { gap: 10, paddingHorizontal: space.gutter, paddingTop: 6, paddingBottom: 28 },
  input: {
    ...type.body,
    color: colors.ink,
    minHeight: 100,
    borderColor: colors.hair,
    borderWidth: 1,
    borderRadius: radii.tile,
    padding: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  button: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    minHeight: 44,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.hairStrong,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primary: { backgroundColor: colors.black, borderColor: colors.black },
  primaryText: { color: colors.onBlack },
  buttonText: { color: colors.ink },
  disabled: { opacity: 0.4 },
  empty: { color: colors.ink70, padding: space.card },
  confirm: { color: colors.ink, marginTop: 12 },
  error: { color: colors.no },
}));
