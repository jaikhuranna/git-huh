# git-huh — stories, flows, and the two lists

`LANGUAGE.md` says how the app should look. `DESIGN.md` says what each screen
is. This file says **who is holding the phone and what they came for** — the
stories, the paths through the app, and the two lists that decided the shape
of the navigation.

The lists are not aspiration. They are what people say, out loud, about the
GitHub mobile app: forum threads, store reviews, the recurring arguments.
Sources are at the bottom. Where a gripe has since been fixed by GitHub, it
says so rather than being scored as a free win.

---

## 1. Who is holding the phone

Three situations, and every story below belongs to one of them. None of them
is at a desk — anyone at a desk has the web.

- **the walk.** Ten seconds, one hand, probably outdoors. Did anything move?
  Did I break the streak? Answered by a glance at the widget, or by one
  screen after launch.
- **the queue.** Five minutes, standing still. Who is waiting on me, what did
  they actually say, and can I read the change they are arguing about?
- **the sofa.** Twenty minutes, nothing at stake. What did this year look
  like? This is the part the web is worst at and the part this app exists
  for.

---

## 2. The stories

Each story names the section it lives in, what it needs from GitHub, and
where it stops. **Where a story stops matters.** An app that only reads
ends every story that goes "and then I approve it" outside the app; this
one keeps those endings inside.

### today — *how am I doing*

1. **I want to see today's number before I have decided to care.** One glance,
   no navigation: the widget on the home screen, and the `now` view if the app
   is already open. Needs the contribution calendar, which includes private
   work; the commit buckets do not. → `now`, widget.
2. **I want to know whether the streak is alive** without counting squares.
   → `weather` (the gradient is warm while it holds, cold when it breaks),
   `you` (the streak in the subtitle).
3. **I want to know if this week is better or worse than last.** A percentage
   with an arrow that follows the sign — never an up arrow over a fall.
   → `weather`.
4. **I want to know when I actually work**, because I suspect it is later than
   I say it is. → `hours`, the only screen built on real commit timestamps.
5. **I want my own name and my own year on the front page**, not a feed of
   other people's repositories. → `you`.

### inbox — *what wants me*

6. **I want the two things addressed to me**, not forty repository events. The
   filter chips carry counts so the tab tells you whether it is worth opening.
   → `inbox`, and the count on the tab itself.
7. **I want to know what they said, from the list.** Every row quotes the
   comment. A row that only says "someone commented" makes you open it to find
   out it was a thumbs up. → `inbox`.
8. **I want the row to open the thing, in the app.** A pull request, an
   issue or a discussion — all three open here. → `inbox` → `pull` / thread.
8a. **I want to put a row away and have it come back if it matters.** Swipe
   left for `done`, right for `snooze` until nine; a new comment on the
   thread brings it back. → `inbox`.
8b. **I want to be told, even with the app shut.** → notifications on `you`.
9. **I want to know the difference between "nobody said anything" and "GitHub
   would not tell us".** Two different facts, two different lines.
   → `inbox` empty and error states.

### work — *what I am shipping*

10. **I want my open pull requests filed, not listed** — grouped by repository,
    with the repo named once, so five PRs across two repos read as two stacks.
    → `pulls`.
11. **I want to read a pull request properly on a phone**: the description
    rendered rather than printed, the conversation legible, and the actual
    patch with line numbers. → `pull` (`the brief` · `talk` · `files`).
12. **I want to read the argument**, not a count of comments. Review threads
    carry the file and the few lines they are about. → `pull` → `talk`.
13. **I want the diff to be a diff.** `+54 −13` is a size, not a change.
    Additions and deletions are banded as well as coloured, long lines scroll,
    big files start folded. → `pull` → `files`.
14. **I want to skim my own descriptions one after another** without going back
    to a list each time. → `brief`, paged from a bar pinned to the bottom.
15. **I want to know how long my pull requests actually take**, because the
    number I say out loud is wrong. → `cycle`.
16. **I want my repositories ordered by when a commit was last written in
    them** — not by `pushedAt`, which a tag or a fork sync bumps. → `repos`.

### year — *what the year was*

17. **I want the year as one page I could print**, not an infinite scroll.
    → `weeks`.
18. **I want to see where the year actually went** — and to see the private
    band, because on most working accounts it is the biggest one and every
    other total silently omits it. → `split`.
19. **I want my languages by weight**, with GitHub's own colour for each.
    → `languages`.
