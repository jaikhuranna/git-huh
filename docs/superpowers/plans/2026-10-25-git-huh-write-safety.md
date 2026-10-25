# Write Safety and Proposal Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every GitHub write reports what is known and lets the user safely reconcile a dispatched write whose reply was lost.

**Architecture:** Keep transport classification in `github.ts` and `rest.ts`; expose a dedicated GraphQL mutation entry so callers cannot omit mutation intent. Move the resumable fork/branch/commit/PR protocol out of the broad write facade into a focused proposal-write module, with durable operation state and a remote reconciliation step before repeating uncertain actions.

**Tech Stack:** TypeScript, Zod, GitHub GraphQL/REST, `src/lib/store.ts`, existing Bun test runner.

**Spec:** `docs/superpowers/specs/2026-10-25-git-huh-performance-reliability-spec.md`

## Global Constraints

- Preserve the existing five-section navigation and feature behavior.
- Keep `package-lock.json` tracked; ignore `bun.lock`; do not change package manager.
- Never retry a write with unknown outcome until remote state is reconciled.
- Preserve file SHA/revision preconditions and captured draft context.
- Cache keys must isolate account, host, credential generation, representation, and resource identity.
- User-authored drafts/settings are not LRU cache entries and must not be silently dropped.
- Keep response/list/history/cache/bitmap budgets explicit and test their limits.
- Do not claim a performance gain without baseline and post-change measurements on release builds.
- Dynamic imports may be used for web bundle splitting; native production bundle splitting is not supported by current Expo Router guidance. Measure native module-evaluation behavior before retaining added complexity.

---

### Task 1: Add one GraphQL mutation transport entry

**Files:**
- Modify: `src/lib/github.ts`
- Modify: `src/lib/writes.ts`
- Modify: `src/lib/github.test.ts` or create a focused transport test file

**Interface produced:**
```ts
export function executeMutation<T>(
  token: string,
  mutation: string,
  schema: z.ZodType<T>,
  variables: Record<string, unknown>,
  options?: Omit<QueryOptions, 'mutation' | 'variables'>,
): Promise<T>;
```

- [x] **Step 1: Write failing public transport tests.** Mock `fetch` so a mutation is dispatched then rejects; expect `GitHubError.kind === 'network'` and `outcome === 'unknown'`. Mock a pre-aborted caller signal and expect an abort, not an unknown write.
- [x] **Step 2: Run `bun test -- src/lib/github.test.ts`.** Expected: tests fail because no canonical mutation entry is exported and write call sites default to query behavior.
- [x] **Step 3: Implement `executeMutation` by calling the shared transport with `{ mutation: true, variables, ...options }`.** Keep query calls on `executeQuery`. Replace all mutation `executeQuery` calls in `writes.ts`: comments, reviews, discussion comments, generic `mutate`, and discussion creation.
- [x] **Step 4: Search for missed mutation operations.** Run `rg -n 'executeQuery\(' src/lib`; inspect each SQL-like GraphQL string beginning `mutation`. Add a test asserting all current write helpers hit the mutation transport with `mutation: true`.
- [x] **Step 5: Run focused tests and typecheck; commit.** `git add src/lib/github.ts src/lib/writes.ts src/lib/github.test.ts && git commit -m "fix: classify GraphQL mutation outcomes"`

### Task 2: Classify dispatched REST failures without claiming certainty

**Files:**
- Modify: `src/lib/rest.ts`
- Modify: existing REST transport tests
- Modify: write status copy/adapters only if the current message contradicts the outcome model

- [x] **Step 1: Add failing cases for dispatched timeout, network reset, explicit 4xx rejection, 5xx response, and user cancellation.** Assert no retry occurs in the transport.
- [x] **Step 2: Run the REST transport tests.** Expected: existing tests do not cover a 5xx after dispatch or body-read timeout classification.
- [x] **Step 3: Preserve status and certainty separately.** A received 4xx may be a confirmed rejection; a network reset/timeout after dispatch is unknown. Treat 5xx as unknown unless the endpoint's documented semantics prove rejection. Do not relabel a response merely because `kind === 'api'`.
- [x] **Step 4: Verify the UI preserves drafts and offers “check status” for unknown, and that only confirmed-unsent failures say “not sent.”** Run tests and typecheck.
- [x] **Step 5: Commit.** `git add src/lib/rest.ts src/lib && git commit -m "fix: preserve uncertainty for dispatched writes"`

### Task 3: Move proposal protocol out of `writes.ts`

**Files:**
- Create: `src/lib/proposalWrites.ts`
- Modify: `src/lib/writes.ts`
- Modify: `src/lib/proposals.ts`
- Modify: `src/lib/proposals.test.ts` and/or create `src/lib/proposalWrites.test.ts`
- Modify: `src/lib/proposalsStore.ts` and `index.js` only if the storage contract needs migration

- [x] **Step 1: Add failing tests for the existing success path and every resume point.** Assert fork/branch/commit/PR success yields one final PR and clears operation state. Assert cancellation leaves completed remote steps recorded.
- [x] **Step 2: Run focused proposal tests.** Expected: current tests cover naming/state helpers, not the GitHub workflow’s uncertain outcomes.
- [x] **Step 3: Extract orchestration.** Keep `writes.ts` as the public write facade and have its exported `proposeChange`/`resumeProposal` functions delegate to `proposalWrites.ts`. Move protocol-only helpers (`baseOf`, `branchAt`, `forkOf`, polling sleep, step progress) without changing unrelated comment/reaction/repo writes.
- [x] **Step 4: Ensure `src/lib/writes.ts` is below 1,000 lines.** Run `wc -l src/lib/writes.ts src/lib/proposalWrites.ts`; reject the decomposition if it only moves code while preserving a tangled shared protocol.
- [x] **Step 5: Run proposal tests and typecheck; commit.** `git add src/lib/writes.ts src/lib/proposalWrites.ts src/lib/proposals.ts src/lib/proposals.test.ts src/lib/proposalsStore.ts index.js && git commit -m "refactor: isolate resumable file proposals"`

