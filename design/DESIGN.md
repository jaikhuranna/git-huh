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
`#EFEFEF` flat canvas. Top-right: `git-huh?` lockup where the IBM logo sits (serif, ink).
Body: **pixel-rain column chart** — one column per week (53), height ∝ that week's contributions.
Each column is a stack of 8px squares; the top 30% of each column dissolves into scattered
squares with gaps. Square colors cycle `black, blue, red, green` with black dominant (~60%).
Below: mono caption `{year} · {total} contributions · peak week {n}`.
Year chips (mono, from `contributionYears`) let you swap the year; selected chip filled black.

### 5. `orbit` — pin06 (letters on arcs)
White-ish canvas. Title mono `languages`.
Concentric arcs (3–4 rings) drawn as thin ink curves. Each language sits on a ring —
ring index by rank, angle spaced evenly. Top 6 languages get a filled chip in **their real
GitHub language color** (square for odd rank, circle for even, mirroring the pin); the rest are
plain ink letters. Chip label = the language's first letter, full name in mono underneath the chip.
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
Gradient is warm when the current streak is alive, cold when it is not; intensity ∝ streak length.
Pill `this week` over the gradient opens a 7-bar strip; circular button at the bottom = `sync widget`.

### 7. `cards` — pin08 (urbit)
Near-white canvas, vertical stack of **black repo cards** at slight rotation offsets (−3°, 0°, 2°…),
overlapping by ~40% so they read as a fanned deck; the focused card lifts.
Each card: generated **sigil** top-left (2×2 grid of quarter-circle / dot-pair / dome / disc
primitives, chosen deterministically from a hash of the repo name), mono `~{owner}-{repo}` beside it.
Body: **halftone dot field** — white dots, radius ∝ that repo's recent commit density, laid on a
24×7 grid; the repo's top language color tints ~10% of the dots.
Bottom row of the card: mono `★ {stars}  ⑂ {forks}  {language}  {pushed}`.
Tap opens the repo.

### 8. `index` — pin03 (correspondence storage)
Canvas. Header centered mono caps `PULL REQUESTS`, left `Ch. 3 /`, right `/ {count}`.
A stack of filing cards: each PR is a white row with a hairline border, offset left by
`min(rank,6) * 10px`, so the rows step like the pin's index.
A **black tab** rides the left of each row carrying `#{number}` in mono onBlack.
Row content: repo in mono ink70, title in Inter 400 14 ink (2 lines max), and on the right a
black-filled date block `{MON}–{MON}` style age (`3d` / `SEP` / `AUG–SEP`).
Draft PRs get the fully-inverted treatment (black row, onBlack text) like the pin's black cards.
Bottom: the whole stack sits on a hairline "drawer lip" rule with mono caption
`Figure 3-1. Open pull requests`. Filter tabs `open / draft` in the pin's tab style.

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
