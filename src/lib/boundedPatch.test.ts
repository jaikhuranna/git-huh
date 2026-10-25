import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { pageWindow, scanPatch } from './boundedPatch';

describe('scanPatch', () => {
  it('recovers line numbers from hunk headers without a trailing blank row', () => {
    const patch = ['@@ -10,2 +10,3 @@ parse', ' context', '-old', '+new', '+also', ' tail', ''].join('\n');
    const result = scanPatch(patch, 20);
    assert.equal(result.truncated, false);
    assert.deepEqual(
      result.lines.map((line) => [line.kind, line.oldLine, line.newLine, line.text]),
      [
        ['meta', null, null, 'parse'],
        ['context', 10, 10, 'context'],
        ['del', 11, null, 'old'],
        ['add', null, 11, 'new'],
        ['add', null, 12, 'also'],
        ['context', 12, 13, 'tail'],
      ],
    );
  });

  it('stops at the retained cap without needing the rest of the patch as rows', () => {
    const body = ['@@ -1,400 +1,400 @@ fn'];
    for (let index = 0; index < 400; index += 1) body.push(` line ${index}`);
    const result = scanPatch(body.join('\n'), 3);
    assert.equal(result.truncated, true);
    assert.equal(result.lines.length, 3);
    assert.equal(result.lines[2].text, 'line 1');
  });

  it('skips the no-newline marker', () => {
    const result = scanPatch('@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n', 10);
    assert.deepEqual(
      result.lines.map((line) => line.kind),
      ['meta', 'del', 'add'],
    );
  });
});

describe('pageWindow', () => {
  it('grows by a page and then reports nothing left', () => {
    assert.deepEqual(pageWindow(100, 40, 40), { visible: 40, remaining: 60 });
    assert.deepEqual(pageWindow(100, 40, 80), { visible: 80, remaining: 20 });
    assert.deepEqual(pageWindow(100, 40, 200), { visible: 100, remaining: 0 });
  });
});
