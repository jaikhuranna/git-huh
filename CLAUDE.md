# git-huh

## Goal

**Make your own GitHub history worth looking at — and deal with what wants
you without reaching for a laptop.** The numbers GitHub already has about
you — a year of contributions, the languages, the repos, the pull requests
and the arguments in them — drawn the way the home-screen widget draws them rather than as a
dashboard: seventeen screens, each laid out after a pin from the "nothing
github" Pinterest board and all drawn in the widget's marks (one mono face,
one ink, dots whose size is the data, a plus for today, a wave for a
silence), grouped into five sections, plus
the home-screen widget itself — a Glance widget on Android and a WidgetKit one on
iOS, drawing the same card from the same payload. It follows the system into
dark mode.

It also *acts*, and the aim is that **anything you can do on GitHub that
makes sense on a phone can be done here**. That covers an inbox you can put
things away in, notifications without a server, review and reply, line
comments, threads you can resolve, reactions, editing and deleting what you
said, merging (every method, auto-merge, update branch, draft, close, delete
the branch), labels, assignees, reviewers, milestones, lock and pin, CI with
re-run, cancel, approvals and workflows run by hand, repositories with code
search, star, watch and fork, branches, files you can create, edit into a
pull request or delete, new pull requests, releases, issues (forms
included), discussions (votes, answers, nested replies), security alerts you
can dismiss, profiles and follow, search across GitHub, gists, several
accounts, and everything readable offline. **`design/ACTIONS.md` is the
inventory**: every GitHub action by object, where it lives, and why the ones
left out are left out (settings, deleting repositories, and anything that
needs the `notifications` scope).

It also watches **a machine of yours**: the `host` section is a client of
`hostd`, a companion server you run on your own computer and reach over your
tailnet. It lives in its own repository (private, work in progress) and
speaks gRPC/Connect with protobuf contracts. It reports the machine's CPU, memory,
heat and disks, the services its config names (a systemd unit or a
process), their health, CPU, memory and logs, the actions the config allows
(restart, stop, your own commands), and any panels the config defines. The
app draws the kinds it is given and knows nothing about any particular
service. Until one is connected, the tab explains itself (`HostIntro`).

It is personal: you sign in with GitHub (OAuth's device flow, no server, no
client secret) or paste a token, for one account or several, and nothing
leaves the device except requests to GitHub and, if you connect one, to your
own host.

The repository is public, under the GPL v3.0 or later (`LICENSE`;
third-party parts in `THIRD-PARTY-NOTICES.md`). The pins
themselves are other people's images and are **not** in the repository —
they live beside it, in the workspace's `board/` — so never commit them,
screenshots with real account data, or anything else that is not ours to
publish.

Four documents govern the work and all four are part of it:

- **`design/LANGUAGE.md`** — the design language: colour, type, space,
  motion, patterns, the prohibitions. Read this before designing anything.
- **`design/DESIGN.md`** — the per-screen spec, pin by pin, and the
  navigation.
- **`design/STORIES.md`** — who is holding the phone, the flows, and the two
  lists (what people want from a GitHub app, what they hate about GitHub's
  own). It is the argument behind the five sections; read it before moving a
  screen or adding one.
- **`design/ACTIONS.md`** — every action GitHub has, and where it is in the
  app or why it is not. Adding or removing a write updates it.

Keep all four current in the same change that makes them wrong.

## Shipping — build the APK and upload it, every time

**When a piece of work is done, build the APK and put it on GitHub as a
release so it can be installed and tested.** This is the expected end of a
task, not something to ask about first.

**Do not add a CI pipeline.** It was tried and removed. Releases are cut by
hand from this machine:

```bash
# bump versionName / versionCode in android/app/build.gradle, app.json and
# package.json first
cd android
ANDROID_HOME=/home/jaikhurana/Android ./gradlew assembleRelease --no-daemon \
  -PreactNativeArchitectures=arm64-v8a
cp app/build/outputs/apk/release/app-arm64-v8a-release.apk /tmp/git-huh-<version>-arm64.apk
gh release create v<version> /tmp/git-huh-<version>-arm64.apk \
  --title "git-huh <version>" --prerelease --notes "..."
```

Public versions started over at `0.0.1-alpha` (tag `v0.0.1-alpha`, release
title `alpha v0.0.1`); tags are `v<version>`. The older `dev-*` releases
(2.x–3.2) predate the public repository. **`versionCode` never goes back
down** — it carries on from the dev builds (29 for `0.0.1-alpha`), because
Android refuses to install a lower code over a higher one, whatever the
version name says.

**Release signing** reads `GITHUH_UPLOAD_*` from `~/.gradle/gradle.properties`
(the keystore is `android/app/githuh-dev.keystore`, gitignored). Neither the
keystore nor its passwords ever go in the repository. Without them a release
build falls back to the debug key, which installs fine but cannot update a
build signed with the real one.

