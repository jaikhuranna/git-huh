/**
 * Deterministic demo model for the HTML preview. Mirrors the shape of
 * `GitHubModel` in src/lib/contributions.ts so a screen authored here ports
 * to React Native by swapping the renderer, not the data access.
 */

function rng(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const LANGS = [
  { name: 'TypeScript', color: '#3178c6', bytes: 1_842_000 },
  { name: 'Kotlin', color: '#A97BFF', bytes: 940_500 },
  { name: 'Swift', color: '#F05138', bytes: 612_300 },
  { name: 'Python', color: '#3572A5', bytes: 388_100 },
  { name: 'Rust', color: '#dea584', bytes: 254_700 },
  { name: 'Go', color: '#00ADD8', bytes: 171_200 },
  { name: 'Shell', color: '#89e051', bytes: 96_400 },
  { name: 'C', color: '#555555', bytes: 41_900 },
];

const REPO_NAMES = [
  ['git-huh', 'TypeScript'],
  ['nothing-mtui', 'Kotlin'],
  ['dot-matrix', 'Swift'],
  ['glance-cards', 'Kotlin'],
  ['paper-index', 'TypeScript'],
  ['sankey-kit', 'Python'],
  ['orbit-type', 'Rust'],
  ['halftone', 'Go'],
  ['rain-years', 'Python'],
  ['poster-press', 'Shell'],
];

function buildCalendar(seed) {
  const random = rng(seed);
  const days = [];
  const today = new Date('2026-09-19T00:00:00');
  // Walk back a full year, then forward, so the last cell is today.
  const start = new Date(today);
  start.setDate(start.getDate() - 364);
  // Align to Sunday so the 7-row grid reads like GitHub's.
  start.setDate(start.getDate() - start.getDay());

  let streakMood = 0;
  for (let i = 0; start.getTime() + i * 86400000 <= today.getTime(); i++) {
    const date = new Date(start.getTime() + i * 86400000);
    const weekday = date.getDay();
    // Weekends dip, and the mood drifts so the year has real texture.
    if (random() < 0.06) streakMood = random() < 0.5 ? 0 : 1.6;
    const base = (weekday === 0 || weekday === 6 ? 0.35 : 1) * (0.5 + streakMood);
    const roll = random();
    const count =
      roll < 0.22 * (weekday === 0 || weekday === 6 ? 1.8 : 1)
        ? 0
        : Math.max(1, Math.round(random() * 14 * base));
    days.push({
      date: date.toISOString().slice(0, 10),
      count,
      isToday: date.getTime() === today.getTime(),
    });
  }

  const max = days.reduce((m, d) => Math.max(m, d.count), 0);
  for (const day of days) {
    day.level = day.count <= 0 ? 0 : Math.min(4, Math.ceil((day.count / max) * 4));
  }
  return days;
}

function derive(days) {
  let currentStreak = 0;
  for (let i = days.length - 1; i >= 0 && days[i].count > 0; i--) currentStreak++;

  let longest = 0;
  let run = 0;
  let endIndex = 0;
  days.forEach((d, i) => {
    run = d.count > 0 ? run + 1 : 0;
    if (run > longest) {
      longest = run;
      endIndex = i;
    }
  });

  const weekdayTotals = new Array(7).fill(0);
  for (const d of days) weekdayTotals[new Date(`${d.date}T00:00:00`).getDay()] += d.count;

  const weeks = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7).reduce((s, d) => s + d.count, 0));
  }

  const total = days.reduce((s, d) => s + d.count, 0);
  const activeDays = days.filter((d) => d.count > 0).length;
  const thisWeek = weeks[weeks.length - 1] ?? 0;
  const lastWeek = weeks[weeks.length - 2] ?? 0;

  return {
    currentStreak,
    longestStreak: longest,
    longestStreakRange: { startIndex: endIndex - longest + 1, endIndex },
    bestDay: days.reduce((m, d) => Math.max(m, d.count), 0),
    activeDays,
    avgPerDay: total / days.length,
    weekdayTotals,
    peakWeekday: weekdayTotals.indexOf(Math.max(...weekdayTotals)),
    peakWeekIndex: weeks.indexOf(Math.max(...weeks)),
    weeks,
    velocity: lastWeek === 0 ? 100 : Math.round(((thisWeek - lastWeek) / lastWeek) * 100),
    consistency: activeDays / days.length,
    yesterdayCount: days[days.length - 2]?.count ?? 0,
  };
}

function buildYears() {
  const years = [];
  for (let y = 2021; y <= 2026; y++) {
    const random = rng(y * 977);
    const months = Array.from({ length: 12 }, (_, m) => {
      if (y === 2026 && m > 8) return 0;
      return Math.round(random() * 180 * (0.4 + random()));
    });
    const total = months.reduce((s, n) => s + n, 0);
    // Today is 19 September: month index 8, a little over halfway through.
    const before = months.slice(0, 8).reduce((s, n) => s + n, 0) + Math.round(months[8] * 0.63);
    years.push({ year: y, total, months, beforeToday: before, afterToday: total - before });
  }
  return years;
}

