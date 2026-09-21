# git-huh 2.0 — design spec

Source of truth: the Pinterest board **"nothing github"** (10 pins), saved at `design/board/pin01..pin10`.
Every app screen is one pin, rendered with real GitHub data.

## Hard rules

1. **No Nothing design language in the app.** No DotGothic16 anywhere in `src/` or `app/`.
   No `#D71921` / `#E8442E` "brand red". No paper-grey + dot-matrix combination.
   The `?` in the wordmark is ink, not red.
2. **Nothing lives only in Widget A's background**, resolved through the `nothing-mtui` token
   mapping. Nothing red (`widgetFood` `#d71921`) may appear *only* inside Widget A.
3. Dots-as-texture are allowed **only** where a pin itself uses them: pin02's LED numerals,
   pin08's halftone card, pin10's circle rows. Everywhere else the texture is crosses (pin04),
   bars (pin09), ribbons (pin05), arcs (pin06) or rules (pin03).

## Palette

```
canvas      #F2F0EB   warm paper            (pin04, pin07)
canvasCool  #E4E3DE   Ai OS grey            (pin02 only)
card        #FBFAF7   raised surface
recess      #E9E7E1   inset / track
hair        rgba(17,16,16,0.12)
ink         #111110
ink70       #5B5A55
ink40       #93918B
ink20       #C6C4BE
black       #0B0B0A   urbit card, filing tabs, pills
onBlack     #F4F2ED
onBlack55   rgba(244,242,237,0.55)
```

Categorical brights — used for *categories*, never as a single brand accent:

```
blue   #2F7FE0    red    #E8412B    green  #1F9A53
yellow #F5B426    purple #6B4FBB    pink   #F2A0C4
```

Pastels (pin02 dock only): `#F2A65A #B9A7E6 #9BC995 #F2A0C4`
Weather gradient (pin07): cold `#7FA8C9 → #2C4F78`, warm `#F5B426 → #D23A0E`

## Type

| role | family | spec |
|---|---|---|
| display | Instrument Serif 400 | 44/46, 30/34 — greetings, hero words, year labels (italic) |
| title | Inter 700 | 24/28 |
| heading | Inter 600 | 15/20 |
| body | Inter 400 | 14/20 |
| thin numeral | Inter 200 | 86/86 — pin07 hero only |
| label | IBM Plex Mono 500 | 11/14, letterSpacing 0.8, lowercase |
| data | IBM Plex Mono 400 | 12/16, tabular |

Fonts ship via `@expo-google-fonts/{inter,instrument-serif,ibm-plex-mono}`.
Every family has a system fallback so a font-load failure still renders.

## Geometry

radius: card 20, tile 14, pill 999, sheet 28. grid gutter 20. card padding 18.

## Screens — pin by pin

Pager order = nav order. `hey` is the entry screen.

### 1. `hey` — pin04 (Pantom)
Warm canvas. Top-left `git-huh?` in Instrument Serif + mono `2.0`; top-right pill `disconnect`.
Instrument Serif 44 `Hey,` then `~{login}` on the next line.
Below: **cross grid** — 53×7 contribution year drawn as `+` glyphs, weight and opacity stepping
with level (0 → ink at 8%, 4 → ink at 100% bold). This replaces the dot matrix entirely.
Below: the colored sentence, Inter 400 17/26, each stat inline-colored:
`You shipped {commits blue} commits in {repos green} repos. {prs red} pull requests are open,
{stars yellow} stars landed, {followers purple} people follow along.`
Then italic serif subtitle `since {year} · {activeDays} active days`.
Two pills: filled black `open github →`, outlined `refresh`.

Below the fold, the **activity feed** (`SocialFeed`): who commented on your pull requests, who
reviewed them, who asked for your review, who mentioned you, and your own open pull requests.
One coloured rule per category (comment blue, approval green, changes-requested red, review
yellow, review-request purple, mention pink, yours ink), the category also written out in words,
the comment text quoted, and a wrapped chip filter (`all · comments · reviews · mentions · yours`)
with counts. The chips wrap rather than scroll — a nested horizontal scroller fights the pager.

