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
`STORIES.md` is the argument for that grouping. Most of them are now **blocks**
on a section's page rather than screens of their own (a section is one page;
see Navigation), but each keeps its pin's layout and its head. `hey` is still
what opens the app: the top of `today`.

### 1. `hey` — pin04 (Pantom)
`hey,` in `ink40` over `~{login}`, both display, with `share` (the year as a 4:3
card) at the right of `hey,`. Then **the widget itself**, on its card:
the travelling strip of your commit messages and the last few months as the widget's
field at its own pitch (7 rows, up to 21pt a dot), today the plus in the corner.
Then one sentence in body 15/24, the words `ink70` and every figure in full ink, medium:
`you made {total} contributions in the last year, more of them to {repo} than anywhere
else. you work most on {weekday}s, and your longest run was {streak} days in a row.
{prs} pull requests are still open.` Any figure with nothing in it drops out; vanity
figures (stars, followers) stay out. Then the aside `since {year} · {activeDays} active
days · {n} day streak`.

**The feed is the last block on `today`**, after `now` and `hours`, because it has no
end: a mono head naming what it lists (`pr comments` by default) with `change` on the
right, and the rows as feed cards. It starts with the inbox's own feed
and **keeps going**: scrolling within a screen of the bottom pages in older history —
`fetchSocialPage`, ten of your pull requests at a time, open or not, newest activity
first, the last twenty comments and ten reviews of each (`useFeedHistory`). The inbox's
feed is only your *open* pull requests and the last three words on each, because it is
also the background check; under the greeting that made the page stop after a
screenful. The foot says which it is: `reading older pull requests…`, `older →`, or
`that is everything, back to {month}`. Which kinds it lists is a setting on the account
page (`lib/home.ts`).

### 2. `now` — pin02 (Ai OS)
The `today` block, under the head `today` / `{weekday, month day}`. **The count** set in
the widget's dots — lit cells are peak dots, the rest the grid's ghost (two paths),
captioned `contributions so far today`, with `yesterday · best` as the card's figure.
Then **the weather** card (6, below). Then two half cards: **last 7 days** (a `DotRow`
with weekday initials, today the plus) and **languages** (the top four, name and
share). Then **last 30 days** as one `DotRow`, a week of nothing a wave. `now` and
`weather` used to be two views and drew today's count and the week twice; they are
one block.

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
The first block of `year`: the head `{year}, week by week` with `share` (which opens on
the year the poster is showing), the chart on a card at a fixed 300pt — it used to take
the whole page, which a page of five blocks cannot give it — the caption under it, and
the year chips below the card.
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
revolution every fifty seconds, on the native driver: the spiral is drawn once and the
view holding it rotates, every mark in its own small canvas turning back against it so
it stays upright. It used to be a JavaScript frame loop redrawing the SVG, which on a
page that scrolls stuttered the scroll. Parked while `year` is not on screen. Names are
lower case, like everything else. Legend rows are a round chip holding
the mark, the name and the share. GitHub's language colours are not drawn anywhere.

### 6. `weather` — pin07 (weather gradients)
A card inside the `today` block: `weather` / `{n} day streak`, a condition as a title —
`severe shipping expected` (streak ≥ 7), `steady output`, `quiet and overcast` — and
`high {bestDay} · average {avgPerDay} a day` under it (it said `low` over the average
once; the low of a year is always nought). Three readings with hairline glyphs:
**the last seven days against the seven before** (the arrow **follows the sign**;
rolling, not the calendar week, which on a Sunday is one day old and read as a
collapse), **active days** (the share of days that have happened with work in them),
and **longest run**. Today's count and the week are the `now` cards around it, not
repeated here.
The sky is **a strip of dots rising from the foot of the card** instead of a gradient:
how high it climbs and how bright it gets is the current streak, seeded so the same
streak is the same sky. Whole dots only, centred, inside the card's padding, under
nothing. Coarse on purpose (a dot every 15pt over 76pt): the full-page sky at 13pt was
big enough to make the x86_64 emulator's launch crash (see the SVG trap in
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

