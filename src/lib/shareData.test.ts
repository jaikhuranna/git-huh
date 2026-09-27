import assert from 'node:assert/strict';
import { test } from 'node:test';

import { compact, percent, recentYears, shareKindOf, splitOf, topLanguages } from './shareData';

test('charts share, lists do not', () => {
  assert.equal(shareKindOf('poster'), 'weeks');
  assert.equal(shareKindOf('hey'), 'year');
  assert.equal(shareKindOf('inbox'), null);
  assert.equal(shareKindOf('index'), null);
});

test('languages past the cap fold into other, and the shares add to one', () => {
  const languages = ['a', 'b', 'c', 'd'].map((name, index) => ({
    name,
    color: '#000',
    bytes: 10 - index,
    share: 0,
  }));
  const slices = topLanguages(languages, 2, '#999');
  assert.deepEqual(
    slices.map((slice) => slice.label),
    ['a', 'b', 'other'],
  );
  const total = slices.reduce((sum, slice) => sum + slice.share, 0);
  assert.ok(Math.abs(total - 1) < 1e-9);
  assert.deepEqual(topLanguages([], 6, '#999'), []);
});

test('the split leaves out what is zero and puts the biggest first', () => {
  const palette = { commits: 'b', pullRequests: 'p', issues: 'y', reviews: 'g', private: 'k' };
  const slices = splitOf({ commits: 5, pullRequests: 0, issues: 1, reviews: 9, private: 0 }, palette);
  assert.deepEqual(
    slices.map((slice) => slice.label),
    ['reviews', 'commits', 'issues'],
  );
  assert.deepEqual(splitOf({ commits: 0, pullRequests: 0, issues: 0, reviews: 0, private: 0 }, palette), []);
});

test('years are the latest few, oldest first', () => {
  const year = (value: number) => ({
    year: value,
    total: 1,
    months: [],
    weeks: [],
    weekMonths: [],
    beforeToday: 0,
    afterToday: 0,
  });
  assert.deepEqual(
    recentYears([year(2024), year(2019), year(2026), year(2025)], 3).map((entry) => entry.year),
    [2024, 2025, 2026],
  );
});

test('figures stay short enough for the frame', () => {
  assert.equal(compact(9876), '9,876');
  assert.equal(compact(12_345), '12.3k');
  assert.equal(compact(123_456), '123k');
  assert.equal(compact(2_345_678), '2.3m');
  assert.equal(percent(0.004), '<1%');
  assert.equal(percent(0.456), '46%');
});
