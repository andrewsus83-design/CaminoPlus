// The Daily reading phones of design/index.html and the daily banner of its Library phones, drawn from the functions the app itself uses to say a day (daily/week.ts for the strip, daily/liturgy.ts for the
// liturgical day, daily/content.ts for the title, the readings and their words, daily/reference.ts for the runs of a passage, daily/bannerLayout.ts for the place of the pill), so that the page cannot show a day, a
// reading, a title or a verse that the app does not: daily.test.ts draws the page again on every run and fails when design/index.html is not what the app makes of the days. The readings and the Bible are
// read from the files of the app (mobile/assets), the way the tests read them.
//
// The page has marked places, lines like "<!-- Daily screen: daily (start) -->" and "<!-- ... (end) -->", and what this file makes goes between each pair:
//  - SCREENS: the inside of each Daily reading phone: the header row, the week strip and what is under it (the liturgical card, the readings card with the words of the readings that are opened, the line of small print);
//    the calendar sheet that two of the phones show on top, the frame of the phone and its words stay in the page,
//  - BANNERS: the daily banner of each Library phone (Bible tab): the date, the title with its pill, the day and the readings.
// The look of all of it (sizes, colours, spacing: tokens of tokens.css) is in the style of the page, not here.
// To draw the page again after the readings, the Bible, the calendar or a screen changed (from mobile/):
//   npx tsc -p tsconfig.librarytest.json && node node_modules/.cache/library-test/features/library/__tests__/designDaily.js --write
// Without --write it only says whether the page is what the app makes of it.
import fs from 'node:fs';
import path from 'node:path';
import { todayLine } from '../bible/today';
import { makeBibleText, type TextIndex } from '../bible/textCore';
import { BOOKMARK_DAY, UNBOOKMARK_DAY } from '../daily/bookmarks';
import { pillBesideTitle } from '../daily/bannerLayout';
import { rangeAround, sameDay, type Ymd } from '../daily/calendar';
import { NO_READINGS, READINGS_SOURCE, WHOLE_PSALM_NOTE, makeContent, readingsLine, readingsSpoken, type DayContent, type Reading } from '../daily/content';
import { dateKey } from '../daily/datekey';
import { COLOUR_NAMES, LITURGY_NOTE, RANK_NAMES, SEASON_NAMES, liturgicalDayOf } from '../daily/liturgy';
import { makeReadingsLookup } from '../daily/readingsCore';
import { runsOf } from '../daily/reference';
import { WEEKDAY_LETTERS, canMoveWeek, dayCellLabel, nextWeekLabel, previousWeekLabel, weekDays, weekSpoken, weekTitle } from '../daily/week';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const NBSP = String.fromCharCode(160);
/** Escaped, with the no-break spaces written as the entity, so that a diff shows them. */
const html = (s: string): string => esc(s).split(NBSP).join('&nbsp;');

const ROOT = process.cwd(); // from mobile/
const json = <T>(p: string): T => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8')) as T;
const bibleIndex = json<TextIndex>('assets/bible/webc/index.json');
const bible = makeBibleText(bibleIndex, Object.fromEntries(bibleIndex.books.map((b) => [b.code, () => json(`assets/bible/webc/${b.code}.json`)])));
const content = makeContent({ lookup: makeReadingsLookup([() => json('assets/library/daily/readings-2026.json')]), source: { hasBook: bible.hasBook, loadBook: bible.loadBook } });

/** The day as the screen has it: what it is called, its readings and their words, from the files of the app. */
export const dayOf = (day: Ymd): DayContent => content.dayContent(dateKey(day));

/** The day the phones are drawn on: the clock of the page. */
export const TODAY: Ymd = { y: 2026, m: 11, d: 8 };
const ymd = (y: number, m: number, d: number): Ymd => ({ y, m, d });

/* ============================================================================================ the Daily reading phones */

