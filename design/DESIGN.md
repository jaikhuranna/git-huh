# git-huh — design spec

Source of truth: the Pinterest board **"nothing github"** (eleven pins, `pin01`–`pin11`).
Every app screen is one pin, rendered with real GitHub data. The pins are other people's
work and are not redistributed in this repository; each is described where its screen
is specified, which is all the spec relies on.

This file is the **per-screen spec**. The rules that hold across every screen —
colour, type, space, motion, patterns, the prohibitions — live in
**`design/LANGUAGE.md`**, and that is the one to read first.

## Hard rules

1. **The app is the widget, zoomed out.** The home-screen card — a warm near-black
   surface, one mono face, your commit messages travelling across the top and the days
   as dots under them, a plus for today, a wave for a silence — is the source of every
   screen. Each screen keeps the layout its pin gave it; the marks are the widget's.
2. **Still not the Nothing design language.** No DotGothic16, no dot-matrix *typeface*,
   no `#D71921`. The dots are data (a day, a week, a month, an hour), never a texture
   laid under something else.
3. **One ink.** Colour appears only as the machine's `yes` and `no` (added / removed,
   passed / failed, approved / changes requested), muted, and always beside a word or a
   sign that says the same thing.

## Palette

```
                day        night
canvas          #ECE8E4    #141110   the page the cards sit on
card            #F8F5F2    #221C1A   the widget's card — every raised surface
recess          #E0DBD6    #2D2624   inset: a track, a code block, a swiped row
ink             #211C1A    #ECE5E0   statement
ink70           #615854    #ADA49E   support
ink40           #978D88    #7A716C   annotation
ink20           #CBC3BE    #463E3B   structure
black / onBlack  the solid surface (a selected chip, the one button that is the point)
yes             #56794F    #93AD8A   sage
no              #A8553F    #D08A74   clay
```

Intensity is never hue: it is a dot's size and weight, on the widget's own ramps
(`levels.scale` / `levels.alpha` = `DotFieldRenderer.SCALES` / `ALPHAS`).

## Type

One family, IBM Plex Mono, in every role (`@expo-google-fonts/ibm-plex-mono`):

| role | cut | spec |
|---|---|---|
| display | 300 Light | 34/40, −0.8 tracking — greetings, a handle |
| title | 500 Medium | 19/25 |
| heading | 500 Medium | 14/20 |
| body | 400 Regular | 13/20 — prose, titles, comments |
| numeral | 200 ExtraLight | 86/92 — `weather`'s one figure |
| label | 400 Regular | 11/15, lowercase |
| data | 400 Regular | 12/16 |
| aside | 400 Italic | 12/18, `ink70` — `since 2021 · …` |

Every primitive has a system fallback so a font-load failure still renders.

## Geometry