### 9. `ideas` — a local project notebook
A `project ideas` caption (`2 building · 12 saved`), then `saved on this
device`, then the stage chips with their counts — `all`, `building`, `next`,
`idea`, `shipped`, `parked`, only the stages that have something — and a card
with one multiline box: the first line is the idea's name, the rest its notes.
A new idea joins the stage being looked at.

Ideas are listed building first, then next, idea, shipped and parked (dimmed),
each newest-touched first. Closed, a card is the stage as a small pill (filled
for `building`), `3 of 5` steps, its age, the name, two lines of notes and the
steps as a row of dots lit up to the share done. Opened, it shows all the
notes, the stages as chips to move it, the steps as a checklist (tick, remove,
add one in place), and the way to its repository: `make a repository` opens the
new-repository form named after the idea (`repoName`), and once that repository
is made it is linked to the idea, which moves to `building`. A linked idea
opens its repository instead. `edit` reuses the box at the top; `delete` is
pressed twice. Empty, loading and error states are written in words.
Notebooks saved before stages existed (version 1) open with every note as an
idea.
Native notes live in a document file, web notes in localStorage, separate
from disposable account caches. The demo uses a separate notebook. Saving
must succeed before the editor clears; unreadable data is never replaced
with an empty notebook. The old `DotsScreen` remains unlinked source.

### 9b. `host` — a machine of yours, from the phone

The fifth tab, where `inbox` was. Its numbers come from `hostd`, a
companion server the user runs on their own machine and reaches over their
tailnet (its own repository). The app knows nothing about any
service: it draws the kinds the host's JSON names.

Not connected, the page explains itself first (`HostIntro`): one sentence
(`your computer, from your phone`), a diagram (this tab → your tailnet →
your machine → what it reads, as nodes on a dotted wire with a dot
travelling down each wire for a request), the page as it will look — drawn
from the demo host at a third of its weight, a light sweeping through its
blocks so it reads as a preview, labelled `demo numbers` — and `set it up` in
three numbered steps. All of it runs on one looping value on the native
driver and stops off screen. Then the `connect` card: an address field (a
`….ts.net` name), a token field, and `connect`, which asks the host before
anything is saved, so a typo is said there and not as an empty page. The
address and the token are kept in the keystore beside the GitHub token.

Connected, it is three blocks. The **machine**: `ScreenHead` with its name,
`up 4d 3h` and the settings glyph; a card of four figures (cpu, memory, heat,
load), the last hour of CPU as a `DotRow` squeezed to forty slots (each the
peak of the readings it stands for), and memory as a row of dots lit up to its
share; a card of disks, each a row of dots, clay past 90%. **Services**: one
card, a row per service: a green or clay dot and a word (`up`, `not
answering`, `down`, `failed`), then `cpu 0.3% · 45 mb · for 2h · http 502`.
A row pushes the service. **Panels**: one card per panel from the host's
config, drawn by kind — `stat` a big figure (and dots up to its `max`),
`series` the figure and its history as dots, `status` a dot and a word, `list`
rows, `table` columns, `log` monospaced lines, `bars` a row of dots per label.
A failing panel prints its error in its own place; the others still draw.

A **service** (pushed, `host · {name}`): a card with its dot and word, its
name, the line about it, and `up for · pid · restarts · answering · http 200 ·
4 ms`; the glyphs to open its `url` and read it again; its actions as verbs
(`restart`, `stop` pressed twice), only those its config lists; CPU and memory
over the hour as dots; `answering` as a row of cells, clay where a reading was
down, with the share; its own panels; and the end of its log — monospaced,
scrolled sideways rather than wrapped, lines with `error`/`fail` in clay, with
`newest` and `further back`.

