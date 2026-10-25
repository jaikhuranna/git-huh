/**
 * Caps for text that would otherwise become one row per line.
 *
 * A unified diff and a long comment both arrive as a single string. Building
 * every row first, then throwing most of them away, still allocates the
 * whole document. These helpers stop once the retained window is full and
 * say, honestly, that more remains.
 */

export const PATCH_LINE_CAP = 260;

/** Rows mounted at once when a file is open. The rest stay one page away. */
export const DIFF_PAGE_ROWS = 80;

/** Blocks mounted at once for a conversation body. */
export const MARKDOWN_PAGE_BLOCKS = 40;

export interface PatchLine {
  kind: 'add' | 'del' | 'context' | 'meta';
  text: string;
  oldLine: number | null;
  newLine: number | null;
}

export interface BoundedPatch {
  lines: PatchLine[];
  truncated: boolean;
}

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

/**
 * Walk a unified diff without splitting it into an array first.
 *
 * Line numbers live only in `@@` headers; each following line is the next
 * one. Scanning stops at `limit` retained rows and reports truncation
 * without reading the remainder into a second copy.
 */
export function scanPatch(patch: string, limit = PATCH_LINE_CAP): BoundedPatch {
  const lines: PatchLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let start = 0;
  const length = patch.length;

  const take = (end: number): boolean => {
    let raw = patch.slice(start, end);
    if (raw.endsWith('\r')) raw = raw.slice(0, -1);
    start = end + 1;

    if (raw.startsWith('\\')) return false;

    if (lines.length >= limit) return true;

    const header = HUNK.exec(raw);
    if (header) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      lines.push({
        kind: 'meta',
        text: header[3].trim() || `line ${newLine}`,
        oldLine: null,
        newLine: null,
      });
      return false;
    }

    if (raw.startsWith('+')) {
      lines.push({ kind: 'add', text: raw.slice(1), oldLine: null, newLine });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', text: raw.slice(1), oldLine, newLine: null });
      oldLine += 1;
    } else {
      lines.push({ kind: 'context', text: raw.startsWith(' ') ? raw.slice(1) : raw, oldLine, newLine });
      oldLine += 1;
      newLine += 1;
    }
    return false;
  };

  for (let index = 0; index < length; index += 1) {
    if (patch.charCodeAt(index) !== 10) continue;
    if (take(index)) {
      return { lines, truncated: true };
    }
  }

  // A patch that ends in a newline is not a blank context line. Git writes
  // a genuine blank as a single space, so a dangling break is discarded.
  if (start < length && take(length)) {
    return { lines, truncated: true };
  }

  return { lines, truncated: lines.length >= limit && start < length };
}

/** How many items of a capped list should be on screen, and whether more exist. */
export function pageWindow(
  total: number,
  shown: number,
  page: number,
): { visible: number; remaining: number } {
  const visible = Math.min(total, Math.max(page, shown));
  return { visible, remaining: Math.max(0, total - visible) };
}
