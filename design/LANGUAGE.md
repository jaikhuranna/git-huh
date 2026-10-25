# git-huh — the design language

The rules the whole app obeys, independent of any one screen. `DESIGN.md` is
the per-screen spec; this is what every screen has in common and what a new
screen has to agree with before it belongs here.

Keep this current. If a change alters a token, a rule or a pattern below, it
alters this file in the same commit.

---

## 1. The idea

**The app is the widget, zoomed out.** The home-screen widget came last and
turned out to be the clearest thing the app ever made: a warm near-black card,
one mono face, your own commit messages travelling across the top, the days
under them as dots whose size and weight are the data, a plus for today, and a
hand-drawn wave where nothing happened, with how long it lasted written on it.
Every screen is that card with more room. The layouts still come from the
board's pins — a poster, a filing drawer, a weather page, a spiral — but the
marks, the type and the surface are the widget's, so seventeen screens read as
one thing.

Three consequences, and they settle most arguments:

1. **Every mark is a measurement.** A dot is a day, a week, a month, an hour or
   a pull request's wait; its size and its weight say how much. If a shape is
   not data it is a rule, a card or a margin. There is no decorative texture —
   the sign-in page's stand-in field is the one exception, and it is labelled
   by being on the sign-in page.
2. **The artefact sets the layout, the data sets the shape.** A poster fills the
   page because posters do. Content that runs short leaves the artefact
   visibly empty in its own terms (a ghost dot, a wave), not blank canvas.
3. **Say the honest thing.** A missing number says it is missing. A sample
   says it is a sample. No zero is drawn where the truth is "we did not look".

## 2. What this is not

The board this is drawn from is called "nothing github", and the app still
does **not** use the Nothing design language:

- No dot-matrix *typeface* — no DotGothic16 anywhere in `src/` or `app/`. The
  dots are data, set in a plain grid; the type is IBM Plex Mono.
- No Nothing red (`#D71921`), anywhere.
- No dots laid *under* something as a texture. A field of dots is always the
  thing being read.

Nothing survives in exactly one place: **the widget's background**, the
Material You neutral Nothing's own widgets sit on, read natively from the
device's live palette (`WidgetSurface.kt`). The app's `card` is the same warm
neutral at night, which is why the two sit together on a phone.

## 3. Colour

All values live in `src/theme/palette.ts`. Screens use the tokens; they never
write a hex literal (`tint(colour, alpha)` makes a band from a token).

### Surfaces

| token | day | night | where |
|---|---|---|---|
| `canvas` | `#ECE8E4` | `#141110` | the page — a step darker than a card |
| `card` | `#F8F5F2` | `#221C1A` | the widget's card; every raised surface |
| `recess` | `#E0DBD6` | `#2D2624` | inset: a track, a code block, a swiped row's underside |
| `black` / `onBlack` | ink / card | ink / card | the solid surface — a selected chip, the one button that is the point |

There are no per-screen canvases any more. The poster's flat grey, the
archive's cream, `now`'s cool grey and the loading page's ultramarine are gone:
each was a screen dressed as a different app.

### Ink

`ink` → `ink70` → `ink40` → `ink20`, plus `hair` and `hairStrong` for rules.
Four steps, and they mean four things: **statement, support, annotation,
structure.** A dot's weight uses the widget's own ramp instead (`levels`).

### Yes and no — the only colour

`yes` (sage) and `no` (clay), muted so they sit in the widget's world. They
are the two words a machine has to say: a line added or removed, a check
passed or failed, a review approved or asking for changes, an issue closed.
They are **never the only signal** — a diff line is banded *and* signed, a
check is named, a review says `approved` in words.

Everything that used to be a categorical bright is now a weight of ink or a
shape: the kinds of work in `split` are five weights, the feed's kinds are a
dot, a ring and a square, languages are their mark and their name. GitHub's
language colours and label colours are not drawn.

### Night

