# Everything git-huh could show

Three lists, in the order they were asked for: what GitHub will give us, what
people actually want from GitHub on a phone, and which of the two overlap into
a screen worth building.

Legend: **✅ in the app today** · **◻️ available, unused** · **🔒 needs an extra
token scope**

---

## 1. Data available from a personal access token

### 1a. Summary data — one GraphQL round trip

| Field | Status | Notes |
|---|---|---|
| login, name, avatarUrl, bio, company, location, websiteUrl, twitterUsername | ✅ partly | only login/name/bio/avatar are used |
| createdAt (account age), pronouns, status (emoji + message + busy flag) | ◻️ | "member since", the little status bubble |
| followers / following counts and the actual lists | ✅ counts only | the lists are unused |
| contributionCalendar — 365 days, per-day counts, colours | ✅ | |
| contributionYears — every active year | ✅ | |
| totalCommit / PullRequest / Issue / PullRequestReview contributions | ✅ | the `flow` breakdown |
| totalRepositoriesWithContributedCommits | ◻️ | "you touched 23 repos this year" |
| commitContributionsByRepository (top 25, with counts) | ✅ | |
| restrictedContributionsCount | ◻️ | **private work you did that GitHub hides** — a genuinely interesting number |
| repositories: name, description, stars, forks, watchers, issues, isPrivate, isFork, isArchived, isTemplate, licenseInfo, diskUsage, createdAt, pushedAt, homepageUrl, topics | ✅ partly | topics, licence, size, watchers, age all unused |
| languages per repo, with byte sizes and GitHub's colour | ✅ | |
| defaultBranchRef → commit history, message, committedDate, additions, deletions, author | ◻️ | **commit messages and diff sizes** |
| starredRepositories (what *you* starred, with starredAt) | ◻️ | your taste, not your output |
| watching, organizations, teams | ◻️ | |
| gists — count, files, public/secret, updatedAt | ◻️ | |
| sponsorshipsAsSponsor / asMaintainer, sponsorsListing | ◻️ | |
| projectsV2 — boards, items, status columns | ◻️ | |
| packages, releases (tag, name, publishedAt, assets, downloadCount) | ◻️ | **release cadence** is a good stat |
| repository discussions, categories, answered state | ◻️ | |
| issues and PRs authored: number, title, state, createdAt, closedAt, merged, mergedAt | ✅ PRs only | issues unused; **closedAt − createdAt = cycle time** |
| notifications (unread count, reason, subject) | 🔒 `notifications` | the single most-used mobile feature |
| workflow runs / check suites: status, conclusion, duration | 🔒 `actions:read` | **is my build green** |
| security advisories, Dependabot alerts | 🔒 `security_events` | |
| traffic: views, clones, referrers, popular paths | 🔒 admin on the repo | **who is actually looking at my repo** |

### 1b. Detail data — one fetch *per object*, i.e. "from the links"

This is the part the current app ignores entirely. Every PR/issue/commit in a
list has a URL, and fetching it returns far more than the list row does:

**Pull request detail**
- `body` — the full markdown **description** (+ `bodyText`, `bodyHTML`)
- `additions`, `deletions`, `changedFiles` — the diff size
- `files` — per-file path, additions, deletions, change type
- `commits` — message, author, date, and each commit's own diff stat
- `reviews` — state (approved / changes requested / commented), reviewer, body
- `reviewThreads` → `comments` — inline comments, the file and line they sit on,
  whether the thread is resolved or outdated
- `reviewRequests` — who has been asked, and hasn't answered
- `labels`, `assignees`, `milestone`, `projectCards`
- `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`
- `baseRefName` → `headRefName` — which branch into which
- `closingIssuesReferences` — the issues this PR will close
- `timelineItems` — the whole event stream: force-pushes, renames, ready-for-review
- `comments` — the conversation, with reactions
- `reactionGroups` — 👍 👎 😄 🎉 😕 ❤️ 🚀 👀 counts
- `checkSuites` / `statusCheckRollup` — CI state for the head commit
- `participants` — everyone involved

**Issue detail** — `body`, labels, assignees, milestone, comments, reactions,
`timelineItems`, linked PRs, `closedAt`, `stateReason` (completed vs not planned)

**Commit detail** — full `message`, `messageBody`, `additions`/`deletions`,
`changedFiles`, `tree`, `parents`, `signature` (is it verified), `status`,
associated PRs