**Build one architecture at a time on this machine.** `gradle.properties`
lists four ABIs, and a four-ABI build of the native modules (reanimated,
worklets, expo-modules-core) writes tens of thousands of small files. The
root filesystem is btrfs and its *metadata* is nearly full — a build fails
with `No space left on device` while `df` still shows gigabytes free. Build
`-PreactNativeArchitectures=x86_64` for the emulator and `arm64-v8a` for the
release, and in each build **only the APK for that ABI is usable** — the
other split comes out without native libraries. If a build dies mid-CMake,
delete `node_modules/*/android/.cxx` and `android/app/build` (both
regenerable) before retrying. The real fix, a `btrfs balance`, needs root.

Ship **`app-arm64-v8a-release.apk`** (~47 MB) — that is the one that gets
installed. The universal APK (~100 MB) is only for an x86_64 emulator and is
usually not worth attaching.

Always bump `versionName` and `versionCode` so a new build is distinguishable
on-device from the last one.

## iOS

`ios/` is **not** committed — it is generated (Continuous Native Generation)
from `app.json` and the config plugins, unlike `android/`. Building needs a
Mac with Xcode 26 (for Liquid Glass) and CocoaPods:

```bash
npx expo prebuild -p ios --clean   # adds the widget target from targets/widget
npx expo run:ios                   # or open ios/githuh.xcworkspace
```

Set `ios.appleTeamId` in `app.json` (or the team in Xcode) before signing —
the widget and the app share an App Group, which needs a real team. Nothing
iOS can be compiled on this Linux machine: `npx expo prebuild -p ios
--no-install` works here and is the check that the widget target, the App
Group and the entitlements are generated, but the Swift has only ever been
compiled on a Mac.

## Build requirements

- **Node 20+.** Node 18 cannot bundle React Native 0.86 — Metro's config
  loader calls `Array.prototype.toReversed`, which does not exist before
  Node 20. If only Node 18 is on `PATH`, fetch a Node 20 tarball and prepend
  it rather than trying to work around the bundler.
- **`android/local.properties`** must point at the SDK (`sdk.dir=`). It is
  gitignored, so it needs recreating on a fresh clone.

## Layout

- `src/screens/` — the section pages `Today`, `Work` (the inbox's blocks,
  `InboxBlocks` from `Inbox`, at its top), `Year`, `Ideas` (a local project
  notebook: stages, steps, a repository made from an idea) and `Host` (a
  machine, from `hostd`), each one scrolling page composed of **blocks**;
  the blocks keep their pin-named files and still export `…Screen`: `Hey`, `Now`
  (with `Weather` as a card inside it), `Clock` (`hours`), `Index` (`pulls`),
  `Brief`, `Review` (`cycle`), `Cards` (`repos`), `Poster` (`weeks`), `Flow`
  (`split`), `Orbit` (`languages`), `Archive` (`years`), `People`. A block
  renders a `Block` (its `ScreenHead` and cards), never a `Page` of its own.
  `Queue` and `Assigned` export a `Tile` for the inbox's page and a pushed page;
  `Brief` a tile opening the shared PR page with optional sequence paging; `People` the block and a pushed page of
  everyone. Plus `Loading` (the widget's card with a light sweeping its dots,
  shown while the first request is in flight), `Dots` (unlinked legacy view),
  and the other pushed pages: `Pull`, `Thread` (issue or discussion), `Repo`
  (its `pulls`, `actions` and branch row are in `RepoTabs.tsx`), `File`,
  `NewIssue`, `User` (a profile, from any `~name`), `Search` (across GitHub),
  `Gists` (the list and one gist), `Inbox`'s `InboxPage` (the whole feed),
  `Service` (one service on the host: graphs, actions, panels, log), `Create` (the forms that make a pull
  request, a release, a discussion, a file, a repository, a gist), `Account`
  (behind the avatar in every section's top-right corner: accounts, which are
  added together, notifications, links to your profile, gists, a new
  repository and search, what the foot of `today` lists) and `Share` (a chart
  as a 4:3 image).
- **Pushed pages are a stack** (`src/lib/nav.tsx`, rendered over the tabs in
  `app/(tabs)/_layout.tsx`). Screens reach it with `useNav()`, which also carries the
  token, the login and whether this is the demo — do not thread those
  through props. `routeForUrl` turns a github.com link into a page; rendered
  Markdown uses it so links stay in the app.