20. **I want to compare this year with the ones before it**, drawn from each
    year's own calendar rather than a twelve-bar summary. → `years`.

### lab — *not finished*

21. **I want somewhere for the ideas that are not load-bearing yet.** A screen
    in `lab` is allowed to be a toy, to be slow, or to be wrong on an empty
    account. Nothing in `lab` is linked to from anywhere else, and a screen
    leaves `lab` by earning a place in one of the four sections above.
    → `join the dots` today.

### writing back

26. **I want to answer from where I read it** — reply, approve, request
    changes. → `pull` → `talk`.
27. **I want to point at a line** — any line, including the ones around the
    change. → `pull` → `files`, tap it.
28. **I want to know why CI is red and push it again.** → `pull` → `checks`.
29. **I want to let a held run or a deployment through.** → `checks`.
30. **I want to fix the typo I just found.** → a file → `edit` → a pull
    request.
31. **I want to open an issue the way the maintainers asked for it.** →
    repository → `issues` → `new issue`, templates and forms.

### the account

22. **I want to paste a token once and never see a login again.** Stored in the
    keystore, restored on launch, never sent anywhere but GitHub. And a
    second one beside it, for the work account. → `you` → accounts.
23. **I want to be told when my token is the reason the numbers are wrong.** A
    PAT without `repo` returns a smaller, valid, wrong year and GitHub reports
    no error; the strip under the masthead names it and links to a token that
    has the scope.
24. **I want to try it before I hand it a token.** → `try the demo`.
25. **I want one button that erases it.** → `disconnect`, on `you`, which also
    clears the widget and the message pool.

---

## 3. The flows

### first run

    launch → loading wave (stand-in commit subjects)
           → paste a token   ─┬─ verified → keystore → contributions request
                              └─ rejected → error line, form stays
           → loading wave (your own commit messages, from the pool)
           → today · you

The wave is on screen before anything has been fetched, which is why the
messages are a pool kept on the device rather than a request.

### the daily glance

    home screen widget  → a commit of yours, travelling, and the dot field
      (no counts: they are on every screen in the app and a home screen is
       not where they were wanted)
    → tap → today · now → 2 taps to anywhere else

### triage

    inbox  → chips: all · comments · reviews · mentions · yours (with counts)
           → row (quoted text, category in words and colour)
           → pull request? → pull · the brief → talk → files
             issue?        → browser, and the app says that is what it did
           → back → the inbox is where you left it

There is no GitHub "mark as read" — this app holds no `notifications` scope.
It keeps its own: swipe left `done`, right `snooze` until nine, and a row
comes back by itself when someone writes on the thread again.

    notification (app shut) → tap → the thread it was about, over `today`

### reading one of yours, and someone else's

    work · pulls → guide tab per repo → card → pull
    work · brief → ← prev · n of N · next →   (skim descriptions in order)
    pull · talk  → comment · approve · request changes
    pull · files → find · tap a line → comment on this line
    pull · checks → why (log tail) · re-run failed · approve and run · approve deploy

### the one-line fix

    work · repos → card → repository · code → folder → file
                 → find → edit → message → new branch + pull request
                 → (not a collaborator? a fork, made for you)
                 → the new pull request, opened

### the retrospective

    year · weeks   → year chips (wrapped, never a scroller)
         · split   → trunk → five bands → repositories under the commits band
         · languages → the spiral, one revolution every fifty seconds
         · years   → one row per contribution year

### token repair

    any screen → scope strip ("this token has no repo scope")
      → github.com/settings/tokens/new?scopes=read:user,repo
      → disconnect → paste the new one

The strip only appears when the app is certain: classic PATs send
`x-oauth-scopes`, fine-grained ones send nothing, and nothing is inferred
from silence.

### leaving

    today · you → disconnect → widget cleared, pool cleared, keystore cleared
                → the token form

---

## 4. What people want from a GitHub app

Ranked by how often it is asked for, not by how easy it is. The last column
is honest about this app: **yes**, **partly**, or **no** — and the column
is mostly *yes*, because this list is the brief the app was built to.

