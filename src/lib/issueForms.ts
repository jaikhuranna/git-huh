import { parse } from 'yaml';

import { fetchFile, listDirectory } from './repo';

/**
 * A repository's issue templates, including the YAML *forms* GitHub's phone
 * app never learned to fill in — one of the named gaps between the app and
 * the website.
 *
 * Markdown templates prefill the body. Forms become fields: a line, a box,
 * a choice, a set of ticks. The answers are written back into the issue
 * exactly the way the website writes them (`### Label`, then the answer,
 * `_No response_` for a blank), so a maintainer's triage bots cannot tell
 * which one you used.
 */

export type FormField =
  | { type: 'markdown'; text: string }
  | {
      type: 'input' | 'textarea';
      id: string;
      label: string;
      description: string;
      placeholder: string;
      value: string;
      required: boolean;
      render: string | null;
    }
  | {
      type: 'dropdown';
      id: string;
      label: string;
      description: string;
      options: string[];
      multiple: boolean;
      required: boolean;
    }
  | {
      type: 'checkboxes';
      id: string;
      label: string;
      description: string;
      options: { label: string; required: boolean }[];
    };

export interface IssueTemplate {
  file: string;
  name: string;
  about: string;
  title: string;
  labels: string[];
  kind: 'markdown' | 'form';
  /** Markdown templates: the body to start from. */
  body: string;
  /** Forms: the fields, in order. */
  fields: FormField[];
}

/** Text answers, chosen options, or one tick per checkbox. */
export type Answer = string | string[] | boolean[];
export type Answers = Record<string, Answer>;

type Loose = Record<string, unknown>;

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : value == null ? fallback : String(value);

const list = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.map((item) => str(item)).filter(Boolean)
    : typeof value === 'string'
      ? value.split(',').map((item) => item.trim()).filter(Boolean)
      : [];

export async function fetchTemplates(
  token: string,
  repo: string,
  ref: string,
  signal?: AbortSignal,
): Promise<IssueTemplate[]> {
  let entries;
  try {
    entries = await listDirectory(token, repo, '.github/ISSUE_TEMPLATE', ref, signal);
  } catch {
    return [];
  }
  const files = entries.filter(
    (entry) =>
      entry.type === 'file' &&
      /\.(md|ya?ml)$/i.test(entry.name) &&
      !/^config\.ya?ml$/i.test(entry.name),
  );

  const templates = await Promise.all(
    files.map(async (entry) => {
      try {
        const file = await fetchFile(token, repo, entry.path, ref, signal);
        if (file.text == null) return null;
        return /\.md$/i.test(entry.name)
          ? fromMarkdown(entry.name, file.text)
          : fromForm(entry.name, file.text);
      } catch {
        return null;
      }
    }),
  );
  return templates.filter((template): template is IssueTemplate => template != null);
}

function fromMarkdown(file: string, text: string): IssueTemplate {
  const match = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/.exec(text);
  const head = (match ? (parse(match[1]) as Loose | null) : null) ?? {};
  return {
    file,
    name: str(head.name, file.replace(/\.md$/i, '')),
    about: str(head.about),
    title: str(head.title),
    labels: list(head.labels),
    kind: 'markdown',
    body: (match ? match[2] : text).trim(),
    fields: [],
  };
}

function fromForm(file: string, text: string): IssueTemplate | null {
  const form = parse(text) as Loose | null;
  if (!form || !Array.isArray(form.body)) return null;

  const fields: FormField[] = (form.body as Loose[]).flatMap((raw, index): FormField[] => {
    const type = str(raw.type);
    const attributes = (raw.attributes ?? {}) as Loose;
    const validations = (raw.validations ?? {}) as Loose;
    const id = str(raw.id, `field-${index}`);
    const label = str(attributes.label, id);
    const description = str(attributes.description);
    const required = validations.required === true;

    switch (type) {
      case 'markdown':
        return [{ type: 'markdown', text: str(attributes.value) }];
      case 'input':
      case 'textarea':
        return [
          {
            type,
            id,
            label,
            description,
            placeholder: str(attributes.placeholder),
            value: str(attributes.value),
            required,
            render: type === 'textarea' && attributes.render ? str(attributes.render) : null,
          },
        ];
      case 'dropdown':
        return [
          {
            type: 'dropdown',
            id,
            label,
            description,
            options: list(attributes.options),
            multiple: attributes.multiple === true,
            required,
          },
        ];
      case 'checkboxes':
        return [
          {
            type: 'checkboxes',
            id,
            label,
            description,
            options: (Array.isArray(attributes.options) ? (attributes.options as Loose[]) : []).map(
              (option) => ({
                label: str(option.label),
                required: ((option.required ?? false) as boolean) === true,
              }),
            ),
          },
        ];
      default:
        return [];
    }
  });

  return {
    file,
    name: str(form.name, file),
    about: str(form.description),
    title: str(form.title),
    labels: list(form.labels),
    kind: 'form',
    body: '',
    fields,
  };
}

/** Starting answers: every field's own default, nothing ticked. */
export function initialAnswers(fields: FormField[]): Answers {
  const answers: Answers = {};
  for (const field of fields) {
    if (field.type === 'input' || field.type === 'textarea') answers[field.id] = field.value;
    if (field.type === 'dropdown') answers[field.id] = [];
    if (field.type === 'checkboxes') answers[field.id] = field.options.map(() => false);
  }
  return answers;
}

/** The labels of required fields that are still empty. */
export function missingRequired(fields: FormField[], answers: Answers): string[] {
  return fields.flatMap((field) => {
    if (field.type === 'markdown') return [];
    const answer = answers[field.id];
    if (field.type === 'checkboxes') {
      const ticks = (answer as boolean[] | undefined) ?? [];
      return field.options.some((option, index) => option.required && !ticks[index])
        ? [field.label]
        : [];
    }
    if (!field.required) return [];
    const empty = Array.isArray(answer) ? answer.length === 0 : !str(answer).trim();
    return empty ? [field.label] : [];
  });
}

/** The issue body, in the website's own format. */
export function renderAnswers(fields: FormField[], answers: Answers): string {
  return fields
    .flatMap((field) => {
      if (field.type === 'markdown') return [];
      const answer = answers[field.id];
      let value: string;
      if (field.type === 'checkboxes') {
        const ticks = (answer as boolean[] | undefined) ?? [];
        value = field.options
          .map((option, index) => `- [${ticks[index] ? 'x' : ' '}] ${option.label}`)
          .join('\n');
      } else if (field.type === 'dropdown') {
        const chosen = (answer as string[] | undefined) ?? [];
        value = chosen.length > 0 ? chosen.join(', ') : '_No response_';
      } else {
        const text = str(answer).trim();
        value = !text
          ? '_No response_'
          : field.type === 'textarea' && field.render
            ? `\`\`\`${field.render}\n${text}\n\`\`\``
            : text;
      }
      return [`### ${field.label}\n\n${value}`];
    })
    .join('\n\n');
}