radius: card 24, sheet 28 (the widget's corner), tile 14, pill 999. gutter 18, card
padding 18. A screen is a stack of cards with 10pt between them.

## The widget's marks, in the app

- **`DotField`** — the widget's field: a run of days ending today, newest in the
  bottom-right corner, dots sized and weighted by level, the peak squared off, today the
  plus, three weeks or more of nothing folded into the wave with its length on it
  (`lib/quiet.ts`). One `<Path>` per level.
- **`DotRow`** — one row of the same dots for any series over time (a week, thirty days,
  twelve months): the peak squared off and carrying its number, empty slots the grid's
  ghost, a long enough empty run the wave.
- **`Marquee`** — the widget's top strip: `repo ~~~ commit message`, travelling left on
  the native driver. Widths are arithmetic (Plex Mono is 0.6 em a glyph), so nothing is
  measured.
- **`Card`** — the widget's surface and corner, with an optional name/figure caption.
- **`StateChip`**, **`DiffDots`** — where a pull request or issue stands (a dot and the
  word, in an outlined pill), and additions against deletions as a row of 24 dots.

## Screens — pin by pin

Screens are numbered by the pin they come from, **not** by where they sit in
the app — the sections and their order are under "Navigation" below, and
`STORIES.md` is the argument for that grouping. `hey` is still the entry
screen: `today · you`.

### 1. `hey` — pin04 (Pantom)
`hey,` in `ink40` over `~{login}`, both display. Then **the widget itself**, on its card:
the travelling strip of your commit messages and the last few months as the widget's
field at its own pitch (7 rows, up to 21pt a dot), today the plus in the corner.
Then one sentence in body 15/24, the words `ink70` and every figure in full ink, medium:
`you made {total} contributions in the last year, more of them to {repo} than anywhere
else. you work most on {weekday}s, and your longest run was {streak} days in a row.
{prs} pull requests are still open.` Any figure with nothing in it drops out; vanity
figures (stars, followers) stay out. Then the aside `since {year} · {activeDays} active
days · {n} day streak`.

Then **the feed**: a mono head naming what it lists (`pr comments` by default) with
`change` on the right, and the rows as feed cards. It starts with the inbox's own feed
and **keeps going**: scrolling within a screen of the bottom pages in older history —
`fetchSocialPage`, ten of your pull requests at a time, open or not, newest activity
first, the last twenty comments and ten reviews of each (`useFeedHistory`). The inbox's
feed is only your *open* pull requests and the last three words on each, because it is
also the background check; under the greeting that made the page stop after a
screenful. The foot says which it is: `reading older pull requests…`, `older →`, or
`that is everything, back to {month}`. Which kinds it lists is a setting on the account
page (`lib/home.ts`).

### 2. `now` — pin02 (Ai OS)
Three cards. **today**: the count set in the widget's dots — lit cells are peak dots, the
rest the grid's ghost (two paths), captioned `contributions so far today`, with
`yesterday · best` as the card's figure. Then two half cards: **this week** (the last
seven days as a `DotRow` with weekday initials, today the plus) and **languages** (the
top four, name and share). Then **last 30 days** as one `DotRow`, a week of nothing a wave.

### 3. `flow` — pin05 (Sankey)
Title row `where it went` / `last 12 months`, the chart on a card with `100%` and the
total over it. One trunk fans into commits / pull requests / issues / reviews /
**private**, and the commits band fans on into the repositories. **Weight, not colour**:
each kind of work is one of the widget's weights of ink (commits 1, pull requests .72,
reviews .52, issues .36, private .16), and its legend row repeats it as a dot of the
same weight. Private is the faintest on purpose — GitHub says how much and nothing
else — and a footnote says so. Repositories step down in weight by rank, `others` the
ghost. Nodes are rounded bars.

The second stage belongs to **the commits band alone**: `commitContributionsByRepository`
counts commits, so the repositories hang off the commits band and are scaled to it.

### 4. `poster` — pin09 (IBM)
**Full page**: the year and `week by week` across the top, the chart taking every point
left over (measured with `onLayout`), the caption and the year chips at the foot.
One column per week, each a stack of the widget's dots rising from the baseline; the top
30% dissolves into a rain of smaller, fainter ones drifting by a fraction of a dot. The
busiest week's column is at full weight, the rest a step back. One path per weight.
A month rule runs under the baseline.

Every year is drawn from **its own calendar** (`YearSummary.weeks`). Year chips are a
**wrapped row, never a horizontal scroller**.

### 5. `orbit` — pin06 (letters on a spiral)
The spiral on a card, the legend on another. **One spiral** that *breaks* around every
mark on it; rank 0 at the outer end. The top six languages are the widget's dots with
the language's devicon mark cut out of them in `onBlack` — the first squared off, as a
peak is — weighted by rank. The rest are the mark in ink. **The spiral turns**, one
revolution every fifty seconds, parked off screen. Legend rows are a round chip holding
the mark, the name and the share. GitHub's language colours are not drawn anywhere.

### 6. `weather` — pin07 (weather gradients)
Centered: `~{login}`, the date, a condition — `severe shipping expected` (streak ≥ 7),
`steady output`, `quiet and overcast`. Hero: the thin numeral, today's count, `today`
beside it; `high {bestDay}` `low {avgPerDay}` under it. A card of three readings with
hairline glyphs — velocity (the arrow **follows the sign**), consistency, pace — and a
card of the last seven days as a `DotRow`.
The sky is **a field of dots rising from the bottom of the page** instead of a gradient:
how high it climbs and how bright it gets is the current streak, seeded so the same
streak is the same sky. It is coarse on purpose (a dot every 19pt): at 13pt the path
was big enough to make the x86_64 emulator's launch crash (see the SVG trap in
`CLAUDE.md`) four times in six.