| # | want | why it is wanted | git-huh |
|---|---|---|---|
| 1 | triage what is addressed to me | the phone is where you find out, not where you work | **yes** — `inbox`, a count on the tab, `done` and `snooze` |
| 2 | read a pull request in full — body, conversation, patch | reviewing on a phone is "too easy to miss context", and that is a UI failure | **yes** — `pull`: brief · talk · files · checks |
| 3 | reply, approve, request changes | triage that ends in "open the laptop" is half a tool | **yes** — the box at the end of `talk`; approve is hidden on your own pull requests, as GitHub requires |
| 4 | search code, and search *within* a file | source files run past a thousand lines with no way to navigate | **yes** — code search on `repos` and in every repository; find-in-file with `n / m`; find across a diff |
| 5 | see why CI failed, and re-run it | Actions debugging is the weakest part of the mobile product | **yes** — `checks`: red first, the end of the failing job's log, `re-run failed` |
| 6 | offline reading | planes, trains, tunnels; asked for since 2021 and still not prioritised | **yes** — every answer is saved on the device and shown with its age when there is no signal |
| 7 | stay in the app when a notification is tapped | security alerts, releases and workflow approvals bounce to the browser and back | **yes** — pull requests, issues, discussions, repositories, releases, alerts and approvals all open here |
| 8 | an activity feed | it exists on the web, was absent from mobile, and people keep asking | **yes** — `inbox` |
| 9 | my own contribution history, properly | the profile graph is the thing people screenshot, and mobile shows the least of it | **yes** — most of the app |
| 10 | a widget that works on my phone | glanceable counts without unlocking anything | **yes** |
| 11 | releases, discussions, issue forms, security alerts in-app | feature parity with the site | **yes** — the repository screen; issue *forms* render as fields |
| 12 | multiple accounts and org switching | work and personal on one phone | **yes** — accounts on `you`; orgs come with whichever account can see them |
| 13 | fast cold start, no repeated sign-in | a tool you open twenty times a day | **yes** — a warm launch draws the saved year before any request lands |
| 14 | honest numbers | a number that quietly omits private work is worse than no number | **yes** |
| 15 | organise the inbox — swipe actions, folders | people ask for Spark-style swipes and custom notification folders by name | **yes** — swipe left `done`, right `snooze`; `snoozed` and `done` folders; anything written on again comes back |
| 16 | make the small change from the phone — a branch, a file, a pull request | the one-line typo fix at a bus stop is the reason the app is open | **yes** — edit a file, then a new branch and pull request (through a fork if you cannot push), or a commit straight onto the branch |
| 17 | comment on any line, not only changed ones | context lines are where half of review comments belong | **yes** — tap any line in `files` |

Still **no**: creating a *new* file or repository, merging, and anything in
repository settings. None of them was on anyone's list above the fold.

## 5. What people hate about the GitHub app

| # | gripe | where it comes from | what this app does |
|---|---|---|---|
| 1 | **everything important opens the browser** — security alerts, release notes, workflow approvals, and then the browser redirects back into the app | community #39004, #110751 | every one of those is a screen here: issues, discussions, releases, Dependabot alerts, held runs and pending deployments. Links inside comments open here too |
| 2 | **push notifications are unreliable and narrow** — nothing for mentions inside PR reviews, silence on some Android builds | community #184354, #159661, #180827 | there is no server to push from, so Android wakes the app every fifteen minutes or so and it reads the same feed the inbox does — mentions in reviews included. The setting says exactly that, and says when Android is blocking it |
| 3 | **reviewing a PR is painful** — easy to miss context on a small screen | store and roundup reviews | the patch is the screen; find across it; comment on any line; approve or request changes at the end of the conversation; the checks beside it |
| 4 | **no code search, no in-file search** | community #60088 | code search per repository and across everything you own; find-in-file with a count and next / previous |
| 5 | **no offline anything** | community #7365, open since 2021 | everything read is kept, and shown offline with `offline · saved 3h ago` rather than an error |
| 6 | **bare-bones next to the website** — issue forms, releases, half the settings | community #39004 | issue forms, releases, discussions and alerts are in; settings are not |
| 7 | **promised features that are not there** | community #139804 | every number on every screen is fetched or absent; nothing is drawn as zero because we did not look |
| 8 | **widgets that do not work on some Android ROMs** | community #139804 | one widget, painted as bitmaps, no custom-font inflation, no reflection tricks |
| 9 | **notification and comment management is the oldest unfixed complaint** | Hacker News | filters with counts, quotes in the row, and a read state you control |
| 10 | **polish decays as features land** | Hacker News | one type scale, four inks, one gutter, and three design documents that are part of the change that breaks them |
| 11 | **you cannot make the change** — no branch, no file edit, no pull request | community #6348, mary.codes | `edit` on any file: propose it as a pull request, through a fork when you are not a collaborator |
| 12 | **notifications are marked read the moment you glance at them** | community #18623 | nothing is read until you say so — and a row you put away comes back when the thread moves |
| 13 | **the phantom badge** — "you have unread notifications" with nothing behind it | community #13684 | the tab count is computed from the rows on screen, minus the ones you put away |
| 14 | **you could not comment on an unchanged line** | GitHub on X | any line, changed or not |
| 15 | **Copilot arrived in the app** and took the room | X, devRant | still no assistant, no chat, no suggestions |

