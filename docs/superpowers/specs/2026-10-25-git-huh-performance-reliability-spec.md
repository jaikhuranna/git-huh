# git-huh reliability and performance improvement specification

## Goal

Finish the reliability work in PR #1, then reduce startup, stale-data exposure, render work, retained RAM, disk growth, and native-widget work using measured changes that preserve app behavior.

## Source reports and branch context

- Baseline source audit: `/var/folders/v2/7l8j4cqj6y10yf9f_754166h0000gn/T/opencode/performance-audit-2026-10-24.md` (50 findings against `d2cc354`). It is a local temp file, so the durable decisions and disposition are summarized here.
- Architecture candidate report: `/var/folders/v2/7l8j4cqj6y10yf9f_754166h0000gn/T/architecture-review-20261024.html`.
- Current deep review: `/tmp/architecture-review-20261025-git-huh.html`.
- Branch under review: `perf/audit-fixes` in `jaikhuranna/git-huh` PR #1, based on `origin/main`.
- Repo is Expo SDK `~57.0.23`, React `19.2.3`, React Native `0.86.3`, Hermes enabled, npm/`package-lock.json` is package-manager authority.
- No `CONTEXT.md` or ADRs were present in the scanned repo paths. Use existing app vocabulary and keep Office-like terms out of this project.

## Report quality and decisions

The 24 Oct architecture report is useful as an early candidate map, but stale against this branch: PR section reads, lazy overlay declarations, rolling-calendar loading, Today virtualization, bounded history, shared reads, and session action/data contexts now exist in some form. Do not reimplement these from the old diagrams. Its “one conversation read replaces all searches” suggestion is rejected as written because inbox, history, mention, review-request, and open-PR queries have different semantics; share entities only where query membership and completeness remain correct.

The 25 Oct deep-review HTML is readable as a text report and its findings were source-checked. The HTML was designed for the T3 injected theme; opened as `file://`, its `var(--foreground)`/`var(--card)` variables have no local fallback. The older HTML loads Tailwind and Mermaid from CDNs, and the Mermaid ES module may be blocked by file-origin CORS. T3 preview tools returned `Authentication required`; neither report received a successful rendered-browser verification. The durable plans below are plain Markdown and do not depend on those diagrams.

## Disposition of the 50 audit findings

“Done in branch” means the code path was added, not that device behavior was verified. Every done/partial item still requires its specified regression or performance validation.

| Audit items | Disposition on this branch |
|---|---|
| 01 editor snapshot, 02 theme remount, 04 host identity, 05 composed cache keys, 06 avoid persisted aggregate, 08 empty files, 10 rolling calendar first, 11 local sections independent, 12 PR sections, 14 pull body separation, 15 viewer-id filtering, 16 bounded secondary-account loading, 18 deadline/budget primitives, 20 REST validators, 21 shared resource registry, 22 shared current value, 25 coalesced ordered persistence, 26 LRU disk index, 29 virtual Today, 30 bounded history, 31 cancellable history, 33 seen only while inbox visible, 36 bounded log tail, 38 debounced file search, 40 bounded patch scan, 41 memoized derivations, 42 reduced/offscreen animation, 43 batched branch-name lookup, 45 guarded checks actions, 47 widget redraw coalescing, 48 byte-budgeted widget cache | Implemented or substantially implemented. Preserve and add regression/device evidence; do not redo blindly. Residual details are in plans. |
| 03 uncertain mutation outcomes | Done (code): `executeMutation` in `github.ts` is the one GraphQL mutation entry (`mutation: true`); every mutation call site in `writes.ts` uses it. Tests: `github.test.ts`, `transportBudget.test.ts`. Device behavior not measured. |
| 07 failed slices vs valid zeros | Done (code): `optionalRead` isolates a supplemental read and returns a `ReadFailure` record, never a valid empty; `invalid-token` is rethrown. Tests: `optionalRead.test.ts` (stale→forbidden, revoked token, offline, rate-limit, and the one genuine empty). |
| 09 clock-derived state | Done (code): `day.ts` holds `localDay`/`msUntilNextLocalMidnight`/`nextMorning`/`stateOnDay`; the rollover and triage call it. Tests: `triage.test.ts` covers midnight, spring-forward, fall-back, timezone change and foreground resume. Widget date rendering not device-verified. |
| 13 eventual-consistency retry scope | Done (code): `noteCreated`/`wasJustCreated` plus `eventually(..., { recent: true })` gate retries to a just-created object; `usePullDetail` retries only the core read, and the release create retries only the propagation read, aborted on leaving the form. Ordinary reads issue one request. |
| 17 overlapping queries | Open by design: inbox/history/mention/review/open-PR queries keep distinct membership; entities are reused only where completeness is unchanged. |
| 19 rate-limit scheduling | Done (code): every read takes a `RequestPriority`, `interactive` by default and `background` for the secondary/together/notify lanes. Tests: `rateLimit.test.ts` (interactive proceeds during a cooldown, background waits then leaves once it expires). |
| 23 stale/focus policy | Done (code): production hooks supply named `staleAfterMs` (activity 5m, PR core 60s, PR section 2m, social 90s, queue/tasks/open-PRs 2m, people 15m, contributions 30m, together `FRESH_MS`), and foreground return revalidates only expired or invalidated resources. |
| 24 cached inner-schema validation | Improved: `proposalsStore` write/remove now return the store promise so a failed save surfaces instead of promising a restart; `savedStore.test.ts` covers the envelope and version. Per-shape validators/migration across every durable payload still to audit. |
| 27 mutation invalidation | Done (code) for pull requests: one typed `PullMutation`→`PullSection` effect map in `usePullDetail`; `invalidateResource`/`refreshResource` cancel the prior flight and bump the generation so a stale completion cannot republish or strand `flight`. Other parent lists still rely on explicit effects. |
| 28 stale authorization/failure messaging | Done (code): `explainReadFailure` names the subject and GitHub's reason; `optionalRead` keeps stale content with a failure record for forbidden/offline/rate-limited and rethrows a revoked token. Tests: `optionalRead.test.ts`. |
| 32 nested/list completeness | Open: explicit caps/cursors and truthful truncation for inbox, conversations and repository pickers remain to be asserted per connection. |
| 34 selector-level session subscriptions | Partial: the action/data split exists; the broad data context remains. Narrowing waits on a release Profiler trace. |
| 35 bounded overlay retention | Partial: pushed routes are retained within a bound; draft/scroll/focus recovery under eviction is not proven. |
| 37 size-aware file transfer | Partial: patch and response reads are bounded, but large-file/base64/line allocations are not profiled. |
| 39 file-list geometry | Not measured: needs device instrumentation of viewport, mounted rows, scroll-to-index and memory; no layout change was made without it. |
| 44 resumable proposal writes | Done (code): `proposalWrites.ts` records per-step state (`not-started`/`in-flight`/`unknown`/`confirmed`), reconciles an unknown branch/commit/pull by reading remote state, and never replays a dispatched write. Tests: `proposalWrites.test.ts` (8) and `branchName.test.ts`. Device not measured. |
| 46 host client reuse | Done (code), device-unverified: `hostLifecycle.ts` holds identity, poll-gate, backoff and one-sample rules; `hostClient` reuses one client per host+credential generation and drops it with its samples on change. Tests: `host.test.ts`. Client creation/persistence/backoff not measured; no server delta added. |
| 49 lifecycle/integration tests | Improved: `host.test.ts`, `triage.test.ts`, `optionalRead.test.ts`, `proposalWrites.test.ts` and `savedStore.test.ts` cover host lifecycle, date rollover, failure records and lost-write reconciliation on Node. Hooks/disk/UI/native lifecycle still need device-level integration. |
| 50 release measurements and bundle loading | Open: `docs/performance/` holds the measurement protocol and an empty baseline template; no device baselines yet. No native bundle splitting was added. |

