# git-huh

## Goal

**Make your own GitHub history worth looking at — and deal with what wants
you without reaching for a laptop.** The numbers GitHub already has about
you — a year of contributions, the languages, the repos, the pull requests
and the arguments in them — rendered as a set of printed artefacts rather
than as a dashboard: fourteen screens, each one a pin from the "nothing
github" Pinterest board, grouped into five sections, plus
one home-screen widget — a Glance widget on Android and a WidgetKit one on
iOS, drawing the same card from the same payload. It follows the system into
dark mode.

It also *acts*, because that is what the lists in
`design/STORIES.md` asked for: an inbox you can put things away in,
notifications without a server, review and reply, line comments, CI with
re-run and approvals, repositories with code search, files you can edit into
a pull request, issues (forms included), discussions, releases, security
alerts, several accounts, and everything readable offline.

It is personal: you paste a token (or several), and nothing leaves the
device except requests to GitHub.

The repository is public, under the PolyForm Noncommercial licence
(`LICENSE`; third-party parts in `THIRD-PARTY-NOTICES.md`). The pins
themselves are other people's images and are **not** in the repository —
they live beside it, in the workspace's `board/` — so never commit them,
screenshots with real account data, or anything else that is not ours to
publish.

Three documents govern the work and all three are part of it:

- **`design/LANGUAGE.md`** — the design language: colour, type, space,
  motion, patterns, the prohibitions. Read this before designing anything.
- **`design/DESIGN.md`** — the per-screen spec, pin by pin, and the
  navigation.
- **`design/STORIES.md`** — who is holding the phone, the flows, and the two
  lists (what people want from a GitHub app, what they hate about GitHub's
  own). It is the argument behind the five sections; read it before moving a
  screen or adding one.

Keep all three current in the same change that makes them wrong.

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

Versions are `3.3.0-alpha.1` and so on while the app is in alpha; tags are
`v<version>`. The older `dev-*` releases predate the public repository.

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

- `src/screens/` — one file per screen: `Hey`, `Now`, `Weather`, `Clock`,
  `Inbox`, `Index`, `Brief`, `Review`, `Cards`, `Poster`, `Flow`, `Orbit`,
  `Archive`, `Dots`, plus `Loading` (pin11, shown while the first request is
  in flight), and the pushed pages: `Pull`, `Thread` (issue or discussion),
  `Repo`, `File`, `NewIssue`.
- **Pushed pages are a stack** (`src/lib/nav.tsx`, rendered over the tabs in
  `app/(tabs)/_layout.tsx`). Screens reach it with `useNav()`, which also carries the
  token, the login and whether this is the demo — do not thread those
  through props. `routeForUrl` turns a github.com link into a page; rendered
  Markdown uses it so links stay in the app.
- **Every read is cache-first** through `src/hooks/useRemote.ts`: the saved
  answer (`src/lib/store.ts`, JSON files in the documents directory — *not*
  SecureStore, which caps at ~2 KB) is drawn first, the fresh one replaces
  it, and offline the saved one stays with its age. New data sources should
  use it rather than a hand-rolled hook. Cache keys start with the lowercase
  login and a dash, so `accountStore.remove` can clear an account's answers.
- **Every write** is in `src/lib/writes.ts` (comments, reviews, line
  comments, issues, the edit → branch → pull request flow including the
  fork fallback) and `src/lib/checks.ts` (re-run, approvals), and every
  write in the UI goes through `src/components/Composer.tsx`. On the demo
  token the composer answers `nothing was sent` and never calls them.
- `src/lib/triage.ts` + `src/hooks/useTriage.ts` — the inbox's own done /
  snooze marks, per account, on the device.
- `src/lib/notify.ts` — the background inbox check (expo-background-task,
  ~15 min, Android decides) and its local notifications. See the entry-file
  trap below.
- `src/lib/accounts.ts` — the list of accounts in the keystore; the current
  token is still `tokenStore`.