### Task 4: Reconcile unknown branch, commit, and PR creation before retry

**Files:**
- Modify: `src/lib/proposalWrites.ts`
- Modify: `src/lib/proposals.ts`
- Modify: `src/lib/proposalWrites.test.ts`
- Modify: `src/lib/writes.ts` only for returned operation result types

**State rule:** Persist an operation identity and immutable captured proposal before dispatch. Store per-step states `not-started`, `in-flight`, `unknown`, and `confirmed`, with returned branch/commit/PR IDs where known. An unknown state must issue a read/reconciliation before any new write.

- [x] **Step 1: Add lost-reply tests for branch creation.** Simulate branch creation applying remotely then throwing; on retry, matching-refs must identify the operation branch and must not create a second branch.
- [x] **Step 2: Add lost-reply tests for the file commit.** Simulate PUT applying new content then dropping the response; retry reads the branch file/blob, confirms the captured text and commit SHA, and proceeds without replaying with the old SHA.
- [x] **Step 3: Add lost-reply tests for PR creation.** Simulate POST creating the PR then dropping response; retry searches for the matching head/base operation and returns its PR number without POSTing another PR.
- [x] **Step 4: Persist intent before each dispatched write and reconcile by deterministic branch/head/base plus captured blob content/hash.** Never infer success from a timeout alone. Keep draft text in the existing protected app storage policy; surface write-state persistence failure instead of silently promising restart recovery.
- [x] **Step 5: Run the three targeted suites plus full `bun test`, typecheck, and lint; commit.** `git add src/lib/proposalWrites.ts src/lib/proposals.ts src/lib/proposalWrites.test.ts src/lib/writes.ts && git commit -m "fix: reconcile uncertain proposal writes"`

### Task 5: Make branch-collision retries narrow and bounded

**Files:**
- Modify: `src/lib/proposalWrites.ts`
- Modify: `src/lib/branchName.ts` and `src/lib/branchName.test.ts`
- Modify: `src/lib/proposalWrites.test.ts`

- [x] **Step 1: Add tests that a genuine existing-ref collision tries a new suffix, while permission, rate-limit, timeout, and server failures stop and surface their actual outcome.**
- [x] **Step 2: Run branch/proposal tests; expected current code treats every `GitHubError.kind === 'api'` as a collision.**
- [x] **Step 3: Classify ref-exists narrowly using structured REST status/error data.** Do not catch all `api` errors as name collisions; keep a fixed retry ceiling and use the deterministic operation branch for reconciliation.
- [x] **Step 4: Verify ten simultaneous fake creators converge without unlimited GET/POST attempts; run targeted tests and typecheck.**
- [x] **Step 5: Commit.** `git add src/lib/proposalWrites.ts src/lib/branchName.ts src/lib/branchName.test.ts src/lib/proposalWrites.test.ts && git commit -m "fix: bound proposal branch collision retries"`

### Task 6: Centralize mutation effects and validate parent views

**Files:**
- Modify: `src/hooks/usePullDetail.ts`
- Modify: data hooks for PR/work/repository listings affected by writes
- Modify: mutation screens/callbacks such as `PullScreen.tsx`, `RepoTabs.tsx`, and `FileScreen.tsx`
- Add: focused mutation-effect tests

- [ ] **Step 1: Write tests mapping each mutation category to affected resources.** Cases: comment/review/reaction, labels/assignees/state, merge/deploy, file edit/delete, repo star/fork. Assert unrelated sections are not invalidated.
- [ ] **Step 2: Run tests and inspect each existing callback’s `afterMutation` behavior.**
- [ ] **Step 3: Define one typed effect map in the canonical mutation owner.** Keep confirmed server state authoritative; optimistically patch only fields with deterministic server semantics. Invalidate only related list/detail keys after confirmed success; reconcile unknown outcomes first.
- [ ] **Step 4: Test a hidden parent list after a child write and verify it refreshes once, while PR file mutation does not refetch unrelated conversation/reactions.**
- [ ] **Step 5: Run targeted tests, typecheck, lint; commit.** `git add src/hooks src/screens src/lib && git commit -m "fix: refresh only mutation-affected resources"`

## Verification

Run `bun run typecheck`, `bun run lint`, and `bun test`. Test write outcomes with controlled fake fetch; do not attempt real mutations against a user account as a verification shortcut. Preserve the existing PR and SHA precondition protections.

## Status (2026-10-25)

Tasks 1–5 are implemented and committed on `perf/audit-fixes`
(`0b92f8c` mutation classification, `9a434bc` deadlines, `29c4e4c` proposal
extraction + reconciliation, `caec5af` collision tests). The one GraphQL
mutation entry, REST outcome classification, the extracted `proposalWrites.ts`
protocol, lost-reply reconciliation at branch/commit/pull, and the narrow
branch-collision retry are covered by `github.test.ts`,
`transportBudget.test.ts`, `proposalWrites.test.ts` and `branchName.test.ts`.

Task 6 is not complete. A typed `PullMutation` → `PullSection` effect map exists
in `usePullDetail.ts`, but the per-category mapping tests and the
hidden-parent-list refresh check were not added, so the remaining parents still
rely on explicit effects rather than one validated map.

All of this is TypeScript/Node evidence. No real mutation was sent against an
account, and no device build was run.
