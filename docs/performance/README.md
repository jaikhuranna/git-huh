# Performance and reliability measurement

This directory holds the commands and the recorded numbers behind every
performance claim on this branch. A change is only "faster" when a release
build, on a real device, shows it. Unit tests and Metro development builds do
not measure startup, bundle size, RAM, or frame time.

Plan: `docs/superpowers/plans/2026-10-25-git-huh-release-measurement.md`.
Spec: `docs/superpowers/specs/2026-10-25-git-huh-performance-reliability-spec.md`.

## What is verified in code, and what is not

Verified by `bun run typecheck`, `bun run lint`, and the pure test suite:
transport budget and deadline behavior, cache identity and eviction accounting,
resource registry races and freshness helpers, proposal reconciliation, the
widget bitmap/redraw contracts (JVM tests).

**Not verified here** — these need a release build and a device:

- cold/warm/offline startup time and first-usable-frame
- JS and native memory after startup and after a long session
- scroll frame time and render counts
- web production chunk payloads
- Android/iOS widget redraw behavior under the launcher

Nothing in the PR summary may claim these without a row in a record file.

## Repeatable runs

Run the code checks first; they gate every measurement.

```sh
bun run typecheck
bun run lint
# The test script assumes node; on this machine node is shimmed to bun, so use:
bun ./node_modules/typescript/bin/tsc -p tsconfig.test.json && (cd .test-build && bun test)
```

Release artifacts and devices (run these yourself; they are not CI):

```sh
# Android release ABI (one ABI at a time; versionCode never decreases)
cd android && ./gradlew assembleRelease
# iOS release build
bun run ios --configuration Release
# Native widget JVM contracts
cd android && ./gradlew :app:testDebugUnitTest
# Production web export (only if web is a confirmed shipped target)
bunx expo export --platform web
```

## Device matrix

Record the same rows for every run so comparisons mean something.

| Field | Value |
|---|---|
| OS + version | |
| Device / ABI | |
| App commit | |
| Build mode | release / debug |
| Account fixture | |
| Network profile | wifi / throttled / offline |

## Scenarios

Capture median and p95 across enough repetitions to show variance. Raw output
and the exact commands belong in a record file, not only a summary.

1. Cold launch → first usable tab
2. Warm resume from background
3. Signed-out startup
4. Cached/offline startup
5. Pull-request overview → first section → full section set
6. Today feed scroll
7. 10-minute navigation/feed session, then JS + native memory
8. Request count and bytes, disk bytes and writes, widget redraws

## Release gates

No CI pipeline is added by this branch. The gates are the commands above,
run by hand before cutting a release:

| Gate | Pass condition |
|---|---|
| typecheck | no errors |
| lint | zero warnings |
| tests | all pass |
| Android release compile | assembles one ABI |
| production web export | only if web is shipped |
| device checks | explicitly recorded per device, never inferred from CI |
