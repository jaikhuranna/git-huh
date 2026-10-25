# UI Dataflow and Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep screens responsive and data truthful while avoiding redundant rerenders and incomplete lists.

**Architecture:** Apply explicit freshness in domain hooks after the shared resource registry is race-safe. Preserve separate query membership semantics; normalize or share entities only when completeness is unchanged. Tune React subscriptions and list rows against a release-profile baseline.

**Tech Stack:** Expo SDK 57, React 19, React Native 0.86, TypeScript, Expo Router, existing Bun test runner.

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

### Task 1: Audit and narrow session subscriptions using measured churn

**Files:** `src/shell/session.tsx`, provider consumers under `src/hooks/` and `src/screens/`, focused session tests.

- [ ] Record a React Profiler trace while switching tabs, refreshing the inbox, and changing a session action. Count committed consumers and identify the highest-churn shared values.
- [ ] Add a test or development harness that proves an action-only update does not rerender read-only subscribers and a data update reaches every consumer that needs it.
- [ ] Split only high-churn independently-owned values into selector/context boundaries. Keep stable session identity and low-churn values shared; do not add a state library or per-field context for its own sake.
- [ ] Verify login/logout/account-switch transitions replace the correct subscriptions and never expose the previous account's data.
- [ ] Trace partial-query failures through hydration and UI selectors; assert a failed slice is never converted into or persisted as a valid zero/empty result.
- [ ] Run focused tests, `bun run typecheck`, and `bun run lint`; commit `perf: narrow high-churn session subscriptions`.

### Task 2: Stabilize Today row identity and callbacks

**Files:** `src/screens/TodayScreen.tsx`, `src/hooks/useActivity.ts`, Today list tests.

- [ ] Capture release-profile render counts for a feed refresh and scrolling a representative list.
- [ ] Add tests for item-key stability, the history-ID lookup, `renderItem`, and row open behavior across an unrelated parent render.
- [ ] Move row actions behind stable callbacks or a row-owned stable adapter; memoize `renderItem` only when its captured inputs are stable. Remove an unused history index or wire it into the actual lookup so it has one owner.
- [ ] Verify opening an item and updating seen state still works after item insertion, reorder, and account switch.
- [ ] Compare render counts and frame times to baseline; retain the change only if it lowers work without increasing stale UI. Commit `perf: stabilize Today feed row updates`.

### Task 3: Restrict eventual-consistency retries to create-then-open flows

**Files:** `src/hooks/usePullDetail.ts`, `src/screens/ThreadScreen.tsx`, `src/lib/polling.ts`, retry tests.

- [ ] Enumerate every `eventually()` call and classify whether it follows a successful create or is an ordinary read.
- [ ] Add tests proving ordinary PR/thread reads issue one request and a create-then-open path uses a bounded, cancellable retry window.
- [ ] Keep eventual retries only for known server propagation after a confirmed create. Propagate cancellation, permission errors, rate limits, and ordinary not-found results without retry loops.
- [ ] Run focused tests and typecheck; commit `fix: scope eventual reads to create flows`.

### Task 4: Preserve completeness and truthful caps across list screens

**Files:** inbox/history/repository-picker/conversation hooks and screens, pagination tests.

- [ ] Inventory each connection's ordering, filter, cursor, cap, and distinct membership semantics. Do not infer global completeness from one endpoint's result.
- [ ] Add fixtures with more records than each cap and assert the UI exposes pagination or a truthful truncation state.
- [ ] Reuse entity payloads only when identity/revision agrees; maintain independent connection membership and cursor state for inbox, history, mentions, review requests, and open PRs.
- [ ] Verify account changes and stale/offline states do not present partial data as complete.
- [ ] Run affected tests, typecheck, and lint; commit `fix: report bounded list completeness accurately`.

### Task 5: Keep local draft and overlay state predictable under route eviction

**Files:** `app/(tabs)/_layout.tsx`, pushed screen state owners, draft persistence modules, navigation tests.

- [ ] Record which pushed routes are retained and which are evicted; cover unsaved comment/review/proposal drafts, selection, scroll position, and keyboard focus.
- [ ] Add navigation tests for opening more routes than the retention bound, leaving a dirty draft screen, and returning to it.
- [ ] Persist only user-authored state with the existing protected storage semantics; do not put drafts in the evictable read cache. Restore scroll/focus only where it does not overwrite a newer document or account.
- [ ] Verify eviction actually releases screen-local large state and that reopening a route does not duplicate network work.
- [ ] Run focused navigation tests, typecheck, lint; commit `fix: preserve drafts across route eviction`.

### Task 6: Validate date-derived state across day and timezone changes

**Files:** `src/lib/home.ts`, triage/snooze state owners, widget date rendering and related tests.

- [ ] Add fake-clock tests across local midnight, daylight-saving transitions, timezone changes, foreground resume, and widget refresh.
- [ ] Assert snooze/seen state stays attached to the intended local date and is not recomputed into a different day after timezone changes.
- [ ] Ensure clock-derived values are refreshed from one explicit local-day boundary and that cached display data does not outlive that boundary.
- [ ] Run focused tests and commit `fix: keep day-derived state consistent`.

### Task 7: Keep stale data truthful after permission and account failures

**Files:** remote error mapping, shared resource selectors, inbox/PR/repository screens and tests.

- [ ] Add fixtures for stale cached data followed by forbidden, revoked-token, missing-resource, offline, and rate-limit responses.
- [ ] Define per-domain whether stale content remains visible and expose the failure state without presenting stale content as current or complete.
- [ ] Verify credential replacement clears or revalidates account-scoped resources and never carries a previous account's stale rows into the new session.
- [ ] Run focused tests and commit `fix: report stale resource failures accurately`.

## Verification

Run focused tests for changed seams, then `bun run typecheck`, `bun run lint`, and `bun test`. Repeat render and frame measurements in release builds; development Profiler output is diagnostic only.

## Status (2026-10-25)

- Task 2 (Today rows): committed (`9d52fca perf: stabilize Today feed updates`); the
  Profiler capture and the before/after render-count comparison (Steps 1 and 5)
  are device work and remain open.
- Task 3 (eventual retries): done. `noteCreated`/`wasJustCreated` and
  `eventually(..., { recent: true })` restrict retries to a just-created object;
  `usePullDetail` retries only the core read, and the release create retries only
  the propagation read and aborts it when the form is left.
- Task 6 (day-derived state): done. `day.ts` + `triage.test.ts` cover local
  midnight, daylight-saving, timezone change and foreground resume.
- Task 7 (truthful stale failures): done for supplemental reads via
  `optionalRead` + `optionalRead.test.ts`; cross-screen account-switch
  verification (Step 3) remains.
- Tasks 1, 4 and 5 (session subscription split, list completeness, overlay
  eviction): not completed in this workstream.

Render, frame-time and memory results are not claimed: this workstream's
acceptance criteria require release builds and devices.