**Repository detail** — `object(expression: "HEAD:README.md")` gives the README
text, plus `contributors`, `collaborators`, `branches`, `tags`, `releases`,
`codeOfConduct`, `fundingLinks`, `vulnerabilityAlerts`

**Rate limit** — `rateLimit { limit cost remaining resetAt }`, worth surfacing
somewhere since the app now makes heavy queries

### 1c. Derived — free, no extra request

Streaks (current/longest, with exact dates) ✅ · best day ✅ · active days ✅ ·
average per day ✅ · busiest weekday ✅ · velocity ✅ · consistency ✅ ·
**commit hour histogram** (night owl vs early bird) ◻️ · **weekend ratio** ◻️ ·
**PR cycle time** (open → merge) ◻️ · **review latency** (requested → reviewed) ◻️ ·
**merge rate** (merged ÷ opened) ◻️ · **first-response time on issues** ◻️ ·
**longest gap / comeback day** ◻️ · **commit-message length and verb habits** ◻️ ·
**repo half-life** (how long before a project goes quiet) ◻️ ·
**additions vs deletions ratio** — are you net adding or net deleting ◻️

---

## 2. What people actually want (research)

**What GitHub Mobile is missing**, from GitHub's own community board — the
contribution graph is the single most requested item, alongside achievements,
profile activity, org/project listings, repo search, and file/keyword search
([discussion #18455](https://github.com/orgs/community/discussions/18455),
[#3731](https://github.com/orgs/community/discussions/3731)). People also want
code editing and fork/rename/delete, which are out of scope for a stats app.

**What people use GitHub for daily** — code review and collaboration lead;
roughly 12 commits per week for the average developer, with automated testing
(~45%), deployment (~25%) and quality checks (~15%) the dominant Actions
workloads ([Kinsta](https://kinsta.com/blog/github-statistics/),
[Graphite](https://graphite.com/guides/github-statistics-and-analytics)).

**What the "wrapped" genre proves is shareable** — top projects, busiest
day/month, streaks, language mix, most productive hours, quirkiest commit
messages, and night-owl-vs-early-bird
([Git Wrapped](https://git-wrapped.com/), [Git LookBack](https://www.gitlookback.dev/),
[DEV roundup](https://dev.to/github/your-github-year-in-review-10-fun-ways-to-visualize-your-contributions-392o)).

**Reading across those three:** the gap worth filling is *the contribution
graph and the profile story GitHub Mobile refuses to show*, plus the review
workload that dominates real daily use, plus the handful of wrapped-style
numbers nobody else puts on a home screen.

---

## 3. Candidate new screens

Ranked by how much new, genuinely interesting data each unlocks.

| # | Screen | Data | Why |
|---|---|---|---|
| 1 | **Clock** — 24h radial histogram of commit hours | commit `committedDate` | night owl vs early bird; the most-shared wrapped stat; nothing in the app shows *time of day* |
| 2 | **Review** — PR cycle time and review latency | PR `createdAt`/`mergedAt`, review timestamps | review is the #1 daily activity and the app has nothing on it |
| 3 | **Brief** — a PR opened up: description, diff size, files, checks, reactions | PR `body`, `files`, `statusCheckRollup` | the "from the links" data; turns `index` from a list into something you can actually read on a phone |
| 4 | **Inbox** — notifications by reason (review requested, mentioned, assigned) | notifications API 🔒 | the thing people open the mobile app *for* |
| 5 | **Ledger** — additions vs deletions over the year | commit diff stats | net-adding vs net-deleting is a nice mirror, and no other tool shows it |
| 6 | **Shelf** — repos you starred, over time | `starredRepositories(starredAt)` | your taste, not your output — the only screen about what you *read* |
| 7 | **Hidden** — private/restricted contributions | `restrictedContributionsCount` | GitHub deliberately hides this; showing it is a small delight |
| 8 | **Releases** — tags shipped and cadence | `releases` | "you shipped 9 versions this year" |
| 9 | **Green** — CI pass rate and slowest workflow | workflow runs 🔒 | answers "is it broken" at a glance |
| 10 | **Words** — commit-message habits: length, top verbs, longest message | commit `message` | the quirkiest-commit stat, and it is genuinely funny on real data |

Scope note: 4 and 9 need extra token scopes, so they have to degrade politely
when the scope is absent rather than erroring.
