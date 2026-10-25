# Loading Strategy and Release Measurement Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove which changes improve startup and interaction on each supported platform, and keep only loading complexity that produces a measurable release benefit.

**Architecture:** Capture comparable baselines first. Treat web bundle chunking and native module evaluation as separate mechanisms. Keep route-level lazy boundaries typed and coarse; do not add waterfalls to small or common components. Release gates report code size, user-visible timings, request work, and memory separately.

**Tech Stack:** Expo SDK 57, Expo Router, React 19, React Native 0.86, Hermes, TypeScript, Bun scripts, Android Gradle, Xcode.

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

### Task 1: Establish reproducible cold, warm, and offline baselines

**Files:** `app/_layout.tsx`, app startup/data bootstrap owners, profiling scripts or `docs/performance/` records.

- [ ] Define a repeatable dataset and device matrix for Android and iOS release builds plus production web export. Record OS, device, app commit, build mode, account fixture, and network profile.
- [ ] Measure cold launch to first usable tab, warm resume, signed-out startup, cached/offline startup, PR overview, first PR section, full PR section set, and Today scroll.
- [ ] Capture JS and native memory after startup and after a 10-minute navigation/feed session; capture request count/bytes, disk bytes/writes, and widget redraw count.
- [ ] For the file list, record viewport geometry, mounted row count, scroll-to-index accuracy, and memory while opening and closing large repositories; change layout only if measurements show excess work.
- [ ] Run enough repetitions to report median and p95, and record variance. Store raw results and commands so later comparisons are reproducible.
- [ ] Do not set arbitrary budgets until baselines and product targets are reviewed; commit the baseline artifact separately.

### Task 2: Audit existing dynamic imports and make route boundaries typed

**Files:** `app/(tabs)/_layout.tsx`, route modules, `app.json`/`app.config.*`, web export scripts.

- [ ] Enumerate every static and dynamic import for pushed routes and heavy rare features. For each, record module size, shared dependencies, frequency, and whether it blocks first paint.
- [ ] Replace `ComponentType<any>` lazy-screen casts with typed named-export adapters, or remove the generic helper where explicit route modules are clearer.
- [ ] Keep lazy boundaries at substantial pushed routes or rare heavy features. Do not dynamically import tiny leaf components or modules needed immediately by all five tabs.
- [ ] Verify each lazy route has a loading/error boundary that preserves navigation and does not blank the whole app.
- [ ] Run typecheck, lint, route navigation tests, and production exports; commit `refactor: type lazy route boundaries`.

### Task 3: Enable and verify web-only async route chunks when web is a shipped target

**Files:** `app.json` or `app.config.*`, web build scripts, CI web export validation.

- [ ] Confirm supported deployment targets and current Expo SDK 57 configuration. Expo Router async routes require explicit configuration; production async route support applies to web, not native.
- [ ] If web is shipped, enable the documented web-only async route setting while leaving native at its default synchronous behavior. If web is not shipped, record that and skip config churn.
- [ ] Build a production web export and inspect emitted chunks/network waterfall to prove that an unopened heavy route is not in the initial route payload and is loaded on navigation.
- [ ] Compare initial bytes, route-transition latency, and cache behavior against Task 1 baseline. Revert the split if it adds a user-visible waterfall or no material initial-payload reduction.
- [ ] Run web smoke/navigation checks and commit `perf: split heavy web routes` only when measured beneficial.

### Task 4: Measure native dynamic-import effects without assuming bundle splitting

**Files:** route loading helper, native build/profile scripts, profiling record.

- [ ] Build Android and iOS release artifacts with and without selected dynamic boundaries where feasible; inspect actual packaged JS/Hermes bytecode and startup/module-evaluation behavior.
- [ ] Measure cold launch, first route navigation, JS memory, and interaction frames for the same scenarios and devices as Task 1.
- [ ] Confirm any benefit comes from deferred evaluation/initialization; do not report reduced native bundle size unless the packaged artifacts prove it.
- [ ] Remove native lazy boundaries that add suspense/network-like waterfalls without a material measured benefit. Keep behavior consistent on low-memory devices.
- [ ] Record results and commit only evidence-backed native loading changes.

### Task 5: Add reliability and performance release gates

**Files:** `.github/workflows/`, test scripts, `docs/performance/` results.

- [ ] Define CI gates for `bun run typecheck`, `bun run lint`, `bun test`, production web export, and Android release compilation as available in CI.
- [ ] Keep device-only checks explicit: iOS release build, Android/iOS launch and navigation, memory, frame-time, offline, widget lifecycle. Do not label these passed from simulator-free CI.
- [ ] Add a focused lifecycle integration suite for disk hydration, account switch, foreground revalidation, hidden-screen cancellation, route eviction, and widget refresh handoff.
- [ ] Establish thresholds from measured baseline and an agreed regression budget; avoid noisy hard thresholds until repeated CI/device variance is known.
- [ ] Update the PR summary with exact commands/results and separate code checks from device measurements.

## Verification

Run the applicable export/build commands in release mode and preserve raw measurements. Expo development mode, Metro's dev server, and unit-test timings do not demonstrate production startup, bundle splitting, RAM, or frame-rate improvements.

## Status (2026-10-25)

Only Task 1's reproducible protocol landed (`d9c51e8 docs: add release
measurement protocol and baseline record`): `docs/performance/README.md` and the
`docs/performance/baseline.md` template define the dataset, device matrix and
recorded fields. No baseline numbers exist.

Tasks 1–4 measurements and Task 5's release gates are blocked: there is no
Android or iOS device, no release build and no CI pipeline in this environment.
No web or native bundle splitting was enabled, and no startup, memory or
frame-time improvement is claimed anywhere in this branch as a result.