- **Navigation is five sections on the native tab bar.** Each section is a
  route in `app/(tabs)/` (`index` is `today`), all five render
  `src/shell/SectionScreen.tsx`, and the bar is expo-router's `NativeTabs` in
  `app/(tabs)/_layout.tsx` — Liquid Glass on iOS 26, Material 3 on Android.
  **The app's state is not in a screen**: `src/shell/session.tsx`
  (`SessionProvider`, `useSession`) holds the token, the year, the inbox and
  the pushed pages above the navigator, and reads which section is open from
  the path. `src/shell/sections.ts` `SECTIONS` is the whole map: `today` (you · now · weather · hours),
  `inbox` (recent), `work` (pulls · brief · cycle · repos), `year` (weeks ·
  split · languages · years) and `lab` (join the dots), which is where an
  unfinished artefact lives until it earns a place in one of the other four.
  The in-section switcher is `src/components/Segments.tsx`. Apple's HIG is the reference: three to five persistent
  labelled destinations, no drawer, no hamburger, segmented control for views
  of one subject. **Do not add a sixth section**, and do not put an action in
  the bar.
- A section mounts the first time it is opened and keeps its own page after
  that, so the fetches are gated on the *section* (and, for the heavy
  activity request, on the view one step before the one that needs it).
- **Pushed pages are not sections.** They render *over* everything because
  they have horizontal scrollers of their own (the diff, a file, a log), and
  a horizontal scroller nested inside a pager loses every drag to the page
  swipe — which is also why the poster's year chips wrap instead of
  scrolling. A one-view section (`inbox`, `lab`) turns its pager's scrolling
  off, or the inbox's swipe actions would lose their drag the same way.
- `src/lib/activity.ts` — the second-tier data layer: sampled commit history
  and pull request detail. `src/lib/social.ts` — the `inbox` section's feed,
  built from search plus each PR's comment and review connections
  **deliberately not** from the notifications API, which would need a
  `notifications` scope the app never asks for. The scopes it *does* ask for
  are in `TOKEN_SETTINGS_URL` (`PatForm.tsx`): `read:user, repo,
  read:discussion, write:discussion, security_events`. Every screen works on
  less and says what the missing scope costs.
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
- `src/hooks/useTokenScopes.ts` — reads `x-oauth-scopes` off a REST call and
  drives the "no repo scope" strip in `src/shell/SectionScreen.tsx`. See the trap below.
- `src/lib/pullDetail.ts` — one pull request in full: GraphQL for the object,
  its comments and its review threads, REST for the file patches (GraphQL's
  `files` connection carries no patch text), plus the unified-diff parser.
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
  otherwise it keeps the palette it was imported under. The root layout
  remounts the tree under the session when the system scheme changes.
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

The app deliberately does **not** use the Nothing design language. No
dot-matrix typeface, no Nothing red (`#D71921`) **anywhere**, no
grey-paper-plus-dot-grid combination. Type is Instrument Serif (display) + Inter (body) + IBM Plex
Mono (labels and data). Colour is six categorical brights used to distinguish
categories, never a single brand accent.

Nothing survives in exactly one place: **the widget's background**, the
Material You neutral Nothing's own widgets sit on
(`android.R.color.system_neutral1_50` / `_900`). It is read natively in
`WidgetSurface.kt` each time the card is composed — never carried in the
sync payload, which would keep the old colour after the wallpaper changed.

Dots as texture are allowed only where the source pin is built from them:
`now` (LED numerals), `dots` (the puzzle), `archive` (circle rows). Everywhere else use that pin's own device — crosses, ribbons,
stacked squares, arcs, filing rules.

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
  then force-stop and relaunch.

Build the debug APK with `./gradlew assembleDebug -PreactNativeArchitectures=x86_64`
— one ABI is about half the native compile. Warm the bundle with a request to
`/.expo/.virtual-metro-entry.bundle?platform=android&dev=true` before launching,
or the app times out waiting and falls back to assets.

If a build dies with `ninja: error: manifest 'build.ninja' still dirty` or a
JVM `SIGBUS` in `PerfLongVariant::sample`, delete the offending
`node_modules/*/android/.cxx` directory and pass
`-Dorg.gradle.jvmargs="… -XX:-UsePerfData"`.

## Six traps

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
`PanResponder` has to drive.) The loading wave went through a `setInterval` stepping a counter
(~16 fps, visibly steppy) and then a `requestAnimationFrame` loop (right
timing, still slow) before landing on the only thing that works: precompute
every glyph's whole track at mount, hand it to one looping `Animated.Value`
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