### 7. `cards` — pin08 (urbit)
A fanned deck of the widget's cards at slight rotations, overlapping, a band of canvas
at every seam. Each card: the generated **sigil** in ink, `~{owner}-{repo}`, and that
repository's commit history as **a `DotRow` of months** on the deck's one shared
twelve-month axis (`monthWindow`) — the busiest month squared off with its count, three
quiet months or more the wave. A repo the sample never reached says `outside the commit
sample`. Bottom row: `★ ⑂ {language mark + name} {last commit}`. Ordered by when the
repository last had a commit written in it, not `pushedAt`.

### 8. `index` — pin03 (correspondence storage)
`pull requests` / `{n} yours`, chips `open {n}` `draft {n}`, then **one card per
repository**, its name and count across the top and its pull requests as rows inside:
title, `#{n} · waiting {age}`, and a dot for how long it has waited — bigger and brighter
by the day, week, fortnight and month, squared off past a month — so the one that has
sat longest stands out the way a peak day does on the widget. Tapping a row opens `pull`.

### 9. `dots` — pin01, now **the widget, zoomed out** (`lab`)
The home-screen card with room to pull back: the strip on top, the field under it, and
three zooms — `widget` (seven rows at the widget's own pitch, a few months), `6 mo` and
`year`. Zooming out makes the dots smaller and the card **taller** — more rows of the
same run of days — because the widget's rows are not weekdays either; at `year` every
day since last year's today is on the card. Under it, four figures on a card and a line
saying what the marks mean. (It replaced the connect-the-dots puzzle.)

### 10. `archive` — pin10 (rain years)
On a card: `year` / `today` / `before · after` heads, then one row per contribution year,
oldest first: twelve monthly dots sized and weighted by volume, three quiet months a
wave, a hairline through today's date across every row, and paired rounded bars for
before and after today, the top three years at full weight.

### 11. `loading` — the widget, waiting
The canvas, and in the middle of it the home-screen card: **your commit messages
travelling across the top** (`Marquee`, from the pool below) and a field of dots under
them with **a light passing through it** from the oldest column to today's plus, over and
over — each dot rests at a stand-in level and swells to the peak as the crest passes its
column, the crest leaning a little down the rows. Under the card, the wordmark and what
it is doing (`reading your year`). The card fades in over half a second.

**Nothing about the animation runs in JavaScript.** Every dot's whole track — its scale
and opacity at twenty-four phases of the sweep — is computed once at mount and handed to
the native driver as an interpolation of one looping value; the strip is one native
`translateX`. So the light keeps moving at the display's rate while the first GitHub
response is parsed on the JS thread.

*(Superseded: pin11's ultramarine page of warped uppercase type. It was the one screen in
another app's colours.)*

#### Where the words come from

The screen is on display *before* any request finishes, so the messages are a **pool kept on the
device** (`messageCache`), refetched only when it is more than a week old. Every other launch
reshuffles what is already there, which costs nothing and still reads differently each time.

The pool itself is oldest-heavy: `commitLines` asks the commit search endpoint for the thirty
oldest commits by author date and the twelve newest. `activity.ts` cannot do this — it reads the
newest commits of your most recently pushed repos, which is only ever the last few days — and
GraphQL has no commit search at all, hence the one REST call. Accounts whose history will not
search fall back to the sampled history, and a first launch falls back to stand-in commit
subjects.

### 12. `brief` — pin03's card, opened

pin03's filing card with the lid off: `the brief` / `1 / 5`, one pull request's cover on a card
(the number, a `StateChip`, the title, `DiffDots`, counts, labels as outlined pills) and then its
description under a wavy rule.

The description is **rendered, not printed** (`components/Markdown`). GitHub hands back raw
Markdown, and verbatim a heading arrives as a literal `## Problem` and a list as a column of
hyphens. The renderer is deliberately partial — headings,
lists, task lists, quotes, fenced code, rules, and inline code / bold / italic / links — and
anything it does not recognise falls through as text, which is the correct failure for prose.
Headings are underlined with a wave; so is `The description`.

Paging lives in a **bar pinned to the bottom** (`← prev · n of N · next →`), so `next` is in the
same place on every pull request. Under the description it would sit below the fold on a long
body and halfway up the screen on a one-liner.

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
its own tone (a comment `ink40`, a review by state — `yes` approved, `no` changes requested, `ink70` otherwise — a thread `ink70`), sized to the comment it runs beside
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

### 14. `inbox` — the feed, given a section

pin04's feed, lifted out of the greeting and given the page. `ScreenHead`
`what wants you` · `{n} events`, the wrapped chip filter
(`all · comments · reviews · mentions · yours`) with counts, and up to forty
rows, each on its own card. One of the widget's marks per category — a dot for a
comment, a ring for a review or a mention, a square for a review request, a
sage dot for an approval and a clay one for changes requested, a faint ring for
your own pull request — with the category written out in words as well, the comment text
quoted, and the repository and number under each row.

**A row opens the thing** — a pull request in `pull`, an issue or a
discussion in `thread` (below). The url decides which; the mentions search
returns all three.

**A row can be put away.** Swipe left for `done`, right for `snooze` until
nine the next morning. The words for both sit under the row and are
uncovered as it moves, so the gesture says what it will do before you let
go; the same actions are on the row as accessibility actions. Two more chips
at the end of the filter row — dashed, because they are where rows *went*
rather than kinds of row — are the `snoozed` and `done` folders, and inside
them either swipe puts a row back. The state is the app's own, saved on the
phone per account (`lib/triage.ts`), and every mark remembers the timestamp
of the event it was made against: when someone writes on that thread again,
the row is back in the inbox on its own. GitHub's inbox is never written to;
no `notifications` scope is asked for.

The tab count is the open wants-you rows — review requests, mentions,
changes requested — minus anything put away, computed from the same rows the
screen draws.

### 15. `thread` — an issue or a discussion

The pull request's `talk` without the diff, pushed over everything. Title and
a `StateChip` (`open` ink, `closed` faint, `answered` sage) and the title on a card, a mono byline,
labels as outlined pills, the body rendered, then the
replies on wavy spines (`Spoken`) — the discussion's accepted answer in sage
and marked `the answer` in words, replies to replies nested under their own
spine. At the end, the composer: `comment` and `close issue` / `reopen` for
an issue, `reply` for a discussion. Replies GitHub has that were not fetched
say so above the first one.

### 16. `repo` — a repository, from the inside

Pushed from a repo card, from a pull request's masthead, or from any link to
a repository in rendered Markdown. Name, description, `★ ⑂ language
private`, then five chips: `code · issues n · releases · discussions ·
security`. The footer carries `open on github` and the default branch with
what this token may do there (`you admin`, `you read`).

- **code** — a search field over the repository's code (GitHub's REST code
  search: default branch only, ten searches a minute, both said on the
  results), and under it a file browser: breadcrumbs, folders first with a
  trailing `/`, files with their size.
- **issues** — a filled `new issue` pill, then the open issues.
- **releases** — the newest open, the rest folded; notes rendered.
- **discussions** — category, title, replies, `answered`. Discussions that
  are switched off say so; a token without `read:discussion` says that.
- **security** — open Dependabot alerts, severity as a coloured rule *and* a
  word, the vulnerable range and the fix. A token without `security_events`
  is told so and linked to a token that has it — **an empty list is never
  shown for "not allowed to look"**.

### 17. `file` — one file, readable and editable

Line numbers, no wrapping (a horizontal scroll sized to the longest line,
capped at 220 columns), virtualised so a long file costs what is on screen. A
find bar with `n / m` and `↑ ↓`; the current match's line is banded in faint ink
and each occurrence is marked. Opened from a code search, the search term is
already in the bar.

`edit` swaps the reader for a monospace editor and a commit form: a one-line
message, and two choices as chips — `new branch + pull request` (the default)
or `commit to {branch}`. The first creates `login-patch-n`, commits there and
opens the pull request, **forking first when the token cannot push to the
repository**, which is what the website does for anyone who is not a
collaborator. The new pull request replaces the file on the stack. Files past
200 KB are not editable, and say so.

### 18. `new issue`

A list of the repository's templates (`.github/ISSUE_TEMPLATE`) and `blank
issue`. A Markdown template prefills the body. A **form** (`.yml`) becomes
fields — a line, a box, a choice as chips, ticks as boxes — with required
ones starred and listed under the button until they are filled. The body is
written in the website's own shape (`### Label`, the answer, `_No response_`
for a blank), so a repository's triage bots cannot tell the difference. The
new issue replaces the form on the stack.

