import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from 'react-native';

import { Markdown } from '../components/Markdown';
import { OverlayFrame } from '../components/Overlay';
import { Body, Heading, Label, Micro } from '../components/Type';
import { useRemote } from '../hooks/useRemote';
import { demoTemplates } from '../lib/demo';
import {
  fetchTemplates,
  initialAnswers,
  missingRequired,
  renderAnswers,
  type Answers,
  type FormField,
  type IssueTemplate,
} from '../lib/issueForms';
import { useNav } from '../lib/nav';
import { explain } from '../lib/rest';
import { createIssue } from '../lib/writes';
import { colors, fallbacks, fonts, radii, space, themed } from '../theme';

const BLANK: IssueTemplate = {
  file: '',
  name: 'blank issue',
  about: 'no template, just a title and some words',
  title: '',
  labels: [],
  kind: 'markdown',
  body: '',
  fields: [],
};

/**
 * Opening an issue, including through a repository's issue *forms* — the
 * structured templates the website renders as fields and GitHub's phone app
 * never did. Pick a template, fill it in, and the issue lands written the
 * way the website would have written it.
 */
export function NewIssueScreen({ repo }: { repo: string }) {
  const nav = useNav();
  const [chosen, setChosen] = useState<IssueTemplate | null>(null);
  const demo = useMemo(() => (nav.demo ? demoTemplates() : undefined), [nav.demo]);
  const templates = useRemote(
    nav.token ? `${nav.token}|templates|${repo}` : null,
    (signal) => fetchTemplates(nav.token ?? '', repo, '', signal),
    { cacheKey: nav.login ? `${nav.login.toLowerCase()}-templates-${repo}` : null, demo },
  );

  return (
    <OverlayFrame
      onBack={chosen ? () => setChosen(null) : nav.close}
      where={`${repo} · new issue`}
    >
      {!chosen && (
        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <Heading style={styles.heading}>What kind of issue?</Heading>
          {templates.status === 'loading' && <Label style={styles.note}>reading the templates…</Label>}
          {[...(templates.status === 'ready' ? templates.data : []), BLANK].map((template) => (
            <Pressable
              accessibilityRole="button"
              key={template.file || 'blank'}
              onPress={() => setChosen(template)}
              style={styles.template}
            >
              <Body style={styles.templateName}>{template.name}</Body>
              {template.about ? <Micro style={styles.about}>{template.about}</Micro> : null}
              {template.kind === 'form' && <Micro style={styles.kind}>form</Micro>}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {chosen && (
        <Fill
          onCreated={(number) => nav.replace({ kind: 'thread', repo, number, type: 'issue' })}
          repo={repo}
          template={chosen}
        />
      )}
    </OverlayFrame>
  );
}

function Fill({
  repo,
  template,
  onCreated,
}: {
  repo: string;
  template: IssueTemplate;
  onCreated: (number: number) => void;
}) {
  const nav = useNav();
  const { width } = useWindowDimensions();
  const [title, setTitle] = useState(template.title);
  const [body, setBody] = useState(template.body);
  const [answers, setAnswers] = useState<Answers>(() => initialAnswers(template.fields));
  const [phase, setPhase] = useState<{ kind: 'idle' | 'sending' | 'failed' | 'sent'; note?: string }>({
    kind: 'idle',
  });

  const form = template.kind === 'form';
  const missing = form ? missingRequired(template.fields, answers) : [];
  const ready = title.trim().length > 0 && missing.length === 0;

  const submit = async () => {
    if (!ready || phase.kind === 'sending') return;
    if (nav.demo) {
      setPhase({ kind: 'sent', note: 'demo account · nothing was opened' });
      return;
    }
    setPhase({ kind: 'sending' });
    try {
      const made = await createIssue(nav.token ?? '', repo, {
        title: title.trim(),
        body: form ? renderAnswers(template.fields, answers) : body,
        labels: template.labels,
      });
      onCreated(made.number);
    } catch (error) {
      setPhase({ kind: 'failed', note: explain(error, 'that issue') });
    }
  };

  const set = (id: string, value: Answers[string]) =>
    setAnswers((current) => ({ ...current, [id]: value }));

  return (
    <ScrollView
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Label style={styles.fieldLabel}>title</Label>
      <TextInput
        onChangeText={setTitle}
        placeholder="one line that says what is wrong"
        placeholderTextColor={colors.ink40}
        style={styles.input}
        value={title}
      />

      {!form && (
        <>
          <Label style={styles.fieldLabel}>what happened</Label>
          <TextInput
            multiline
            onChangeText={setBody}
            placeholder="markdown is fine"
            placeholderTextColor={colors.ink40}
            style={[styles.input, styles.area]}
            textAlignVertical="top"
            value={body}
          />
        </>
      )}

      {form &&
        template.fields.map((field, index) => (
          <Field
            answer={field.type === 'markdown' ? undefined : answers[field.id]}
            field={field}
            key={index}
            onChange={(value) => field.type !== 'markdown' && set(field.id, value)}
            width={width - space.gutter * 2}
          />
        ))}

      {template.labels.length > 0 && (
        <Micro style={styles.labels}>labelled {template.labels.join(', ')}</Micro>
      )}

      <View style={styles.submitRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
          disabled={!ready || phase.kind === 'sending'}
          onPress={submit}
          style={[styles.solid, (!ready || phase.kind === 'sending') && styles.disabled]}
        >
          <Label style={styles.solidLabel}>{phase.kind === 'sending' ? 'opening…' : 'open issue'}</Label>
        </Pressable>
      </View>
      {missing.length > 0 && <Micro style={styles.missing}>still needed: {missing.join(' · ')}</Micro>}
      {phase.kind === 'failed' && <Micro style={styles.failed}>{phase.note}</Micro>}
      {phase.kind === 'sent' && <Micro style={styles.sent}>{phase.note}</Micro>}
    </ScrollView>
  );
}

function Field({
  field,
  answer,
  onChange,
  width,
}: {
  field: FormField;
  answer: Answers[string] | undefined;
  onChange: (value: Answers[string]) => void;
  width: number;
}) {
  if (field.type === 'markdown') {
    return (
      <View style={styles.prose}>
        <Markdown source={field.text} width={width} />
      </View>
    );
  }

  const head = (
    <>
      <Label style={styles.fieldLabel}>
        {field.label.toLowerCase()}
        {'required' in field && field.required ? ' *' : ''}
      </Label>
      {field.description ? <Micro style={styles.about}>{field.description}</Micro> : null}
    </>
  );

  if (field.type === 'input' || field.type === 'textarea') {
    return (
      <>
        {head}
        <TextInput
          multiline={field.type === 'textarea'}
          onChangeText={onChange}
          placeholder={field.placeholder}
          placeholderTextColor={colors.ink40}
          style={[
            styles.input,
            field.type === 'textarea' && styles.area,
            field.render != null && styles.code,
          ]}
          textAlignVertical="top"
          value={(answer as string | undefined) ?? ''}
        />
      </>
    );
  }

  if (field.type === 'dropdown') {
    const chosen = (answer as string[] | undefined) ?? [];
    return (
      <>
        {head}
        <View style={styles.options}>
          {field.options.map((option) => {
            const on = chosen.includes(option);
            return (
              <Pressable
                accessibilityRole={field.multiple ? 'checkbox' : 'radio'}
                accessibilityState={{ checked: on }}
                key={option}
                onPress={() =>
                  onChange(
                    field.multiple
                      ? on
                        ? chosen.filter((item) => item !== option)
                        : [...chosen, option]
                      : on
                        ? []
                        : [option],
                  )
                }
                style={[styles.option, on && styles.optionOn]}
              >
                <Label style={on ? styles.optionLabelOn : undefined}>{option}</Label>
              </Pressable>
            );
          })}
        </View>
      </>
    );
  }

  if (field.type !== 'checkboxes') return null;
  const ticks = (answer as boolean[] | undefined) ?? field.options.map(() => false);
  return (
    <>
      {head}
      {field.options.map((option, index) => (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: ticks[index] }}
          key={option.label}
          onPress={() => onChange(ticks.map((tick, position) => (position === index ? !tick : tick)))}
          style={styles.tickRow}
        >
          <View style={[styles.tick, ticks[index] && styles.tickOn]} />
          <Body style={styles.tickText}>
            {option.label}
            {option.required ? ' *' : ''}
          </Body>
        </Pressable>
      ))}
    </>
  );
}

const styles = themed(() =>
  StyleSheet.create({
    page: {
      paddingBottom: 40,
      paddingHorizontal: space.gutter,
      paddingTop: 6,
    },
    heading: {
      marginBottom: 12,
    },
    template: {
      borderTopColor: colors.hair,
      borderTopWidth: 1,
      gap: 3,
      paddingVertical: 12,
    },
    templateName: {
      fontSize: 15,
    },
    about: {
      color: colors.ink40,
      lineHeight: 13,
    },
    kind: {
      color: colors.purple,
    },
    fieldLabel: {
      color: colors.ink,
      marginBottom: 6,
      marginTop: 18,
    },
    input: {
      backgroundColor: colors.card,
      borderColor: colors.hair,
      borderRadius: radii.tile,
      borderWidth: 1,
      color: colors.ink,
      fontFamily: fonts.sans ?? fallbacks.sans,
      fontSize: 14,
      marginTop: 4,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    area: {
      minHeight: 110,
    },
    code: {
      fontFamily: fonts.mono ?? fallbacks.mono,
      fontSize: 12,
    },
    prose: {
      marginTop: 14,
    },
    options: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    option: {
      borderColor: colors.hair,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    optionOn: {
      backgroundColor: colors.black,
      borderColor: colors.black,
    },
    optionLabelOn: {
      color: colors.onBlack,
    },
    tickRow: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 10,
      paddingVertical: 6,
    },
    tick: {
      borderColor: colors.ink,
      borderRadius: 3,
      borderWidth: 1,
      height: 16,
      width: 16,
    },
    tickOn: {
      backgroundColor: colors.black,
    },
    tickText: {
      flex: 1,
    },
    labels: {
      color: colors.ink40,
      marginTop: 14,
    },
    submitRow: {
      flexDirection: 'row',
      marginTop: 20,
    },
    solid: {
      backgroundColor: colors.black,
      borderColor: colors.black,
      borderRadius: radii.pill,
      borderWidth: 1,
      paddingHorizontal: 18,
      paddingVertical: 10,
    },
    solidLabel: {
      color: colors.onBlack,
    },
    disabled: {
      opacity: 0.4,
    },
    missing: {
      color: colors.ink40,
      marginTop: 10,
    },
    failed: {
      color: colors.red,
      marginTop: 10,
    },
    sent: {
      color: colors.green,
      marginTop: 10,
    },
    note: {
      marginTop: 10,
    },
  }),
);