export type ScreenName = 'daily' | 'memorial' | 'reading' | 'calendar' | 'dark' | 'darkreading' | 'darkcalendar' | 'narrow' | 'solemnity' | 'none';

export type ScreenSpec = {
  /** The day that is picked. */
  picked: Ymd;
  bookmarked?: boolean;
  /** The reading that is opened (its kind), if one is. */
  open?: 'first' | 'psalm' | 'second' | 'gospel';
  /** A phone 320 wide: the card of the strip reaches into the margins. */
  fit?: boolean;
};

export const SCREENS: Record<ScreenName, ScreenSpec> = {
  daily: { picked: ymd(2026, 11, 8) },
  memorial: { picked: ymd(2026, 11, 11), bookmarked: true },
  reading: { picked: ymd(2026, 11, 8), open: 'psalm' },
  calendar: { picked: ymd(2026, 11, 8) },
  dark: { picked: ymd(2026, 11, 8) },
  darkreading: { picked: ymd(2026, 11, 8), open: 'gospel' },
  darkcalendar: { picked: ymd(2026, 11, 8) },
  narrow: { picked: ymd(2026, 12, 13), fit: true },
  solemnity: { picked: ymd(2026, 12, 8), open: 'gospel' },
  none: { picked: ymd(2027, 1, 17) },
};

const INDENT = '            ';

const icon = (name: string): string => `<svg class="cp-icon"><use href="#i-${name}"/></svg>`;

function headerHtml(bookmarked: boolean): string {
  const mark = bookmarked
    ? `<button class="dr-hb on" aria-label="${UNBOOKMARK_DAY}" aria-selected="true">${icon('bookmark')}</button>`
    : `<button class="dr-hb" aria-label="${BOOKMARK_DAY}" aria-selected="false">${icon('bookmark')}</button>`;
  return `<div class="dr-hd"><button class="dr-hb" aria-label="Back">${icon('back')}</button><h1 class="dr-h1">Daily reading</h1><button class="dr-hb" aria-label="Open calendar">${icon('calendar')}</button>${mark}</div>`;
}

/** The week strip of the picked day, as WeekStrip.tsx draws it. */
export function stripHtml(picked: Ymd, fit: boolean): string {
  const range = rangeAround(TODAY);
  const days = weekDays(picked);
  const away = !sameDay(picked, TODAY);
  const arrow = (label: string, on: boolean, glyph: string): string => `<button class="dr-arrow"${on ? '' : ' disabled'} aria-label="${esc(label)}">${icon(glyph)}</button>`;
  const cells = days.map((x, k) => {
    const isToday = sameDay(x, TODAY), isSelected = sameDay(x, picked);
    const classes = `dr-c${isSelected ? ' sel' : ''}${isToday ? ' today' : ''}`;
    return `<button class="${classes}" aria-label="${esc(dayCellLabel(x, isToday))}" aria-selected="${isSelected}"><span class="w">${WEEKDAY_LETTERS[k]}</span><span class="k">${x.d}</span><span class="dr-dot ${liturgicalDayOf(x).colour}"></span></button>`;
  }).join('');
  return `<div class="dr-strip${fit ? ' fit' : ''}"><div class="dr-sh">${arrow(previousWeekLabel(picked, range), canMoveWeek(picked, -1, range), 'back')}<span class="m" role="heading" aria-level="3" aria-label="${weekSpoken(days)}">${weekTitle(days)}</span>${away ? '<button class="dr-today" aria-label="Today">Today</button>' : ''}${arrow(nextWeekLabel(picked, range), canMoveWeek(picked, 1, range), 'chev')}</div><div class="dr-cells">${cells}</div></div>`;
}