### 19. `checks` — the fourth tab of `pull`

Every check run on the head commit, red first, then what waits on you, what
is running, what passed. A tally line (`2 failed · 1 waiting on you · …`),
then the actions: `re-run failed · {workflow}` for a failed Actions run,
`approve and run` for a first-time contributor's held run, `approve deploy ·
{environment}` / `reject` for a deployment waiting on a reviewer — and when
the reviewer is somebody else, it says that instead of offering a button. A
failed Actions job opens to the end of its log: the error annotations in clay,
then the last forty lines in mono.

### Writing back

Every write is the same object, `Composer`: one box, a row of verbs as
pills, the primary one filled, and a line under them that says what
happened in words — `approved`, `sent · it is on github now`, or exactly why
not (`this token is not allowed to do that review here · it needs more
scope`). Nothing is sent until a named button is pressed, and a failure
leaves the text in the box. On the demo account every write answers `demo
account · nothing was sent`.

- `talk` ends in `comment`, and — on someone else's open pull request —
  `approve` (no words needed) and `request changes`.
- `files` has a find field across every file (`n lines in m files`, matching
  lines marked with an ink rule, files holding them opened) and every line
  is tappable: the tapped line is quoted over a compact composer, `comment on
  this line`. Deleted lines comment on the old side, everything else on the
  new — including unchanged context lines.

### Offline

Every answer the app reads is saved on the device (`lib/store.ts`, a JSON
file per key in the documents directory) and drawn first on the next visit,
then replaced by the fresh one. When GitHub cannot be reached the saved
answer stays on screen with its age: `offline · saved 3h ago` in the chrome
for the year, and at the top of any pushed screen. A revoked token still
fails loudly, saved answer or not.

### The account page — the avatar, top right

Every section's chrome is the wordmark on the left and, on the right, `share` (on a
view that is a chart) and the account's picture in a circle — several overlapping when
accounts are added together. Settings open from the corner on every phone; the avatar
pushes **`account`** (`AccountScreen`) onto the stack.

**accounts**: one row each, picture, `~login` and a mono line. The one in use carries a
black `in use`; the others switch the whole app when tapped, and carry a `together`
toggle. **Ticked accounts are added into the one in use** (`lib/merge.ts`,
`useTogether`): the calendar is summed day by day and its levels worked out again over
the sum, every total and breakdown bucket is summed, repositories and languages are
merged, and `~you + ~work` becomes the handle on every chart and card. The inbox, the
pull requests and every write stay with the account in use — its token is the one that
can act — and an account that cannot be read drops out of the sum with `could not be
read · left out of the charts` rather than taking the charts down. People with a work
account asked for this: neither profile alone is what they did. Then a dashed
`+ add account` (the token form, with `cancel`) and `forget ~login` for the others.

**on the you page**: the kinds the `you` feed lists, as chips.

At the foot, filled `open github →` and outlined `disconnect ~login` (`exit
demo`). `disconnect` forgets the current account and moves to the next one if the phone
holds another.

**notifications**: `turn on`, then one chip per kind (`review requests ·
mentions · changes requested · approvals · comments`), and a line that says
exactly what it does — `android checks the inbox every 15 minutes or so, less
on a low battery` — or why it cannot (`blocked · android is not letting
git-huh notify`). It is a background check of the inbox, not a push; there
is no server. Put-away rows never notify, and what the inbox already showed
with the app open is not repeated.

## Navigation

**Five sections, a bar that is always visible, and a segmented control for
the views inside a section.** No drawer, no hamburger, nothing behind a menu,
and no scrolling list of thirteen names — which is a hamburger lying down.
The shape follows Apple's Human Interface Guidelines: three to five
persistent, labelled destinations that are *content* and not actions, with
the second level as a segmented control at the top of the section it belongs
to. `STORIES.md` is why the grouping is this grouping.

| section | views (segmented control) | the question it answers |
|---|---|---|
| `today` | `you` · `now` · `weather` · `hours` | how am I doing |
| `inbox` | `recent` | what wants me |
| `work` | `pulls` · `brief` · `cycle` · `repos` | what am I shipping |
| `year` | `weeks` · `split` · `languages` · `years` | what was the year |
| `lab` | `zoomed out` | the widget, pulled back to the whole year |

- **Bar**: the system's own tab bar, through expo-router's `NativeTabs`
  (`app/(tabs)/_layout.tsx`). On iOS it is `UITabBarController` — Liquid Glass
  on iOS 26, with SF Symbols and the system's own type, minimising as you
  scroll down. On Android it is Material 3's navigation bar on canvas, mono
  labels, Material Symbols, and the selected indicator in the card's colour —
  the same surface every screen above it is drawn on. A bar drawn in JavaScript could
  never look like either system's. `inbox` carries a count of the events addressed to you (review
  requests, mentions, changes requested), which is the honest version of a
  badge: it is computed from the rows that are actually there.
- **Segments** (`Segments`): mono labels, the selected one in full ink with the
  app's wave under it — the widget's `repo ~~~ message` weights. Hidden when a section
  has one view. The row **wraps, it never scrolls**.
- **Swiping** moves between views *within* a section and stops at its edges,
  so a drag never carries you three destinations away.
- **Sections keep their place.** Each remembers which view you left it on,
  and mounts the first time it is opened rather than on launch, so nothing
  is built before it is looked at. A mounted screen is memoised and redraws
  only when its own data changes.
- **Detail is a stack.** `pull`, `thread`, `repo`, `file`, `new issue`,
  `account`, `share` and `add account` push over the sections and over each other, each with `←
  back` and the system back button wired to pop the top. Lower pages stay
  mounted, hidden, so back returns to them as they were. A github.com link
  anywhere in rendered Markdown opens the matching page on the stack instead
  of the browser. (`lib/nav.tsx`.)

### Share — a view as a 4:3 image

`share` in the chrome, on any view that is a chart, pushes a preview of that view
recomposed as a **4:3 card** (`ShareCard`, 640 × 480 points, captured at 1600 × 1200
PNG with react-native-view-shot and handed to the system share sheet with
expo-sharing). A card is not a screenshot: a phone screen is portrait and scrolls, a
timeline image is landscape and does neither. Every card is the same frame — wordmark
and handle across the top, a light display title and one thin figure, the chart, and a line of
fact with the month along the foot — so a run of them reads as a series.

| views | card | chart |
|---|---|---|
| `you` `now` `weather` `zoomed out` | a year on github | four figures and the widget's field, eleven rows deep so a whole year fits |
| `weeks` | {year}, week by week | the poster for one year (chips on the share page pick it) |
| `split` | where the year went | one ruled bar and a legend with counts and shares |
| `languages` | what I write in | six bars and an `other` |
| `years` | every year on github | a column per year, the last twelve |
| `hours` | when I commit | 24 bars from the sampled commits |

Lists (`inbox`, `pulls`, `brief`, `cycle`, `repos`) have no card. Every list on a card is
capped in `lib/shareData.ts` and big figures are shortened (`12.3k`), so no account can
push anything off the frame; a card with nothing to draw says so in the chart's place.
The card follows the phone's light or dark.

### Silences — the wave, in every chart

The widget draws three weeks or more of nothing as the app's wave with its length on it
(`The dot field`, below). The app's charts do the same, from `lib/quiet.ts`: bars and
rows keep their axis and the wave **bridges the empty stretch in place** — a month of
empty weeks on the poster, three empty months on a repository card or an archive row,
a week of empty days on `now`'s last thirty, an empty run of hours or years on a share
card — and `DotField` folds it the way the widget does. The part of a year that has not happened yet is never a silence.

*(Superseded: a single horizontal pager of thirteen pages under a
horizontally scrolling name rail. Everything was one swipe from its
neighbours and nothing was one tap from anywhere, the rail's contents
depended on where you already were, and `dots` — a puzzle — sat in the same
rank as the pull request drawer.)*

## Sign-in (`PatForm`)

`hey,` / `paste a token and i'll read the year.`, a card holding a stand-in field of the
widget's dots, mono input with a hairline underline, filled pill `connect`, ghost pill
`try the demo`, the app's version top right. Error text in `no`.