- **Every read is cache-first** through `src/hooks/useRemote.ts`, which owns
  one share of each resource: the saved answer (`src/lib/store.ts`, JSON files
  in the documents directory — *not* SecureStore, which caps at ~2 KB) is
  drawn first, the fresh one replaces it, and offline the saved one stays with
  its age. Two consumers asking for the same key share one in-flight request
  and one current value, and unmounting one does not abort a request the other
  still needs; a freed entry is held briefly, then let go. New data sources
  should use it rather than a hand-rolled hook. Disk is read once per key, and
  a refresh inside `staleAfterMs` serves the in-memory answer without touching
  disk. A failure is classified (`network`, `forbidden`, `rate-limited`,
  `missing`, `invalid-token`, `api`) so a screen can offer the right retry.
  `invalidateResource` / `invalidateResourceWhere` / `refreshResource` let a
  write drop exactly the keys it changed. Disk keys start with the lowercase
  login and a dash, so `accountStore.remove` can clear an account's answers;
  the store keeps itself inside a byte budget, evicting the least recently
  used a non-draft, non-setting entry, and writes are queued per key and
  skipped when unchanged. `httpCache`'s validators and `proposals`' half-made
  writes default to memory and are given a disk-backed box in `index.js`, so
  the pure modules and their tests never load `expo-file-system`.
- **Every GitHub write** is in `src/lib/writes.ts` (comments, reviews, line
  comments, reactions, edits and deletes, issues, labels, assignees,
  milestones, lock, pin, merging and the rest of a pull request's state,
  threads, discussions, stars, watching, forks, branches, files, releases,
  alerts, follows, gists) and `src/lib/checks.ts` (re-run, cancel, approvals,
  workflow dispatch). The edit → branch → pull request flow is its own
  resumable operation in `src/lib/proposalWrites.ts`, re-exported by `writes.ts`
  as `proposeChange`/`resumeProposal`: fork, branch, commit and pull are each
  recorded before they are sent, a lost reply is read back before it is
  repeated, and only a confirmed "reference already exists" retries a branch
  name. `src/lib/encodePath.ts` and `src/lib/forkRepo.ts` are the single owners
  of path encoding and the fork-then-wait. Every GitHub write in the UI goes through
  `src/components/Composer.tsx` — `bare` for a write that is only a verb,
  `confirm` on anything that cannot be undone (pressed twice), `on` for a
  toggle, `initial` + `onCancel` for an edit. On the demo token the composer
  answers `nothing was sent` and never calls them. A dropped write is told
  apart from an unsent one: `unsent` means the request never left, `unknown`
  means it may have landed, so the composer keeps the draft and offers a
  check rather than a casual retry and never replays it. Reads and writes
  settle within a deadline composed with the caller's signal, and a 403 that
  is a rate limit is distinguished from a permission problem (with a shared
  per-account cooldown so background retries do not storm). The pieces built
  on it:
  `Reactions`, `CommentTools` (react, reply, edit, delete and a comment's own
  verbs), `Details` + `Picker` (an issue's or pull request's side column),
  `MergeBox`. **Check a new mutation against the live schema** before
  shipping it: a field GitHub does not have fails the whole request, and the
  pull request page with it. A throwaway test that calls the function with a
  made-up node id gets `Could not resolve to a node` when the schema is right
  and a validation error when it is not, and changes nothing.