/** The liturgical card, as LiturgicalCard.tsx draws it. */
export function litHtml(picked: Ymd, c: DayContent): string {
  const lit = liturgicalDayOf(picked);
  const facts = [
    `<div class="dr-fact"><span class="l">Season</span><span class="v"><i class="dr-sw ${lit.colour}"></i>${SEASON_NAMES[lit.season]} · ${COLOUR_NAMES[lit.colour]}</span></div>`,
    c.under ? '' : `<div class="dr-fact"><span class="l">Rank</span><span class="v">${RANK_NAMES[lit.rank]}</span></div>`,
    `<div class="dr-fact"><span class="l">Sunday cycle</span><span class="v">Year ${lit.sundayCycle}</span></div>`,
    `<div class="dr-fact"><span class="l">Weekday cycle</span><span class="v">Year ${lit.weekdayCycle}</span></div>`,
  ].join('');
  const titles = `<div class="dr-titles"><div class="dr-title" role="heading" aria-level="3">${html(c.title)}</div>${c.under ? `<div class="dr-under">${html(c.under)}</div>` : ''}</div>`;
  return `<div class="cp-card dr-lit"><div class="dr-eyebrow">Liturgical day</div>${titles}<div class="dr-facts">${facts}</div><div class="dr-cap">${html(LITURGY_NOTE)}</div></div>`;
}

/** The words of a reading, as PassageBody draws them: a psalm one verse to a line, the rest in paragraphs, a psalm shown whole says so. */
function passageHtml(r: Reading): string {
  const text = r.text!;
  const runs = runsOf(text.lines);
  const verse = (n: string, t: string): string => `${n ? `<i>${esc(n)}</i> ` : ''}${html(t)}`;
  const body = r.kind === 'psalm'
    ? runs.flat().map((l) => `<p class="dr-v">${verse(l.n, l.text)}</p>`).join('')
    : runs.map((run) => `<p class="dr-v">${run.map((l) => verse(l.n, l.text)).join(' ')}</p>`).join('');
  return `<div class="dr-rt">${body}${text.whole ? `<div class="dr-cap">${html(WHOLE_PSALM_NOTE)}</div>` : ''}</div>`;
}

/** The readings card and the small print under it, as DayReading.tsx draws them. */
export function readingsHtml(c: DayContent, open?: string): string {
  const top = '<div class="dr-top"><span class="dr-eyebrow">Readings</span></div>';
  if (!c.readings) return `<div class="cp-card dr-card dr-readings">${top}<div class="dr-none">${html(NO_READINGS)}</div></div>`;
  const rows = c.readings.map((r) => {
    const label = `${esc(`${r.title}, ${r.reference}`)}`;
    const head = `<span class="tx"><span class="t">${r.title}</span><span class="c">${html(r.reference)}</span></span>`;
    if (!r.text) return `<div class="dr-rr"><div class="dr-rb plain" role="group" aria-label="${label}">${head}</div></div>`;
    const isOpen = r.kind === open;
    return `<div class="dr-rr"><button class="dr-rb" aria-expanded="${isOpen}" aria-label="${label}">${head}${icon('chev')}</button>${isOpen ? passageHtml(r) : ''}</div>`;
  }).join('');
  return `<div class="cp-card dr-card dr-readings">${top}${rows}</div><div class="dr-src">${html(READINGS_SOURCE)}</div>`;
}

/** The inside of one phone: the lines go between the marks of the page. */
export function screenHtml(name: ScreenName): string {
  const spec = SCREENS[name];
  const c = content.dayContent(dateKey(spec.picked));
  return [headerHtml(!!spec.bookmarked), stripHtml(spec.picked, !!spec.fit), litHtml(spec.picked, c), readingsHtml(c, spec.open)].map((line) => `${INDENT}${line}`).join('\n');
}

/* ================================================================================================= the daily banner */

export type BannerName = 'library' | 'continue' | 'dark' | 'deutero' | 'narrow';

/** The width of the phone each banner is on. */
export const BANNER_WIDTH: Record<BannerName, number> = { library: 390, continue: 390, dark: 390, deutero: 390, narrow: 320 };