### 2. `now` — pin02 (Ai OS)
`canvasCool` background, dotted 4px grid behind the hero.
Header: Inter 700 `Today` + Inter 700 ink40 `at a glance` on the next line (the Unified/Chat lockup).
Hero: today's contribution count rendered as **LED dot-matrix numerals** on the dotted field
(5×7 dot font, ink dots, inactive dots ink at 12%). Under it, greyed second line = yesterday's count.
Bottom block, two columns:
 - left: circular **week dial** — 7 ticks around the rim, small ink ticks, a red tick at the peak
   weekday, black centre disc with a 3-armed hand pointing at today.
 - right: 2×2 **dock** of pastel circles = top 4 languages, each showing the language initial in ink.
Footer strip: black pill "ruler" = last 30 days as a tick timeline, taller tick per contribution,
a single red hairline on today. Two circular ghost buttons flank it (`prs`, `repos` — jump links).

### 3. `flow` — pin05 (Sankey)
Canvas, all black/grey. Title row: mono `where it went` + mono right `last 12 months`.
Left node: `100%` Inter 700 32 with grey absolute below = total contributions.
One black ribbon fans right into 4 nodes: commits / pull requests / issues / reviews —
each `27.7%` Inter 700 18 + ink40 absolute under it. Ribbon thickness ∝ share.
Each node fans again into its top repositories (max 4, then `others`), labelled 10px mono on the right.
Ribbons are filled polygons, greyscale: depth 1 black, depth 2 ink at 55%, `others` at 25%.

### 4. `poster` — pin09 (IBM)
`#EFEFEF` flat canvas, **full page**: head, chart, caption and chips, with the chart taking
every point left over (it is measured with `onLayout`, not given a fixed height).
Top-right: `git-huh?` lockup where the IBM logo sits (serif, ink).
Body: **pixel-rain column chart** — one column per week, height ∝ that week's contributions.
Each column is a stack of squares; the top 30% of each column dissolves into scattered
squares with gaps, drifting by a fraction of a *square* (at a fraction of a column they land
on the neighbours and read as debris). Square colors cycle `black, blue, red, green` with
black dominant (~60%). A month rule runs under the baseline, one tick per month.
Below: mono caption `{total} contributions · busiest week {n}, in {month}`.

Every year is drawn from **its own calendar** (`YearSummary.weeks`), so 2019 gets the same
fifty-two columns as this year. Older years used to fall back to twelve monthly bars, which
made them look like a different chart, and the latest year used the trailing-365-day window
under a calendar-year label — which was not that year.

Year chips are a **wrapped row, never a horizontal scroller**: nested inside the pager, a
horizontal scroller loses every drag to the page swipe and the chips past the right edge
could not be reached at all.

### 5. `orbit` — pin06 (letters on a spiral)
White-ish canvas. Title mono `languages`.
**One spiral**, not concentric rings — the pin is a single line wound outward, and the line
*breaks* around every mark on it. Rank 0 sits at the outer end, where there is room for the
biggest chip, and the tail walks inward; the gaps are computed in the spiral's own parameter
so they scale with the mark. Top 6 languages get a filled chip in **their real GitHub language
color** (square for even rank, circle for odd, mirroring the pin); the rest are the devicon
mark in ink, or their initials where devicon has none.

**The spiral turns**, one revolution every fifty seconds. The arcs are drawn once and the
group is rotated, so a frame costs one transform rather than two hundred re-projected points;
the marks ride the same rotation but are positioned in JS and stay upright, because a spinning
devicon reads as a glitch rather than as an orbit. The ticker is parked whenever the page is
off screen — thirteen screens are mounted at once.

Footer: legend rows `▪ TypeScript 41.2%` sorted desc, mono 11.