## Required outcomes

1. Resource reads publish observable immutable snapshots; invalidation/cancellation/generation races cannot strand or overwrite data.
2. Every write has a truthful outcome and a recoverable operation identity. Unknown non-idempotent outcomes are reconciled before retry; no automatic replay.
3. Read deadlines include response-body consumption. Body bytes, lines, pages, history, cache, and native bitmaps stay within explicit limits.
4. Resource freshness and refresh policy are explicit per domain, including foreground return. Stale age and failure state remain truthful.
5. Existing screen work is profiled before further context splitting, list tuning, chart caching, host ring buffers, or granular component lazy loading.
6. Decompose the proposal write workflow out of the 1,055-line `src/lib/writes.ts` before that module grows further.
7. Keep the current five native sections and already-working PR split, rolling calendar, feed window, cache isolation, and mutation preconditions.
8. Add no dependencies or state-library migration unless a benchmark proves the smaller existing architecture cannot meet the target.
9. Establish cold/warm/offline startup, PR-section latency, request/byte counts, render/frame time, retained JS/native memory, disk writes, and widget redraws before setting numerical targets.
10. Android/iOS claims require release-device evidence. A passing TypeScript/unit suite is not a memory/FPS result.

## Workstreams

- Read registry and freshness: `2026-10-25-git-huh-read-registry.md`
- Mutation safety and proposal recovery: `2026-10-25-git-huh-write-safety.md`
- UI subscriptions, feed, and load policy: `2026-10-25-git-huh-ui-dataflow.md`
- Disk, file/log bounds, host, and widget memory: `2026-10-25-git-huh-memory-native.md`
- Loading strategy, integration gates, and release measurement: `2026-10-25-git-huh-release-measurement.md`

## Global constraints

- Preserve the existing five-section navigation and feature behavior.
- Keep `package-lock.json` tracked; ignore `bun.lock`; do not change package manager.
- Never retry a write with unknown outcome until remote state is reconciled.
- Preserve file SHA/revision preconditions and captured draft context.
- Cache keys must isolate account, host, credential generation, representation, and resource identity.
- User-authored drafts/settings are not LRU cache entries and must not be silently dropped.
- Keep response/list/history/cache/bitmap budgets explicit and test their limits.
- Do not claim a performance gain without baseline and post-change measurements on release builds.
- Dynamic imports may be used for web bundle splitting; native production bundle splitting is not supported by current Expo Router guidance. Measure native module-evaluation behavior before retaining added complexity.