## The widget

### The widget — `GitHuhWidget`

**The surface is the one place Nothing survives.** The card sits on the Material You
neutral that Nothing's own widgets use — `system_neutral1_50` by day and
`system_neutral1_900` at night — read natively while the card is composed
(`WidgetSurface.kt`), so it follows the wallpaper without the app having to run. Android
11 and older have no dynamic palette and get fixed tones (`#E5E5E5` / `#1B1B1B`), which
are also what the iOS widget uses. Ink is `#000` by day and `#fff` at night — painted
white, with each mark's weight in its alpha, and tinted by the launcher with a day/night
colour, so the ink and the surface flip together the moment the phone changes scheme.
Ink chosen while composing would stay behind until the next redraw: white type on a card
that had just turned pale.
**There is no accent**, and no Nothing red: today is a plus, and the field reads
through shape, which is what the rest of the app does.

**One padding, every side.** Glance's `Scaffold` pads the sides and the top and bottom by
different amounts, so the card draws its own background, its own corner radius and a
single `padding(14.dp)` instead.

Layout, top to bottom — **two elements, and nothing else**:
 1. **A commit message of your own, travelling.** Mono 11, right to left, with the
    repository it was written in at the end of the line in the faint ink. A home-screen
    card has four lines to spend, and none of them goes on telling its owner their own
    name. **The handle is not a fallback for it** — a card with no line to run runs
    none, and a card that has never been synced shows the sigil (`GlyphRenderer`) and
    `open the app to connect`. Two things keep the line from being
    either absent or a different one every hour: a sync that carries no pool keeps the
    stored one rather than erasing it, and the pick hashes the local day against each
    message instead of indexing a list the app reshuffles on every launch.
 2. **The dot field** (below), which has the rest of the card. Today is a **plus**;
    a peak day is a rounded square; everything else is a dot sized by level.