The page re-asks every `every` seconds (the host's sampling interval) while it
is on screen and stops when it is not. A saved answer is drawn first and stays,
with its age, when the host cannot be reached. The demo has a host of its own
and asks nobody.

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
it is doing — `opening the drawer` while the token is read from the keystore, `opening`
while a pushed screen's module loads. The card fades in over half a second.

This is the token read and a lazy row, not the year: once there is a token the five
tabs are up and each section says what it is doing, so an unreachable GitHub never
hides the device-local `ideas` and `host`.

**Nothing about the animation runs in JavaScript.** Every dot's whole track — its scale
and opacity at twenty-four phases of the sweep — is computed once at mount and handed to
the native driver as an interpolation of one looping value; the strip is one native
`translateX`. So the light keeps moving at the display's rate while the JS thread starts
the screen it is waiting for.

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

On the `work` page, a block: `the brief` / `{n} descriptions`, the newest pull request's
cover on a card (the number, a `StateChip`, the title, `DiffDots`, counts, labels as
outlined pills) and the first lines of its description — tapping it opens `pull` — then
`read all {n} in order →`, which pushes the reader.

`read all` opens the ordinary `pull` page with a sequence of PR identities.
There is no separate Brief reader: the header, full Markdown description,
conversation, files, checks, cache and errors are the same from every entry point.
The shared `PullHeader` also draws the tile's preview; activity data is a list
sample, not another detail model.

Paging lives in a **bar pinned to the bottom** (`← prev · n of N · next →`).
Previous/next replaces the current PR, resets the page, and keeps back pointing
to the source. Paging remains available when a PR fails to load. Comment and
review links select `talk`; file and check links select their corresponding tab.

### 12a. `cycle` — pin10's rows, for pull requests

A block on `work`: `how long it took` / `{n} merged`, three figures on tiles (median
cycle, median wait for a first review, merge rate), then one card with a row per merged
pull request, oldest first: `#{n}` on the left, a run of the widget's dots from open to
merge, a ring where the first review landed, a dashed median carried down every row
(each row is five whole dashes tall, so the rows join), and the time it took on the
right. A row slower than the median is in full ink with its last dot squared. **Each
row says which pull request it is and opens it** — the key used to be a second card
under the chart, matched to it by counting rows.

### 13. `pull` — a pull request, opened

Every entry point uses `pullRoute` and this page's `usePullDetail` loader. The
core PR, conversation, management details and file patches are separate reads.
A failed supplemental read is shown in its section with GitHub's reason and a
retry action; it never hides a readable description or becomes a false empty
list. Management controls are hidden when their permissions were not loaded.
A revoked token still fails the entire load. The cache version is `pull3`.

Not a section: a full-screen page pushed **over** the sections and the bar, from `pulls`,
`brief`, `cycle`, the inbox or a link, with its own back button and a `hardwareBackPress`
handler.

Header: title, state chip, the proportional add/delete rule, and a stat row (the author is a
link to their profile). Then four tabs — `the brief` (the description, same renderer, its
reactions, and the **details**: labels, assignees, reviewers, milestone, each with `change`
opening a picker in place, then `edit the title and description`, `assign me`, `lock
conversation`), `talk`, `files`, `checks` — and a footer with `open on github` and `{head} →
{base}`.

**The merge box** sits at the end of `talk`, above the composer, on the card surface: one line
saying whether it merges, in words (`ready to merge` in sage, `conflicts with main · they need
resolving first` in clay, `behind main · update the branch first`, `github is still working out
whether it merges`), then only the verbs this account may use here: the merge methods the
repository allows (`merge`, `squash and merge`, `rebase and merge`, each pressed twice and pinned
to the head that was on screen), `merge when ready` / `cancel auto-merge`, `update branch`,
`ready for review` / `back to draft`, `close pull request` / `reopen`, and once it is closed or
merged, `delete {branch}`. Someone who cannot push is told so rather than shown merge buttons
that would fail. The line is `lib/pullState.ts` (`mergeLine`, tested).

**`talk` is drawn in waves.** Every other surface in this app is ruled and filed and measured,
and a review thread is none of those things; the wave is what marks the part of a pull request
that is two people arguing rather than a statistic. Each comment has a vertical wavy spine in
its own tone (a comment `ink40`, a review by state — `yes` approved, `no` changes requested, `ink70` otherwise — a thread `ink70`), sized to the comment it runs beside
by measuring it after layout — SVG cannot stretch to a sibling. Comments are separated by wavy
rules, each phase-shifted so stacked rules do not line up. A review thread carries the file it
is anchored to and the few lines of diff it is arguing about, with its replies indented under
their own spine.

Under everything said sit its **tools** (`CommentTools`): the reactions as words with counts
(`+1 3`, `heart 1`, yours filled; `react` opens all eight — never emoji, which would be the
loudest colour on the page), `edit` and `delete` on your own, and what its kind allows — `reply
in thread` and `resolve` / `unresolve` on a review thread, `dismiss review` on an approving or
blocking review for someone who can push.

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

### 14. `inbox` — the feed, at the top of `work`

The inbox was its own section; it is now the top of `work`, because what wants
you is how a working day starts and a sixth tab was not an option. `work` opens with **what wants you**: two `Tile`s side by side, `review` and
`assigned` — the lists that are about you rather than about your work. Each is a count
(`4 waiting on you`, `4 yours to do`), a `WaitDot` per item, longest wait first, so the
one that has sat a month is visible before anything is opened, and a line of what
matters (`oldest asked 1mo · 1 moved since you looked`; `1 overdue · quietest 1mo · 2
you filed`). The whole tile opens its list in full (20 and 21, below). They were two
tabs beside the feed, which hid both behind a label.

Then the feed, pin04's, lifted out of the greeting: `ScreenHead` `inbox` ·
`{n} events`, the wrapped chip filter
(`all · comments · reviews · mentions · yours`) with counts, and the first six
rows, each on its own card, then `all 40 events →`, which pushes the whole feed
(`work · inbox`, up to forty rows). One of the widget's marks per category — a dot for a
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
spine. At the end, the composer: `comment`, `close as done`, `close as not
planned` / `reopen` for an issue; `reply` and `close discussion` / `reopen`
for a discussion. Replies GitHub has that were not fetched say so above the
first one.

Under the body, its reactions (and on a discussion `▲ n` to vote it up);
under it, for an issue, the same **details** as a pull request's brief plus
`pin to the repository`; for a discussion, `edit the title and post`. Every
reply carries the pull request's comment tools; a discussion's replies add `▲
n`, `mark as answer` / `not the answer`, and `reply to this` for the one level
of nesting GitHub has.

### 16. `repo` — a repository, from the inside

Pushed from a repo card, from a pull request's masthead, or from any link to
a repository in rendered Markdown, or a link to one of its tabs (`/pulls`,
`/actions/runs/…`, `/releases/tag/…`). Name, description, `★ ⑂ language
private archived`, the owner (a link to their profile) and `forked from …`,
then the repository's verbs as pills — `☆ star n` / `★ starred n`, `watch` /
`watching`, `ignore` / `ignoring`, and `fork n` on someone else's (pressed
twice; opens the fork) — then seven chips: `code · pulls n · issues n ·
actions · releases · discussions · security`. The footer carries `open on
github` and the default branch with what this token may do there (`you
admin`, `you read`).

