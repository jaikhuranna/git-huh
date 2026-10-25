# Shared Read Registry and Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every `useRemote` subscriber observe data changes and make request ownership, invalidation, cancellation, and freshness deterministic.

**Architecture:** Keep one resource registry as the deep module behind `useRemote`. Its interface returns a cached immutable snapshot and subscribe/refresh/invalidate operations; it owns the mutable entry, promise, abort controller, and generation. Keep React hook concerns in `useRemote.ts`, transport/body deadline concerns in `rest.ts` and `github.ts`, and disk persistence behind `store.ts`.

**Tech Stack:** TypeScript, React `useSyncExternalStore`, Expo FileSystem, existing Bun/Node test setup.

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

### Task 1: Extract the observable resource state and prove snapshot identity

**Files:**
- Create: `src/lib/resourceStore.ts`
- Create: `src/lib/resourceStore.test.ts`
- Modify: `src/hooks/useRemote.ts`

**Interface produced:**
- `getResourceSnapshot<T>(key): ResourceSnapshot<T>` returns the exact cached immutable snapshot object until the resource changes.
- `subscribeResource(key, listener): () => void` registers one listener.
- Internal `publishResource(key, nextFields)` installs a new snapshot object before notifying listeners.

- [x] **Step 1: Write a failing identity/publication test.** Create a resource, retain its initial snapshot, subscribe, publish a value, and assert the listener fires once, the next snapshot is a different object, and a second read without mutation returns that same new object.
- [x] **Step 2: Run `bun test -- src/lib/resourceStore.test.ts`.** Expected: FAIL because the store module and immutable snapshot do not exist.
- [x] **Step 3: Implement the smallest pure store.** Keep mutable lifecycle data private; expose `{ value, error, loading, refreshing, savedAt, freshAt, version }` as a readonly snapshot. Increment `version` and replace the snapshot before notifying. Do not create a new object inside `getResourceSnapshot`.
- [x] **Step 4: Run the targeted test and `bun run typecheck`.** Expected: identity contract passes and public types compile.
- [x] **Step 5: Commit.** `git add src/lib/resourceStore.ts src/lib/resourceStore.test.ts src/hooks/useRemote.ts && git commit -m "fix: publish observable resource snapshots"`

### Task 2: Make in-flight work cancellable and invalidation atomic

**Files:**
- Modify: `src/lib/resourceStore.ts`
- Modify: `src/lib/resourceStore.test.ts`
- Modify: `src/hooks/useRemote.ts`
- Modify: `src/hooks/usePullDetail.ts`

- [x] **Step 1: Add failing race tests.** Cover (a) invalidate while a request is pending, (b) a newer request resolving before an older request, (c) refresh aborting its old request, and (d) last subscriber leaving then a request resolving.
- [x] **Step 2: Run `bun test -- src/lib/resourceStore.test.ts`.** Expected: the stale flight is currently reused or its signal is not aborted.
- [x] **Step 3: Store `flight`, `AbortController`, and `generation` together.** `invalidateResource` and `refreshResource` must abort the previous controller, clear flight ownership, increment generation, publish once, then allow the active hook to start one replacement request. A completion may write/publish only when both resource key and generation still match.
- [x] **Step 4: Add a test where an invalidated old promise settles after the new promise.** Assert the old value cannot overwrite the new value and cannot leave `flight` set.
- [x] **Step 5: Run targeted tests and typecheck; commit.** `git add src/lib/resourceStore.ts src/lib/resourceStore.test.ts src/hooks/useRemote.ts src/hooks/usePullDetail.ts && git commit -m "fix: make resource invalidation atomic"`

### Task 3: Race disk hydration safely with the first network read

**Files:**
- Modify: `src/lib/resourceStore.test.ts`
- Modify: `src/hooks/useRemote.ts`
- Modify: `src/lib/store.ts` only if a read API change is required.

- [x] **Step 1: Add failing deferred tests.** Case A: disk answer resolves before network; UI snapshot shows stale disk then fresh network. Case B: network resolves before disk; late disk cannot replace it. Case C: corrupt/invalid cached shape is discarded while network success remains visible.
- [x] **Step 2: Run the targeted test and record the failing assertion.** Expected: the test harness exposes an old disk value replacing or racing the current resource.
- [x] **Step 3: Add a cache-read generation token to hydration.** Install disk data only if the key, generation, and empty-value state are unchanged. Validate once at hydration; do not validate on every render.
- [ ] **Step 4: Audit every durable cache record's inner schema/version.** Add validators for persisted shapes that currently rely only on envelope validation; reject or migrate invalid entries without hiding valid network data.
- [x] **Step 5: Re-run targeted tests, `bun run typecheck`, and `bun run lint`.** Expected: network and disk order no longer changes the final snapshot, and all durable payloads have an explicit validation or migration policy.
- [x] **Step 6: Commit.** `git add src/lib/resourceStore.test.ts src/hooks/useRemote.ts src/lib/store.ts && git commit -m "fix: prevent stale cache hydration races"`