### 6. `weather` — pin07 (weather gradients)
Canvas fading into a full-bleed vertical gradient in the bottom 45%.
Centered: Inter 600 18 `~{login}`, mono 12 `{weekday}, {month} {day}, {time}`.
Condition line Inter 400 14: derived — `severe shipping expected` (streak ≥ 7),
`steady output` (streak 1–6), `quiet and overcast` (streak 0).
Hero: Inter 200 86 `{todayCount}` + superscript `c` (commits) — the 54°F lockup.
Row under: `High: {bestDay}` `Low: {avgPerDay}`.
Frosted card, 3 columns with hairline icons: `velocity {pct}%` (this week vs last),
`consistency {pct}%` (active days / 365), `pace {n}/day`.
The velocity glyph **follows the sign** — rising, falling or level. A fixed upward arrow over
a negative percentage is the one thing on this screen that can be read as a lie.
Gradient is warm when the current streak is alive, cold when it is not; intensity ∝ streak length.
Pill `this week` over the gradient opens a 7-bar strip; circular button at the bottom = `sync widget`.

### 7. `cards` — pin08 (urbit)
Near-white canvas, vertical stack of **black repo cards** at slight rotation offsets (−3°, 0°, 2°…),
overlapping by ~40% so they read as a fanned deck; the focused card lifts.
Each card: generated **sigil** top-left (2×2 grid of quarter-circle / dot-pair / dome / disc
primitives, chosen deterministically from a hash of the repo name), mono `~{owner}-{repo}` beside it.
Body: that repository's **commit history, one bar per month**, oldest on the left, month initials
on the axis, the busiest month drawn solid and carrying its count. Every card in the deck shares
**one twelve-month axis** (`monthWindow`), so a bar on one card sits over the same month as the
bar above it. Sizing each card's axis to its own commits instead produced a card showing a single
bar labelled `s` above a card showing twelve — two charts that look comparable and are not.
A repo the commit sample never reached draws the same axis and says `outside the commit sample`
across it rather than implying a year of silence.
Bottom row of the card: mono `★ {stars}  ⑂ {forks}  {language mark + name}  {pushed}`.
Tap opens the repo.

*(Superseded: the body used to be a halftone field keyed off `hash(repo, col, row)` — a texture
that looked like data and encoded none. Every mark on the card is now a real month.)*

### 8. `index` — pin03 (correspondence storage)
Canvas, **edge to edge**: masthead at the top, the drawer lip and its plate pinned to the
bottom, cards filed between them. Header centered mono caps `PULL REQUESTS`, left `Ch. 3 /`,
right `/ {count}`.
A stack of filing cards: each PR is a white row with a hairline border, offset left by
`min(rank,6) * 9px`, so the rows step like the pin's index.
A **black tab** rides the left of each row carrying `#{number}` in mono onBlack.
Row content: repo in mono ink70, title in Inter 400 14 ink (2 lines max), and on the right a
black-filled date block `{MON}–{MON}` style age (`3d` / `SEP` / `AUG–SEP`).
Draft PRs get the fully-inverted treatment (black row, onBlack text) like the pin's black cards.
Filter tabs `open {n} / draft {n}` in the pin's tab style.

Under the last card the drawer keeps going in **empty slots** down to the lip — the pin is a
*full* drawer, and an empty slot is part of that picture in a way that half a page of blank
canvas is not. How many is measured, not guessed: a card is one or two lines deep depending on
its title, so the slot count comes from the drawer's height minus the stack's.

**Tapping a card opens it** (`pull`, below) rather than leaving for the browser.

### 9. `dots` — pin01 (connect the dots)
White canvas, ink only. Title mono `join the dots` + right mono `streak {n}`.
The contribution year as a scatter of points on a 53×7 lattice with jitter:
 - level 0 → tiny 1.5px ink 20% point, no number
 - level ≥1 → filled black disc, radius 3–7 by level, with the **day's commit count** printed
   beside it in 6px mono
 - the **longest streak** days are connected in order by a 1px ink polyline and numbered `1..N`
   in white inside their discs, exactly like a dot-to-dot puzzle.
Top and bottom edges get the pin's dense black "blob" treatment: months with the highest volume
have their discs merged into solid ink masses.
Footer: mono `{total} contributions · best day {n} · {activeDays} active days`.

