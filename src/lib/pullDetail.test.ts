import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parsePatch } from './pullDetail';

test('line numbers are recovered from the hunk headers', () => {
  const patch = [
    '@@ -1,3 +1,4 @@ function main()',
    ' keep',
    '-old',
    '+new',
    '+added',
    ' tail',
    '\\ No newline at end of file',
    '',
  ].join('\n');

  assert.deepEqual(parsePatch(patch), {
    truncated: false,
    lines: [
      { kind: 'meta', text: 'function main()', oldLine: null, newLine: null },
      { kind: 'context', text: 'keep', oldLine: 1, newLine: 1 },
      { kind: 'del', text: 'old', oldLine: 2, newLine: null },
      { kind: 'add', text: 'new', oldLine: null, newLine: 2 },
      { kind: 'add', text: 'added', oldLine: null, newLine: 3 },
      { kind: 'context', text: 'tail', oldLine: 3, newLine: 4 },
    ],
  });
});

test('a hunk header with no function names its line instead', () => {
  const [meta] = parsePatch('@@ -10 +12 @@\n x').lines;
  assert.equal(meta.text, 'line 12');
});

test('a second hunk restarts the count', () => {
  const { lines } = parsePatch('@@ -1 +1 @@\n a\n@@ -40,2 +41,2 @@\n b');
  assert.deepEqual(
    lines.filter((line) => line.kind === 'context').map((line) => [line.oldLine, line.newLine]),
    [
      [1, 1],
      [40, 41],
    ],
  );
});

test('a very long patch is cut and says so', () => {
  const body = Array.from({ length: 5000 }, (_, i) => `+line ${i}`).join('\n');
  const { lines, truncated } = parsePatch(`@@ -0,0 +1,5000 @@\n${body}`);
  assert.equal(truncated, true);
  assert.ok(lines.length < 5000);
});