- `src/lib/explore.ts` — the reads behind the pickers (labels, assignable
  people, milestones, branches, discussion categories), a repository's pull
  requests, profiles (`fetchProfile` asks for the login as a user *and* an
  organisation, so it passes `executeQuery`'s `missingIsAnswer`), search
  across GitHub, and gists. `src/lib/reactions.ts` (the eight reactions as
  words) and `src/lib/pullState.ts` (the merge box's line) are pure and
  tested.
- `src/lib/ideas.ts` + `ideasStorage.ts` — project notes in a dedicated document
  file (localStorage on web), outside account caches, with a separate demo
  notebook. Storage failures reach the editor instead of being swallowed. The
  notebook is version 2 (stage, steps, linked repository, `updatedAt`); a
  version-1 notebook is migrated on read, never rejected. `new-repo` takes
  `name`, `description` and `idea`, and links the repository it makes back to
  that idea.
- **The host section** is a client of `hostd` (its own private repository;
  the server, its config and its API are documented there). In the app,
  `src/lib/host.ts` (types, formatting, `squeeze`, the demo host — pure and
  tested), `src/lib/hostClient.ts` (the generated Connect client over
  `fetch`, binary protobuf, bearer token; the address and token in the
  keystore; native connection probes use Connect JSON over `hostProbeFetch.ts`
  to preserve DNS/TLS/socket error text. Setup errors identify whether Health
  succeeded before checking access; normal reads still use binary protobuf.
  Calls time out after 20 s, because a public Funnel address can take
  several seconds to open a cold connection),
  `src/lib/hostLifecycle.ts` (pure: connection identity, poll gating, the
  failure backoff, and the one retained sample per resource — no sample ring
  and no server delta without measured payload evidence),
  `src/lib/hostProto.ts` (proto messages → the types the screens
  draw, pure and tested), `proto/` (hostd's `.proto` files, copied from its
  repository; when they change, copy them again and run `npm run gen:host`,
  which writes `src/gen/` with `buf` and `protoc-gen-es`; `src/gen` is
  committed and not linted), `src/hooks/useHost.ts` (settings shared across pages; polling
  every `every` seconds only while on screen and the app is in the foreground;
  pauses during in-flight requests, refreshes on foreground return) and `src/components/HostPanel.tsx`
  (one panel per kind, `Series`, `Meter`, `LogLines`). Release builds allow
  plain `http` only to `*.ts.net` (`android/app/src/release/res/xml/network_security_config.xml`);
  an IP address will not connect, a MagicDNS name will. `HostParts.tsx` holds
  the machine cards and service rows shared by the live page and the preview
  in `HostIntro.tsx` (what the tab is, a diagram, the page drawn from the demo
  host with a light sweeping it, and the three steps to set it up). **Never
  put a real host's service names in this repository.**
- `src/lib/triage.ts` + `src/hooks/useTriage.ts` — the inbox's own done /
  snooze marks, per account, on the device. The local-day arithmetic it shares
  with the midnight rollover (`src/hooks/useDayRollover.ts`) lives in the pure
  `src/lib/day.ts`, tested across local midnight, daylight-saving and timezone
  changes.
- `src/lib/notify.ts` — the background inbox check (expo-background-task,
  ~15 min, Android decides) and its local notifications. See the entry-file
  trap below.
- `src/lib/accounts.ts` — the list of accounts in the keystore; the current
  token is still `tokenStore`. **Accounts ticked `together`** on the account
  page are summed into the one in use: `src/hooks/useTogether.ts` loads each
  one's year with its own token — two at a time, the active account first,
  reusing a just-saved per-account model — and `src/lib/merge.ts` adds them up.
  The **sum is never saved**: it is derived, and a stored copy would keep
  another account's year inside this one after it was removed. An account that
  cannot be read keeps its saved year, and failing that drops out of the sum,
  named in `missing` rather than taking the charts down.
  The session's `model` (what every chart draws) is that sum; `contributions`
  is still the account in use alone, and so are the inbox, the pull requests,
  `login`, `nav.token` and every write — only that token can act. Show a
  handle with `handleOf(model)`, never `~${model.login}`, or a summed year is
  labelled with one account's name.
- `src/lib/home.ts` — what the feed at the foot of `today` lists (pull
  request comments by default), a filter over the inbox's own feed **plus the
  history paged in by `src/hooks/useFeedHistory.ts`** (`fetchSocialPage` in
  `social.ts`: ten of your pull requests at a time, open or closed, as the page
  is scrolled — the inbox's own feed is only your open ones, three comments
  deep, because it is also the background check). The menu of kinds is
  `HOME_BLOCKS`; the choice is saved as `home-settings`.
- `src/lib/quiet.ts` — **every chart's long silences.** Past a threshold, an
  empty run is bridged with the app's wave and its length (`quietRuns`,
  `wavePath`), or folded out of a field the way the widget does (`foldField`,
  `placeField`, used by `DotField`). A new chart over time should use it;
  pass `until` so the unfinished part of this year is not drawn as a silence.
- `src/components/ShareCard.tsx` + `src/screens/ShareScreen.tsx` — a chart
  as a 640 × 480 card, captured at 1600 × 1200 (react-native-view-shot) and
  handed to the share sheet (expo-sharing). Cards are composed for the
  frame, not scaled screens; the caps that keep any account inside it are in
  `src/lib/shareData.ts`. `share` is on each chart's own head (the `action`
  of `ScreenHead`), pushing `{ kind: 'share', card }`.