No counts. They are on every screen in the app, and a home screen is not where they
are wanted.

**The strip is a loop, and it starts on the card** — at the card's left edge, where it
rests, travelling left. Entering from beyond the right edge (`fromXDelta="100%p"`) would
mean five seconds of empty card at the top of every pass.

The loop is painted as one frame per card width — `CYCLE_UNITS` (3) of them, each two
widths long and starting one width further along than the last — and the flipper shows
them in turn. A turn slides a frame exactly one width (`-50%` of its own width) and hands
over to the next frame on identical pixels, so the scroll is continuous and the flip is
invisible. **Frames rather than one long bitmap for two reasons**: a turn is then six
seconds rather than a quarter of a minute, so motion resumes quickly after anything that
resets the flipper; and a launcher that declines to run a widget's animations still gets
a strip that advances a card width every turn instead of one frozen on a single
sentence. As many of your lines as the cycle holds go into it, spaced so the last one
ends exactly on the cycle boundary, so the strip runs several messages rather than the
same one over and over.

**The space between two messages is a rule, not a hole.** It carries the same wave the
pull request screens separate written things with — `Squiggle.tsx`'s amplitude 2.6,
wavelength 13, 1.25 stroke at half ink — painted into the gap by `TextRenderer`. A strip
of commit messages is writing rather than data, and the wave is how this app says so.