### 10. `archive` — pin10 (rain years)
Cream `#F7F5F0`. Header: italic serif `Contribution Year` left, serif centered `Today`,
right two column heads mono `before` / `after`.
One row per contribution year (newest last, like the pin):
 - left 60%: 12 monthly circles, radius ∝ that month's contributions, fill blue at
   alpha ∝ intensity, olive `#8C8A5E` for months below the median; a vertical hairline runs
   through today's month across all rows.
 - right 40%: paired horizontal bars `before` (steel `#5E86A3`) and `after` (olive `#8C8A5E`)
   with the numeric label; the top-3 years get the saturated-blue + white-label treatment.
Row label = year, italic serif 11, with a hairline rule per row.

### 11. `loading` — pin11 (art of type)
Full-bleed ultramarine `#1A50D5`, white uppercase grotesque, one line of type repeated down the
page with its tracking warped line by line until the block bends into a wave. In the app the
phrase is **your own commit messages**, taken from across your whole history, five rows per
message so the eye can follow a letter from row to row — which is the only thing that makes the
wave read as a wave rather than a word search.

Glyphs are positioned individually (`<Text x={[…]}>`): both ends pinned to the margins, the
letters between them pushed by one cycle of a sine whose phase slips per row and travels while
you wait. Amplitude is capped so the tightest gap still clears a capital M.

Two motions, both functions of **elapsed seconds** off one `requestAnimationFrame` ticker
(`useTicker`): the wave travels at 0.2 Hz, and the whole block drifts upward at 0.28 rows a
second so unseen messages keep arriving from the bottom. A timer stepping a counter — which is
what this was — runs at whatever rate the timer fires and stutters visibly. Rows soften out at
both edges rather than clipping against the status bar and the caption, and the field fades in
over half a second instead of cutting to a full page of type.

**One `<Svg>` per row, not one for the field.** Inside a single canvas, react-native-svg shapes
every row's glyphs in one pass, and at a full page of text in a downloaded font that pass
corrupts the heap: the app dies with a `SIGSEGV` inside Fabric's `MountingCoordinator` before it
draws a frame. Reproducible on an x86_64 emulator; the trigger is total glyph count, and it goes
away with either the custom font or the shared canvas removed. Per-row canvases keep each pass
small and draw exactly the same picture.

#### Where the words come from

The screen is on display *before* any request finishes, so the messages are a **pool kept on the
device** (`messageCache`), refetched only when it is more than a week old. Every other launch
reshuffles what is already there, which costs nothing and still reads differently each time.

The pool itself is oldest-heavy: `commitLines` asks the commit search endpoint for the thirty
oldest commits by author date and the twelve newest. `activity.ts` cannot do this — it reads the
newest commits of your most recently pushed repos, which is only ever the last few days — and
GraphQL has no commit search at all, hence the one REST call. Accounts whose history will not
search fall back to the sampled history, and a first launch falls back to stand-in commit
subjects, so the screen is always a wall of commit messages rather than the app's name six
times.

### 12. `brief` — pin03's card, opened

pin03's filing card with the lid off: the masthead, one pull request's cover (number tab, state
chip, diff rule, counts, labels) and then its description.

The description is **rendered, not printed** (`components/Markdown`). GitHub hands back raw
Markdown and this screen used to put it on the page verbatim, so a heading arrived as a literal
`## Problem` and a list as a column of hyphens. The renderer is deliberately partial — headings,
lists, task lists, quotes, fenced code, rules, and inline code / bold / italic / links — and
anything it does not recognise falls through as text, which is the correct failure for prose.
Headings are underlined with a wave; so is `The description`.

Paging lives in a **bar pinned to the bottom** (`← prev · n of N · next →`), so `next` is in the
same place on every pull request. It used to sit under the description, which put it below the
fold on a long body and halfway up the screen on a one-liner.

### 13. `pull` — a pull request, opened

Not a page in the rail: a full-screen overlay pushed **over** the pager from `index` or `brief`,
with its own back button and a `hardwareBackPress` handler. It sits over the pager rather than
inside it because it has horizontal scrollers of its own, and nested in the pager every one of
them would lose its drag to the page swipe.

Header: title, state chip, the proportional add/delete rule, and a stat row. Then three tabs —
`the brief` (the description, same renderer), `talk`, `files` — and a footer with `open on
github` and `{head} → {base}`.

