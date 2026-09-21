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

- `src/screens/` — one file per screen: `Hey`, `Now`, `Flow`, `Poster`,
  `Orbit`, `Weather`, `Cards`, `Index`, `Dots`, `Archive`. Order and
  navigation live in `app/index.tsx`.
- `src/lib/` — GitHub GraphQL, the `GitHubModel` view model, seeded demo data.
- `src/theme/index.ts` — every colour, font and radius. Use these tokens; do
  not invent values in screens.
- `android/app/src/main/java/app/githuh/widget/` — both Glance widgets.
- `preview/` — the same ten screens as HTML at 393×852, used to iterate on
  layout in a browser and to build `review.html`.
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
`now` (LED numerals), `cards` (halftone), `dots` (the puzzle), `archive`
(circle rows). Everywhere else use that pin's own device — crosses, ribbons,
stacked squares, arcs, filing rules.

## Checks

There are no tests. Before shipping, run `npx tsc --noEmit` (it should be
clean) and open `preview/_sheet.html` in a browser to eyeball all ten screens
at phone size.
