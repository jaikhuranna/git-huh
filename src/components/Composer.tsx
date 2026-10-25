import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { clearDraft, loadDraft, saveDraft } from '../lib/drafts';
import { outcomeUnknown } from '../lib/github';
import { explain } from '../lib/rest';
import { colors, fonts, radii, themed } from '../theme';
import { Icon, type Glyph } from './Icon';
import { Label, Micro } from './Type';

export interface ComposerAction {
  key: string;
  label: string;
  /** Filled black: the one thing on the row that is the point. */
  primary?: boolean;
  /** Approving says enough on its own; everything else needs words. */
  allowEmpty?: boolean;
  /**
   * What the pill says after the first press. Anything that cannot be taken
   * back — merge, delete — is pressed twice: once to arm, once to send.
   */
  confirm?: string;
  /** A toggle in its on state — starred, watching, your reaction. */
  on?: boolean;
  /** Not available right now, for a reason the screen says nearby. */
  disabled?: boolean;
  /** A glyph before the verb, so a row of verbs reads at a glance. */
  icon?: Glyph;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'armed'; action: string }
  | { kind: 'sending'; action: string }
  | { kind: 'sent'; note: string }
  | { kind: 'failed'; note: string }
  /**
   * The write left, and the reply did not come back. The draft stays, and
   * the next press checks rather than sending the same words again.
   */
  | { kind: 'unknown'; action: string; note: string; operationId: string };

/**
 * Where you write back. One box, one row of verbs, and a line under them that
 * says what happened in words — `sent`, or exactly why not.
 *
 * Every write in the app goes through this, which is what keeps the rule
 * honest: the button names the thing it does (`approve`, `request changes`,
 * `comment on line 42`), nothing is sent until you press it, and a failure
 * leaves your text in the box rather than eating it.
 *
 * `bare` is the same row without the box, for the writes that are only a
 * verb: merge, star, lock, a reaction. A form that has fields of its own puts
 * them above a bare composer and reads them in `onSubmit`.
 */