**`talk` is drawn in waves.** Every other surface in this app is ruled and filed and measured,
and a review thread is none of those things; the wave is what marks the part of a pull request
that is two people arguing rather than a statistic. Each comment has a vertical wavy spine in
its own tone (comment blue, review by state, thread purple), sized to the comment it runs beside
by measuring it after layout — SVG cannot stretch to a sibling. Comments are separated by wavy
rules, each phase-shifted so stacked rules do not line up. A review thread carries the file it
is anchored to and the few lines of diff it is arguing about, with its replies indented under
their own spine.

**`files` is the actual patch.** `+54 −13` is the size of a change and tells you nothing about
the change. Line numbers are recovered from the `@@` headers (a unified diff carries them
nowhere else), additions and deletions are *banded* as well as coloured, the hunk rule carries
the enclosing function, and every file folds — the one you want is rarely first, so anything
over forty lines starts closed. Long lines scroll horizontally on a surface sized from the
longest line rather than wrapping. Binary files and files GitHub declines to diff say so.

Two requests, because the two halves live in different APIs: GraphQL for the object and its
talk, REST for the files, because GraphQL's `files` connection has paths and counts but no patch
text. The REST half is optional — a token that can read the object but not the contents still
gets a readable conversation.

## Navigation

Horizontal pager, 10 pages. Bottom rail: a horizontally scrolling mono label strip
(`hey  now  flow  poster  orbit  weather  cards  index  dots  archive`), active label ink +
2px underline, inactive ink40. No anonymous dots. Rail sits on canvas with a top hairline.

## Sign-in (`PatForm`)

Pin04 treatment: serif `Hey,` / `paste a token`, cross-grid texture behind, mono input with a
hairline underline, filled black pill `connect`, ghost pill `try the demo`. Error text in `red`.

## Widgets — two variants, both required

### Widget A — `GitHuhWidget` (nothing-mtui background)
Background **must** come from the `nothing-mtui` token mapping:
`widgetBg` = `neutral1/50` in light, `neutral1/900` in dark.
Resolution order:
 1. Android 12+ → resolve the live Material You palette natively:
    `android.R.color.system_neutral1_50` / `system_neutral1_900`. This is what Nothing OS does.
 2. Otherwise → the static fallback the package ships, passed in the sync payload from JS
    (`nothingWidgetColors(null, mode)`), so JS stays the owner of the package.
Elements use `widgetElements` (`#000` light / `#fff` dark) and the accent uses `widgetFood`
(`#d71921`) — the only Nothing red in the whole project. Layout unchanged in spirit:
handle, today's commits, dot matrix, footer stats — but the matrix follows day/night elements.

### Widget B — `GitHuhBoardWidget` (pin08 board style)
The urbit card: `#0B0B0A` card, `#F4F2ED` ink, **no Material You, no red**.
Sigil + `~{login}` in IBM Plex Mono (ship `ibmplexmono.ttf` in `res/font`), a halftone dot field
of the last N days (white dots, radius by level, peak days squared off), and a mono footer
`{totalCommits} commits · {openPrs} prs`. Replaces the old "paper" widget.

## Data coverage

Everything the GraphQL API gives that is worth showing must be surfaced:

| field | screen |
|---|---|
| login, name, avatar, bio | hey, weather, cards |
| contribution calendar (365d, per-day counts) | hey, now, poster, dots, weather |
| contributionYears | poster (chips), archive (rows) |
| commits / PRs / issues / reviews totals | flow |
| repositoriesContributedTo + per-repo commit counts | flow, cards |
| repositories: name, stars, forks, language(+color), pushedAt, isPrivate | cards, orbit, hey |
| language byte breakdown | orbit, now (dock) |
| followers / following | hey |
| open PRs: number, title, repo, age, draft, url | index, hey, weather |
| derived: streaks, best day, active days, avg/day, busiest weekday, velocity | weather, now, dots, hey |
| commit messages + timestamps (sampled history) | clock, loading |
| per-repo commits by month | cards |
| PR comments, review threads, review state | hey (feed), review, pull |
| review requests, mentions | hey (feed) |
| PR body, file patches, diff hunks, base/head refs | pull |
| oldest + newest commit subjects (commit search) | loading |
