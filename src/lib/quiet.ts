/**
 * Long stretches of nothing, and how every chart in the app draws them.
 *
 * A chart of a year with one busy spring spends most of its width on zeroes,
 * and a row of empty bars or ghost dots reads as missing data rather than as
 * the fact it is: nothing happened for a while. The widget solved this first
 * (`DotFieldRenderer`): a long silence is drawn as the app's hand-drawn wave
 * with its length written over it. These are the same rules in TypeScript,
 * for the charts inside the app and the share cards.
 *
 * Two ways a chart can use them:
 *
 * - **Bridged in place** (`quietRuns`): bars and rows keep their axis, and
 *   the wave runs across the empty stretch between the last mark and the
 *   next. Used wherever the axis is the point — weeks, months, days.
 * - **Folded** (`foldField`): a field of marks with no axis gives the room a
 *   silence would have taken to days that had something in them, the way the
 *   widget does. Used by the cross field.
 *
 * Pure, so it is tested beside itself.
 */

export interface QuietRun {
  /** First empty slot, inclusive. */
  start: number;
  /** Last empty slot, inclusive. */
  end: number;
}

/**
 * Every run of at least `min` zeroes inside `values[0..until)`, oldest first.
 * `until` stops the search at the present, so the rest of a calendar year
 * that has not happened yet is never drawn as a silence.
 */
export function quietRuns(values: readonly number[], min: number, until = values.length): QuietRun[] {
  const runs: QuietRun[] = [];
  const stop = Math.max(0, Math.min(until, values.length));
  let start = -1;
  for (let i = 0; i <= stop; i++) {
    const empty = i < stop && values[i] <= 0;
    if (empty && start < 0) start = i;
    if (!empty && start >= 0) {
      if (i - start >= Math.max(1, min)) runs.push({ start, end: i - 1 });
      start = -1;
    }
  }
  return runs;
}

/** `3 wk`, `5 mo`, `1 yr` — the widget's words for how long a silence was. */
export function howLong(days: number): string {
  if (days < 56) return `${Math.max(1, Math.round(days / 7))} wk`;
  if (days < 365) return `${Math.max(2, Math.round(days / 30.44))} mo`;
  return `${Math.max(1, Math.round(days / 365.25))} yr`;
}

/** How long a run of months was, in the same words. */
export function howLongMonths(months: number): string {
  return months >= 12 ? `${Math.max(1, Math.round(months / 12))} yr` : `${months} mo`;
}

/**
 * Which week column of its calendar year a date sits in. GitHub's year
 * calendar starts on the Sunday on or before 1 January, so this is the index
 * into a `YearSummary.weeks` — and everything after it has not happened yet.
 */
export function weekOfYear(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const day = Math.round((date.getTime() - jan1.getTime()) / 86_400_000);
  return Math.floor((day + jan1.getDay()) / 7);
}

/**
 * A sine along a straight line from (x1, y) to (x2, y), as an SVG path — the
 * same wave `Squiggle` draws, for charts that paint into their own canvas.
 */
export function wavePath(
  x1: number,
  x2: number,
  y: number,
  amplitude = 2.2,
  wavelength = 11,
): string {
  const length = x2 - x1;
  if (length <= 0) return '';
  const steps = Math.max(2, Math.ceil(length / 2));
  const points: string[] = [];
  for (let step = 0; step <= steps; step++) {
    const along = (step / steps) * length;
    const across = y + Math.sin((along / wavelength) * 2 * Math.PI) * amplitude;
    points.push(`${step === 0 ? 'M' : 'L'}${(x1 + along).toFixed(1)} ${across.toFixed(1)}`);
  }
  return points.join(' ');
}

/** One cell of a folded field: a mark, or a silence that takes whole columns. */
export type FieldSlot =
  | { kind: 'mark'; level: number }
  | {
      kind: 'quiet';
      /** How many cells of the source it stands for. */
      cells: number;
      /** True when it runs back past the oldest cell there is. */
      toEdge: boolean;
    };

/**
 * A field of levels, newest first, as the cells it will take — the widget's
 * `slotsOf`. The newest cell is always a mark (it is today). A silence folds
 * into a wave only when what it hides is more than the wave's own columns
 * after each side has kept one whole column of its own empty cells, so a
 * wave never costs the field room; the newer side first finishes the column
 * the marks stopped in.
 */
export function foldField(
  levels: readonly number[],
  rows: number,
  {
    quietCells,
    waveColumns = 3,
    edgeColumns = 1,
  }: {
    quietCells: number;
    waveColumns?: number;
    /**
     * Whole columns of its own empty cells each side of a wave keeps. One on
     * the widget; none on a field whose cells are several days each, where a
     * column is two weeks and keeping two of them would stop a six-week
     * silence from ever folding.
     */
    edgeColumns?: number;
  },
): FieldSlot[] {
  const slots: FieldSlot[] = [];
  let cells = 0;
  let i = levels.length - 1;
  while (i >= 0) {
    if (levels[i] > 0 || i === levels.length - 1) {
      slots.push({ kind: 'mark', level: levels[i] });
      cells++;
      i--;
      continue;
    }
    let j = i;
    while (j >= 0 && levels[j] <= 0) j--;
    const run = i - j;
    const toEdge = j < 0;

    const lead = ((rows - (cells % rows)) % rows) + edgeColumns * rows;
    const trail = toEdge ? 0 : edgeColumns * rows;
    const hidden = run - lead - trail;
    const folds = run >= quietCells && (toEdge ? hidden > 0 : hidden > waveColumns * rows);

    if (folds) {
      for (let m = 0; m < lead; m++) slots.push({ kind: 'mark', level: 0 });
      slots.push({ kind: 'quiet', cells: run, toEdge });
      for (let m = 0; m < trail; m++) slots.push({ kind: 'mark', level: 0 });
      cells += lead + trail + waveColumns * rows;
    } else {
      for (let m = 0; m < run; m++) slots.push({ kind: 'mark', level: 0 });
      cells += run;
    }
    i = j;
  }
  return slots;
}

/** Where each piece of a folded field lands, numbered from the bottom-right. */
export type Placed =
  | { kind: 'mark'; level: number; column: number; row: number }
  | { kind: 'quiet'; cells: number; fromColumn: number; toColumn: number };

/**
 * Lay folded slots onto a `columns` × `rows` grid, newest in the bottom-right,
 * up each column and then on to the one on its left. Columns count from the
 * left. Anything that does not fit is dropped; whatever is left over at the
 * left edge is simply not drawn.
 */
export function placeField(
  slots: readonly FieldSlot[],
  columns: number,
  rows: number,
  waveColumns = 3,
): Placed[] {
  const placed: Placed[] = [];
  const capacity = columns * rows;
  let k = 0;
  for (const slot of slots) {
    if (k >= capacity) break;
    if (slot.kind === 'mark') {
      placed.push({
        kind: 'mark',
        level: slot.level,
        column: columns - 1 - Math.floor(k / rows),
        row: rows - 1 - (k % rows),
      });
      k++;
      continue;
    }
    const remaining = columns - Math.floor(k / rows);
    const span = slot.toEdge ? remaining : Math.min(waveColumns, remaining);
    if (span < 2) {
      // No room left for a wave: the last column is the silence's own days.
      while (k < capacity) {
        placed.push({
          kind: 'mark',
          level: 0,
          column: columns - 1 - Math.floor(k / rows),
          row: rows - 1 - (k % rows),
        });
        k++;
      }
      break;
    }
    placed.push({ kind: 'quiet', cells: slot.cells, fromColumn: remaining - span, toColumn: remaining });
    k += span * rows;
  }
  return placed;
}
