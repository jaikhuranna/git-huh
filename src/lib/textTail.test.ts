import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { tailLines } from './textTail';

describe('tailLines', () => {
  it('keeps the last content lines and the errors among them', () => {
    const text = [
      '2026-10-24T12:00:00.0000000Z setup',
      '##[group]hidden',
      '##[endgroup]',
      '',
      '2026-10-24T12:00:01.0000000Z ##[error]boom',
      'Error: no such file',
      'done',
    ].join('\n');

    const result = tailLines(text, { lines: 40, errors: 8 });
    assert.deepEqual(result.tail, ['setup', '##[error]boom', 'Error: no such file', 'done']);
    assert.deepEqual(result.errors, ['boom', 'Error: no such file']);
  });

  it('does not retain lines before the requested window', () => {
    const text = Array.from({ length: 1000 }, (_, index) => `line ${index}`).join('\n');
    const result = tailLines(text, { lines: 3, errors: 1 });
    assert.deepEqual(result.tail, ['line 997', 'line 998', 'line 999']);
    assert.deepEqual(result.errors, []);
  });

  it('stops at the start when the log is shorter than the window', () => {
    assert.deepEqual(tailLines('only\r\n', { lines: 40, errors: 8 }), {
      errors: [],
      tail: ['only'],
    });
  });
});
