/**
 * The last lines of a job log, without a line array the size of the file.
 *
 * Actions logs are one downloaded string. Splitting that string builds an
 * array with one entry per line, which is what a multi-megabyte log spends
 * memory on before the screen keeps forty lines. Scanning backward for
 * newlines keeps only the window that will be shown.
 */

export interface TextTail {
  /** Lines that look like the runner's own error, newest last, at most `errors`. */
  errors: string[];
  /** The last non-empty lines, oldest first, at most `lines`. */
  tail: string[];
}

export interface TextTailOptions {
  /** How many trailing content lines to keep. */
  lines: number;
  /** How many error-shaped lines, taken from the same trailing window, to keep. */
  errors: number;
}

const ERROR = /##\[error\]|^error[:\s]|\bERR!|\bFAIL(ED)?\b|Error:/;

/**
 * Take the last `lines` content lines by walking the string from the end.
 *
 * The walk stops once that many lines are in hand, so a log with millions of
 * earlier lines never becomes a million-element array. Error lines are
 * collected from that same window: a failure's reason is at the end of the
 * job, which is the part a phone can show.
 */
export function tailLines(text: string, options: TextTailOptions): TextTail {
  const kept: string[] = [];
  let end = text.length;

  while (kept.length < options.lines && end > 0) {
    let start = text.lastIndexOf('\n', end - 1);
    if (start === -1) start = -1;
    const raw = text.slice(start + 1, end);
    end = start === -1 ? 0 : start;
    const line = cleanLine(raw);
    if (line == null) continue;
    kept.push(line);
  }

  kept.reverse();
  const errors: string[] = [];
  for (let index = kept.length - 1; index >= 0 && errors.length < options.errors; index -= 1) {
    const line = kept[index];
    if (line == null || !ERROR.test(line)) continue;
    errors.push(line.replace('##[error]', ''));
  }
  errors.reverse();
  return { errors, tail: kept };
}

/** Drop the runner timestamp, blank lines, and the group markers that are not content. */
function cleanLine(raw: string): string | null {
  const line = raw.replace(/^\d{4}-\d\d-\d\dT[\d:.]+Z\s?/, '').replace(/\r$/, '');
  if (line.trim().length === 0) return null;
  if (line.startsWith('##[group]') || line === '##[endgroup]') return null;
  return line;
}