/** The daily banner of a phone `width` wide on `day`, as DailyBanner (LibraryBanner.tsx) draws it. */
export function bannerHtml(day: Ymd, width: number): string {
  const brief = content.dayBrief(dateKey(day));
  const label = todayLine(new Date(day.y, day.m - 1, day.d));
  const line = brief.readings ? readingsLine(brief.readings) : NO_READINGS;
  const spoken = brief.readings ? `Readings: ${readingsSpoken(brief.readings)}` : NO_READINGS;
  const beside = pillBesideTitle(width, 1, 1.2);
  const pill = '<span class="pill">Read today</span>';
  const aria = ['Read today', 'Daily reading', label, brief.title, spoken].filter(Boolean).join('. ');
  const pad = '          ';
  return [
    `${pad}<div class="cp-banner cmp dl${beside ? '' : ' below'}" role="button" aria-label="${html(aria)}">`,
    `${pad}  <div class="ey">${label}</div>`,
    `${pad}  <div class="tr"><h4>Daily reading</h4>${beside ? pill : ''}</div>`,
    `${pad}  <div class="dd">${html(brief.title)}</div>`,
    `${pad}  <div class="rf">${html(line)}</div>`,
    ...(beside ? [] : [`${pad}  <div class="pr">${pill}</div>`]),
    `${pad}</div>`,
  ].join('\n');
}

/* ============================================================================================================ the page */

type Kind = 'screen' | 'banner';
const KINDS: Record<Kind, { title: string; names: readonly string[]; make: (name: string) => string }> = {
  screen: { title: 'Daily screen', names: Object.keys(SCREENS), make: (name) => screenHtml(name as ScreenName) },
  banner: { title: 'Daily banner', names: Object.keys(BANNER_WIDTH), make: (name) => bannerHtml(TODAY, BANNER_WIDTH[name as BannerName]) },
};

/** The two lines that mark a place of design/index.html: what is between them is drawn here. */
export const MARKERS = (kind: Kind, name: string): { start: string; end: string } => ({
  start: `${kind === 'screen' ? INDENT : '          '}<!-- ${KINDS[kind].title}: ${name} (start) -->`,
  end: `${kind === 'screen' ? INDENT : '          '}<!-- ${KINDS[kind].title}: ${name} (end) -->`,
});

/** The page with every place drawn again. A place whose marks are missing (or doubled) is an error: the page and this file have to agree on where things go. */
export function applyDaily(design: string): string {
  let out = design;
  for (const kind of Object.keys(KINDS) as Kind[]) {
    for (const name of KINDS[kind].names) {
      const { start, end } = MARKERS(kind, name);
      const a = out.indexOf(start);
      const b = out.indexOf(end);
      if (a < 0 || b < 0 || out.indexOf(start, a + 1) >= 0 || out.indexOf(end, b + 1) >= 0 || b < a) throw new Error(`the page has no (or two) marks for "${KINDS[kind].title}: ${name}": ${start.trim()}`);
      out = `${out.slice(0, a + start.length)}\n${KINDS[kind].make(name)}\n${out.slice(b)}`;
    }
  }
  return out;
}

export const DESIGN_PATH = path.join(process.cwd(), '..', 'design', 'index.html');

if (require.main === module) {
  const page = fs.readFileSync(DESIGN_PATH, 'utf8');
  const next = applyDaily(page);
  if (process.argv.includes('--write')) {
    fs.writeFileSync(DESIGN_PATH, next, 'utf8');
    console.log(`drew ${Object.keys(SCREENS).length} Daily reading phones and ${Object.keys(BANNER_WIDTH).length} banners in ${DESIGN_PATH} (${page === next ? 'nothing changed' : 'changed'})`);
  } else {
    console.log(page === next ? 'design/index.html has what the app draws for the Daily reading' : 'design/index.html does NOT have what the app draws for the Daily reading: run again with --write');
    process.exitCode = page === next ? 0 : 1;
  }
}