const days = buildCalendar(20260919);
const insights = derive(days);
const totalBytes = LANGS.reduce((s, l) => s + l.bytes, 0);
const random = rng(7);

export const model = {
  login: 'jaikhuranna',
  name: 'Jai Khurana',
  avatarUrl: null,
  bio: 'builds small tools that look like posters',
  since: 2021,
  followers: 41,
  following: 63,
  repoCount: 38,
  stars: 214,
  total: days.reduce((s, d) => s + d.count, 0),
  todayCount: days[days.length - 1].count,
  todayCommits: days[days.length - 1].count,
  totalCommits: 4187,
  openPrs: 6,
  days,
  insights,
  breakdown: { commits: 1642, pullRequests: 214, issues: 96, reviews: 131 },
  topRepos: [
    { nameWithOwner: 'jaikhuranna/git-huh', count: 612 },
    { nameWithOwner: 'jaikhuranna/nothing-mtui', count: 341 },
    { nameWithOwner: 'jaikhuranna/dot-matrix', count: 208 },
    { nameWithOwner: 'jaikhuranna/glance-cards', count: 154 },
    { nameWithOwner: 'others', count: 327 },
  ],
  languages: LANGS.map((l, i) => ({ ...l, share: l.bytes / totalBytes, rank: i })),
  repos: REPO_NAMES.map(([name, lang], i) => {
    const language = LANGS.find((l) => l.name === lang);
    return {
      name,
      owner: 'jaikhuranna',
      nameWithOwner: `jaikhuranna/${name}`,
      description: 'a small tool that looks like a poster',
      stars: Math.round(random() * 90) + (i === 0 ? 120 : 2),
      forks: Math.round(random() * 18),
      isPrivate: i === 6,
      pushedAt: new Date(Date.parse('2026-09-19') - i * 86400000 * 4).toISOString(),
      language: { name: language.name, color: language.color },
      url: `https://github.com/jaikhuranna/${name}`,
      // Per-repo activity, drives the halftone density on the card screen.
      density: Array.from({ length: 24 * 7 }, () => Math.floor(random() * 5)),
    };
  }),
  years: buildYears(),
  prs: [
    { number: 142, title: 'feat: adaptive icon monochrome layer', repo: 'jaikhuranna/git-huh', createdAt: '2026-09-16T10:24:00Z', draft: false },
    { number: 139, title: 'fix(widget): today cell timezone drift', repo: 'jaikhuranna/git-huh', createdAt: '2026-09-14T18:03:00Z', draft: false },
    { number: 41, title: 'docs: release ritual checklist', repo: 'jaikhuranna/nothing-mtui', createdAt: '2026-09-11T09:41:00Z', draft: false },
    { number: 128, title: 'perf: memoize dot matrix columns', repo: 'jaikhuranna/git-huh', createdAt: '2026-08-29T21:12:00Z', draft: true },
    { number: 77, title: 'refactor: split the sankey layout pass', repo: 'jaikhuranna/sankey-kit', createdAt: '2026-08-12T07:55:00Z', draft: false },
    { number: 19, title: 'feat: halftone sigil generator', repo: 'jaikhuranna/halftone', createdAt: '2026-07-30T13:30:00Z', draft: true },
  ],
};

export const SCREENS = [
  ['hey', 'hey.html'],
  ['now', 'now.html'],
  ['flow', 'flow.html'],
  ['poster', 'poster.html'],
  ['orbit', 'orbit.html'],
  ['weather', 'weather.html'],
  ['cards', 'cards.html'],
  ['index', 'index-screen.html'],
  ['dots', 'dots.html'],
  ['archive', 'archive.html'],
];

/** Shared app chrome so every screen shows the same header and rail. */
export function chrome(active) {
  const rail = SCREENS.map(
    ([name, href]) =>
      `<a href="${href}" class="${name === active ? 'on' : ''}">${name}</a>`,
  ).join('');
  return {
    header: `<div class="chrome">
        <div class="wordmark">git-huh<span>?</span></div>
        <div class="chrome-right">
          <span class="label">${active}</span>
          <span class="label">disconnect</span>
        </div>
      </div>`,
    rail: `<nav class="rail">${rail}</nav>`,
  };
}

export function fmt(n) {
  return n.toLocaleString('en-US');
}

export function age(iso, now = new Date('2026-09-19T12:00:00Z')) {
  const d = Math.floor((now - new Date(iso)) / 86400000);
  if (d <= 0) return 'today';
  if (d === 1) return '1d';
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}mo`;
  return `${Math.floor(d / 365)}y`;
}