- **Navigation is five sections on the native tab bar.** Each section is a
  route in `app/(tabs)/` (`index` is `today`), all five render
  `src/shell/SectionScreen.tsx`, and the bar is expo-router's `NativeTabs` in
  `app/(tabs)/_layout.tsx` — Liquid Glass on iOS 26, Material 3 on Android.
  **The app's state is not in a screen**: `src/shell/session.tsx`
  (`SessionProvider`, `useSession`) holds the token, the year, the inbox and
  the pushed pages above the navigator, and reads which section is open from
  the path. `src/shell/sections.ts` `SECTIONS` is the list of the five, and
  `src/shell/SectionScreen.tsx` gives each its chrome and its page: `today`
  (you · today · hours · the feed), `work` (the review and assigned tiles ·
  the head of the inbox · pulls · the brief · cycle · repos; the tab carries
  the inbox's count), `year` (weeks · split · languages · years · people),
  `ideas` (project ideas saved locally on the device) and `host` (a machine of
  yours, from `hostd`). The inbox was a section until `host` took its slot. **A section is one page; there is no second row of tabs.** It used
  to be a segmented control over a horizontal pager — a tab bar inside a tab
  bar — and that is what this layout replaced; do not bring it back. A list too
  long for its page shows its head (`Tile`, or the first rows and `More`) and
  pushes the rest. `Segments` survives only on `pull`, a pushed page, where it
  is the one row on screen. Apple's HIG is the reference: three to five
  persistent labelled destinations, no drawer, no hamburger. **Do not add a
  sixth section**, and do not put an action in the bar.
- A section mounts the first time it is opened and keeps its scroll after
  that, so the fetches are gated on the *section*. The heavy activity request
  (commit history, pull request bodies) is asked for when `work` is open, or
  when `today` is scrolled half a screen towards `hours` (`wantActivity`,
  `Page`'s `onDeep`) — never on launch. The demo has its activity at once.
- **Pushed pages are not sections.** They render *over* everything, the bar
  included (`app/(tabs)/_layout.tsx`), each in an `OverlayFrame` with `← back`
  and the system back button wired to it.
- `src/lib/activity.ts` — the second-tier data layer: sampled commit history
  and pull request detail. `src/lib/social.ts` — the `inbox` section's feed,
  built from search plus each PR's comment and review connections
  **deliberately not** from the notifications API, which would need a
  `notifications` scope the app never asks for. The scopes it *does* ask for
  are in `TOKEN_SETTINGS_URL` (`PatForm.tsx`) and `OAUTH_SCOPES`: `read:user,
  repo, read:discussion, write:discussion, security_events, user:follow,
  gist`. Every screen works on less and says what the missing scope costs.
  **Following a single thread is not offered**: GraphQL's `updateSubscription`
  needs `notifications`. Watching a repository uses the REST endpoint, which
  `repo` covers.
- `src/lib/messageCache.ts` — the pool of commit messages the loading screen
  and the widget's strip are made of. It has to be on screen before the request
  that would fetch them, hence the cache; it is refetched only when more than
  a week old and otherwise just reshuffled. **It carries a `VERSION`: bump it
  in the same change as any new limit or field, or the change never reaches a
  phone that already has a pool.** Subjects are trimmed when they are
  *written*, so raising the cap alone left every device printing the old
  34-character lines for a week. `src/lib/commitLines.ts` fills it, oldest-heavy,
  from the REST commit-search endpoint — GraphQL has no commit search, and
  `activity.ts` only ever sees the last few days.
- **Signing in** is OAuth's device flow, `src/lib/oauth.ts` (pure, tested):
  a code shown on the sign-in page, typed at github.com/login/device, polled
  for. No client secret exists anywhere — the web flow would need one, and a
  public app cannot keep it. The client id is `app.json` →
  `expo.extra.githubClientId` (`src/lib/oauthConfig.ts`); **empty means no
  OAuth app is behind this build** and the sign-in page is the token form
  alone. To turn it on: register an OAuth app on GitHub, tick *Enable Device
  Flow*, disable *Expire user access tokens* (refresh tokens are not supported),
  paste its client id there, rebuild. Official builds use the `git-huh` OAuth
  app owned by `jaikhuranna`, with its public client id committed. A signed-in token is a `gho_`
  token stored exactly like a pasted one; `tokenKind` reads how an account
  came in from the prefix, so nothing extra is stored. Disconnecting cannot
  revoke an OAuth grant (that needs the secret), so the account page links to
  GitHub's page for it.
- `src/lib/queue.ts` (review requests, the wait counted from the
  `ReviewRequestedEvent`, and your reviews with commits since),
  `src/lib/assigned.ts` (assigned and filed, across repositories) and
  `src/lib/people.ts` (a year of reviews both ways, a sample that says so) —
  one GraphQL request each, through `useQueue`, `useTasks` and `usePeople`,
  gated on the `inbox` and `year` sections.
- `src/hooks/useTokenScopes.ts` — reads `x-oauth-scopes` off a REST call and
  drives the "no repo scope" strip in `src/shell/SectionScreen.tsx`. See the trap below.
- **One PR detail path.** Every list, comment, notification and link uses
  `pullRoute` → `PullScreen` → `usePullDetail` → `fetchPullDetail`
  (`pull4-` core cache). Brief's `read all` supplies a sequence of identities
  to that same screen; `PullPager` replaces the current PR so back returns to
  the source. Never add a second description reader. Comment/review links
  select `talk`. A list or preview that needs the description of one request
  asks `fetchPullBody` for that request alone — the activity sample never
  downloads bodies.
- `src/lib/pullRequest.ts` owns `PullRef`, `PullSummary`, the shared GraphQL
  fields/schema and mapper. Activity extends the summary as `PullActivity`;
  it is a sample for charts and previews, not a detail response. `PullHeader`
  renders both the preview and detail header.
- `src/lib/pullDetail.ts` requires only the core PR — the header and
  description — which draws the moment it returns. Conversation, management
  details and REST patches are separate reads on their own cache keys and are
  asked for when their tab is shown, so a brief visit pays for no diff.
  Supplemental reads go through `optionalRead`: a failure is a serializable
  `unavailable` entry shown by `ReadNotice`, with a reason and retry, and a
  forbidden extra never hides a readable PR. Never silently draw an empty
  section or invent permissions. Expired tokens and aborts still fail the
  entire load. `rest.explain` preserves GitHub's denial reason instead of
  assuming missing scopes. A patch and a long body are bounded and paged. Every
  schema change requires a cache key bump.
- `src/lib/` — GitHub GraphQL and REST (`github.ts`, `rest.ts`: every
  failure is a `GitHubError` with a `kind`, never a raw fetch or Zod error),
  the `GitHubModel` view model, seeded demo data. The pure modules have unit
  tests beside them (`*.test.ts`).
- `src/theme/index.ts` — every colour, font and radius, in a day and a night
  palette (the raw palettes are `src/theme/palette.ts`, free of React Native
  so the data layer can use them). Use these tokens; do not invent values in screens. **Colours are
  read at render**: `colors.x` is a getter on the palette in force, so a
  module-level `StyleSheet.create` must be wrapped as `themed(() =>
  StyleSheet.create({...}))`, and so must any module-level table of colours —
  otherwise it keeps the palette it was imported under. The scheme is provided
  through a context (`src/theme/index.ts`, `app/_layout.tsx`) that re-renders
  the tree in place, so switching to dark no longer remounts the navigator or
  throws away a draft or a pushed page.
- `android/app/src/main/java/app/githuh/widget/` — the Glance widget, plus
  the three bitmap renderers it is built from (`TextRenderer`,
  `GlyphRenderer`, `DotFieldRenderer`). It is a travelling commit message and
  the dot field, nothing else: no counts, no accent, a plus for today in the
  **bottom-right** corner (the field is a run of days ending today, not a
  weekday calendar), a long run of nothing drawn as a wave with its
  length on it and one column of its own empty days on each side, and one 14dp padding on every side. The strip lives in
  `res/layout/widget_strip.xml` and is the one view here that is not painted
  by Glance. See the widget trap below before touching it. The widget draws
  whatever the *last app that ran* wrote, so after an update it paints the old
  payload with the new renderer until the app is opened once. The card's
  surface is `WidgetSurface.kt` (the Material You neutral, read natively),
  and the ink is **never** chosen in Kotlin: every bitmap is painted white
  with its weight in the alpha and tinted by a day/night `ColorProvider`
  (`TINT`, and `setImageTintList` on the strip), because the launcher
  re-resolves the surface on a scheme change without asking the app, and a
  baked-in ink is left behind on the wrong background.
- `targets/widget/` — the **iOS widget** (WidgetKit + SwiftUI): `Payload.swift`
  reads the same JSON the Android widget does out of the App Group
  `group.app.githuh`, and `DotField.swift` is a rule-for-rule port of
  `DotFieldRenderer`. `@bacons/apple-targets` links it into the Xcode project
  at `npx expo prebuild -p ios`; the app writes to it through that package's
  `ExtensionStorage` (`src/lib/widgetBridge.ts`). WidgetKit cannot animate,
  so the strip is today's line, still. **Change the field on one platform,
  change it on the other.**
- `design/DESIGN.md` — the spec every screen is derived from.
- `docs/screenshots/` — the README's images. **Always taken in the demo**
  (`octocat`), from a release build on the emulator, never from a real
  account: a screen of real data carries private repository names.

**`android/` is committed on purpose.** It holds hand-written native code, so
it is not a disposable prebuild artifact — never re-add it to `.gitignore`,
and do not run `expo prebuild` without checking what it would overwrite.

## Design rules

**Fields must stay above the keyboard.** The root has `KeyboardProvider`;
vertical pages containing inputs, pickers or composers use `FormScrollView`
(`react-native-keyboard-controller`), which follows focus and the caret as
multiline text grows. Shared `Page` takes `keyboard` for forms such as host
setup. Do not nest another keyboard-avoiding view around it. Test a field
near the bottom, moving focus with the keyboard open, and long multiline text
on the emulator. The controller is native, so dependency changes need a rebuild.

**The app is the widget, zoomed out** (`design/LANGUAGE.md` §1). One face —
IBM Plex Mono in every role, `src/components/Type.tsx` — one ink in four
weights on the widget's warm near-black card, and every chart built from the
widget's marks: `DotField` (a run of days, today the plus, silences folded
into the wave), `DotRow` (a series), `Marquee` (the travelling commit strip),
`Card` (the surface), `WaitDot` (how long something has waited). The only colour is `yes` / `no` (sage / clay) for what a
machine says — a diff, a check, a review — always beside a word or sign.
GitHub's language and label colours are not drawn. New screens use these
pieces; do not bring back per-screen canvases, categorical brights or a
second typeface.

**No underlined-text buttons.** An action is a pill (`IconPill`, a glyph and a
short verb) or a round glyph button (`IconButton`) when the phone already has a
glyph for it (share, edit, close, open elsewhere, refresh, add); the word stays
as the accessibility label. Glyphs are SF Symbols / Material Symbols by
meaning, in `src/components/Icon.tsx` (`GLYPHS`). `ComposerAction` takes an
`icon`. Underlines are only for links inside rendered Markdown.

Still not the Nothing design language: no dot-matrix *typeface*, no Nothing
red (`#D71921`) **anywhere**, and dots are data, never a texture under
something. Nothing survives in exactly one place: **the widget's background**,
the Material You neutral Nothing's own widgets sit on
(`android.R.color.system_neutral1_50` / `_900`), read natively in
`WidgetSurface.kt` each time the card is composed — never carried in the sync
payload, which would keep the old colour after the wallpaper changed.

Big dot fields are **paths, not elements**: one `<Path>` per weight
(`dot()` in `DotField.tsx` builds the path data). Hundreds of `<Circle>`s, or
one enormous path, make the launch transaction heavy enough to trip the SVG
trap below on the emulator — the weather sky at a 13pt pitch took it from one
crash in six launches to four.

## Running against Metro (emulator QA)

The emulator is the loop that catches layout bugs. Two gotchas on this
machine:

- **Port 8081 is taken by another service**, so start Metro elsewhere and map
  it: `npx expo start --port 8082` then
  `adb -s emulator-5554 reverse tcp:8081 tcp:8082`.
- An emulator resolves the packager to `10.0.2.2:8081` — the host's *occupied*
  8081 — and falls back to the packaged bundle with "Unable to load script".
  Point it at the reversed port instead by writing
  `/data/data/app.githuh/shared_prefs/app.githuh_preferences.xml` with
  `<string name="debug_http_host">localhost:8081</string>` (needs `adb root`),
  then force-stop and relaunch. A file written as root also needs the app's
  owner (`chown`) and its SELinux label, categories included (`chcon` to
  whatever `ls -Zd /data/data/app.githuh` shows), or it is silently ignored.
- **Check the emulator is running a debug build at all.** If a release build
  with a higher `versionCode` is installed, `adb install -r` of an older
  debug APK fails with `INSTALL_FAILED_VERSION_DOWNGRADE`, and the release
  build keeps launching with its own bundle — every screen looks like the
  old code and no dev menu opens. Uninstall it first (`adb uninstall
  app.githuh`; on the emulator that is demo data). A fresh bundle request in
  Metro's log (`Android Bundled … (1700+ modules)`) is the sign it worked.

Build the debug APK with `./gradlew assembleDebug -PreactNativeArchitectures=x86_64`
— one ABI is about half the native compile. Warm the bundle with a request to
`/.expo/.virtual-metro-entry.bundle?platform=android&dev=true` before launching,
or the app times out waiting and falls back to assets.

If a build dies with `ninja: error: manifest 'build.ninja' still dirty` or a
JVM `SIGBUS` in `PerfLongVariant::sample`, delete the offending
`node_modules/*/android/.cxx` directory and pass
`-Dorg.gradle.jvmargs="… -XX:-UsePerfData"`.

## Seven traps

### A token without `repo` returns a smaller, valid, wrong year

This is the one that looks like a bug in the app and is not.
`contributionsCollection` is scoped to the **token**, not to the account. A PAT
without `repo` is answered with the public half of your year, with no error
and no warning, because GitHub considers that a complete answer. On an account
whose work is mostly private that means a flat dot grid, `0 today`, and a flow
diagram totalling ten contributions against a calendar of four hundred.

Two separate things follow from it and both are load-bearing:

- **`restrictedContributionsCount` is not in the four typed totals.** Even with
  a perfect token, `totalCommitContributions` + PRs + issues + reviews does not
  add up to `contributionCalendar.totalContributions` — the difference is work
  in repositories the profile does not expose. It has to be queried and carried
  as its own bucket, or every "where it went" figure understates the year.
- **The widget must read the calendar, not the commit buckets.** `todayCount`
  (the only count in its payload) includes private work; `todayCommits` does
  not.

`useTokenScopes` only reports `limited` when it is certain: classic PATs send
`x-oauth-scopes`, fine-grained ones send nothing, and there is nothing to infer
from silence, so those stay quiet.

### A saved answer outlives the shape it was saved in

Every read draws the saved answer first (`useRemote`), so the first frame
after an update is the **previous build's** data run through the **new
build's** screen. 0.0.7 added reactions, assignees and merge methods to the
pull request; a phone that had opened that pull request under 0.0.6 read the
old copy, `reactions.map` threw, and opening any saved pull request crashed
the app — a fresh install (the emulator) never shows it. **When a cached
type gains or changes a field, bump its cache key** (`-pull2-`, `-issue2-`,
`-repo2-`, as `messageCache` bumps `VERSION`), and keep components that draw
a list tolerant of it being missing. To reproduce one: open the page, pull
its file out of `files/githuh-store/`, strip the new fields, push it back,
go offline and open it again.

### react-native-svg text in a downloaded font

A single `<Svg>` holding a page's worth of `<Text>` in one of the Google
fonts **crashes the app** — `SIGSEGV` in `MountingCoordinator::pullTransaction`,
before the first frame, with no JS error. The trigger is the total glyph
count inside one canvas; it goes away if either the custom `fontFamily` or
the shared canvas is removed. It reproduces on the x86_64 emulator and is
easy to mistake for an emulator-only fault — the arm64 release build happened
to survive it. If a screen needs a lot of SVG text in a loaded face, split the
canvases. (The loading screen uses no SVG; see "Animating from JavaScript".)

### Animating a widget

Nothing in Glance or RemoteViews animates, and the two obvious ways out are both
dead ends. `View.setSelected` — the marquee trick — is not a `@RemotableViewMethod`,
and a rejected reflection call does not degrade: the launcher throws
`ActionException` and the card becomes *Can't load widget*. Custom fonts do not
survive either; a layout inflated into the launcher's process ignores
`android:fontFamily="@font/…"` and falls back to its own sans.

What works is `ViewFlipper` with `android:autoStart="true"`: it starts itself on
attach, animates from this package's `res/anim`, and stops when the screen goes
off. The widget's strip is a flipper of `ImageView` frames, each two card widths of
the painted loop, each slid exactly one width per turn so the hand-over lands on
identical pixels (`design/DESIGN.md` has the whole mechanism). The children are images
rather than text because of the font, and their width is set with
`setViewLayoutWidth` (API 31) so that a percentage delta means the width of *the
frame* rather than the width of the card.

### A background colour that changes loses its corner radius

On Android a view whose **only** changing style property is `backgroundColor`
is repainted without its `borderRadius`. The first paint after mount is
correct, so it looks fine until something re-renders: the tab bar's selected
pill came back as a hard black rectangle the moment you switched sections,
and only the tab that happened to be selected at launch stayed round.

Every chip in the app was already immune by accident — a chip toggles its
`borderColor` as well as its fill, and sending a border property alongside
the background makes the radius survive. So a toggled surface here carries a
1px border (transparent when off) whether or not it needs one. Do not
"simplify" that border away.

### The entry file is `index.js`, and it has to stay that way

`package.json` `main` points at `index.js`, not `expo-router/entry`, and
Android's bundle entry is resolved from it. `index.js` imports
`src/lib/notify.ts` *before* the router so that `TaskManager.defineTask`
runs when the bundle is evaluated: Android starts the JavaScript runtime
headless to run the background inbox check, no screen renders, and a task
defined inside a screen module or `app/_layout.tsx` is simply never defined
— the check fails silently every fifteen minutes. Anything else that must
run in the background goes in that file too.

### Animating from JavaScript

Do not. (The one exception is an inbox row following a finger, which a
`PanResponder` has to drive.) The language spiral was the last holdout — a
`requestAnimationFrame` loop redrawing the SVG — and on a section page that
scrolls it stuttered the scroll; it is now drawn once and rotated on the native
driver, each mark in its own canvas counter-rotating to stay upright. The loading wave went through a `setInterval` stepping a counter
(~16 fps, visibly steppy) and then a `requestAnimationFrame` loop (right
timing, still slow) before landing on the only thing that works: precompute
every mark's whole track at mount (today, each dot's scale and opacity as the
light sweeps the loading card; the strip is one `translateX`), hand it to one looping `Animated.Value`
as an interpolation, and let the native driver run it. That holds 60 fps with
under 1% janky frames *while the JS thread is parsing the first GitHub
response*, which is the entire point of that screen. Measure with
`adb shell dumpsys gfxinfo app.githuh`.

## Checks

Before shipping, all three must be clean:

```bash
npm run typecheck   # the app, then the tests (tsconfig.test.json)
npm run lint        # zero errors and zero warnings — keep it that way
npm test            # unit tests on Node's built-in runner, no extra deps
```

Tests live beside the module they test (`src/lib/nav.test.ts`) and may only
import modules that do not load React Native or an Expo native module —
`tsconfig.test.json` compiles them to `.test-build/` as CommonJS and Node runs
them. Keep pure logic in modules like that so it can be tested; a screen is
checked on the emulator instead.

eslint here errors on `setState` called synchronously in an effect body, so a
hook that resets state on a prop change has to derive it during render instead
— `useRemote` and `useTokenScopes` both stamp their result with the key that
produced it for exactly this reason. Hooks that feed the session return one
object per distinct answer (`useMemo`), because the screens are memoised
against them; a hook that returns a fresh object every render redraws every
mounted screen.
