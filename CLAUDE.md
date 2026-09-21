# git-huh

An Expo / React Native app that renders your GitHub year, plus two Android
home-screen widgets. Ten screens, each one a pin from the "nothing github"
Pinterest board (`design/board/`, described in `design/DESIGN.md`).

## Shipping — build the APK and upload it, every time

**When a piece of work is done, build the APK and put it on GitHub as a
release so it can be installed and tested.** This is the expected end of a
task, not something to ask about first.

**Do not add a CI pipeline.** It was tried and removed. Releases are cut by
hand from this machine:

```bash
# bump versionName / versionCode in android/app/build.gradle and app.json first
cd android
ANDROID_HOME=/home/jaikhurana/Android ./gradlew assembleRelease --no-daemon
gh release create dev-<version> \
  app/build/outputs/apk/release/app-arm64-v8a-release.apk \
  --title "dev-<version>" --prerelease --notes "..."
```

Ship **`app-arm64-v8a-release.apk`** (~47 MB) — that is the one that gets
installed. The universal APK (~100 MB) is only for an x86_64 emulator and is
usually not worth attaching.

Always bump `versionName` and `versionCode` so a new build is distinguishable
on-device from the last one.

## Build requirements

- **Node 20+.** Node 18 cannot bundle React Native 0.86 — Metro's config
  loader calls `Array.prototype.toReversed`, which does not exist before
  Node 20. If only Node 18 is on `PATH`, fetch a Node 20 tarball and prepend
  it rather than trying to work around the bundler.
- **`android/local.properties`** must point at the SDK (`sdk.dir=`). It is
  gitignored, so it needs recreating on a fresh clone.
- **`nothing-mtui` is a private repo.** `npm install` therefore needs an
  account with access to it. This is also why CI cannot work without extra
  credential setup.

## Layout

- `src/screens/` — one file per screen: `Hey`, `Now`, `Clock`, `Flow`,
  `Poster`, `Orbit`, `Weather`, `Cards`, `Index`, `Brief`, `Review`, `Dots`,
  `Archive`, plus `Loading` (pin11, shown while the first request is in
  flight). Order and navigation live in `app/index.tsx`.
- `src/lib/activity.ts` — the second-tier data layer: sampled commit history
  and pull request detail. `src/lib/social.ts` — the home screen's activity
  feed, built from search plus each PR's comment and review connections
  **deliberately not** from the notifications API, which would need a
  `notifications` scope the app never asks for.
- `src/lib/messageCache.ts` — last run's commit messages, which is what the
  loading screen is made of. It has to be on screen before the request that
  would fetch them, hence the cache.
- `src/lib/` — GitHub GraphQL, the `GitHubModel` view model, seeded demo data.
- `src/theme/index.ts` — every colour, font and radius. Use these tokens; do
  not invent values in screens.
- `android/app/src/main/java/app/githuh/widget/` — both Glance widgets.
- `preview/` — ten of the screens as HTML at 393×852, used to iterate on
  layout in a browser and to build `review.html`. It lags the app.
- `design/DESIGN.md` — the spec every screen is derived from.

**`android/` is committed on purpose.** It holds hand-written native code, so
it is not a disposable prebuild artifact — never re-add it to `.gitignore`,
and do not run `expo prebuild` without checking what it would overwrite.

## Design rules

The app deliberately does **not** use the Nothing design language. No
dot-matrix typeface, no Nothing red (`#D71921`), no grey-paper-plus-dot-grid
combination. Type is Instrument Serif (display) + Inter (body) + IBM Plex
Mono (labels and data). Colour is six categorical brights used to distinguish
categories, never a single brand accent.

Nothing survives in exactly one place: **widget A's background**, which
resolves `nothing-mtui`'s `widgetBg` token against the device's live Material
You palette. That palette is read natively from
`android.R.color.system_neutral1_*` and handed to JS over the widget bridge —
calling `nothingWidgetColors(null, …)` returns the package's static fallback
and silently stops tracking the wallpaper. Widget B (the board card) uses no
Material You and no red at all.

Dots as texture are allowed only where the source pin is built from them:
`now` (LED numerals), `dots` (the puzzle), `archive` (circle rows). Everywhere else use that pin's own device — crosses, ribbons,
stacked squares, arcs, filing rules.

## Running against Metro (emulator QA)

The HTML previews size off a fixed 393 px box and have missed real layout bugs;
the emulator is the loop that catches them. Two gotchas on this machine:

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

## Checks

There are no tests. Before shipping, run `npx tsc --noEmit` (it should be
clean). `npx eslint app src` has two pre-existing complaints (`FlowScreen`
reassigns a cursor during render, `NowScreen` imports an unused `G`) — do not
add more. The `preview/*.html` sheet is a browser sandbox and has drifted
behind the app; trust the emulator over it.