### Task 4: Keep the request deadline active through bounded body reads

**Files:**
- Modify: `src/lib/requestBudget.ts`
- Modify: `src/lib/rest.ts`
- Modify: `src/lib/github.ts`
- Create or modify: `src/lib/requestBudget.test.ts`
- Create or modify: transport tests under `src/lib/`

- [x] **Step 1: Add a stalled-body test.** Use a `ReadableStream` response that resolves headers immediately and never closes; assert a read rejects on its timeout and the reader is cancelled.
- [x] **Step 2: Run the targeted test.** Expected: current code hangs because `deadline.dispose()` runs before `readBounded`.
- [x] **Step 3: Move deadline disposal around the full lifecycle.** Keep caller abort distinct from deadline expiry while reading and parsing; ensure `readBounded` cancels on byte overflow, abort, and timeout. Count UTF-8 bytes in the no-reader fallback instead of UTF-16 code units.
- [x] **Step 4: Test timeout during headers, timeout during body, user cancellation, byte cap, line cap, and 204.** Run the focused tests plus `bun run typecheck`.
- [x] **Step 5: Commit.** `git add src/lib/requestBudget.ts src/lib/rest.ts src/lib/github.ts src/lib/requestBudget.test.ts src/lib && git commit -m "fix: enforce deadlines through response bodies"`

### Task 5: Make background request priority real

**Files:**
- Modify: `src/lib/github.ts`
- Modify: `src/lib/rest.ts`
- Modify: `src/lib/rateLimit.ts`
- Modify: `src/hooks/useTogether.ts`, `src/hooks/useActivity.ts`, and any background poll caller
- Modify: `src/lib/rateLimit.test.ts`

- [x] **Step 1: Add failing transport tests.** Seed a cooldown; assert an interactive read proceeds, a background read is deferred/rejected before `fetch`, and expiry permits the background request.
- [x] **Step 2: Run `bun test -- src/lib/rateLimit.test.ts`.** Expected: no production call currently reaches `maySend` as background.
- [x] **Step 3: Thread an explicit priority through read options.** Mark passive refresh, secondary-account refresh, notifications, and host/background polling as background; leave user-triggered detail/retry actions interactive. Do not globally relabel reads without reviewing caller intent.
- [x] **Step 4: Run focused rate-limit tests and `bun run typecheck`.** Expected: no background `fetch` is dispatched during cooldown; interactive user action remains available with a truthful error state.
- [x] **Step 5: Commit.** `git add src/lib/github.ts src/lib/rest.ts src/lib/rateLimit.ts src/lib/rateLimit.test.ts src/hooks && git commit -m "feat: prioritize interactive GitHub reads"`

### Task 6: Add explicit freshness and foreground revalidation

**Files:**
- Modify: `src/hooks/useRemote.ts`
- Modify: `src/lib/polling.ts` or add a focused foreground helper if existing API cannot express resume
- Modify: `src/hooks/useSocial.ts`, `useOpenPrs.ts`, `useQueue.ts`, `useTasks.ts`, `usePeople.ts`, `useActivity.ts`, `useHost.ts`
- Add: freshness/resource-policy tests

- [x] **Step 1: Write policy tests for fresh, stale, offline, forbidden, and foreground-resume cases.** Use a fake clock; assert one fresh cache hit avoids a read and an expired entry starts exactly one revalidation while preserving the last good value.
- [x] **Step 2: Run the focused freshness tests.** Expected: active resources currently remain fresh indefinitely because no caller supplies `staleAfterMs`.
- [x] **Step 3: Define named freshness by resource domain.** Use constants near domain hooks (for example inbox, work queue, profile, and PR detail); separate stable resource identity from `enabled`/focused state. On app foreground, refresh only expired or explicitly invalidated resources. Do not poll hidden screens.
- [x] **Step 4: Test quick tab switch, long background, rate limit, revoked token, and manual refresh.** Assert age and failure state remain visible with stale content only where policy allows.
- [x] **Step 5: Run all read tests, typecheck, lint; commit.** `git add src/hooks src/lib && git commit -m "feat: define resource freshness policies"`

## Verification

Run after the workstream: `bun run typecheck`, `bun run lint`, and `bun test`. These verify TypeScript, lint, and current public/pure test seams; they do not prove native frame time or memory. Use the release measurement plan for those claims.

## Status (2026-10-25)

Tasks 1–6 are implemented and committed on `perf/audit-fixes` (`66d03e2`
immutable snapshots, `f95a5dc` atomic invalidation, `26d7597` hydration races,
`9a434bc` body deadlines, `c97a046` background priority, `0513854` freshness
policies). `resourceStore.test.ts` and the transport tests cover snapshot
identity, generation-guarded completion, invalidation during a flight, and
stalled-body timeouts.

Task 3 Step 4 is the one open step: the inner schema/version of every durable
cache payload is not yet audited and validated beyond the envelope, so the
box stays unchecked. No native frame-time or memory claim is made here.
