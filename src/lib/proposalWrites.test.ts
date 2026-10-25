import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, test } from 'node:test';

import { GitHubError, type Outcome } from './github';
import { installProposalStore, loadProposal, proposalKey, type ProposalProgress } from './proposals';
import { proposeChange, resumeProposal, type Proposal } from './writes';

const TOKEN = 'proposal-write-test';
const ACCOUNT = 'ada';

const proposal: Proposal = {
  repo: 'upstream/app',
  path: 'README.md',
  sha: 'blob-old',
  base: 'main',
  text: 'hello from the phone',
  message: 'say hello\n\nfrom the editor',
  login: 'Ada',
};

function blobSha(text: string): string {
  return createHash('sha1').update(`blob ${Buffer.byteLength(text)}\0${text}`).digest('hex');
}

interface Route {
  method: string;
  path: string;
  body?: unknown;
  init?: RequestInit;
}

type HandlerResult = unknown | Response;

type Handler = (route: Route, init?: RequestInit) => HandlerResult | Promise<HandlerResult>;

class GitHub {
  readonly calls: Route[] = [];
  readonly handlers = new Map<string, Handler>();

  on(method: string, path: string, handler: Handler): void {
    this.handlers.set(`${method} ${path}`, handler);
  }

  handlerFor(route: Route): Handler | undefined {
    const exact = this.handlers.get(`${route.method} ${route.path}`);
    if (exact) return exact;
    const pathname = route.path.split('?')[0] ?? route.path;
    const bare = this.handlers.get(`${route.method} ${pathname}`);
    if (bare) return bare;
    let best: { length: number; handler: Handler } | undefined;
    for (const [key, handler] of this.handlers) {
      const [method, path] = key.split(' ');
      if (method !== route.method || !path) continue;
      const prefix = path.endsWith('/') ? path : `${path}/`;
      if (pathname === path || pathname.startsWith(prefix)) {
        if (!best || path.length > best.length) best = { length: path.length, handler };
      }
    }
    return best?.handler;
  }

  writes(method: string, pathIncludes: string): Route[] {
    return this.calls.filter((call) => call.method === method && call.path.includes(pathIncludes));
  }
}

/**
 * A dispatched write whose body never comes back. The response is real, so
 * REST has entered `fetch`; the body then rejects and the outcome is unknown.
 */
/**
 * A dispatched write whose reply is lost. `fetch` resolves, so REST has
 * entered the request; the body then fails. That is an unknown outcome, not
 * an abort and not "could not reach GitHub".
 */
function lostReply(): Response {
  const body = new ReadableStream({
    pull(controller) {
      controller.error(new TypeError('The connection closed before the reply arrived.'));
    },
  });
  return new Response(body, { status: 201, headers: { 'content-type': 'application/json' } });
}

function githubError(
  status: number,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

let github: GitHub;
let originalFetch: typeof globalThis.fetch;
const held = new Map<string, ProposalProgress>();

function installMemory(): void {
  held.clear();
  installProposalStore({
    async read(key) {
      return held.get(key) ?? null;
    },
    write(key, value) {
      held.set(key, value);
    },
    remove(key) {
      held.delete(key);
    },
  });
}

function routeOf(input: RequestInfo | URL, init?: RequestInit): Route {
  const url = new URL(String(input));
  const path = `${url.pathname}${url.search}`;
  const raw = init?.body == null ? undefined : JSON.parse(String(init.body));
  return { method: init?.method ?? 'GET', path, body: raw, init };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  github = new GitHub();
  installMemory();
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const route = routeOf(input, init);
    github.calls.push(route);
    const handler = github.handlerFor(route);
    if (!handler) {
      throw new Error(`unhandled ${route.method} ${route.path}`);
    }
    const result = await handler(route, init);
    if (result instanceof Response) return result;
    if (result instanceof Error) throw result;
    if (result == null) return new Response(null, { status: 204 });
    return json(result);
  };
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  installMemory();
});

function key(): string {
  return proposalKey(ACCOUNT, proposal.repo, proposal.base, proposal.path, proposal.sha);
}

