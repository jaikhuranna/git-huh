import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Composer } from './Composer';
import { Data, Label, Micro } from './Type';
import type { DiffFile, DiffLine } from '../lib/pullDetail';
import { colors, fonts, radii } from '../theme';

/** Where a line comment lands: GitHub numbers new lines on the right, old on the left. */
export interface LineTarget {
  path: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
}

/** IBM Plex Mono at 11pt, measured — used to size the scroll surface. */
const CHAR = 6.62;
const CODE_SIZE = 11;
const GUTTER = 58;
/** Past this, a line is long because it is minified, not because it is code. */
const MAX_COLUMNS = 180;

/**
 * A pull request's diff, as a diff.
 *
 * The brief only ever had `+54 −13` — a bar with two numbers on it, which
 * tells you the size of a change and nothing about the change. This is the
 * patch itself: real line numbers recovered from the hunk headers, additions
 * and deletions banded rather than merely coloured (colour alone is not a
 * signal everyone can read), the enclosing function carried on the hunk
 * rule, and every file foldable because the one you want is rarely first.
 */
export function Diff({
  files,
  moreFiles,
  width,
  find = '',
  onComment,
  demo = false,
}: {
  files: DiffFile[];
  moreFiles: number;
  width: number;
  /** Lines containing this are marked, and files holding them open. */
  find?: string;
  /** Present when lines can be commented on — tap any line, changed or not. */
  onComment?: (target: LineTarget, body: string) => Promise<string>;
  demo?: boolean;
}) {
  const needle = find.trim().toLowerCase();
  const hits = useMemo(
    () =>
      needle
        ? files.map(
            (file) => file.lines.filter((line) => line.kind !== 'meta' && line.text.toLowerCase().includes(needle)).length,
          )
        : files.map(() => 0),
    [files, needle],
  );

  if (files.length === 0) {
    return (
      <Label style={styles.empty}>
        no file contents came back for this pull request
      </Label>
    );
  }

  const total = hits.reduce((sum, count) => sum + count, 0);

  return (
    <View style={styles.stack}>
      {needle.length > 0 && (
        <Micro style={styles.findNote}>
          {total === 0
            ? `“${find.trim()}” is not in these files`
            : `${total} ${total === 1 ? 'line' : 'lines'} in ${hits.filter((count) => count > 0).length} ${
                hits.filter((count) => count > 0).length === 1 ? 'file' : 'files'
              }`}
        </Micro>
      )}
      {files.map((file, index) => (
        <FileBlock
          demo={demo}
          file={file}
          hits={hits[index]}
          key={file.path}
          needle={needle}
          onComment={onComment}
          width={width}
        />
      ))}
      {moreFiles > 0 && (
        <Label style={styles.more}>
          {moreFiles} more {moreFiles === 1 ? 'file' : 'files'} in this pull
          request
        </Label>
      )}
    </View>
  );
}

function FileBlock({
  file,
  width,
  needle,
  hits,
  onComment,
  demo,
}: {
  file: DiffFile;
  width: number;
  needle: string;
  hits: number;
  onComment?: (target: LineTarget, body: string) => Promise<string>;
  demo: boolean;
}) {
  // Big files start folded: a 200-line patch above the next filename means
  // the file list is not a list any more. A find opens the ones it hit.
  const [folded, setOpen] = useState(file.lines.length > 0 && file.lines.length <= 40);
  const open = needle ? hits > 0 || folded : folded;
  const [picked, setPicked] = useState<number | null>(null);
  const pickedLine = picked != null ? file.lines[picked] : null;

  const contentWidth = useMemo(() => {
    const longest = file.lines.reduce(
      (max, line) => Math.max(max, Math.min(line.text.length, MAX_COLUMNS)),
      0,
    );
    return Math.max(width, GUTTER + longest * CHAR + 16);
  }, [file.lines, width]);

  return (
    <View style={styles.file}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={styles.fileHead}
      >
        <Data numberOfLines={1} style={styles.path}>
          {tail(file.path)}
        </Data>
        <View style={styles.counts}>
          {hits > 0 && <Micro style={styles.hits}>{hits} found</Micro>}
          {file.additions > 0 && <Micro style={styles.add}>+{file.additions}</Micro>}
          {file.deletions > 0 && <Micro style={styles.del}>−{file.deletions}</Micro>}
          <Micro style={styles.status}>{file.status}</Micro>
          <Micro style={styles.chevron}>{open ? '−' : '+'}</Micro>
        </View>
      </Pressable>

      {open &&
        (file.hasPatch ? (
          // Horizontal only. Capping the height here would clip a long
          // patch with nothing to scroll it; the page scroll handles depth.
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ width: contentWidth }}>
              {file.lines.map((line, index) => (
                <Row
                  found={needle.length > 0 && line.kind !== 'meta' && line.text.toLowerCase().includes(needle)}
                  key={index}
                  line={line}
                  onPress={
                    onComment && line.kind !== 'meta'
                      ? () => setPicked((current) => (current === index ? null : index))
                      : undefined
                  }
                  picked={picked === index}
                />
              ))}
              {file.truncated && (
                <Micro style={styles.truncated}>
                  … the rest of this patch is on github
                </Micro>
              )}
            </View>
          </ScrollView>
        ) : (
          <Micro style={styles.binary}>
            {file.status === 'renamed'
              ? 'renamed — no content change'
              : 'binary or too large to diff'}
          </Micro>
        ))}

      {open && file.hasPatch && onComment && !pickedLine && (
        <Micro style={styles.tapHint}>tap any line — changed or not — to comment on it</Micro>
      )}

      {open && onComment && pickedLine && pickedLine.kind !== 'meta' && (
        <View style={styles.lineComposer}>
          <Data numberOfLines={1} style={styles.quoted}>
            {pickedLine.kind === 'del' ? `old line ${pickedLine.oldLine}` : `line ${pickedLine.newLine}`} ·{' '}
            {pickedLine.text.trim() || '(blank)'}
          </Data>
          <Composer
            actions={[{ key: 'line', label: 'comment on this line', primary: true }]}
            compact
            demo={demo}
            doing="that comment"
            onSubmit={async (_, body) => {
              const target: LineTarget =
                pickedLine.kind === 'del'
                  ? { path: file.path, line: pickedLine.oldLine ?? 0, side: 'LEFT' }
                  : { path: file.path, line: pickedLine.newLine ?? 0, side: 'RIGHT' };
              const note = await onComment(target, body);
              setPicked(null);
              return note;
            }}
            placeholder="what about this line?"
          />
        </View>
      )}
    </View>
  );
}