Two things that must not come back: `fillAfter` on the animation (an interrupted turn
parks the line off the left of the card until the next flip), and `setDisplayedChild` to
kick the first turn off (asking for an animated show while the view is still being
applied leaves the card blank for a quarter of a minute). Shown plainly, the first child
rests at the start of the cycle: the line is on the card from the first frame and starts
travelling at the first flip.

**Why it is built the way it is.** A widget cannot animate
anything from Kotlin, and the marquee everyone reaches for is not available either: a
TextView only marquees while it is selected, `View.setSelected` is not a
`@RemotableViewMethod`, and asking for it through `RemoteViews.setBoolean` takes the
whole card down with *Can't load widget* on Android 15. What does work is a
`ViewFlipper` with `android:autoStart`, which starts itself on attach and runs
animations out of this package's resources, in the launcher's process, stopping when
the screen goes off. Two children hold the same line and the flip interval is exactly
one pass (12s), so the pass that arrives is the pass that just left.

The children are `ImageView`s, not `TextView`s: a layout inflated into the launcher
does **not** resolve `@font`, and the strip came out in the launcher's own sans. So the
line is painted by `TextRenderer.strip` — message in `widgetElements`, repository in
the faint ink — and each child's width is set to the bitmap's at bind time with
`setViewLayoutWidth`, which is what lets `toXDelta="-100%"` carry the whole message off
the left-hand edge. That call is API 31; below it the strip is printed still.

