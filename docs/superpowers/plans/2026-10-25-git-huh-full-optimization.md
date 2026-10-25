# git-huh Full Reliability and Performance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the reliability fixes and safely improve startup, freshness, responsiveness, RAM, disk use, and native widget cost in the existing PR.

**Architecture:** Execute five independently reviewable subsystem plans in dependency order. First stabilize the shared read and write seams; then set freshness and view policies; then bound memory; finally measure release builds and decide which lazy-loading changes produce real value. Keep implementations local to the modules that own those contracts.

**Tech Stack:** Expo SDK 57, React 19, React Native 0.86, Hermes, TypeScript, Bun test runner for the existing TypeScript test suite, Android Kotlin/Glance, Expo Router.

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

## Execution order

### Task 1: Finish the shared read registry

Execute `2026-10-25-git-huh-read-registry.md`. This is first because all later UI and cache claims depend on observable, race-safe reads.

- [x] Commit the immutable snapshot and invalidation tests before implementation.
- [x] Run the targeted tests, typecheck, and lint listed in that plan.
- [x] Commit the registry contract separately from policy/freshness changes.

### Task 2: Finish write outcome and proposal recovery

Execute `2026-10-25-git-huh-write-safety.md` after Task 1 so related-read invalidation is reliable.

- [x] Commit GraphQL unknown-outcome tests first.
- [x] Extract the proposal workflow from `writes.ts` before it crosses further structural scope.
- [x] Test lost replies at branch, commit, and pull-request creation stages.

### Task 3: Set freshness and UI dataflow policy

Execute `2026-10-25-git-huh-ui-dataflow.md` after the registry behavior is stable.

- [x] Define per-resource freshness by domain and verify foreground refresh.
- [ ] Profile context and Today row rendering before making further subscription splits. Blocked: no release build or device, and no render change is made without a trace.
- [x] Keep inbox/history query semantics distinct while deduplicating identical resources.

### Task 4: Bound disk, JS/native memory, and payload processing

Execute `2026-10-25-git-huh-memory-native.md`.

- [x] Migrate/index old cache entries without counting drafts/settings as evictable cache.
- [x] Bound store bookkeeping maps as well as persisted files.
- [x] Test the Android bitmap budget including a single oversized bitmap. Reasoned and JVM-tested; `assembleRelease` was not run on a device.

### Task 5: Verify lazy loading and establish release gates

Execute `2026-10-25-git-huh-release-measurement.md`.

- [ ] Produce baseline measurements before retaining new optimization complexity. Protocol and template committed in `docs/performance/`; no device baselines yet.
- [ ] Compare web production chunks separately from native release builds. Blocked: no builds run.
- [ ] Test production lazy imports on Android/iOS; do not count Metro development lazy bundling as release savings. Blocked: no native splitting was added.

### Task 6: Audit the 50-item disposition and close only evidenced gaps

- [x] Walk the disposition table in the spec against the final diff and tests.
- [ ] For completed-in-branch items, run the corresponding regression/device check rather than reimplementing. Regression (Node) suites run; device checks blocked.
- [x] For open/partial items 13, 17, 19, 23, 24, 27, 28, 32, 34, 35, 37, 39, 44, 46, 49, and 50, confirm a task in one of the subsystem plans and update the table with evidence.
- [x] Keep speculative host deltas, chart caches, a global state library, FlashList, and native bundle splitting out unless measured evidence changes the decision.
- [ ] Run `git diff --check`, `bun run typecheck`, `bun run lint`, and `bun test` after code work; run Android/iOS release build and device measurements separately. (Code gates pass; release build and device measurements outstanding.)

## Completion criteria

- No task is complete from static reasoning alone when its acceptance criterion requires runtime/UI/native evidence.
- Each subsystem is committed in small reviewable commits; the existing branch/PR remains the delivery target.
- Final PR summary states what is implemented, what ran, what was measured, and what remains platform-unverified.