### What the lists do *not* say

Nobody asks for a dashboard. Nobody asks for another feed of other people's
repositories. The complaints are all about **being interrupted well** and
**being able to read**, and everything in this app's navigation follows from
that: `inbox` before `work`, `work` before `year`, and the year — the part
this app is actually good at — behind them both, where it is a pleasure
rather than an obligation.

---

## 6. What the two lists changed

Before this, the app was thirteen equal pages behind a scrolling name rail.
The rail is a hamburger lying down: where you can go depends on where you
already are, and nothing tells you what is on the other side.

What replaced it is in `DESIGN.md` § Navigation — five sections, a bar that
is always visible, and a segmented control for the views inside a section.
The stories above are the argument for the grouping: story 6 is why `inbox`
is a destination and not a paragraph under a greeting; stories 10–16 are why
`pulls`, `brief`, `cycle` and `repos` are one place; stories 17–20 are why
the whole retrospective is one tab you can ignore on a Tuesday.

---

## Sources

- GitHub community discussions: [#39004](https://github.com/orgs/community/discussions/39004) (features outside the app),
  [#7365](https://github.com/orgs/community/discussions/7365) (offline access),
  [#60088](https://github.com/orgs/community/discussions/60088) (code search),
  [#110751](https://github.com/orgs/community/discussions/110751) (approving workflow runs),
  [#139804](https://github.com/orgs/community/discussions/139804) (v1.180 feedback, widget),
  [#159661](https://github.com/orgs/community/discussions/159661) and
  [#184354](https://github.com/orgs/community/discussions/184354) (push notifications),
  [#180827](https://github.com/orgs/community/discussions/180827) (notification coverage),
  [#168685](https://github.com/orgs/community/discussions/168685) (managing issues and PRs).
- More community discussions: [#6348](https://github.com/orgs/community/discussions/6348) (create pull requests on mobile),
  [#18623](https://github.com/orgs/community/discussions/18623) (notification folders, swipe actions),
  [#13684](https://github.com/orgs/community/discussions/13684) (the badge with nothing behind it),
  [#122792](https://github.com/orgs/community/discussions/122792) (Copilot Chat in mobile).
- [Hacker News, "GitHub desktop/mobile apps…"](https://news.ycombinator.com/item?id=35014133).
- X: GitHub's own ["you can **finally** comment on unchanged lines in PR files"](https://x.com/github/status/2019773260448088135)
  — a limitation named by the people who fixed it — and the reaction to
  Copilot landing in the app, ["github mobile app now has copilot inside it 💀"](https://x.com/rcx86/status/1788938515579097204).
- [devRant](https://devrant.com/rants/2435701/github-mobile-is-released-github-mobile-sucks-ass-what-did-i-expect-from-microso),
  for the launch-day version of the same opinion, and
  [mary.codes, "Why can't I make a pull request in GitHub mobile?"](https://mary.codes/blog/programming/why_cant_i_make_a_pr_in_github_mobile/).
- Store and roundup reviews: [Product Hunt](https://www.producthunt.com/products/github/reviews), [justuseapp](https://justuseapp.com/en/app/1477376905/github/reviews), [Google Play](https://play.google.com/store/apps/details?id=com.github.android).
- GitHub changelog, used to drop gripes that have since been fixed — code
  search landed in mobile v1.133, deployment approvals in 2021.

**Reddit is missing from this list on purpose.** `reddit.com` refuses the
crawler used to research this file, so r/github and r/programming could not be
read directly; what surfaced through the general index and through comparable
social sources (X, devRant, Hacker News) is cited above instead. Anyone with a
browser should read the subreddits before treating the list as complete.

Checked September 2026. GitHub ships constantly; re-read the list before
citing it as current.
