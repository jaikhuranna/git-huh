import { Fragment, useMemo, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { routeForUrl, useNav } from '../lib/nav';
import { Body, Data, Serif } from './Type';
import { Squiggle } from './Squiggle';
import { colors, fonts, radii, themed } from '../theme';

/**
 * Just enough Markdown to read a pull request.
 *
 * Bodies and comments arrive as raw Markdown, and printing them verbatim is
 * how the brief ended up with a literal `## Problem` on the page. This is
 * not a compliant parser and does not try to be — it is a renderer for the
 * handful of constructs that actually show up in a description: headings,
 * lists, task lists, quotes, fenced code, rules, and inline code / bold /
 * italic / links. Anything it does not recognise falls through as text,
 * which is the correct failure for prose.
 */

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullet'; text: string; checked: boolean | null }
  | { kind: 'ordered'; text: string; index: number }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; text: string; language: string }
  | { kind: 'rule' };

export function Markdown({
  source,
  width,
  limit,
}: {
  source: string;
  /** Used to size the wavy rules, which are SVG and cannot be `100%`. */
  width: number;
  /** Characters to show before the text is cut off; omit for all of it. */
  limit?: number;
}) {
  const blocks = useMemo(() => parse(source, limit), [limit, source]);

  if (blocks.length === 0) {
    return <Body style={styles.empty}>Nothing was written here.</Body>;
  }

  return (
    <View>
      {blocks.map((block, index) => (
        <Fragment key={index}>{render(block, width)}</Fragment>
      ))}
    </View>
  );
}

function render(block: Block, width: number) {
  switch (block.kind) {
    case 'heading':
      return (
        <View style={styles.headingBlock}>
          <Serif
            style={[styles.heading, block.level > 2 && styles.headingSmall]}
          >
            {strip(block.text)}
          </Serif>
          <Squiggle
            amplitude={block.level > 2 ? 1.6 : 2.4}
            length={Math.max(40, width * (block.level > 2 ? 0.28 : 0.42))}
            opacity={0.45}
            wavelength={block.level > 2 ? 9 : 12}
          />
        </View>
      );
    case 'rule':
      return (
        <Squiggle
          amplitude={3}
          length={width}
          opacity={0.35}
          style={styles.rule}
          wavelength={16}
        />
      );
    case 'code':
      return (
        <View style={styles.code}>
          {block.language ? (
            <Data style={styles.codeLang}>{block.language}</Data>
          ) : null}
          <Data style={styles.codeText}>{block.text}</Data>
        </View>
      );
    case 'quote':
      return <Quote text={block.text} />;
    case 'bullet':
      return (
        <View style={styles.listRow}>
          <Data style={styles.bullet}>
            {block.checked === null ? '—' : block.checked ? '×' : '○'}
          </Data>
          <Body style={styles.listText}>
            <Inline text={block.text} />
          </Body>
        </View>
      );
    case 'ordered':
      return (
        <View style={styles.listRow}>
          <Data style={styles.bullet}>{block.index}.</Data>
          <Body style={styles.listText}>
            <Inline text={block.text} />
          </Body>
        </View>
      );
    default:
      return (
        <Body style={styles.paragraph}>
          <Inline text={block.text} />
        </Body>
      );
  }
}

/**
 * A block quote, with the wave running down its side instead of the usual
 * bar. The spine has to be told how tall to be — SVG cannot stretch to a
 * sibling — so the text is measured once it has laid out.
 */
function Quote({ text }: { text: string }) {
  const [height, setHeight] = useState(20);

  return (
    <View style={styles.quote}>
      <Squiggle
        amplitude={2}
        length={height}
        opacity={0.5}
        vertical
        wavelength={10}
      />
      <Body
        onLayout={(event) => {
          const measured = Math.max(16, event.nativeEvent.layout.height);
          setHeight((current) =>
            Math.abs(current - measured) < 1 ? current : measured,
          );
        }}
        style={styles.quoteText}
      >
        <Inline text={text} />
      </Body>
    </View>
  );
}

/** `**bold**`, `*italic*`, `` `code` ``, `[label](url)` and bare links. */
function Inline({ text }: { text: string }) {
  const parts = useMemo(() => inline(text), [text]);
  const nav = useNav();
  // A link to a pull request, an issue, a discussion or a repository opens
  // here; anything else is a real link and leaves.
  const follow = (href: string) => {
    const route = routeForUrl(href);
    if (route) nav.open(route);
    else Linking.openURL(href).catch(() => {});
  };
  return (
    <>
      {parts.map((part, index) => {
        if (part.href) {
          return (
            <Text
              key={index}
              onPress={() => follow(part.href as string)}
              style={styles.link}
            >
              {part.text}
            </Text>
          );
        }
        return (
          <Text
            key={index}
            style={[
              part.code && styles.inlineCode,
              part.bold && styles.bold,
              part.italic && styles.italic,
            ]}
          >
            {part.text}
          </Text>
        );
      })}
    </>
  );
}

interface Span {
  text: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  href?: string;
}

