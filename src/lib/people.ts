import { z } from 'zod';

import { monthWindow } from './activity';
import { executeQuery } from './github';

/**
 * Who you work with, as review: the people who reviewed your pull requests
 * and the people whose pull requests you reviewed, over the last twelve
 * months. Review is the one place GitHub records two people working on the
 * same thing on purpose, so it is the honest measure of "who I work with" —
 * a shared repository is not, and a follower count is a vanity figure.
 *
 * It is a sample and says so: your last fifty pull requests, and the last
 * hundred of other people's you reviewed.
 */

export interface Person {
  login: string;
  /** Your pull requests they reviewed. */
  reviewedYou: number;
  /** Their pull requests you reviewed. */
  youReviewed: number;
  /** Both, by month, on the shared twelve-month window, oldest first. */
  months: number[];
  /** The most recent review either way. */
  last: string;
}

export interface People {
  people: Person[];
  /** Month initials of the shared window. */
  initials: string[];
  /** How much of each side was read, against how much GitHub says there is. */
  sample: { mine: number; mineTotal: number; theirs: number; theirsTotal: number };
}

const MINE = 50;
const THEIRS = 100;

const QUERY = /* GraphQL */ `
  query People($mine: String!, $theirs: String!, $login: String!) {
    mine: search(type: ISSUE, query: $mine, first: ${MINE}) {
      issueCount
      nodes {
        ... on PullRequest {
          createdAt
          reviews(first: 30) {
            nodes { author { __typename login } submittedAt }
          }
        }
      }
    }
    theirs: search(type: ISSUE, query: $theirs, first: ${THEIRS}) {
      issueCount
      nodes {
        ... on PullRequest {
          createdAt
          author { __typename login }
          reviews(author: $login, first: 1) {
            nodes { submittedAt }
          }
        }
      }
    }
  }
`;

const actorSchema = z.object({ __typename: z.string(), login: z.string() }).nullable();

const mineSchema = z.object({
  createdAt: z.string(),
  reviews: z.object({
    nodes: z.array(z.object({ author: actorSchema, submittedAt: z.string().nullable() })),
  }),
});

const theirsSchema = z.object({
  createdAt: z.string(),
  author: actorSchema,
  reviews: z.object({ nodes: z.array(z.object({ submittedAt: z.string().nullable() })) }),
});

const searchSchema = z.object({ issueCount: z.number().int(), nodes: z.array(z.unknown()) });
const responseSchema = z.object({ mine: searchSchema, theirs: searchSchema });

type Mine = z.infer<typeof mineSchema>;
type Theirs = z.infer<typeof theirsSchema>;

/** A person, not a bot and not you. */
function human(author: z.infer<typeof actorSchema>, me: string): string | null {
  if (!author || author.__typename === 'Bot') return null;
  if (author.login.endsWith('[bot]')) return null;
  if (author.login.toLowerCase() === me) return null;
  return author.login;
}

/**
 * Tally both sides into one list, busiest first. A person counts once per
 * pull request, however many times they reviewed it — five rounds on one
 * change is one change reviewed.
 */
export function tallyPeople(
  mine: readonly Mine[],
  theirs: readonly Theirs[],
  login: string,
  now: Date = new Date(),
): Pick<People, 'people' | 'initials'> {
  const me = login.toLowerCase();
  const window = monthWindow(12, now);
  const slot = new Map(window.map((bar, index) => [bar.key, index]));
  const byLogin = new Map<string, Person>();

  const touch = (name: string, at: string) => {
    const key = name.toLowerCase();
    let person = byLogin.get(key);
    if (!person) {
      person = { login: name, reviewedYou: 0, youReviewed: 0, months: window.map(() => 0), last: at };
      byLogin.set(key, person);
    }
    const index = slot.get(at.slice(0, 7));
    if (index != null) person.months[index]++;
    if (at > person.last) person.last = at;
    return person;
  };

  for (const pr of mine) {
    const seen = new Set<string>();
    for (const review of pr.reviews.nodes) {
      const name = human(review.author, me);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      touch(name, review.submittedAt ?? pr.createdAt).reviewedYou++;
    }
  }

  for (const pr of theirs) {
    const name = human(pr.author, me);
    if (!name) continue;
    touch(name, pr.reviews.nodes[0]?.submittedAt ?? pr.createdAt).youReviewed++;
  }

  const people = [...byLogin.values()].sort(
    (a, b) =>
      b.reviewedYou + b.youReviewed - (a.reviewedYou + a.youReviewed) ||
      b.last.localeCompare(a.last),
  );
  return { people, initials: window.map((bar) => bar.initial) };
}

function yearAgo(now: Date): string {
  const then = new Date(now);
  then.setFullYear(then.getFullYear() - 1);
  return then.toISOString().slice(0, 10);
}

export async function fetchPeople(
  token: string,
  login: string,
  signal?: AbortSignal,
  now: Date = new Date(),
): Promise<People> {
  const since = yearAgo(now);
  const data = await executeQuery(token, QUERY, responseSchema, signal, {
    mine: `is:pr author:${login} created:>=${since} sort:created-desc`,
    theirs: `is:pr reviewed-by:${login} -author:${login} created:>=${since} sort:created-desc`,
    login,
  });
  const mine = data.mine.nodes.flatMap((node) => {
    const parsed = mineSchema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });
  const theirs = data.theirs.nodes.flatMap((node) => {
    const parsed = theirsSchema.safeParse(node);
    return parsed.success ? [parsed.data] : [];
  });
  return {
    ...tallyPeople(mine, theirs, login, now),
    sample: {
      mine: mine.length,
      mineTotal: data.mine.issueCount,
      theirs: theirs.length,
      theirsTotal: data.theirs.issueCount,
    },
  };
}
