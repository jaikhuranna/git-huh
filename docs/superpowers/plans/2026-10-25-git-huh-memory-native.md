# Disk, Payload, and Native Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound retained memory, persisted cache, and file-processing work while keeping drafts and visible content safe.

**Architecture:** Keep cache eviction, protected user data, file decoding, host polling, and widget bitmap ownership in their existing domain modules. Make every limit byte-based and observable. Measure before changing host protocols or cache strategies.

**Tech Stack:** TypeScript, Expo FileSystem, React Native/Hermes, Android Kotlin/Glance, Bun test runner.

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

### Task 1: Bound all resource-store bookkeeping and migrate legacy cache entries

**Files:** `src/lib/store.ts`, `src/lib/resourceStore.ts`, store tests, resource-store tests.

- [ ] Measure persisted cache bytes and counts in a fixture containing indexed entries, legacy unindexed entries, corrupt files, and protected drafts.
- [ ] Add tests showing legacy cache files are included in the budget and only cache records are evicted; settings/proposals/drafts remain intact.
- [ ] Implement a versioned one-time index migration or safe bounded scan. Define behavior for interrupted migration and corrupt index recovery; do not delete files until replacement index is durably written.
- [ ] Bound in-memory maps for queue tails, generations, and last-written markers. Remove metadata when a resource is deleted/evicted and ensure queued writes cannot resurrect it.
- [ ] Surface persistence errors for user-authored state. Cache persistence may degrade to memory-only with diagnostics, but must not silently report durable success.
- [ ] Run store tests plus typecheck; commit `fix: bound cache index and store metadata`.

### Task 2: Validate cache identity and account separation

**Files:** cache-key helpers and call sites under `src/lib/`, storage tests.

- [ ] Inventory key construction and prove all dimensions are present: account identity, host, credential generation, representation, and resource ID.
- [ ] Add collision and account-switch tests for model/pull/file resources. In particular test the current short token-derived key against collision risk without logging or persisting raw credentials.
- [ ] Replace weak token-derived identity with a stable opaque per-account generation identifier or a suitably collision-resistant keyed digest; document rotation and migration semantics.
- [ ] Confirm cache invalidation on credential replacement/removal and custom-host change.
- [ ] Run targeted tests and typecheck; commit `fix: strengthen persisted resource identity`.

### Task 3: Enforce payload, file, diff, and line budgets end to end

**Files:** `src/lib/rest.ts`, `src/lib/github.ts`, `src/lib/requestBudget.ts`, `src/screens/FileScreen.tsx`, `src/lib/diff.ts`, markdown/file helpers and focused tests.

- [ ] Profile allocations for a large text file and binary/base64 response: raw response, decoded string, split lines, rendered rows, and patch representation. Record which copies dominate.
- [ ] Add tests at and beyond byte, line, and patch limits, including multibyte UTF-8 text and a no-stream response fallback.
- [ ] Pass bounded payloads/metadata through the file pipeline; avoid retaining raw base64, full strings, line arrays, and rendered copies simultaneously where a streaming or line-window seam exists.
- [ ] Verify file search covers the intended columns/lines and clearly signals truncated search. Keep the debounce and avoid indexing every opened file unless profiling justifies it.
- [ ] Preserve patch context and file SHA preconditions; verify large-file edits cannot bypass the existing safety checks.
- [ ] Run file/diff/transport tests, typecheck, lint; commit `perf: bound file and diff processing`.

### Task 4: Enforce widget bitmap accounting, including oversized entries

**Files:** Android widget bitmap cache and renderer under `android/`, Kotlin tests or an instrumentation seam.

- [ ] Add tests for cache hit, LRU replacement, byte-account updates, configuration-key separation, and a single bitmap larger than the full budget.
- [ ] Reject or downsample an entry that individually exceeds the byte budget before caching; ensure accounting remains correct after failed decode and replacement.
- [ ] Include density/theme/day/payload revision in cache identity wherever render output depends on it.
- [ ] Verify latest-wins redraw coalescing still clears/replaces stale content and failure does not strand the worker flag.
- [ ] Run available Gradle unit tests and `./gradlew assembleDebug`; report separately if device/emulator instrumentation is unavailable. Commit `fix: enforce widget bitmap memory budget`.

### Task 5: Verify host-client lifecycle and only optimize measured costs

**Files:** `src/hooks/useHost.ts`, `src/lib/hostClient.ts`, host tests and diagnostics.

- [ ] Measure client construction, persisted-state reads/writes, poll duration, cancellation, and retained result size for visible and background states.
- [ ] Add tests for host/token replacement, hiding the screen during a poll, repeated foregrounding, failure backoff, and bounded retained samples.
- [ ] Reuse clients only within the same host and credential generation; clear stale clients and user-specific state on identity change.
- [ ] Avoid a sample ring or delta protocol unless measured payload/allocation evidence shows the current bounded strategy is costly and the host protocol supports safe deltas.
- [ ] Run focused tests and typecheck; commit `perf: bound host client lifecycle state`.

## Verification

Run targeted tests and Android build for native changes. Report byte budgets and before/after allocation measurements; JS heap snapshots alone do not account for native bitmap memory.

## Status (2026-10-25)

- Task 1 (store budget and migration): committed (`c848588 fix: bound cache index
  and store metadata`); the byte/count measurement (Step 1) is device work.
- Task 2 (cache identity): committed (`448956a fix: strengthen persisted resource
  identity`); SHA-256 replaces the 32-bit FNV credential name, checked against the
  published empty and "abc" vectors.
- Task 3 (payload/file/diff budgets): partial. Response and patch reads are
  bounded, but large-file/base64/line allocations are not profiled, so Steps
  1 and 3–5 have no evidence.
- Task 4 (widget bitmap budget): committed (`c614b1b fix: enforce widget bitmap
  memory budget`); reasoned and JVM-tested, but `./gradlew assembleRelease` was
  not run.
- Task 5 (host client lifecycle): committed (`5717c05 refactor: extract host
  connection lifecycle rules`); the construction/persistence/backoff measurement
  (Step 1) is device work. No sample ring or delta protocol was added.

No native memory or allocation result is claimed without a device.