- **code** — a search field over the repository's code (GitHub's REST code
  search: default branch only, ten searches a minute, both said on the
  results), then `on {branch}` with `branches` (switch; and for writers `new
  branch from {branch}` / `delete {branch}`) and `pull request` when the branch
  is not the default, then a file browser: breadcrumbs, `new file here` for
  writers, folders first with a trailing `/`, files with their size.
- **pulls** — `open n` / `closed` chips and `new pull request`, then the
  rows: number, title, `~author · head → base`.
- **issues** — `open` / `closed` chips and a filled `new issue` pill, then
  the issues.
- **actions** — the workflows, each with `run` for writers (a box for
  `key=value` inputs and `run on {default branch}`), then the latest runs:
  a state chip in words (`passed`, `failed`, `running`), the title, `branch ·
  event · ~actor`, `logs on github`, and `re-run failed` / `re-run all` /
  `cancel` / `approve and run` as the run allows.
- **releases** — `new release` for writers; the newest open, the rest folded;
  notes rendered, `assets on github`, and `delete release` (pressed twice).
- **discussions** — `new discussion`, then category, title, replies,
  `answered`. Discussions that are switched off say so; a token without
  `read:discussion` says that.
- **security** — open Dependabot alerts, severity as a coloured rule *and* a
  word, the vulnerable range and the fix, and for writers `dismiss` with the
  five reasons GitHub takes. A token without `security_events` is told so and
  linked to a token that has it — **an empty list is never shown for "not
  allowed to look"**.

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
200 KB are not editable, and say so. Someone who can push also has `delete`
in the footer, pressed twice, committed onto the branch the file was read
from.