export function Composer({
  placeholder,
  actions,
  onSubmit,
  doing = 'that',
  demo = false,
  compact = false,
  bare = false,
  quiet = false,
  initial = '',
  onCancel,
  draftKey,
  onCheck,
}: {
  placeholder?: string;
  actions: ComposerAction[];
  /** Resolves with the line to show when it worked. Throws when it did not. */
  onSubmit: (action: string, text: string) => Promise<string>;
  doing?: string;
  demo?: boolean;
  compact?: boolean;
  /** No box: the row of verbs alone. */
  bare?: boolean;
  /** Say nothing when it worked — a reaction is its own receipt. */
  quiet?: boolean;
  /** What is in the box to begin with — an edit starts from what was said. */
  initial?: string;
  /** A `cancel` pill, for a box opened to edit something. */
  onCancel?: () => void;
  /**
   * Where an unsent comment lives across a remount. The account and the
   * resource, so one person's draft is never the next person's.
   */
  draftKey?: { account: string | null; kind: string; id: string };
  /**
   * Look, don't send. Called when the reply was lost, so the screen can see
   * whether the write landed before anyone offers to send it again.
   */
  onCheck?: (action: string, text: string, operationId: string) => Promise<string>;
}) {
  const [text, setText] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const busy = phase.kind === 'sending';
  const restored = useRef(false);
  // One id per armed send. A retry of an unknown outcome keeps it, so the
  // write is not given a new identity and posted a second time.
  const operationId = useRef<string | null>(null);
  const operationCount = useRef(0);

  useEffect(() => {
    if (!draftKey || restored.current) return;
    restored.current = true;
    let live = true;
    loadDraft(draftKey.account, draftKey.kind, draftKey.id).then((draft) => {
      if (!live || !draft) return;
      setText((current) => (current.trim().length > 0 ? current : draft.text));
    });
    return () => {
      live = false;
    };
  }, [draftKey]);

  const remember = (value: string) => {
    setText(value);
    if (draftKey && !demo) saveDraft(draftKey.account, draftKey.kind, draftKey.id, value);
    if (phase.kind !== 'idle' && phase.kind !== 'sending') setPhase({ kind: 'idle' });
  };

  const send = async (action: ComposerAction) => {
    if (busy || action.disabled) return;
    if (!bare && !action.allowEmpty && text.trim().length === 0) return;
    if (action.confirm && !(phase.kind === 'armed' && phase.action === action.key)) {
      setPhase({ kind: 'armed', action: action.key });
      return;
    }
    if (phase.kind === 'unknown' && phase.action === action.key) {
      // The first press already left. Checking is the only honest next step;
      // sending again would be a second comment.
      if (!onCheck) return;
      setPhase({ kind: 'sending', action: action.key });
      try {
        const note = await onCheck(action.key, text.trim(), phase.operationId);
        if (!bare) {
          setText('');
          if (draftKey) clearDraft(draftKey.account, draftKey.kind, draftKey.id);
        }
        setPhase(quiet ? { kind: 'idle' } : { kind: 'sent', note });
      } catch (error) {
        if (outcomeUnknown(error)) {
          setPhase({
            kind: 'unknown',
            action: action.key,
            note: explain(error, doing),
            operationId: phase.operationId,
          });
          return;
        }
        setPhase({ kind: 'failed', note: explain(error, doing) });
      }
      return;
    }
    const id = operationId.current ?? `${action.key}:${(operationCount.current += 1)}`;
    operationId.current = id;
    setPhase({ kind: 'sending', action: action.key });
    try {
      if (demo) {
        setPhase({ kind: 'sent', note: 'demo account · nothing was sent' });
        return;
      }
      const note = await onSubmit(action.key, text.trim());
      operationId.current = null;
      if (!bare) {
        setText('');
        if (draftKey) clearDraft(draftKey.account, draftKey.kind, draftKey.id);
      }
      setPhase(quiet ? { kind: 'idle' } : { kind: 'sent', note });
    } catch (error) {
      if (outcomeUnknown(error)) {
        setPhase({
          kind: 'unknown',
          action: action.key,
          note: explain(error, doing),
          operationId: id,
        });
        return;
      }
      operationId.current = null;
      setPhase({ kind: 'failed', note: explain(error, doing) });
    }
  };

  return (
    <View style={[styles.box, compact && styles.compact, bare && styles.bare]}>
      {!bare && (
      <TextInput
        editable={!busy}
        multiline
        onChangeText={remember}
            placeholder={placeholder}
        placeholderTextColor={colors.ink40}
        style={[styles.input, compact && styles.inputCompact]}
        textAlignVertical="top"
        value={text}
      />
      )}
      <View style={styles.actions}>
        {actions.map((action) => {
          const disabled =
            busy || action.disabled || (!bare && !action.allowEmpty && text.trim().length === 0);
          const armed = phase.kind === 'armed' && phase.action === action.key;
          const filled = action.primary || action.on || armed;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{
                disabled,
                busy: busy && phase.action === action.key,
                ...(action.on !== undefined ? { selected: action.on } : {}),
              }}
              disabled={disabled}
              key={action.key}
              onPress={() => send(action)}
              // Border and fill change together: see the corner-radius trap.
              style={[
                styles.pill,
                filled && styles.primary,
                disabled && (filled ? styles.primaryDisabled : styles.disabled),
              ]}
            >
              {action.icon && !(busy && phase.action === action.key) ? (
                <Icon
                  color={filled ? colors.onBlack : colors.ink}
                  name={armed ? 'save' : action.icon}
                  size={14}
                />
              ) : null}
              <Label style={filled ? styles.primaryLabel : styles.label}>
                {busy && phase.action === action.key
              ? 'sending…'
              : phase.kind === 'unknown' && phase.action === action.key
                ? 'check'
                : armed
                  ? (action.confirm ?? action.label)
                  : action.label}
            </Label>
            </Pressable>
          );
        })}
        {onCancel && (
          <Pressable accessibilityRole="button" disabled={busy} onPress={onCancel} style={styles.pill}>
            <Icon name="close" size={14} />
            <Label style={styles.label}>cancel</Label>
          </Pressable>
        )}
      </View>
      {phase.kind === 'sent' && <Micro style={styles.sent}>{phase.note}</Micro>}
      {phase.kind === 'failed' && <Micro style={styles.failed}>{phase.note}</Micro>}
      {phase.kind === 'unknown' && <Micro style={styles.failed}>{phase.note}</Micro>}
    </View>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    box: {
      borderTopColor: colors.ink,
      borderTopWidth: 1,
      gap: 10,
      marginTop: 22,
      paddingTop: 12,
    },
    bare: {
      borderTopWidth: 0,
      marginTop: 10,
      paddingTop: 0,
    },
    compact: {
      borderTopColor: colors.hair,
      marginTop: 6,
      paddingTop: 8,
    },
    input: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 14,
      lineHeight: 20,
      minHeight: 84,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    inputCompact: {
      minHeight: 60,
    },
    actions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    pill: {
      alignItems: 'center',
      borderColor: colors.hairStrong,
      borderRadius: radii.pill,
      borderWidth: 1,
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    primary: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    disabled: {
      opacity: 0.4,
    },
    // A primary verb waiting for words stays the black pill, quieter, rather
    // than turning into a grey blob that reads as a different control.
    primaryDisabled: {
      opacity: 0.55,
    },
    label: {
      color: colors.ink,
    },
    primaryLabel: {
      color: colors.onBlack,
    },
    sent: {
      color: colors.yes,
    },
    failed: {
      color: colors.no,
    },
  }),
);
