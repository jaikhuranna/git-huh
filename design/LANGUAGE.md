# git-huh — the design language

The rules the whole app obeys, independent of any one screen. `DESIGN.md` is
the per-screen spec; this is what every screen has in common and what a new
screen has to agree with before it belongs here.

Keep this current. If a change alters a token, a rule or a pattern below, it
alters this file in the same commit.

---

## 1. The idea

**Printed matter that happens to be alive.** Every screen is a real printed
artefact — a poster, a filing drawer, a weather page, an ID card, a page of
type — that has been handed live data. The app never invents a "UI look"; it
borrows one that already existed on paper and then makes it move only where
motion earns its place.

Three consequences, and they settle most arguments:

1. **Every mark is a measurement.** If a shape is not data, it is a rule, a
   tab or a margin. There is no decorative texture anywhere in the app. The
   repo cards once carried a halftone field keyed off a hash of the name — it
   looked like data and encoded none, and it was deleted for that reason.
2. **The artefact sets the layout, the data sets the shape.** A poster fills
   the page because posters do; a drawer runs edge to edge and has a lip at
   the bottom because drawers do. Content that runs short does not leave the
   artefact half-built — it leaves it *empty*, visibly, in the artefact's own
   terms (an empty folder slot, not blank canvas).
3. **Say the honest thing.** A missing number says it is missing. A sample
   says it is a sample. No zero is ever drawn where the truth is "we did not
   look".

## 2. What this is not

The board this is drawn from is called "nothing github", and the app
deliberately does **not** use the Nothing design language.

- No dot-matrix typeface. No DotGothic16 anywhere in `src/` or `app/`.
- No Nothing red (`#D71921`). The `?` in the wordmark is ink.
- No grey-paper-plus-dot-grid combination.
- Dots as texture are allowed **only** where the source pin is built from
  them: `now` (LED numerals), `dots` (the puzzle), `archive` (circle rows).
  Everywhere else the texture is that pin's own device — crosses, ribbons,
  stacked squares, arcs, filing rules.

Nothing survives in exactly one place: **widget A's background**, resolved
from `nothing-mtui`'s `widgetBg` against the device's live Material You
palette. Nothing red may appear inside widget A and nowhere else.

## 3. Colour

All values live in `src/theme/index.ts`. Screens use the tokens; they never
write a hex literal.

### Surfaces

| token | value | where |
|---|---|---|
| `canvas` | `#F2F0EB` | warm paper — the app's default |
| `canvasCool` | `#E4E3DE` | `now` only |
| `canvasFlat` | `#EFEFEF` | `poster` only |
| `canvasCream` | `#F7F5F0` | `archive` only |
| `card` | `#FBFAF7` | raised surface |
| `recess` | `#E9E7E1` | inset, track, code block |
| `black` | `#0B0B0A` | filing tabs, repo cards, filled pills |
| `klein` | `#1A50D5` | `loading` only, where it is the whole page |

A screen gets its own canvas only when the source pin has one. Four of
thirteen do.

### Ink

`ink` `#111110` → `ink70` `#5B5A55` → `ink40` `#93918B` → `ink20` `#C6C4BE`,
plus `hair` and `hairStrong` for rules. On black: `onBlack`, `onBlack55`,
`onBlack25`.

Four steps of ink, and they mean four things: **statement, support,
annotation, structure.** A fifth grey would be a decision nobody can
reproduce.

### The brights

`blue #2F7FE0` · `red #E8412B` · `green #1F9A53` · `yellow #F5B426` ·
`purple #6B4FBB` · `pink #F2A0C4`

These are **categorical**. They separate kinds of thing — comment from
review, addition from deletion, one language from another. None of them is a
brand accent, and **none of them is ever the only thing carrying meaning**: a
diff line is banded *and* signed, a feed event is coloured *and* named in
words, a velocity is tinted *and* has an arrow pointing the right way.

Language colours are the exception that proves it: those are GitHub's own
colour for the language, not ours, and they are always paired with the name.

## 4. Type

Three voices, from `src/components/Type.tsx`. Screens use the primitives;
they do not set `fontFamily`.

| voice | face | for |
|---|---|---|
| display | Instrument Serif | greetings, hero words, year labels, section heads |
| body | Inter | everything read as prose — titles, sentences, PR bodies |
| data | IBM Plex Mono | labels, numbers, handles, paths, code, captions |

The split is semantic, not decorative: **serif announces, sans explains, mono
measures.** A number that can be compared is mono. A number inside a sentence
is not.

Sizes are the `type` scale in the theme — `display` 44, `displaySm` 30,
`title` 24, `heading` 15, `body` 14, `numeral` 86 (thin, `weather` only),
`label` 11 mono with 0.8 tracking, `data` 12 mono, `micro` 9 mono.