### 18. `new issue`

A list of the repository's templates (`.github/ISSUE_TEMPLATE`) and `blank
issue`. A Markdown template prefills the body. A **form** (`.yml`) becomes
fields — a line, a box, a choice as chips, ticks as boxes — with required
ones starred and listed under the button until they are filled. The body is
written in the website's own shape (`### Label`, the answer, `_No response_`
for a blank), so a repository's triage bots cannot tell the difference. The
new issue replaces the form on the stack.

### 18a. `new pull request`, `new release`, `new discussion`, `new file`, `new repository`, `new gist`

Each is a few labelled fields (`CreateScreen.tsx`) over one bare composer
whose verb names the thing that will exist — `open pull request`, `publish
release` / `save as draft`, `start discussion`, `commit new file`, `create
repository`, `create secret gist`. Choices are chips: the branches for
`from` and `into`, a discussion's categories, `private`, `pre-release`.
What was made replaces the form on the stack. A secret gist says that it is
unlisted, not private.

### 19. `checks` — the fourth tab of `pull`

Every check run on the head commit, red first, then what waits on you, what
is running, what passed. A tally line (`2 failed · 1 waiting on you · …`),
then the actions: `re-run failed · {workflow}` for a failed Actions run,
`approve and run` for a first-time contributor's held run, `approve deploy ·
{environment}` / `reject` for a deployment waiting on a reviewer — and when
the reviewer is somebody else, it says that instead of offering a button. A
failed Actions job opens to the end of its log: the error annotations in clay,
then the last forty lines in mono.

### 19a. `user` — a person or an organisation

Pushed from any `~name` (a byline, a pull request's author, a repository's
owner) or a github.com link to a login. Avatar, name, `~login`, bio, then
facts as mono lines (`4,210 followers · 9 following`, company, place, `on
github 15y`), the website as a link, `follow` / `following`, links to their
gists and to a search of their repositories, then their repositories,
recently pushed first. Your own adds `new repository`. An organisation has
no follow and no gists.

### 19b. `search` — across GitHub

Pushed from `search github` on the `repos` block's head or from the account
page. One field and four chips — `repositories · issues · pull requests ·
people` — with the site's qualifiers passed through as typed (`is:open
label:bug`). `n found · the first 30`, then rows that open the matching page.
Code search stays on `repos` and in each repository.

### 19c. `gists` and `gist`

Your gists (secret ones marked `secret`) with `new gist`, or someone else's
public ones. A gist opens to every file in it, selectable, with `☆ star` and,
for your own, `delete gist` (pressed twice).

### 20. `review` — the queue, filed like pin03 (`inbox`)

The review requests out of the inbox, on a page of their own and read from the
front — pushed from the inbox's `review` tile (`inbox · review` in its frame).
`ScreenHead` `waiting on you` · `{n} to review`, chips `asked {n}` ·
`reviewed {n} · {m} moved`.

**asked**: a card named `the queue` with `oldest {age}` as its figure, holding one
of the widget's wait dots per pull request (`WaitDot`, the same dot `pulls` uses:
bigger and brighter by the day, week, fortnight and month, squared off past a month),
oldest on the left, and one sentence in the `you` page's voice — `4 pull requests,
about 978 changed lines across 33 files. the oldest was asked 1mo ago; 1 came through
a team.` Then a card per pull request, longest wait first: the author's picture and
handle, the wait dot and `asked 9d ago`, the title, `repo #n · 5 files · draft · via a
team`, and the change's size as `DiffDots`. **The wait is counted from when you were
asked**, from the pull request's `ReviewRequestedEvent`s (the newest naming you, else
the newest to a team), not from when it was opened — a change can sit for a month
before anyone asks you. Past thirty the foot says `the 30 longest waits of {n}`.

**reviewed**: open pull requests of other people's that you reviewed, in one card.
Each row is your verdict as a `StateChip` (`you approved` sage, `you asked for
changes` clay, `you commented` faint) and, on the right, **`{n} new commits`** in
medium ink when commits were written after your review — the reason to look again —
or `nothing new`. Moved rows come first. A pull request you were asked to review again
is in `asked`, not here. Every row opens `pull`.

### 21. `assigned` — what is yours to do (`inbox`)

Pushed from the inbox's `assigned` tile (`inbox · assigned` in its frame).
`ScreenHead` `yours to do` · `{n} assigned`, chips `assigned {n}` · `filed {n}`
(issues you opened that are still open), then `pulls`' drawer: one card per
repository, its name and count across the top, the rows inside. A row is the title,
`issue #401 · quiet 3d · 6 replies` (or `pull #142 · moved today · draft`), and under
it the milestone with its date in words (`v2.4 · due in 4d`; `3d overdue` in medium
ink, weight rather than colour) and the labels as outlined pills in ink — GitHub's
label colours are not drawn. The row's dot is a `WaitDot` on **how long the thread
has been quiet** (`updatedAt`), so the assignment everyone forgot is the biggest mark
on the page; the foot says so. Issues open `thread`, pull requests `pull`.