function Row({
  line,
  found,
  picked,
  onPress,
}: {
  line: DiffLine;
  found: boolean;
  picked: boolean;
  onPress?: () => void;
}) {
  if (line.kind === 'meta') {
    return (
      <View style={[styles.row, styles.metaRow]}>
        <Micro style={styles.metaText}>@@ {line.text}</Micro>
      </View>
    );
  }

  return (
    <Pressable
      accessibilityLabel={
        onPress ? `comment on line ${line.newLine ?? line.oldLine}` : undefined
      }
      accessibilityRole={onPress ? 'button' : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.row,
        line.kind === 'add' && styles.addRow,
        line.kind === 'del' && styles.delRow,
        found && styles.foundRow,
        picked && styles.pickedRow,
      ]}
    >
      <Micro style={styles.lineNo}>{line.oldLine ?? ''}</Micro>
      <Micro style={styles.lineNo}>{line.newLine ?? ''}</Micro>
      <Micro style={styles.sign}>
        {line.kind === 'add' ? '+' : line.kind === 'del' ? '−' : ' '}
      </Micro>
      <Data style={styles.code}>{clip(line.text)}</Data>
    </Pressable>
  );
}

/** Deep paths only matter at the end; the leading directories are context. */
function tail(path: string): string {
  const parts = path.split('/');
  return parts.length > 3 ? `…/${parts.slice(-2).join('/')}` : path;
}

function clip(text: string): string {
  return text.length > MAX_COLUMNS ? `${text.slice(0, MAX_COLUMNS)}…` : text;
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  file: {
    backgroundColor: colors.card,
    borderColor: colors.hair,
    borderRadius: radii.tile,
    borderWidth: 1,
    overflow: 'hidden',
  },
  fileHead: {
    alignItems: 'center',
    backgroundColor: colors.recess,
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  path: {
    flex: 1,
    fontSize: 11,
  },
  counts: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  add: {
    color: colors.green,
  },
  del: {
    color: colors.red,
  },
  status: {
    color: colors.ink40,
  },
  chevron: {
    color: colors.ink,
    fontSize: 12,
    width: 10,
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    paddingVertical: 1,
  },
  addRow: {
    backgroundColor: 'rgba(31,154,83,0.12)',
  },
  delRow: {
    backgroundColor: 'rgba(232,65,43,0.12)',
  },
  // Found lines keep their add/delete band underneath the mark, so a find
  // never hides what kind of line it landed on.
  foundRow: {
    borderLeftColor: colors.yellow,
    borderLeftWidth: 3,
  },
  pickedRow: {
    backgroundColor: 'rgba(47,127,224,0.16)',
  },
  hits: {
    color: colors.ink,
    fontFamily: fonts.monoMedium,
  },
  findNote: {
    color: colors.ink40,
  },
  tapHint: {
    color: colors.ink40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  lineComposer: {
    paddingBottom: 10,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  quoted: {
    color: colors.ink70,
    fontSize: 10,
  },
  metaRow: {
    backgroundColor: colors.recess,
    paddingVertical: 3,
  },
  metaText: {
    color: colors.ink40,
    paddingLeft: 10,
  },
  lineNo: {
    color: colors.ink20,
    fontSize: 9,
    textAlign: 'right',
    width: 24,
  },
  sign: {
    color: colors.ink40,
    fontSize: 9,
    textAlign: 'center',
    width: 10,
  },
  code: {
    color: colors.ink,
    fontFamily: fonts.mono,
    fontSize: CODE_SIZE,
    lineHeight: 15,
  },
  truncated: {
    color: colors.ink40,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  binary: {
    color: colors.ink40,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  empty: {
    marginTop: 12,
  },
  more: {
    marginTop: 2,
  },
});
