import assert from 'node:assert/strict';
import { test } from 'node:test';

import { foldField, howLong, placeField, quietRuns, weekOfYear, wavePath } from './quiet';

test('only runs at least as long as the minimum are silences', () => {
  assert.deepEqual(quietRuns([1, 0, 0, 1, 0, 0, 0, 0, 2], 3), [{ start: 4, end: 7 }]);
  assert.deepEqual(quietRuns([0, 0, 0, 0], 4), [{ start: 0, end: 3 }]);
  assert.deepEqual(quietRuns([1, 2, 3], 1), []);
});

test('the part of a year that has not happened is never a silence', () => {
  // Weeks 3.. are the future: zero, but not quiet.
  assert.deepEqual(quietRuns([5, 0, 1, 0, 0, 0, 0], 3, 3), []);
  assert.deepEqual(quietRuns([0, 0, 0, 0, 1, 0, 0, 0], 3, 5), [{ start: 0, end: 3 }]);
});

test('lengths read the way the widget writes them', () => {
  assert.equal(howLong(21), '3 wk');
  assert.equal(howLong(90), '3 mo');
  assert.equal(howLong(400), '1 yr');
});

test('a week column counts from the Sunday before new year', () => {
  // 2026-01-01 is a Thursday: the 1st and the 3rd share week 0, the 4th starts week 1.
  assert.equal(weekOfYear(new Date(2026, 0, 1)), 0);
  assert.equal(weekOfYear(new Date(2026, 0, 3)), 0);
  assert.equal(weekOfYear(new Date(2026, 0, 4)), 1);
});

test('a wave path starts and ends where it is told', () => {
  const d = wavePath(10, 50, 20);
  assert.ok(d.startsWith('M10.0 20.0'));
  assert.ok(d.includes('L50.0'));
  assert.equal(wavePath(5, 5, 0), '');
});

test('a long silence folds into a wave with a column of empty days either side', () => {
  const rows = 7;
  // 14 busy days, 70 quiet ones, 14 busy ones ending today.
  const levels = [...Array(14).fill(2), ...Array(70).fill(0), ...Array(14).fill(3)];
  const slots = foldField(levels, rows, { quietCells: 21 });
  const quiet = slots.filter((slot) => slot.kind === 'quiet');
  assert.equal(quiet.length, 1);
  assert.deepEqual(quiet[0], { kind: 'quiet', cells: 70, toEdge: false });
  // 14 marks + a column of empties before the wave, a column after it.
  const before = slots.findIndex((slot) => slot.kind === 'quiet');
  assert.equal(before, 14 + rows);
  assert.equal(slots.length - before - 1, rows + 14);
});

test('a short silence stays as empty days', () => {
  const levels = [1, ...Array(20).fill(0), 1];
  assert.ok(foldField(levels, 7, { quietCells: 21 }).every((slot) => slot.kind === 'mark'));
});

test('today is always a mark, even when it is empty', () => {
  const slots = foldField([1, ...Array(60).fill(0)], 7, { quietCells: 21 });
  assert.deepEqual(slots[0], { kind: 'mark', level: 0 });
});

test('placed fields put today in the bottom-right and the wave across whole columns', () => {
  const levels = [...Array(14).fill(2), ...Array(70).fill(0), ...Array(14).fill(3)];
  const placed = placeField(foldField(levels, 7, { quietCells: 21 }), 12, 7);
  assert.deepEqual(placed[0], { kind: 'mark', level: 3, column: 11, row: 6 });
  const wave = placed.find((piece) => piece.kind === 'quiet');
  assert.ok(wave && wave.kind === 'quiet');
  assert.equal(wave.toColumn - wave.fromColumn, 3);
});

test('a coarse field folds a six-week silence without edge columns', () => {
  // Two days a cell: 22 quiet cells between busy ones.
  const levels = [...Array(20).fill(2), ...Array(22).fill(0), ...Array(7).fill(1)];
  assert.ok(foldField(levels, 7, { quietCells: 11 }).every((slot) => slot.kind === 'mark'));
  const folded = foldField(levels, 7, { quietCells: 11, waveColumns: 2, edgeColumns: 0 });
  assert.equal(folded.filter((slot) => slot.kind === 'quiet').length, 1);
});