function happyPath(drop?: 'branch' | 'commit' | 'pull'): void {
  github.on('GET', '/repos/upstream/app/git/ref/heads/main', () => ({
    object: { sha: 'base-sha' },
  }));
  github.on('GET', '/repos/upstream/app/git/matching-refs/heads/ada-patch-', () => []);
  github.on('GET', '/repos/upstream/app/git/ref/heads/', () => githubError(404, 'Not Found'));
  github.on('POST', '/repos/upstream/app/git/refs', () => {
    if (drop === 'branch') return lostReply();
    return { ref: 'refs/heads/ada-patch-1', object: { sha: 'base-sha' } };
  });
  github.on('PUT', '/repos/upstream/app/contents/', () => {
    if (drop === 'commit') return lostReply();
    return { commit: { sha: 'commit-1' }, content: { sha: blobSha(proposal.text) } };
  });
  github.on('POST', '/repos/upstream/app/pulls', () => {
    if (drop === 'pull') return lostReply();
    return { number: 7, html_url: 'https://github.com/upstream/app/pull/7' };
  });
}

describe('proposeChange success and cancellation', () => {
  test('fork is skipped, one branch, one commit and one pull request, then the operation is cleared', async () => {
    happyPath();

    const result = await proposeChange(TOKEN, proposal, { account: ACCOUNT });

    assert.deepEqual(result, { kind: 'pull', repo: 'upstream/app', number: 7 });
    assert.equal(github.writes('POST', '/git/refs').length, 1);
    assert.equal(github.writes('PUT', '/contents/').length, 1);
    assert.equal(github.writes('POST', '/pulls').length, 1);
    assert.equal(github.writes('POST', '/forks').length, 0);
    assert.equal(await loadProposal(key()), null);
  });

  test('cancellation after the branch is created records that step and does not open a pull request', async () => {
    const controller = new AbortController();
    happyPath();
    github.on('POST', '/repos/upstream/app/git/refs', () => {
    controller.abort();
    return { ref: 'refs/heads/ada-patch-1', object: { sha: 'base-sha' } };
  });

    await assert.rejects(
      proposeChange(TOKEN, proposal, { account: ACCOUNT, signal: controller.signal }),
      { name: 'AbortError' },
    );

    const saved = await loadProposal(key());
    assert.ok(saved);
    assert.equal(saved.branch, 'ada-patch-1');
    assert.equal(saved.steps.branch, 'confirmed');
    assert.equal(saved.steps.commit, 'not-started');
    assert.equal(github.writes('POST', '/pulls').length, 0);
  });
});

describe('lost replies are reconciled before another write', () => {
  test('a branch that landed despite a lost reply is found and not created again', async () => {
    happyPath('branch');
    await assert.rejects(proposeChange(TOKEN, proposal, { account: ACCOUNT }), (error: unknown) => {
      assert.ok(error instanceof GitHubError);
      assert.equal(error.outcome, 'unknown');
      return true;
    });
    const afterDrop = await loadProposal(key());
    assert.equal(afterDrop?.steps.branch, 'unknown');
    assert.equal(afterDrop?.branch, 'ada-patch-1');

    github.on('GET', '/repos/upstream/app/git/matching-refs/heads/ada-patch-', () => [
      { ref: 'refs/heads/ada-patch-1', object: { sha: 'base-sha' } },
    ]);
    github.on('POST', '/repos/upstream/app/git/refs', () => {
      throw new Error('a second branch must not be created');
    });
    github.on('PUT', '/repos/upstream/app/contents/README.md', () => ({
      commit: { sha: 'commit-1' },
    }));
    github.on('POST', '/repos/upstream/app/pulls', () => ({ number: 7 }));

    const result = await resumeProposal(TOKEN, proposal, { account: ACCOUNT });
    assert.deepEqual(result, { kind: 'pull', repo: 'upstream/app', number: 7 });
    assert.equal(github.writes('POST', '/git/refs').length, 1);
  });

  test('a committed file is confirmed by blob text and sha, then continued without the old sha', async () => {
    happyPath('commit');
    await assert.rejects(proposeChange(TOKEN, proposal, { account: ACCOUNT }));
    const afterDrop = await loadProposal(key());
    assert.equal(afterDrop?.steps.commit, 'unknown');
    assert.equal(afterDrop?.text, proposal.text);

    const committed = blobSha(proposal.text);
    github.on('GET', '/repos/upstream/app/contents/README.md?ref=ada-patch-1', () => ({
      sha: committed,
      content: Buffer.from(proposal.text, 'utf8').toString('base64'),
      encoding: 'base64',
    }));
    github.on('GET', '/repos/upstream/app/commits?sha=ada-patch-1&path=README.md&per_page=1', () => [
      { sha: 'commit-1' },
    ]);
    github.on('PUT', '/repos/upstream/app/contents/', (route) => {
      const body = route.body as { sha?: string };
      assert.notEqual(body.sha, proposal.sha, 'must not replay the commit against the old blob sha');
      return githubError(409, 'must not replay the commit');
    });
    github.on('POST', '/repos/upstream/app/pulls', () => ({ number: 9 }));

    const result = await resumeProposal(TOKEN, proposal, { account: ACCOUNT });
    assert.deepEqual(result, { kind: 'pull', repo: 'upstream/app', number: 9 });
    assert.equal(github.writes('PUT', '/contents/').length, 1);
    const saved = await loadProposal(key());
    assert.equal(saved, null);
  });

  test('a pull request that already exists for the head and base is returned without posting another', async () => {
    happyPath('pull');
    await assert.rejects(proposeChange(TOKEN, proposal, { account: ACCOUNT }));
    assert.equal((await loadProposal(key()))?.steps.pull, 'unknown');

    github.on('GET', '/repos/upstream/app/pulls', (route) => {
      assert.match(route.path, /head=upstream%3Aada-patch-1/);
      assert.match(route.path, /base=main/);
      return [{ number: 11 }];
    });
    github.on('POST', '/repos/upstream/app/pulls', () => {
      throw new Error('a second pull request must not be posted');
    });

    const result = await resumeProposal(TOKEN, proposal, { account: ACCOUNT });
    assert.deepEqual(result, { kind: 'pull', repo: 'upstream/app', number: 11 });
    assert.equal(github.writes('POST', '/pulls').length, 1);
  });
});

