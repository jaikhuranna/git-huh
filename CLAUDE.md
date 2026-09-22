# git-huh

## Goal

**Make your own GitHub history worth looking at.** The numbers GitHub already
has about you — a year of contributions, the languages, the repos, the pull
requests and the arguments in them — rendered as a set of printed artefacts
rather than as a dashboard. Fourteen screens, each one a pin from the
"nothing github" Pinterest board (`design/board/`), grouped into five
sections, plus one Android home-screen widget.

It is a personal app for one account at a time: you paste a token, it reads
your year, and nothing leaves the device except requests to GitHub.

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

- `src/screens/` — one file per screen: `Hey`, `Now`, `Weather`, `Clock`,
  `Inbox`, `Index`, `Brief`, `Review`, `Cards`, `Poster`, `Flow`, `Orbit`,
  `Archive`, `Dots`, plus `Loading` (pin11, shown while the first request is
  in flight) and `Pull`.
- **Navigation is five sections, and it lives in `app/index.tsx`.**
  `SECTIONS` is the whole map: `today` (you · now · weather · hours),
  `inbox` (recent), `work` (pulls · brief · cycle · repos), `year` (weeks ·
  split · languages · years) and `lab` (join the dots), which is where an
  unfinished artefact lives until it earns a place in one of the other four.
  The bar is `src/components/TabBar.tsx`, the in-section switcher is
  `src/components/Segments.tsx`, and the thirteen-name scrolling `Rail` they
  replaced is gone. Apple's HIG is the reference: three to five persistent
  labelled destinations, no drawer, no hamburger, segmented control for views
  of one subject. **Do not add a sixth section**, and do not put an action in
  the bar.
- A section mounts the first time it is opened and keeps its own page after
  that, so the fetches are gated on the *section* (and, for the heavy
  activity request, on the view one step before the one that needs it).
- **`Pull` is not a section.** It is a full-screen overlay rendered *over*
  everything from `app/index.tsx`, opened from a row on `index`, `inbox` or
  the link on `brief`. It has horizontal scrollers of its own (the diff), and
  a horizontal scroller nested inside a pager loses every drag to the page
  swipe — which is also why the poster's year chips wrap instead of
  scrolling.
- `src/lib/activity.ts` — the second-tier data layer: sampled commit history
  and pull request detail. `src/lib/social.ts` — the `inbox` section's feed,
  built from search plus each PR's comment and review connections
  **deliberately not** from the notifications API, which would need a
  `notifications` scope the app never asks for.
- `src/lib/messageCache.ts` — the pool of commit messages the loading screen
  and widget A's strip are made of. It has to be on screen before the request
  that would fetch them, hence the cache; it is refetched only when more than
  a week old and otherwise just reshuffled. **It carries a `VERSION`: bump it
  in the same change as any new limit or field, or the change never reaches a
  phone that already has a pool.** Subjects are trimmed when they are
  *written*, so raising the cap alone left every device printing the old
  34-character lines for a week. `src/lib/commitLines.ts` fills it, oldest-heavy,
  from the REST commit-search endpoint — GraphQL has no commit search, and
  `activity.ts` only ever sees the last few days.
- `src/hooks/useTokenScopes.ts` — reads `x-oauth-scopes` off a REST call and
  drives the "no repo scope" strip in `app/index.tsx`. See the trap below.
- `src/lib/pullDetail.ts` — one pull request in full: GraphQL for the object,
  its comments and its review threads, REST for the file patches (GraphQL's
  `files` connection carries no patch text), plus the unified-diff parser.
- `src/lib/` — GitHub GraphQL, the `GitHubModel` view model, seeded demo data.
- `src/theme/index.ts` — every colour, font and radius. Use these tokens; do
  not invent values in screens.