### The dot field — one bitmap, painted at the shape of its box

The widget paints the field with `DotFieldRenderer` and hand it to Glance as a single
`Image` with `ContentScale.Fit`. **Do not go back to a Column of weighted Rows.** That
layout cannot make a square grid: the columns split the reported width while the rows
were pinned to a capped dp height, so the horizontal pitch ran about 2.5× the vertical
one and the field read as stripes. It also lost rows — a launcher that over-reports its
height leaves the nested LinearLayouts short and RemoteViews gives the last children no
height at all, so a seven-row grid arrived on the home screen with five rows in it.

Three rules, and all three exist because breaking one was visible on a real phone:

1. **The bitmap is painted at the box's own shape**, `innerWidth × fieldHeight`. Any
   other shape is letterboxed by `ContentScale.Fit`, and then the field floats inside
   the card with margins that match neither the strip above it nor each other.
2. **The pitch comes from the height and the columns from the width.** Seven rows as
   big as the height allows (capped at 22dp a cell), then as many weeks as fill the
   width at that pitch. Nothing is left over to centre, so the field's edges are the
   card's padding. Only the *ratio* of the reported size is trusted; a launcher that
   under-reports just gets a smaller bitmap scaled back up.
3. **The newest day is the bottom-right mark.** The field is a run of days, not
   GitHub's weekday calendar: days go down each column and on to the next, oldest
   top-left, so the last mark on the card is today — the same corner every day, and
   never a column of days that have not happened yet. The payload is therefore
   the year as it happened, ending on today, with no padding in it.
4. **Three weeks or more of nothing is a wave.** A quiet stretch that long is drawn
   as the app's hand-drawn rule across the middle of the field, three columns wide,
   with its length over it in mono — `5 wk`, `4 mo`, `1 yr` — and the columns it would
   have filled go to days that had something in them. A year with one busy spring
   shows the spring, and the silence after it is one line that says how long it was.
5. **A silence starts and ends as empty days.** Each side of a wave keeps one whole
   column of the stretch's own empty days, and the newer side finishes the column its
   marks stopped in first, so the wave sits between two columns of nothing and never
   against the last commit beside a half-empty column. A stretch folds only
   when what it hides is more than the wave's three columns once its edges have
   kept theirs, so a wave never costs the card room — under five weeks or so of
   nothing stays as dots. The oldest silence runs out to the card's left
   edge — quiet since before anything the card can show. Only a payload shorter
   than the card leaves ghost dots on the left: an account younger than the card.

### One widget

Two widgets of the same data, differing mostly in their surface, is one more than the
home screen wants. The pin08 card (sigil + `~handle` + halftone field) is not built;
its sigil survives as the widget's empty state (`GlyphRenderer`).


## Data coverage

Everything the GraphQL API gives that is worth showing must be surfaced:

| field | screen |
|---|---|
| login, name, avatar, bio | hey, weather, cards |
| contribution calendar (365d, per-day counts) | hey, now, poster, dots, weather |
| contributionYears | poster (chips), archive (rows) |
| commits / PRs / issues / reviews totals | flow |
| restrictedContributionsCount (private work) | flow, widgets |
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