### 22. `people` — who you work with (`year`)

pin08's deck, dealt as people. `ScreenHead` `who you work with` · `last 12 months`.
Review is the measure because it is the one place GitHub records two people working
on the same thing on purpose; a shared repository is not that, and followers are a
vanity figure.

A card with the six busiest faces overlapping and one sentence: `5 people reviewed
your pull requests and you reviewed 6 people's. most of it was with ~anna, who
reviewed 23 of yours while you reviewed 18 of theirs.` Then `← reviewed yours` /
`you reviewed theirs →` over a card per person, busiest first — the first three on the
`year` page, then `all {n} people →`, which pushes the rest (`year · people`), up to
twelve: picture,
handle, total; a **give-and-take rule** — a stretched dot to the left of a hairline
for their reviews of yours (`ink70`), one to the right for yours of theirs (ink), each
with its count, on **one scale across every card**; and the twelve months as a
`DotRow` on the shared month window, three quiet months the wave, month initials (lower
case) on the last card only. The scale is the twelve's, on the page and pushed alike, so
a bar is the same length wherever it is drawn. A person counts once per pull request however many rounds it
took. Bots and you are left out. The foot is the sample: `from your last 50 pull
requests of 64 and all 38 you reviewed · bots left out`.

### Writing back

Every write is the same object, `Composer`: one box, a row of verbs as
pills, the primary one filled, and a line under them that says what
happened in words — `approved`, `sent · it is on github now`, or exactly why
not (`this token is not allowed to do that review here · it needs more
scope`). Nothing is sent until a named button is pressed, and a failure
leaves the text in the box. On the demo account every write answers `demo
account · nothing was sent`.

