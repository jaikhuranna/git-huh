import assert from 'node:assert/strict';
import { test } from 'node:test';

import { tallyPeople } from './people';

const user = (login: string) => ({ __typename: 'User', login });

test('both sides are tallied once per pull request, without bots or yourself', () => {
  const now = new Date(2026, 8, 29);
  const { people, initials } = tallyPeople(
    [
      {
        createdAt: '2026-09-01T00:00:00Z',
        reviews: {
          nodes: [
            { author: user('Ana'), submittedAt: '2026-09-02T00:00:00Z' },
            { author: user('ana'), submittedAt: '2026-09-03T00:00:00Z' },
            { author: user('me'), submittedAt: '2026-09-03T00:00:00Z' },
            { author: { __typename: 'Bot', login: 'copilot' }, submittedAt: '2026-09-03T00:00:00Z' },
            { author: user('dependabot[bot]'), submittedAt: '2026-09-03T00:00:00Z' },
          ],
        },
      },
    ],
    [
      { createdAt: '2026-06-01T00:00:00Z', author: user('ana'), reviews: { nodes: [{ submittedAt: '2026-06-04T00:00:00Z' }] } },
      { createdAt: '2026-07-01T00:00:00Z', author: user('bo'), reviews: { nodes: [] } },
    ],
    'Me',
    now,
  );
  assert.equal(initials.length, 12);
  assert.deepEqual(
    people.map((person) => [person.login, person.reviewedYou, person.youReviewed]),
    [
      ['Ana', 1, 1],
      ['bo', 0, 1],
    ],
  );
  const ana = people[0];
  assert.equal(ana.months[11], 1); // september, this month
  assert.equal(ana.months[8], 1); // june
  assert.equal(ana.last, '2026-09-02T00:00:00Z');
});
