#!/usr/bin/env python3
"""Assemble review.html — the side-by-side of every pin and the screen it became.

Deliberately built from the board's own tokens (warm paper, Instrument Serif,
Inter, IBM Plex Mono). No dot matrix, no Nothing red: the review document has
to argue the case it is making.
"""

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOARD = ROOT / "design" / "board"
PREVIEW = ROOT / "preview"
OUT = ROOT.parent / "review.html"

# screen key, file, pin file, title, what the pin is, what the data is
SCREENS = [
    ("hey", "hey.html", "pin04.jpg", "Hey,",
     "Pantom's landing page — serif greeting, a field of plus glyphs, one sentence with every "
     "noun in its own colour, two pills.",
     "The home screen. The plus field is your contribution year (crosses, not dots). The coloured "
     "sentence carries commits, repos, open PRs, stars and followers — five numbers in one "
     "readable line instead of five stat tiles."),
    ("now", "now.html", "pin02.jpg", "Now",
     "Ai OS 2.0 — a dot-matrix LED clock on a dotted field, a circular dial, a dock of pastel "
     "app circles, a black ruler strip.",
     "Today at a glance. The LED numerals are today's contributions, the dial is this week with "
     "a hand on today and a tick on your peak weekday, the dock is your top four languages, and "
     "the ruler is the last thirty days."),
    ("flow", "flow.html", "pin05.jpg", "Flow",
     "A monochrome Sankey of Madrid's culture budget: bold percentages, grey absolutes, black "
     "ribbons branching left to right.",
     "Where the year actually went. Total contributions fan into commits, pull requests, issues "
     "and reviews, and those fan again into the repositories that absorbed them."),
    ("poster", "poster.html", "pin09.png", "Poster",
     "An IBM poster: columns of coloured squares rising from the baseline and dissolving into "
     "pixel rain at the top.",
     "The year in weekly columns. Column height is that week's contributions; the top of each "
     "column breaks apart into scattered squares. Year chips let you walk back through every "
     "year the account has been active."),
    ("orbit", "orbit.html", "pin06.jpg", "Orbit",
     "Letters distributed along concentric spiral arcs, a handful highlighted in filled colour "
     "chips — squares and circles alternating.",
     "Languages. Ring by rank, chip colour is GitHub's real colour for that language, and the "
     "legend underneath gives the byte share."),
    ("weather", "weather.html", "pin07.jpg", "Weather",
     "A weather app: airy off-white, an ultra-thin 54°F, a frosted three-stat card, and a "
     "full-bleed gradient — blue when cold, orange when hot.",
     "Your commit weather. The gradient runs warm while a streak is alive and cold when it "
     "isn't. High and low are your best day and your daily average; the frosted card is "
     "velocity, consistency and pace."),
    ("cards", "cards.html", "pin08.png", "Cards",
     "Black Urbit ID cards fanned in a stack, each with a geometric sigil, a monospace ~name and "
     "a halftone field of white dots.",
     "Repositories. Every repo gets a sigil generated from its name and a halftone field whose "
     "density is that repo's recent activity. Stars, forks, language and last push run along the "
     "bottom edge."),
    ("index", "index-screen.html", "pin03.jpg", "Index",
     "A 1950s filing-system diagram — stacked cards with black tabs, typewriter labels, and a "
     "few rows inverted to solid black.",
     "Open pull requests. Each PR is a filing card with its number on the tab, the repo and "
     "title on the card, and its age in the date block. Drafts invert to black."),
    ("dots", "dots.html", "pin01.jpg", "Dots",
     "A connect-the-dots puzzle: sparse numbered points with dense black masses where the "
     "solution crowds together.",
     "The year as a puzzle. Every active day is a disc sized by its commit count; your longest "
     "streak is drawn as a numbered path running one to N through the calendar."),
    ("archive", "archive.html", "pin10.png", "Archive",
     "A rainfall chart: one row per year, circles sized by volume, a vertical line through a "
     "single date, and paired before/after bars down the right.",
     "Every year you have contributed. Circles are monthly volume, the vertical line is today's "
     "date carried across all the years, and the bars split each year into what you shipped "
     "before today and what came after."),
]


def data_uri(path: Path) -> str:
    mime = "image/png" if path.suffix == ".png" else "image/jpeg"
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def inline_preview(name: str) -> str:
    """Inline a screen as a srcdoc iframe so review.html is a single file."""
    html = (PREVIEW / name).read_text()
    for asset in ("tokens.css", "shell.css"):
        css = (PREVIEW / asset).read_text()
        html = html.replace(
            f'<link rel="stylesheet" href="{asset}">', f"<style>{css}</style>"
        )
    # data.js is a module import; inline it as a blob-free module script.
    data = (PREVIEW / "data.js").read_text()
    html = html.replace(
        "from './data.js'",
        "from 'data:text/javascript;base64,"
        + base64.b64encode(data.encode()).decode()
        + "'",
    )
    return html


def escape_srcdoc(html: str) -> str:
    """Ampersands first, or every entity in the page gets double-escaped."""
    return html.replace("&", "&amp;").replace('"', "&quot;")


def section(index, key, file, pin, title, pin_note, data_note) -> str:
    return f"""
    <section class="pin" id="{key}">
      <header>
        <span class="num">{index:02d}</span>
        <h2>{title}</h2>
        <span class="key">{key}</span>
      </header>
      <div class="split">
        <figure>
          <img src="{data_uri(BOARD / pin)}" alt="{title} source pin">
          <figcaption><strong>the pin.</strong> {pin_note}</figcaption>
        </figure>
        <figure>
          <div class="frame">
            <iframe srcdoc="{escape_srcdoc(inline_preview(file))}"
                    width="393" height="852" loading="lazy"
                    title="{title} screen"></iframe>
          </div>
          <figcaption><strong>the screen.</strong> {data_note}</figcaption>
        </figure>
      </div>
    </section>"""


def main():
    body = "".join(
        section(i, *s) for i, s in enumerate(SCREENS, 1)
    )
    nav = "".join(
        f'<a href="#{s[0]}"><span>{i:02d}</span>{s[0]}</a>'
        for i, s in enumerate(SCREENS, 1)
    )
    template = (ROOT / "scripts" / "review_template.html").read_text()
    OUT.write_text(
        template.replace("<!--NAV-->", nav).replace("<!--BODY-->", body)
    )
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