A write that is only a verb — merge, star, lock, a reaction — is the same
composer **bare**: the row without the box. A toggle is a filled pill when
it is on (`★ starred`, `following`, your reaction). Anything that cannot be
taken back (merge, close, delete, fork, dismiss) is **pressed twice**: the
first press fills the pill and changes its words to the question (`squash and
merge? press again`, `delete it?`), the second sends. Reactions are `quiet`:
the count moving is the receipt, and only a failure is written. Editing what
you said opens the composer with your words already in it and a `cancel`.
`design/ACTIONS.md` is the list of every action and where it lives.

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

Every section's chrome is the wordmark on the left and, on the right, the account's
picture in a circle — several overlapping when accounts are added together. (`share`
used to sit here too; it is on each chart's own head now, next to the thing it
shares.) Settings open from the corner on every phone; the avatar
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

**on github**: `your profile`, `your gists`, `new repository`, `search github`, as
chips that push those pages.

**at the foot of today**: the kinds the feed at the end of `today` lists, as chips.

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

**Five sections, a bar that is always visible, and each section one page.**
No drawer, no hamburger, nothing behind a menu, and no scrolling list of
thirteen names — which is a hamburger lying down. The shape follows Apple's
Human Interface Guidelines: three to five persistent, labelled destinations
that are *content* and not actions. `STORIES.md` is why the grouping is this
grouping.

There is **no second row of tabs**. A section used to be a segmented control
of three to five views over a horizontal pager — a tab bar inside a tab bar —
which hid most of every section behind a label, made `now` and `weather` draw
the same count and the same week twice, and put the inbox's swipe actions at
war with the pager. Now each section is a page of **blocks** in reading order,
each opened by its `ScreenHead`; a list too long for the page shows its head and
pushes the rest.

| section | the page, top to bottom | pushes | the question it answers |
|---|---|---|---|
| `today` | `you` · `today` (`now` + `weather`) · `hours` · the feed | — | how am I doing |
| `work` | `review` and `assigned` tiles · `inbox` (six rows) · `pulls` · `the brief` · `cycle` · `repos` | the queue, the assignments, the whole inbox, the brief | what wants me, and what am I shipping |
| `year` | `weeks` · `split` · `languages` · `years` · `people` (three) | everyone | what was the year |
| `ideas` | `project ideas`: stage chips, the note box, one card per idea | a new repository, named after an idea | what could I build next |
| `host` | the machine (cpu, memory, heat, load, disks) · `services` · `panels` | one service: its graphs, actions, panels, log | is my machine and what runs on it alright |

- **Bar**: the system's own tab bar, through expo-router's `NativeTabs`
  (`app/(tabs)/_layout.tsx`). On iOS it is `UITabBarController` — Liquid Glass
  on iOS 26, with SF Symbols and the system's own type, minimising as you
  scroll down. On Android it is Material 3's navigation bar on canvas, mono
  labels, Material Symbols, and the selected indicator in the card's colour —
  the same surface every screen above it is drawn on. A bar drawn in JavaScript could
  never look like either system's. `work` carries a count of the events addressed to you (review
  requests, mentions, changes requested), which is the honest version of a
  badge: it is computed from the rows that are actually there.
- **Blocks** (`Block`, `ScreenHead` in `screens/shared.tsx`): a block's head and
  its cards sit ten apart; blocks sit thirty-four apart, so the heads read as the
  dividers. A block's one action — `share` on a chart, `change` on the feed — is a
  round glyph button at the end of its head (`IconButton`): the share glyph, the
  settings glyph. The word is its accessibility label.
- **Folded lists**: a `Tile` (`components/Tile.tsx`) is a list as one card — what it
  is, how many, a `WaitDot` per item, a line of what matters — and opens the list;
  `More` (`all 6 people →`) follows the first few rows of one. Either pushes the
  whole list as a page of its own.
- **Sections keep their place.** Each keeps its scroll, and mounts the first time it
  is opened rather than on launch, so nothing is built before it is looked at. Each
  block is memoised and redraws only when its own data changes. The heavy commit
  history is asked for when `work` opens or when `today` is scrolled towards
  `hours`, never on launch.