const INLINE =
  /(`[^`]+`)|(\*\*[^*]+\*\*)|(__[^_]+__)|(\*[^*\n]+\*)|(\[[^\]]+\]\([^)\s]+\))|(https?:\/\/\S+)/g;

function inline(text: string): Span[] {
  const spans: Span[] = [];
  let cursor = 0;

  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0;
    if (at > cursor) spans.push({ text: text.slice(cursor, at) });
    const token = match[0];

    if (token.startsWith('`')) {
      spans.push({ text: token.slice(1, -1), code: true });
    } else if (token.startsWith('**') || token.startsWith('__')) {
      spans.push({ text: token.slice(2, -2), bold: true });
    } else if (token.startsWith('*')) {
      spans.push({ text: token.slice(1, -1), italic: true });
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      spans.push({
        text: token.slice(1, split),
        href: token.slice(split + 2, -1),
      });
    } else {
      spans.push({ text: token, href: token });
    }
    cursor = at + token.length;
  }

  if (cursor < text.length) spans.push({ text: text.slice(cursor) });
  return spans.length > 0 ? spans : [{ text }];
}

/** Headings keep their own weight, so inline marks are only noise there. */
function strip(text: string): string {
  return text.replace(/[*_`]/g, '').trim();
}

function parse(source: string, limit?: number): Block[] {
  let text = source
    .replace(/\r/g, '')
    // HTML comments are how bots and templates hide instructions; they are
    // not part of what the author wrote.
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\/?(details|summary|br|p|div|img|picture|source)[^>]*>/gi, '')
    .trim();

  if (limit && text.length > limit) {
    text = `${text.slice(0, limit).trimEnd()}…`;
  }

  const blocks: Block[] = [];
  const lines = text.split('\n');
  let paragraph: string[] = [];
  let order = 0;

  const flush = () => {
    if (paragraph.length === 0) return;
    blocks.push({ kind: 'paragraph', text: paragraph.join(' ').trim() });
    paragraph = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = /^```(\S*)/.exec(trimmed);
    if (fence) {
      flush();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({
        kind: 'code',
        language: fence[1] ?? '',
        text: body.join('\n').replace(/\s+$/, ''),
      });
      continue;
    }

    if (trimmed.length === 0) {
      flush();
      order = 0;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({
        kind: 'heading',
        level: heading[1].length,
        text: heading[2],
      });
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ kind: 'rule' });
      continue;
    }

    if (trimmed.startsWith('>')) {
      flush();
      blocks.push({ kind: 'quote', text: trimmed.replace(/^>\s?/, '') });
      continue;
    }

    const task = /^[-*+]\s+\[( |x|X)\]\s+(.*)$/.exec(trimmed);
    if (task) {
      flush();
      blocks.push({
        kind: 'bullet',
        checked: task[1].toLowerCase() === 'x',
        text: task[2],
      });
      continue;
    }

    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (bullet) {
      flush();
      blocks.push({ kind: 'bullet', checked: null, text: bullet[1] });
      continue;
    }

    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    if (ordered) {
      flush();
      order += 1;
      blocks.push({ kind: 'ordered', index: order, text: ordered[2] });
      continue;
    }

    // A table degrades to its rows rather than disappearing.
    if (/^\|/.test(trimmed)) {
      if (/^\|[\s|:-]+\|?$/.test(trimmed)) continue;
      flush();
      blocks.push({
        kind: 'code',
        language: '',
        text: trimmed.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).join('  ·  '),
      });
      continue;
    }

    paragraph.push(trimmed);
  }

  flush();
  return blocks;
}

const styles = themed(() =>
  StyleSheet.create({
    empty: {
      color: colors.ink40,
      fontStyle: 'italic',
    },
    headingBlock: {
      gap: 2,
      marginBottom: 6,
      marginTop: 16,
    },
    heading: {
      fontFamily: fonts.light,
      fontSize: 19,
      lineHeight: 24,
    },
    headingSmall: {
      fontSize: 16,
      lineHeight: 21,
    },
    paragraph: {
      color: colors.ink70,
      marginTop: 8,
    },
    rule: {
      marginVertical: 14,
    },
    code: {
      backgroundColor: colors.recess,
      borderRadius: radii.tile,
      gap: 4,
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    codeLang: {
      color: colors.ink40,
      fontSize: 9,
    },
    codeText: {
      color: colors.ink,
      fontSize: 11,
      lineHeight: 16,
    },
    quote: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 10,
    },
    quoteText: {
      color: colors.ink40,
      flex: 1,
      fontStyle: 'italic',
    },
    listRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    bullet: {
      color: colors.ink40,
      minWidth: 14,
    },
    listText: {
      color: colors.ink70,
      flex: 1,
    },
    inlineCode: {
      backgroundColor: colors.recess,
      color: colors.ink,
      fontFamily: fonts.mono,
      fontSize: 12,
    },
    bold: {
      color: colors.ink,
      fontFamily: fonts.monoMedium,
    },
    italic: {
      fontStyle: 'italic',
    },
    link: {
      color: colors.ink,
      textDecorationLine: 'underline',
    },
  }),
);