describe('branch collisions are narrow and bounded', () => {
  test('only a reference-already-exists answer tries the next suffix', async () => {
    happyPath();
    let created = 0;
    github.on('POST', '/repos/upstream/app/git/refs', () => {
      created += 1;
      if (created === 1) {
        return githubError(422, 'Reference already exists');
      }
      return { ref: 'refs/heads/ada-patch-2', object: { sha: 'base-sha' } };
    });

    const result = await proposeChange(TOKEN, proposal, { account: ACCOUNT });
    assert.equal(result.kind, 'pull');
    assert.equal(github.writes('POST', '/git/refs').length, 2);
  });

  test('permission, rate-limit, timeout and server failures do not hunt for another name', async () => {
    const stops: { response: Response | Error; kind: GitHubError['kind']; outcome: Outcome }[] = [
      {
        response: githubError(403, 'Resource not accessible by integration'),
        kind: 'forbidden',
        outcome: 'rejected',
      },
      {
        response: githubError(403, 'API rate limit exceeded', { 'x-ratelimit-remaining': '0' }),
        kind: 'api',
        outcome: 'rate-limited',
      },
      {
        response: lostReply(),
        kind: 'network',
        outcome: 'unknown',
      },
      {
        response: githubError(500, 'Server Error'),
        kind: 'api',
        outcome: 'rejected',
      },
    ];
    for (const failure of stops) {
      github.calls.length = 0;
      held.clear();
      happyPath();
      github.on('POST', '/repos/upstream/app/git/refs', () => {
        if (failure.response instanceof Error) throw failure.response;
        return failure.response.clone();
      });
      await assert.rejects(proposeChange(TOKEN, proposal, { account: ACCOUNT }), (error: unknown) => {
        assert.ok(error instanceof GitHubError);
        assert.equal(error.kind, failure.kind);
        assert.equal(error.outcome, failure.outcome);
        return true;
      });
      assert.equal(github.writes('POST', '/git/refs').length, 1, failure.kind);
    }
  });

  test('ten creators sharing taken names stay inside the retry ceiling', async () => {
    const taken = new Set<string>();
    const posts: string[] = [];
    happyPath();
    github.on('GET', '/repos/upstream/app/git/matching-refs/heads/ada-patch-', () =>
      [...taken].map((name) => ({ ref: `refs/heads/${name}`, object: { sha: 'base-sha' } })),
    );
    github.on('POST', '/repos/upstream/app/git/refs', (route) => {
      const ref = (route.body as { ref: string }).ref;
      posts.push(ref);
      const name = ref.replace('refs/heads/', '');
      if (taken.has(name)) return githubError(422, 'Reference already exists');
      taken.add(name);
      return { ref, object: { sha: 'base-sha' } };
    });

    const results = [];
    for (let index = 0; index < 10; index += 1) {
      results.push(await proposeChange(
        TOKEN,
        { ...proposal, path: `notes/file-${index}.md`, sha: `blob-${index}` },
        { account: `${ACCOUNT}-${index}` },
      ));
    }
    assert.equal(results.length, 10);
    assert.ok(posts.length <= 10 * 6, `unbounded branch posts: ${posts.length}`);
    const unique = new Set(posts.filter((ref) => taken.has(ref.replace('refs/heads/', ''))));
    assert.equal(unique.size, taken.size);
  });
});