Labels are **lowercase**. Mastheads are **upper case with wide tracking**.
Both are typewriter conventions and the app keeps them consistently.

Every primitive declares a platform fallback, so a failed font download
degrades to readable type rather than a blank screen.

## 5. Space and geometry

`gutter` 20 · `card` 18 · `row` 14. Radii: `sheet` 28 · `card` 20 ·
`tile` 14 · `pill` 999.

- **Hairlines over boxes.** Structure is a 1px rule wherever a rule will do.
  Borders are for things you can pick up: cards, chips, tabs.
- **Pills are actions; rectangles are objects.** Anything with a `pill`
  radius does something when tapped. Anything square is a thing.
- **Filled black means selected or primary**, everywhere, without exception:
  the on-state of a chip, the guide tab of a folder, the one button on the
  page that is the point.
- **Full-bleed is allowed only when the artefact is the page** — `poster`,
  `weather`, `loading`, `index`. Everything else lives inside the gutter.

## 6. Motion

Motion is rare and it is never decoration. Two screens move, and both move
because the subject is motion: the language **spiral turns**, and the
**loading wave travels**.

Three rules, all of them learned the hard way:

1. **Never animate from JavaScript.** Both moving screens run entirely on the
   native driver. The loading field precomputes each glyph's whole track at
   mount and hands it to one looping `Animated.Value` as an interpolation, so
   a frame costs nothing — which matters most on the loading screen, where
   the JS thread is busy parsing the first GitHub response. Two earlier
   versions animated from JS (a `setInterval` stepping a counter, then
   `requestAnimationFrame`) and both visibly stuttered.
2. **Park what is off screen.** A section mounts the first time it is opened
   and stays mounted after that, so several screens are always live at once.
   An animation takes an `active` prop and stops when its view is not the one
   being looked at — which now means *its section is current and its page is
   the visible one*.
3. **Arrive, don't appear.** Anything full-page fades in over ~500 ms. A hard
   cut to a full page of type reads as a crash.

Everything else is still. There are no hover states, no spinners, no
skeletons — a screen that is loading says so in words.

## 7. Patterns

**Navigation is two levels and both are visible.** A bar of five sections at
the bottom (`TabBar`, filled black pill = the section you are in) and a
segmented control at the top for the views inside one section (`Segments`,
2px ink rule = the view you are in). Nothing lives behind a menu, a drawer or
a scrolling list of names; if a screen exists, one tap and at most one swipe
reaches it. Sections are content — never actions — and there are never more
than five. `DESIGN.md` § Navigation has the table; `STORIES.md` has the
argument.

**Screen head.** Every scrolling screen opens with the same two-part caption:
a mono name on the left, a mono figure on the right (`ScreenHead`). It is the
single strongest thing holding thirteen very different layouts together.

**Chapter masthead.** The two filing screens (`index`, `brief`) use the book
form instead: `Ch. N /` · `TITLE` · `/ n`, over a full-width ink rule.

**Chips.** Outlined pill, mono label, filled black when on. Used for filters,
years, tabs. **Chips wrap; they never scroll horizontally** — the app is one
big horizontal pager and a nested horizontal scroller loses every drag to the
page swipe. This is not a preference, it is a bug that has been fixed twice.

**Counts belong on the control.** A filter that says `open 4 / draft 1` tells
you whether the other tab is worth a tap. A bare `open / draft` does not.

**Empty states are written, not drawn.** One mono line in the screen's own
voice — `nothing filed here · go ship`, `outside the commit sample`,
`nobody has said anything yet`. Never an icon, never a grey box.

**Degradation is visible.** Where the app shows a sample rather than the
whole truth, it says so on the surface (`in 12mo`, `outside the commit
sample`, `the rest of this patch is on github`).

## 8. Charts

- **One axis per comparison.** Cards in a deck share a single twelve-month
  window, because two charts that look comparable must *be* comparable. A
  per-card axis was shipped once and pulled: one card showed a single bar
  labelled `s` above a card showing twelve.
- **Label the extreme, not every point.** The peak bar carries its number;
  the rest carry none.
- **Bars are ink on paper, not gradients.** Fills are solid; intensity is
  opacity (`levels.alpha`) or size (`levels.scale`), never hue.
- **A gap in the data is drawn as a gap** — a baseline tick, not a missing
  bar and not a zero.

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
- No colour-only signal (see §3).
- Contrast: `ink` on `canvas` and `onBlack` on `black` are both well past
  AA. `ink40` is annotation only and never carries the sole meaning of a row.
- Type scales with the system; nothing is locked to a pixel height that a
  larger body size would clip.