The app follows the system (`useColorScheme` in `app/_layout.tsx`), and night
is the widget as most people see it: the warm near-black card on a page one
step darker, the ink the colour of the widget's strip. `black` means "the solid
surface", so at night it is the light one.

- **Read a colour at render, never at import.** `colors.x` is a getter on the
  palette in force; a module-level sheet is `themed(() => StyleSheet.create(…))`.
- **The tree re-renders in place when the scheme changes.** The scheme is a
  context above the navigator (`app/_layout.tsx`), which stays mounted, so the
  account, the year, a half-typed draft and any pushed page all survive the
  switch.

## 4. Type

One face, the widget's: **IBM Plex Mono**, in the roles of
`src/components/Type.tsx`. Screens use the primitives; they do not set
`fontFamily` except to pick a weight inside a sentence.

| role | cut | for |
|---|---|---|
| `Display` | 300 Light, 34/40 | greetings, a handle — large and quiet |
| `Title` | 500 Medium, 19/25 | a verdict (`night owl`), a figure in a card |
| `Heading` | 500 Medium, 14/20 | a pull request's title, a stat |
| `Body` | 400, 13/20 | prose: sentences, comments, descriptions |
| `Numeral` | 200 ExtraLight, 86 | `weather`'s one figure |
| `Label` / `Data` / `Micro` | 400, 11 / 12 / 10 | names, numbers, captions |
| `Serif` (historic name) | 400 Italic, 12 | the aside: `since 2021 · …` |

Inside a sentence the words are `ink70` and **the figures full ink in
Medium** — the widget's two weights, so the numbers can be read on their own.
Everything is **lower case**, the way the widget's strip is.

## 5. Space and geometry

`gutter` 18 · `card` 18 · 10 between cards. Radii: `card` 24 · `sheet` 28 (the
widget's own corner) · `tile` 14 · `pill` 999.

- **A screen is a stack of cards.** A chart, a list, a set of figures: each on
  its own card, on the canvas. Hairlines still divide rows *inside* a card.
- **Pills are actions; cards are objects.** Anything with a `pill` radius does
  something when tapped.
- **A button is never underlined text.** A line of underlined words reads as a
  link in a paragraph, and a page of them (`change`, `edit the title and
  description`, `branches`, `new file here`) reads as a form nobody finished.
  An action is a pill (`IconPill`: a glyph and a short verb) or, when the
  phone already has a glyph for it — share, edit, close, open elsewhere,
  refresh, add — a round glyph button (`IconButton`) with the word as its
  accessibility label. Underlines are left to links inside written prose
  (`Markdown`).
- **Glyphs are on controls only** (`components/Icon.tsx`): SF Symbols on iOS
  and Material Symbols on Android, the families the tab bar already uses, in
  ink, never decoration and never an empty state.
- **Filled means selected or primary**: the on-state of a chip, the one button
  on the page that is the point.
- **Full-bleed is allowed only when the artefact is the page** — `poster`,
  `weather`'s sky.

## 6. Motion

Motion is still rare, and now it is the widget's: things **travel**.

- **The strip travels** (`Marquee`) — your commit messages, `repo ~~~ message`,
  sliding left at the top of `today` and on the loading card.
- **The light sweeps** through the loading card's dots towards today.
- **The spiral turns** on `languages`: the drawing is made once and the
  view holding it rotates, each language's mark turning back against it to
  stay upright.

Three rules, all learned the hard way:

1. **Never animate from JavaScript.** Everything above runs on the native
   driver from values computed once at mount: the strip is one `translateX`
   over a sequence drawn twice, the sweep is one looping value interpolated
   into each dot's scale and opacity, the spiral is one rotation. Two earlier
   loading screens animated from JS (a `setInterval`, then
   `requestAnimationFrame`) and both stuttered exactly while the first
   response was being parsed; the spiral did too, and on a page that scrolls
   a JS frame loop stutters the scroll as well.
2. **Park what is off screen.** A section stays mounted once opened, so every
   animation takes an `active` prop and stops when its section is not the one
   being looked at, or a page is pushed over it.
3. **Arrive, don't appear.** Anything full-page fades in over ~500 ms.

There are no hover states, no spinners, no skeletons — a screen that is loading
says so in words.

The one exception to rule 1 is a **row under a finger**: an inbox row
follows the drag through a `PanResponder`, because there is no other way to
follow a finger. It moves one transform, for as long as the finger does, and
then lets go.

## 7. Patterns

**Navigation is one row of tabs, and a section is one page.** A bar of five
sections at the bottom (`today`, `work` — with the inbox at its top — `year`,
`ideas`, `host`) — the platform's own tab bar (Liquid Glass on iOS 26,
Material 3's navigation bar on Android, where the selected pill is the card's
colour) — and under each, a single page that scrolls. There is **no second
row of tabs** inside a section: a segmented control of four or five views
under a tab bar is a tab bar in a tab bar, it hid most of a section behind
labels, and `now` and `weather` drew today's count and the week twice
without anyone noticing. What were a section's views are **blocks** on its
page, in reading order, each opened by its screen head. A list too long for
the page shows its head there — a `Tile` (a count and a `WaitDot` per item)
or the first few rows and `all 12 →` (`More`) — and pushes the rest. Nothing
lives behind a menu, a drawer or a scrolling list of names. Sections are
content — never actions — and there are never more than five. `DESIGN.md` §
Navigation has the map; `STORIES.md` has the argument.