- **Detail is a stack.** `pull`, `thread`, `repo`, `file`, `user`, `search`, `gists`,
  `gist`, the forms that make something (`new issue`, `new pull request`, `new
  release`, `new discussion`, `new file`, `new repository`, `new gist`), the folded
  lists (`queue`, `assigned`, `people`), `account`, `share` and `add account`
  push over the sections and over each other, each with `←
  back` and the system back button wired to pop the top. A pushed page about one
  thing may have views of it (`Segments` on `pull`): it covers the bar, so that row
  is the only one on screen. The top few pages stay mounted, hidden, so back returns
  to them as they were; deeper ones are built again on the way back, showing the saved
  reads and the drafts left on the device. A github.com link
  anywhere in rendered Markdown opens the matching page on the stack instead
  of the browser. (`lib/nav.tsx`.)

### Share — a chart as a 4:3 image

`share` on a chart's head pushes a preview of that chart recomposed as a **4:3 card** (`ShareCard`, 640 × 480 points, captured at 1600 × 1200
PNG with react-native-view-shot and handed to the system share sheet with
expo-sharing). A card is not a screenshot: a phone screen is portrait and scrolls, a
timeline image is landscape and does neither. Every card is the same frame — wordmark
and handle across the top, a light display title and one thin figure, the chart, and a line of
fact with the month along the foot — so a run of them reads as a series.

| `share` on | card | chart |
|---|---|---|
| the greeting, top of `today` | a year on github | four figures and the widget's field, eleven rows deep so a whole year fits |
| `weeks` | {year}, week by week | the poster for one year — the one on screen; chips on the share page pick another |
| `split` | where the year went | one ruled bar and a legend with counts and shares |
| `languages` | what I write in | six bars and an `other` |
| `years` | every year on github | a column per year, the last twelve |
| `hours` | when I commit | 24 bars from the sampled commits |

Lists (`inbox`, `review`, `assigned`, `pulls`, `brief`, `cycle`, `repos`, `people`) have no card. Every list on a card is
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

`hey,` / `sign in and i'll read the year.`, a card holding a stand-in field of the
widget's dots, the filled pill **`sign in with github`** and the ghost pill `try the
demo`, then `or paste a token`: a mono input with a hairline underline and an outlined
`connect` beside it, the scopes line, and `make a token on github →`. The app's
version top right. Error text in `no`.

**Signing in is OAuth's device flow** (`lib/oauth.ts`), because the web flow needs a
client secret and a public app cannot keep one. `sign in with github` asks GitHub for
a code and the card turns into it: `type this on github`, the eight letters in the
light display cut (`WDJB-MJHT`, selectable), `github.com/login/device · good for 14
min`, and one filled button, `copy and open github →`, which puts the code on the
clipboard and opens the page. The page polls at the interval GitHub sets (backing off
on `slow_down`, riding out a dropped connection) while the token form hides and `stop`
replaces the button. Each way it can end is its own line: the code ran out, github was
told no, this build cannot sign in by code. The token that comes back is stored and
verified exactly as a pasted one is, and asks for the same scopes.

The client id is `app.json` → `expo.extra.githubClientId` (`lib/oauthConfig.ts`).
Official builds configure the `git-huh` OAuth app with Device Flow enabled and
token expiration disabled, since the client does not handle refresh tokens yet.
Empty, the page is the token form alone and says `paste a token`. The account page
says how each account came in (`signed in with github`, `token`, `fine-grained
token`, from the token's own prefix) and, for a signed-in one, links to GitHub's page
for the grant — revoking it, and asking an organisation that restricts OAuth apps to
allow git-huh, which a token never needs.

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
| review requests with when you were asked, size, files; your last review + commits since | review |
| issues and PRs assigned to you, issues you filed: labels, milestone due date, replies, last update | assigned |
| reviews of your PRs by person, your reviews of theirs, by month | people |
| PR body, file patches, diff hunks, base/head refs | pull |
| oldest + newest commit subjects (commit search) | loading |