- `android/app/src/main/java/app/githuh/widget/` — the Glance widget, plus
  the three bitmap renderers it is built from (`TextRenderer`,
  `GlyphRenderer`, `DotFieldRenderer`). It is a travelling commit message and
  the dot field, nothing else: no counts, no accent, a plus for today, and one
  14dp padding on every side. The strip lives in
  `res/layout/widget_strip.xml` and is the one view here that is not painted
  by Glance. See the widget trap below before touching it.
- `preview/` — ten of the screens as HTML at 393×852, used to iterate on
  layout in a browser and to build `review.html`. It lags the app.
- `design/DESIGN.md` — the spec every screen is derived from.

**`android/` is committed on purpose.** It holds hand-written native code, so
it is not a disposable prebuild artifact — never re-add it to `.gitignore`,
and do not run `expo prebuild` without checking what it would overwrite.

## Design rules

The app deliberately does **not** use the Nothing design language. No
dot-matrix typeface, no Nothing red (`#D71921`) **anywhere** — it was the
widget's today mark until 2.8, and today is a plus now — no
grey-paper-plus-dot-grid combination. Type is Instrument Serif (display) + Inter (body) + IBM Plex
Mono (labels and data). Colour is six categorical brights used to distinguish
categories, never a single brand accent.

Nothing survives in exactly one place: **the widget's background**, which
resolves `nothing-mtui`'s `widgetBg` token against the device's live Material
You palette. That palette is read natively from
`android.R.color.system_neutral1_*` and handed to JS over the widget bridge —
calling `nothingWidgetColors(null, …)` returns the package's static fallback
and silently stops tracking the wallpaper. The second widget (the pin08 board
card) was deleted in 2.8; there is one widget now.

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

## Five traps

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
- **The widgets must read the calendar, not the commit buckets.** `todayCount`
  and `total` include private work; `todayCommits` and `totalCommits` do not.

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
canvases. (The loading screen no longer uses SVG at all; see below.)

### Animating a widget

Nothing in Glance or RemoteViews animates, and the two obvious ways out are both
dead ends. `View.setSelected` — the marquee trick — is not a `@RemotableViewMethod`,
and a rejected reflection call does not degrade: the launcher throws
`ActionException` and the card becomes *Can't load widget*. Custom fonts do not
survive either; a layout inflated into the launcher's process ignores
`android:fontFamily="@font/…"` and falls back to its own sans.

What works is `ViewFlipper` with `android:autoStart="true"`: it starts itself on
attach, animates from this package's `res/anim`, and stops when the screen goes
off. Widget A's strip is two `ImageView` children holding the same painted line,
flipped at exactly the length of one pass. The children are images rather than text
because of the font, and their width is set with `setViewLayoutWidth` (API 31) so
that `toXDelta="-100%"` means the width of *the message* rather than the width of
the card — without it the line can never leave the screen.

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

### Animating from JavaScript

Do not. The loading wave went through a `setInterval` stepping a counter
(~16 fps, visibly steppy) and then a `requestAnimationFrame` loop (right
timing, still slow) before landing on the only thing that works: precompute
every glyph's whole track at mount, hand it to one looping `Animated.Value`
as an interpolation, and let the native driver run it. That holds 60 fps with
under 1% janky frames *while the JS thread is parsing the first GitHub
response*, which is the entire point of that screen. Measure with
`adb shell dumpsys gfxinfo app.githuh`.

## Checks

There are no tests. Before shipping, run `npx tsc --noEmit` (it should be
clean) and `npx eslint app src` (four warnings, all pre-existing — `NowScreen`
imports an unused `G`, `IndexScreen` has an exhaustive-deps note, and
`Wordmark` imports `react-native` twice). **Zero errors; do not add more
warnings.** Note that
eslint here errors on `setState` called synchronously in an effect body, so a
hook that resets state on a prop change has to derive it during render instead
— `useContributions` and `useTokenScopes` both stamp their result with the
token that produced it for exactly this reason. The `preview/*.html` sheet is a browser sandbox and has drifted
behind the app; trust the emulator over it.