A pushed page about one thing may have views of it (`Segments` — a pull
request's brief, talk, diff and checks): it covers the bar, so its row is
the only one on screen.

**Screen head.** Every block opens with the same two-part caption: a mono
name on the left, a mono figure on the right (`ScreenHead`). It is the single
strongest thing holding a dozen very different layouts together, and on a
section's page it is what divides one block from the next — blocks sit
further apart than the cards inside a block. A block's one action (`share`
on a chart, `change` on the feed) sits at the end of its head as a small
pill.

**Card head.** A card that holds one thing names it the same way, smaller:
`Card`'s `title` and `figure`.

**Chips.** Outlined pill, mono label, filled when on (`Chips` in
`screens/shared.tsx`). Used for filters and years — a filter on one list,
never a way between screens. **Chips wrap; they never scroll horizontally**,
so every choice and its count is in view at once; a sideways scroller also
loses its drag to anything around it that claims one (the inbox's rows do).

**Counts belong on the control.** A filter that says `open 4 / draft 1` tells
you whether the other tab is worth a tap. A bare `open / draft` does not.

**Empty states are written, not drawn.** One mono line in the screen's own
voice — `nothing filed here · go ship`, `outside the commit sample`,
`nobody has said anything yet`. Never an icon, never a grey box.

**Waiting is a dot.** Anything that has been waiting — a pull request on
review, a request on you, an issue gone quiet — carries a `WaitDot`: the
widget's dot, bigger and brighter by the day, week, fortnight and month, and
squared off past a month, the way a peak is.

**Degradation is visible.** Where the app shows a sample rather than the
whole truth, it says so on the surface (`in 12mo`, `outside the commit
sample`, `the rest of this patch is on github`). A saved answer shown
without a connection carries its age — `offline · saved 3h ago` — and a
refusal is never drawn as an empty list: "this token cannot read security
alerts" is a different sentence from "no open alerts".

**Writing to GitHub is one object.** Every remote write goes through `Composer`: one box, a
row of verbs, a line under them. The verb names the act (`approve`,
`request changes`, `comment on this line`, `propose change`), nothing leaves
until it is pressed, the result is said in words in `yes` or `no`, and a
failure keeps the text. The words for a failure name the one thing that
would change it — the scope, the connection, the token.

A write that is only a verb uses the same composer without its box (`bare`):
merge, star, lock, a reaction. A toggle is a filled pill while it is on.
Anything that cannot be undone is **pressed twice**: the first press fills
the pill and turns its label into the question (`delete it?`), and only the
second sends it. Reactions are **words** (`+1 3`, `heart 1`, `rocket`), never
emoji, because a coloured glyph would be the loudest mark on a page with one
ink.

**Local ideas.** The notebook uses one multiline input (first line the name)
and an explicit save button. It clears only after the device has saved
successfully; failures keep the draft. Stages are chips with counts; steps are
a checklist whose progress is a row of dots; a repository is made from an idea
through the ordinary new-repository form and linked back to it.

**A machine is read, not driven.** The `host` section only shows what
`hostd` serves and only runs the actions its config lists — the phone can never
send a command of its own. A failing panel prints its error in its place.

**A gesture always has a second way in.** The inbox's swipe actions are
also accessibility actions on the row, and the words `done` and `snooze`
are printed under the row so the gesture announces itself before it
commits.

**One object, one detail page.** Lists may fetch summaries in batches, but every
entry point opens the same detail route, loader, cache and renderer. Paging
through a list adds previous/next to that page; it does not create another
reader. Optional data failures stay in the affected section with their reason
and a retry action. They never turn readable content into a full-page error.

**Keep writing visible.** A form scrolls its focused field and caret above the
keyboard, with breathing room. This continues when focus changes or multiline
text grows. Use the shared `FormScrollView` for pages with inputs or composers;
buttons remain tappable while typing, and dragging the page dismisses the keyboard.

**Detail pushes; sections do not.** A pull request, a thread, a repository,
a file: each one pushes over what is there with `← back`, and back pops it.
Nothing in the bar ever pushes.

## 8. Charts

**Every chart is made of the widget's dots.** A field of days is `DotField`; a
series over time is a `DotRow` or a column of dots; a count is lit cells in a
grid of ghosts. Nothing is a filled bar except where two quantities are laid
side by side (`years`' before and after, the share card's split), and those are
rounded like a stretched dot.

- **One axis per comparison.** Cards in a deck share a single twelve-month
  window, because two charts that look comparable must *be* comparable. A
  per-card axis was shipped once and pulled: one card showed a single bar
  labelled `s` above a card showing twelve.
- **Label the extreme, not every point.** The peak dot squares off and carries
  its number; the rest carry none.
- **Intensity is size and weight, never hue** — the widget's `levels.scale`
  and `levels.alpha`, so a dot in the app and a dot on the home screen agree.
- **Today is the plus**, in the bottom-right corner of a field and at the end
  of a row, wherever a chart reaches today.
- **A gap in the data is drawn as a gap** — a baseline tick, not a missing
  bar and not a zero. **A long gap is a wave**: past a threshold each chart
  sets (a month of weeks, three months, a week of days), the empty stretch is
  bridged with the app's hand-drawn wave, its length written over it where
  there is room (`6 wk`, `4 mo`). `lib/quiet.ts` holds the rule; the widget
  was first.

## 9. Writing

The app talks like a well-set printed page: lower case, no exclamation
marks, no second person imperative unless it is a button.

- Buttons are verbs: `open on github`, `connect`, `disconnect`, `next →`.
- Captions are statements of fact: `663 contributions · busiest week 35, in
  may`.
- Nothing is ever "awesome", "oops" or "🎉". The one joke in the app is its
  name.
- Numbers are grouped (`2,214`) and ages are short (`today`, `3d`, `2mo`,
  `1y`).

## 10. Accessibility

- Every `Pressable` carries an `accessibilityRole`, and toggles carry
  `accessibilityState`.
- No colour-only signal (see §3): `yes` and `no` always sit beside a word or a sign.
- Contrast: `ink` on `canvas` and `onBlack` on `black` are both well past
  AA. `ink40` is annotation only and never carries the sole meaning of a row.
- Type scales with the system; nothing is locked to a pixel height that a
  larger body size would clip.
