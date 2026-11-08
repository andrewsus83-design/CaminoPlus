// Plain-node checks of the Daily reading screen (Library > Bible > Daily reading, /library/daily). No React, no React Native, no network.
// The first half is the calendar: the weekday of a day, the month as a grid, the months and the limits, the words a screen reader says,
// and how wide the calendar is on a phone of 320 to 430. Those are checked against ways of finding the weekday that share no code
// with the screen (Zeller's congruence, Date.UTC, and a walk through the days one at a time). The second half reads the source: how the
// screen is wired into the app, in the style of wiring.test.ts. Run: npm run test:library
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  DAYS_IN_WEEK, FALLBACK_TODAY, GRID_WEEKS, MONTHS, RANGE_YEARS, WEEKDAYS, WEEKDAYS_SHORT, addDays, addMonths, canGoBack, canGoForward, clampMonth, compareMonths, dayInRange, dayLabel,
  daysInMonth, formatDate, fromDays, isLeapYear, isValidDay, monthGrid, monthInRange, monthNumber, monthTitle, nextMonthLabel, previousMonthLabel, rangeAround, readingHeading,
  sameDay, sameMonth, todayOf, toDays, weekdayIndex, weeksNeeded, type Cell, type Ym, type Ymd,
} from '../daily/calendar';
import { CARD_PAD, COLUMNS, GRID_MAX, TOUCH, calendarMetrics } from '../daily/layout';
import { BOOKMARK_DAY, DAILY_GROUP, UNBOOKMARK_DAY, dailyKey, dailyTitle } from '../daily/bookmarks';
import { COLOUR_NAMES, LITURGY_NOTE, RANK_NAMES, SEASON_NAMES, liturgicalDay } from '../daily/liturgy';
import { WEEKDAY_LETTERS, canMoveWeek, dayCellLabel, nextWeekLabel, previousWeekLabel, weekDays, weekSpoken, weekTitle } from '../daily/week';
import { arrows, dailyReducer, initDaily, type DailyAction, type DailyState } from '../daily/state';
import { BANNER_WIDTH, MARKERS, applyDaily, dayOf, screenHtml } from './designDaily';
import { NO_READINGS, READINGS_SOURCE, WHOLE_PSALM_NOTE } from '../daily/content';
import './liturgy.test'; // the liturgical calendar (daily/liturgy.ts): its own file, run here so no script has to name it
import './weekstrip.test'; // the week strip, the date of a bookmark and the bookmark key of a day: its own file, run here too
import './readings.test'; // the readings of the days: the references, the words from the Bible in the app, the files, the data of 2026 against the calendar: its own file, run here too

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

/* ======================================================================== other ways of knowing a weekday */

/** Monday 0 to Sunday 6 by Date.UTC (the engine's calendar; UTC so that no time zone or daylight saving can move the day). */
const byDate = (y: number, m: number, d: number): number => (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;

/** Monday 0 to Sunday 6 by Zeller's congruence for the Gregorian calendar (January and February count as months 13 and 14 of the year before). */
function byZeller(y: number, m: number, d: number): number {
  const mm = m < 3 ? m + 12 : m;
  const yy = m < 3 ? y - 1 : y;
  const k = yy % 100;
  const j = Math.floor(yy / 100);
  const h = (d + Math.floor((13 * (mm + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7; // 0 Saturday, 1 Sunday, 2 Monday ...
  return (h + 5) % 7;
}

/** The days in a month by Date: the 0th day of the next month is the last day of this one. */
const lengthByDate = (y: number, m: number): number => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** The leap rule written a second way. */
const leapAgain = (y: number): boolean => (y % 400 === 0) || (y % 4 === 0 && y % 100 !== 0);

// A small seeded generator, so a failure repeats.
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randomDay = (next: () => number, from = 1600, to = 2400): Ymd => {
  const y = from + Math.floor(next() * (to - from + 1));
  const m = 1 + Math.floor(next() * 12);
  return { y, m, d: 1 + Math.floor(next() * lengthByDate(y, m)) };
};

const day = (y: number, m: number, d: number): Ymd => ({ y, m, d });
const nov8 = day(2026, 11, 8); // a Sunday: the day the screen is built on

/* ================================================================================================== weekdays */

check('known days: the weekdays that anyone can look up (Monday is 0, Sunday is 6)', () => {
  const known: [number, number, number, number, string][] = [
    [1970, 1, 1, 3, 'Thursday'], [2000, 1, 1, 5, 'Saturday'], [2024, 2, 29, 3, 'Thursday'], [2028, 2, 29, 1, 'Tuesday'], [2100, 2, 28, 6, 'Sunday'],
    [2100, 3, 1, 0, 'Monday'], [2026, 11, 1, 6, 'Sunday'], [2026, 11, 8, 6, 'Sunday'], [2026, 11, 30, 0, 'Monday'], [2027, 2, 1, 0, 'Monday'],
    [2028, 2, 1, 1, 'Tuesday'], [2026, 8, 1, 5, 'Saturday'], [2026, 12, 1, 1, 'Tuesday'], [2027, 1, 1, 4, 'Friday'], [1900, 3, 1, 3, 'Thursday'], [1600, 1, 1, 5, 'Saturday'],
  ];
  for (const [y, m, d, index, name] of known) {
    assert.equal(weekdayIndex(day(y, m, d)), index, `${y}-${m}-${d}`);
    assert.equal(WEEKDAYS[weekdayIndex(day(y, m, d))], name);
  }
});

check('the weekday of 5000 random days between 1600 and 2400 is the one Zeller and Date.UTC find', () => {
  const next = rng(20261108);
  for (let i = 0; i < 5000; i++) {
    const x = randomDay(next);
    const w = weekdayIndex(x);
    assert.equal(w, byZeller(x.y, x.m, x.d), `Zeller ${x.y}-${x.m}-${x.d}`);
    assert.equal(w, byDate(x.y, x.m, x.d), `Date ${x.y}-${x.m}-${x.d}`);
  }
});

check('every day from 1900 to 2100 (73,000 of them): one more day than the one before, the right weekday, and the day comes back out of its number', () => {
  // walk the calendar one day at a time with a leap rule and month table of its own
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let y = 1900, m = 1, d = 1, weekday = byDate(1900, 1, 1), days = toDays(day(1900, 1, 1)), seen = 0;
  while (y < 2101) {
    const here = day(y, m, d);
    assert.equal(toDays(here), days, `${y}-${m}-${d} is day ${days}`);
    assert.equal(weekdayIndex(here), weekday, `${y}-${m}-${d}`);
    assert.deepEqual(fromDays(days), here, `day ${days}`);
    seen += 1;
    days += 1; weekday = (weekday + 1) % 7;
    const length = m === 2 && leapAgain(y) ? 29 : lengths[m - 1];
    if (d < length) d += 1; else { d = 1; if (m < 12) m += 1; else { m = 1; y += 1; } }
  }
  assert.equal(seen, 73414, '1900 to 2100: 201 years, 49 leap years');
});

check('leap years: every fourth year, not every hundredth, but every four hundredth; February has 29 days in those', () => {
  for (const y of [2000, 2004, 2024, 2028, 2032, 2400, 1600]) assert.equal(isLeapYear(y), true, String(y));
  for (const y of [1900, 2100, 2200, 2300, 2026, 2027, 2029, 2025, 1999]) assert.equal(isLeapYear(y), false, String(y));
  for (let y = 1500; y <= 2600; y++) {
    assert.equal(isLeapYear(y), leapAgain(y), String(y));
    for (let m = 1; m <= 12; m++) assert.equal(daysInMonth(y, m), lengthByDate(y, m), `${y}-${m}`);
  }
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(daysInMonth(2100, 2), 28);
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => daysInMonth(2026, m)), [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
});

check('a day that does not exist is not a day: 30 February, month 13, a half day, nothing', () => {
  assert.equal(isValidDay(day(2028, 2, 29)), true);
  assert.equal(isValidDay(day(2027, 2, 29)), false);
  assert.equal(isValidDay(day(2026, 2, 30)), false);
  assert.equal(isValidDay(day(2026, 13, 1)), false);
  assert.equal(isValidDay(day(2026, 0, 1)), false);
  assert.equal(isValidDay(day(2026, 4, 31)), false);
  assert.equal(isValidDay(day(2026, 4, 0)), false);
  assert.equal(isValidDay(day(2026.5, 4, 1)), false);
  assert.equal(isValidDay(day(2026, 4, 1.5)), false);
  assert.equal(isValidDay(null), false);
  assert.equal(isValidDay(undefined), false);
});

check('days can be added across the end of a month, a year and a leap day', () => {
  assert.deepEqual(addDays(day(2026, 12, 31), 1), day(2027, 1, 1));
  assert.deepEqual(addDays(day(2027, 1, 1), -1), day(2026, 12, 31));
  assert.deepEqual(addDays(day(2028, 2, 28), 1), day(2028, 2, 29));
  assert.deepEqual(addDays(day(2028, 2, 29), 1), day(2028, 3, 1));
  assert.deepEqual(addDays(day(2027, 2, 28), 1), day(2027, 3, 1));
  assert.deepEqual(addDays(nov8, 54), day(2027, 1, 1));
  const next = rng(7);
  for (let i = 0; i < 2000; i++) {
    const x = randomDay(next);
    const k = Math.floor(next() * 4000) - 2000;
    assert.deepEqual(addDays(addDays(x, k), -k), x);
    assert.equal(toDays(addDays(x, k)) - toDays(x), k);
  }
  assert.equal(sameDay(nov8, day(2026, 11, 8)), true);
  assert.equal(sameDay(nov8, day(2026, 11, 9)), false);
  assert.equal(sameDay(nov8, null), false);
  assert.equal(sameDay(null, null), false);
});

/* ============================================================================================= the grid */

check('November 2026 starts on a Sunday: six empty places, then the 1st, six rows, and the 30th alone in the last row', () => {
  const g = monthGrid({ y: 2026, m: 11 });
  assert.equal(g.length, 6);
  assert.deepEqual(g[0].slice(0, 6), [null, null, null, null, null, null]);
  assert.deepEqual(g[0][6], day(2026, 11, 1));
  assert.deepEqual(g[1].map((c) => c?.d), [2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(g[4].map((c) => c?.d), [23, 24, 25, 26, 27, 28, 29]);
  assert.deepEqual(g[5][0], day(2026, 11, 30));
  assert.deepEqual(g[5].slice(1), [null, null, null, null, null, null]);
  assert.equal(weeksNeeded({ y: 2026, m: 11 }), 6);
  assert.deepEqual(g[1][6], nov8, 'the 8th, a Sunday, is the last place of its row');
});

check('February 2028 has 29 days and starts on a Tuesday; February 2027 starts on a Monday and has exactly four rows of days', () => {
  const leap = monthGrid({ y: 2028, m: 2 });
  assert.deepEqual(leap[0].map((c) => c?.d ?? null), [null, 1, 2, 3, 4, 5, 6]);
  const days = leap.flat().filter((c): c is Ymd => !!c);
  assert.equal(days.length, 29);
  assert.deepEqual(days[28], day(2028, 2, 29));
  assert.equal(weeksNeeded({ y: 2028, m: 2 }), 5);
  const plain = monthGrid({ y: 2027, m: 2 });
  assert.deepEqual(plain[0].map((c) => c?.d), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(plain[3].map((c) => c?.d), [22, 23, 24, 25, 26, 27, 28]);
  assert.ok(plain[4].every((c) => c === null) && plain[5].every((c) => c === null), 'the last two rows are empty, and still there: the height does not change');
  assert.equal(weeksNeeded({ y: 2027, m: 2 }), 4);
  assert.equal(monthGrid({ y: 2100, m: 2 }).flat().filter(Boolean).length, 28, '2100 is not a leap year');
});

check('some months by name: how many rows they need', () => {
  assert.equal(weeksNeeded({ y: 2026, m: 12 }), 5);
  assert.equal(weeksNeeded({ y: 2027, m: 1 }), 5);
  assert.equal(weeksNeeded({ y: 2026, m: 8 }), 6, 'August 2026 starts on a Saturday and has 31 days');
  assert.equal(weeksNeeded({ y: 2026, m: 2 }), 5);
});

check('every month from 1990 to 2060 is six rows of seven: the days once each in order, the first on its weekday, each in the column of its weekday', () => {
  for (let y = 1990; y <= 2060; y++) {
    for (let m = 1; m <= 12; m++) {
      const g = monthGrid({ y, m });
      assert.equal(g.length, GRID_WEEKS);
      for (const row of g) assert.equal(row.length, DAYS_IN_WEEK);
      const flat = g.flat();
      const lead = byDate(y, m, 1);
      const length = lengthByDate(y, m);
      assert.equal(flat.slice(0, lead).every((c) => c === null), true, `${y}-${m}: ${lead} empty places before the 1st`);
      for (let d = 1; d <= length; d++) assert.deepEqual(flat[lead + d - 1], { y, m, d }, `${y}-${m}-${d}`);
      assert.equal(flat.slice(lead + length).every((c) => c === null), true, `${y}-${m}: nothing after the last day`);
      flat.forEach((c: Cell, i) => { if (c) assert.equal(i % 7, byDate(c.y, c.m, c.d), `${y}-${m}-${c.d} is in the column of its weekday`); });
      assert.equal(weeksNeeded({ y, m }), Math.ceil((lead + length) / 7), `${y}-${m}`);
      const lastRowWithDays = g.map((row) => row.some(Boolean)).lastIndexOf(true) + 1;
      assert.equal(weeksNeeded({ y, m }), lastRowWithDays, `${y}-${m}: the rows that are needed are the rows that have a day`);
      assert.ok(weeksNeeded({ y, m }) >= 4 && weeksNeeded({ y, m }) <= 6);
    }
  }
});

check('the weeks start on Monday and the weekday row says so', () => {
  assert.deepEqual([...WEEKDAYS_SHORT], ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  assert.deepEqual(WEEKDAYS.map((w) => w.slice(0, 2)), [...WEEKDAYS_SHORT], 'the short names are the first two letters of the full ones');
  assert.equal(WEEKDAYS[0], 'Monday');
  assert.equal(WEEKDAYS.length, 7);
  assert.equal(MONTHS.length, 12);
  assert.deepEqual([...MONTHS].slice(0, 3), ['January', 'February', 'March']);
  assert.equal(new Set([...MONTHS, ...WEEKDAYS]).size, 19, 'no name twice');
});

/* ========================================================================================= months, limits */

check('months can be added across the turn of the year, backwards and forwards, by any number', () => {
  assert.deepEqual(addMonths({ y: 2026, m: 12 }, 1), { y: 2027, m: 1 });
  assert.deepEqual(addMonths({ y: 2027, m: 1 }, -1), { y: 2026, m: 12 });
  assert.deepEqual(addMonths({ y: 2026, m: 11 }, 14), { y: 2028, m: 1 });
  assert.deepEqual(addMonths({ y: 2026, m: 1 }, -13), { y: 2024, m: 12 });
  assert.deepEqual(addMonths({ y: 2026, m: 6 }, 0), { y: 2026, m: 6 });
  assert.deepEqual(addMonths({ y: 2026, m: 6 }, 12), { y: 2027, m: 6 });
  assert.deepEqual(addMonths({ y: 2026, m: 6 }, -12), { y: 2025, m: 6 });
  assert.deepEqual(addMonths({ y: 2026, m: 1 }, -1), { y: 2025, m: 12 });
  const next = rng(99);
  for (let i = 0; i < 2000; i++) {
    const from: Ym = { y: 1900 + Math.floor(next() * 300), m: 1 + Math.floor(next() * 12) };
    const by = Math.floor(next() * 2400) - 1200;
    const to = addMonths(from, by);
    assert.ok(to.m >= 1 && to.m <= 12 && Number.isInteger(to.y));
    assert.deepEqual(addMonths(to, -by), from);
    assert.equal(monthNumber(to) - monthNumber(from), by);
    assert.equal(compareMonths(to, from) > 0, by > 0);
  }
  assert.equal(sameMonth({ y: 2026, m: 11 }, nov8), true);
  assert.equal(sameMonth({ y: 2026, m: 10 }, nov8), false);
});

check('the calendar goes five years back and five years ahead of today, whole months, both ends included', () => {
  assert.equal(RANGE_YEARS, 5);
  const range = rangeAround(nov8);
  assert.deepEqual(range, { min: { y: 2021, m: 11 }, max: { y: 2031, m: 11 } });
  assert.equal(monthNumber(range.max) - monthNumber(range.min) + 1, 121, '10 years and the month itself');
  assert.equal(monthInRange({ y: 2021, m: 11 }, range), true);
  assert.equal(monthInRange({ y: 2021, m: 10 }, range), false);
  assert.equal(monthInRange({ y: 2031, m: 11 }, range), true);
  assert.equal(monthInRange({ y: 2031, m: 12 }, range), false);
  assert.equal(dayInRange(day(2021, 11, 1), range), true);
  assert.equal(dayInRange(day(2021, 10, 31), range), false);
  assert.equal(dayInRange(day(2031, 11, 30), range), true);
  assert.equal(dayInRange(day(2031, 12, 1), range), false);
  assert.deepEqual(clampMonth({ y: 1999, m: 1 }, range), range.min);
  assert.deepEqual(clampMonth({ y: 2999, m: 1 }, range), range.max);
  assert.deepEqual(clampMonth({ y: 2026, m: 3 }, range), { y: 2026, m: 3 });
  // a leap day as today: the same months (a range is of months, so no 29 February is ever asked for in a year that has none)
  assert.deepEqual(rangeAround(day(2028, 2, 29)), { min: { y: 2023, m: 2 }, max: { y: 2033, m: 2 } });
});

check('the arrows switch off at the limits: back at the first month, forward at the last, and nowhere else', () => {
  const range = rangeAround(nov8);
  assert.equal(canGoBack(range.min, range), false);
  assert.equal(canGoBack(addMonths(range.min, 1), range), true);
  assert.equal(canGoForward(range.max, range), false);
  assert.equal(canGoForward(addMonths(range.max, -1), range), true);
  for (let by = 0; by <= 120; by++) {
    const shown = addMonths(range.min, by);
    assert.equal(canGoBack(shown, range), by > 0, `month ${by}`);
    assert.equal(canGoForward(shown, range), by < 120, `month ${by}`);
  }
});

/* ============================================================================================ the clock */

check('today is read off the clock in the phone\'s own time zone, to the last second of the day; a clock that cannot be read still gives a day', () => {
  assert.deepEqual(todayOf(new Date(2026, 10, 8, 0, 0, 0)), nov8);
  assert.deepEqual(todayOf(new Date(2026, 10, 8, 23, 59, 59, 999)), nov8);
  assert.deepEqual(todayOf(new Date(2026, 10, 9, 0, 0, 0)), day(2026, 11, 9));
  assert.deepEqual(todayOf(new Date(2028, 1, 29, 12)), day(2028, 2, 29));
  assert.deepEqual(todayOf(new Date(2026, 11, 31, 23, 59)), day(2026, 12, 31));
  assert.deepEqual(todayOf(new Date(NaN)), FALLBACK_TODAY);
  assert.equal(isValidDay(FALLBACK_TODAY), true);
  const next = rng(5);
  for (let i = 0; i < 1000; i++) {
    const x = randomDay(next, 1971, 2099);
    assert.deepEqual(todayOf(new Date(x.y, x.m - 1, x.d, Math.floor(next() * 24), Math.floor(next() * 60))), x, 'whatever the hour of the day');
  }
});

/* ============================================================================================ the words */

check('the dates read the way a person says them: weekday, day, month, year', () => {
  assert.equal(formatDate(nov8), 'Sunday 8 November 2026');
  assert.equal(formatDate(day(2028, 2, 29)), 'Tuesday 29 February 2028');
  assert.equal(formatDate(day(2026, 1, 1)), 'Thursday 1 January 2026');
  assert.equal(monthTitle({ y: 2026, m: 11 }), 'November 2026');
  assert.equal(monthTitle({ y: 2027, m: 1 }), 'January 2027');
});

check('every day of the grid has a label of its own with the whole date, and says "today" and "selected" when they are true', () => {
  assert.equal(dayLabel(day(2026, 11, 14)), 'Saturday 14 November 2026');
  assert.equal(dayLabel(day(2026, 11, 14), { selected: true }), 'Saturday 14 November 2026, selected');
  assert.equal(dayLabel(nov8, { today: true }), 'Sunday 8 November 2026, today');
  assert.equal(dayLabel(nov8, { today: true, selected: true }), 'Sunday 8 November 2026, today, selected');
  assert.equal(dayLabel(nov8, { today: false, selected: false }), 'Sunday 8 November 2026');
  for (const ym of [{ y: 2026, m: 11 }, { y: 2028, m: 2 }, { y: 2026, m: 12 }]) {
    const labels = monthGrid(ym).flat().filter((c): c is Ymd => !!c).map((c) => dayLabel(c));
    assert.equal(new Set(labels).size, labels.length, `${monthTitle(ym)}: no two days are labelled alike`);
    for (const l of labels) assert.match(l, /^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday) \d{1,2} [A-Z][a-z]+ \d{4}$/);
  }
});

check('the month buttons say where they go, and, when there is nowhere to go, only what they are', () => {
  const range = rangeAround(nov8);
  assert.equal(previousMonthLabel({ y: 2026, m: 11 }, range), 'Previous month, October 2026');
  assert.equal(nextMonthLabel({ y: 2026, m: 11 }, range), 'Next month, December 2026');
  assert.equal(nextMonthLabel({ y: 2026, m: 12 }, range), 'Next month, January 2027', 'across the turn of the year');
  assert.equal(previousMonthLabel({ y: 2027, m: 1 }, range), 'Previous month, December 2026');
  assert.equal(previousMonthLabel(range.min, range), 'Previous month');
  assert.equal(nextMonthLabel(range.max, range), 'Next month');
});

check('the heading of the reading: the weekday on top (with "Today" when it is today), the date under it, and one sentence for a screen reader', () => {
  assert.deepEqual(readingHeading(nov8, true), { eyebrow: 'Today · Sunday', title: '8 November 2026', label: 'Today, Sunday 8 November 2026' });
  assert.deepEqual(readingHeading(day(2026, 11, 14), false), { eyebrow: 'Saturday', title: '14 November 2026', label: 'Saturday 14 November 2026' });
});

/* ====================================================================================== what a tap does */

const reduce = (state: DailyState, ...actions: DailyAction[]) => actions.reduce(dailyReducer, state);

check('the screen opens on this month with today selected, and today\'s limits', () => {
  const s = initDaily(nov8);
  assert.deepEqual(s.selected, nov8);
  assert.deepEqual(s.shown, { y: 2026, m: 11 });
  assert.deepEqual(s.range, { min: { y: 2021, m: 11 }, max: { y: 2031, m: 11 } });
  assert.deepEqual(arrows(s), { back: true, forward: true });
});

check('tapping a day selects it, and a day in the month on show stays in it', () => {
  const s = reduce(initDaily(nov8), { type: 'select', day: day(2026, 11, 14) });
  assert.deepEqual(s.selected, day(2026, 11, 14));
  assert.deepEqual(s.shown, { y: 2026, m: 11 });
  const again = reduce(s, { type: 'select', day: nov8 });
  assert.deepEqual(again.selected, nov8);
});

check('the arrows change the month on show and leave the selected day alone: the reading changes only when a day is tapped', () => {
  const s = reduce(initDaily(nov8), { type: 'month', by: 1 }, { type: 'month', by: 1 });
  assert.deepEqual(s.shown, { y: 2027, m: 1 });
  assert.deepEqual(s.selected, nov8);
  const t = reduce(s, { type: 'month', by: -1 }, { type: 'month', by: -1 }, { type: 'month', by: -1 });
  assert.deepEqual(t.shown, { y: 2026, m: 10 });
  assert.deepEqual(t.selected, nov8);
});

check('Today brings back today\'s month and selects today, from any month and any day', () => {
  const far = reduce(initDaily(nov8), { type: 'month', by: 40 }, { type: 'select', day: day(2030, 3, 17) }, { type: 'month', by: -70 });
  assert.notDeepEqual(far.shown, { y: 2026, m: 11 });
  const back = dailyReducer(far, { type: 'today', today: nov8 });
  assert.deepEqual(back.shown, { y: 2026, m: 11 });
  assert.deepEqual(back.selected, nov8);
  assert.deepEqual(back.range, far.range, 'the limits do not move');
  // the phone was left open overnight: today is the next day now, and that is what Today goes to
  const nextDay = dailyReducer(far, { type: 'today', today: day(2026, 11, 9) });
  assert.deepEqual(nextDay.selected, day(2026, 11, 9));
  // past the limits (a clock that jumped): it stops at the limit, on the first of that month
  const jumped = dailyReducer(initDaily(nov8), { type: 'today', today: day(2040, 5, 20) });
  assert.deepEqual(jumped.shown, { y: 2031, m: 11 });
  assert.deepEqual(jumped.selected, day(2031, 11, 1));
});

check('pressing the arrows over and over stops at the limits, both ways, and the arrow that cannot go is off', () => {
  let s = initDaily(nov8);
  let steps = 0;
  while (arrows(s).forward) { s = dailyReducer(s, { type: 'month', by: 1 }); steps += 1; assert.ok(steps <= 121, 'it ends'); }
  assert.equal(steps, 60, 'five years of months');
  assert.deepEqual(s.shown, { y: 2031, m: 11 });
  assert.equal(arrows(s).back, true);
  assert.equal(dailyReducer(s, { type: 'month', by: 1 }), s, 'one more is not taken: the state itself comes back');
  let back = 0;
  while (arrows(s).back) { s = dailyReducer(s, { type: 'month', by: -1 }); back += 1; assert.ok(back <= 121); }
  assert.equal(back, 120, 'ten years of months');
  assert.deepEqual(s.shown, { y: 2021, m: 11 });
  assert.deepEqual(arrows(s), { back: false, forward: true });
  assert.equal(dailyReducer(s, { type: 'month', by: -1 }), s);
  assert.deepEqual(dailyReducer(initDaily(nov8), { type: 'month', by: 100000 }).shown, { y: 2031, m: 11 }, 'a jump of any size stops at the limit');
  assert.deepEqual(dailyReducer(initDaily(nov8), { type: 'month', by: -100000 }).shown, { y: 2021, m: 11 });
});

check('a day past the limits, or one that does not exist, is not selected', () => {
  const s = initDaily(nov8);
  for (const bad of [day(2031, 12, 1), day(2021, 10, 31), day(1999, 1, 1), day(2026, 2, 30), day(2026, 13, 1), day(2026, 11, 0), { y: NaN, m: 1, d: 1 }]) {
    assert.equal(dailyReducer(s, { type: 'select', day: bad }), s, JSON.stringify(bad));
  }
  assert.deepEqual(dailyReducer(s, { type: 'select', day: day(2031, 11, 30) }).selected, day(2031, 11, 30), 'the last day of the last month is inside');
  assert.deepEqual(dailyReducer(s, { type: 'select', day: day(2021, 11, 1) }).selected, day(2021, 11, 1), 'the first day of the first month is inside');
});

check('the reducer does not change what it was given, and the same taps always end in the same place', () => {
  const s = initDaily(nov8);
  const copy = JSON.stringify(s);
  const t = reduce(s, { type: 'month', by: 3 }, { type: 'select', day: day(2027, 2, 14) }, { type: 'today', today: nov8 });
  assert.equal(JSON.stringify(s), copy);
  assert.deepEqual(t, reduce(s, { type: 'today', today: nov8 }), 'Today after anything is the same place');
});

/* ================================================================================ the width of the calendar */

check('on every phone from 320 to 430 wide a day is at least 44 by 44 and the calendar stays on the screen', () => {
  assert.equal(TOUCH, 44);
  assert.equal(COLUMNS, 7);
  for (let w = 320; w <= 430; w++) {
    const m = calendarMetrics(w, 16);
    assert.ok(m.cell >= TOUCH - 1e-9, `${w}: a day is ${m.cell} wide`);
    assert.ok(m.card <= w + 1e-9, `${w}: the card is ${m.card} wide`);
    assert.ok(m.bleed >= 0 && m.bleed <= 16, `${w}: bleed ${m.bleed}`);
    assert.ok(m.pad >= 0 && m.pad <= CARD_PAD, `${w}: pad ${m.pad}`);
    assert.ok(Math.abs(m.card - 2 * m.pad - m.grid) < 1e-9, `${w}: the seven days fill the card inside its padding`);
    assert.ok(Math.abs(m.cell * COLUMNS - m.grid) < 1e-9);
  }
});

check('the three kinds of phone: 320 where the card reaches 10 px into each margin, 340 to 355 where it does not and the padding grows, 356 and up with the full padding', () => {
  assert.deepEqual(calendarMetrics(320, 16), { bleed: 10, pad: 0, card: 308, grid: 308, cell: 44 });
  assert.deepEqual(calendarMetrics(340, 16), { bleed: 0, pad: 0, card: 308, grid: 308, cell: 44 });
  assert.equal(calendarMetrics(350, 16).pad, 5);
  assert.equal(calendarMetrics(350, 16).cell, 44);
  assert.equal(calendarMetrics(356, 16).pad, CARD_PAD);
  for (let w = 356; w <= 430; w++) { assert.equal(calendarMetrics(w, 16).pad, CARD_PAD, String(w)); assert.equal(calendarMetrics(w, 16).bleed, 0, String(w)); }
  assert.equal(calendarMetrics(390, 16).cell, (390 - 32 - 16) / 7);
  assert.ok(calendarMetrics(390, 16).cell > 48 && calendarMetrics(390, 16).cell < 49);
  assert.ok(calendarMetrics(430, 16).cell > 54 && calendarMetrics(430, 16).cell < 55);
  // a day only gets wider as the phone does
  let last = 0;
  for (let w = 300; w <= 1400; w++) { const c = calendarMetrics(w, 16).cell; assert.ok(c >= last - 1e-9, String(w)); last = c; }
});

check('on a tablet or in a browser window the days stop growing at 64, and a phone that is too small for 44 simply fills its screen', () => {
  assert.equal(calendarMetrics(1400, 16).grid, GRID_MAX);
  assert.equal(GRID_MAX, 448);
  assert.equal(calendarMetrics(1400, 16).cell, 64);
  const tiny = calendarMetrics(300, 16);
  assert.equal(tiny.card, 300, 'not past the edge of the screen');
  assert.equal(tiny.bleed, 16);
});

/* ==================================================================================================================
   From here on the source is read, nothing is run: how the screen is wired into the app, and that the design page shows the same screen.
   ================================================================================================================== */

const DIR = 'src/features/library/daily';
const ROUTE = 'app/library/daily.tsx';
const dailyFiles = [...fs.readdirSync(path.join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${DIR}/${f}`), ROUTE];
const source = (f: string) => code(read(f));
/** The text of a file of the feature, comments out. */
const all = () => dailyFiles.map((f) => `// ${f}\n${source(f)}`).join('\n');

check('the feature is the files this test expects, so a new one is looked at (and the scans below see all of them)', () => {
  assert.deepEqual(dailyFiles.map((f) => path.basename(f)).sort(), [
    'CalendarSheet.tsx', 'DailyBookmarks.tsx', 'DailyHeader.tsx', 'DayReading.tsx', 'LiturgicalCard.tsx', 'MonthCalendar.tsx', 'WeekStrip.tsx', 'bannerLayout.ts', 'bookmarks.ts', 'calendar.ts',
    'content.ts', 'daily.tsx', 'datekey.ts', 'dayData.ts', 'layout.ts', 'liturgy.ts', 'readings.generated.ts', 'readingsCore.ts', 'reference.ts', 'state.ts', 'useDailyReading.ts', 'week.ts',
  ]);
});

check('no new native module and no network: React, React Native, expo-router and the app\'s own components, theme and Library bookmarks, and no call to the account, the network or the phone\'s storage from this feature itself', () => {
  // NEW RULE: the screen keeps one thing on the phone, the bookmark of a day, and only through the Library's own hook (useLibraryBookmarks), which is the one place the
  // Library's bookmarks are read and written; nothing of the feature itself touches the account, the network or the storage
  const allowed = /^(react|react-native|expo-router|react-native-safe-area-context)$|^\.{1,2}\/|^@\/(components\/|theme$|features\/library\/daily\/|features\/library\/(useLibraryBookmarks|bookmarks|BookmarkToggle)$)/;
  const offenders: string[] = [];
  for (const f of dailyFiles) for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  assert.deepEqual(offenders, []);
  const text = all();
  assert.doesNotMatch(text, /supabase|@\/lib\/|localStore|secureStorage|AsyncStorage|expo-file-system|\bfetch\(|XMLHttpRequest|WebSocket|NetInfo|navigator\.onLine/i, 'the feature fetches nothing and stores nothing itself');
});

check('the calendar, the reducer, the layout, the readings and the references are plain TypeScript: no React and no React Native in them', () => {
  for (const f of ['calendar.ts', 'state.ts', 'layout.ts', 'liturgy.ts', 'bannerLayout.ts', 'content.ts', 'readingsCore.ts', 'reference.ts']) {
    const src = read(`${DIR}/${f}`);
    assert.doesNotMatch(src, /from 'react|from '@\/|from 'expo/, `${f} is read by node tests, so it imports nothing of the app`);
  }
  assert.doesNotMatch(source(`${DIR}/calendar.ts`), /\bIntl\b|toLocale|\.toDateString|\.getDay\(|Date\.UTC|\.getTimezoneOffset/, 'no Date or Intl arithmetic: the tables and the day counting are the calendar');
  assert.equal((source(`${DIR}/calendar.ts`).match(/new Date\(/g) ?? []).length, 0, 'calendar.ts only reads the fields of a Date it is given');
});

check('colours are theme roles and nothing else: no literal colour, no palette colour, no fixed colour, and none read when the file loads', () => {
  for (const f of dailyFiles) {
    const src = source(f);
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/, `${f}: a literal colour`);
    if (f.endsWith('.tsx')) assert.doesNotMatch(src, /\bfixed\.|\bc\.[a-z]/, `${f}: only role.* (and the theme's radius and layout) are used here`);
    assert.doesNotMatch(src, /\b(backgroundColor|borderColor|color)\s*[:=]\s*'(?!transparent')[a-z]+'/, `${f}: a named colour`);
  }
  assert.match(all(), /\brole\.action\b/);
  // a role is read while drawing: nothing of the theme is read at the top level of a file
  for (const f of dailyFiles.filter((p) => p.endsWith('.tsx'))) {
    for (const line of source(f).split('\n')) assert.ok(!/^(export )?const \w+ = .*\brole\./.test(line), `${f}: a role read when the file loads would never follow light and dark: ${line.trim()}`);
  }
  assert.doesNotMatch(all(), /StyleSheet\.create/);
});

check('the pairs the screen draws keep their contrast in light and in dark: text 4.5 : 1, the rings and the arrows 3 : 1, the quiet arrow that cannot go included', () => {
  type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Tokens;
  const roleColour = (name: string, dark: boolean): string => {
    const literal = dark ? tokens.dark.role[name] : undefined;
    if (literal) return literal.startsWith('#') ? literal : (tokens.dark.color[literal] ?? tokens.color[literal]);
    const colour = tokens.role[name];
    return (dark ? tokens.dark.color[colour] : undefined) ?? tokens.color[colour];
  };
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  const pairs: [string, string, number, string][] = [
    ['text', 'surface', 4.5, 'the numbers of the days and the month on the card'],
    ['textMuted', 'surface', 4.5, 'the weekday names, the translation line and the verse numbers on a card'],
    ['text', 'bg', 4.5, 'the title and the date over the reading'],
    ['textMuted', 'bg', 4.5, 'the small line over the date'],
    ['action', 'surface', 4.5, 'the label of Today'],
    ['action', 'surface', 3, 'the ring of today'],
    ['onAction', 'action', 4.5, 'the number of the day that is picked, and the ring inside it'],
    ['textPlaceholder', 'surface', 3, 'the arrow that cannot go'],
  ];
  for (const dark of [false, true]) for (const [fg, bg, need, where] of pairs) {
    const ratio = contrast(roleColour(fg, dark), roleColour(bg, dark));
    assert.ok(ratio >= need, `${dark ? 'dark' : 'light'}: ${where} (${fg} on ${bg}) is ${ratio.toFixed(2)} : 1, needs ${need}`);
  }
  // and the screen draws exactly those: the quiet arrow is the placeholder grey at full strength (not a faded copy of the dark one)
  const cal = source(`${DIR}/MonthCalendar.tsx`);
  assert.match(cal, /<Icon name=\{direction\} color=\{enabled \? role\.text : role\.placeholder\} \/>/);
  assert.doesNotMatch(cal, /opacity: !enabled/, 'fading an arrow takes it under 3 : 1');
  assert.match(read('src/theme/index.ts'), /placeholder: pick\('textPlaceholder', k, scheme\)/, 'role.placeholder is the textPlaceholder of tokens.json');
});

check('every control has a label for a screen reader, says it is a button, and is at least 44 px: the days, the arrows, Today and Back', () => {
  const cal = source(`${DIR}/MonthCalendar.tsx`);
  const pressables = [...cal.matchAll(/<Pressable\b/g)];
  assert.equal(pressables.length, 3, 'Arrow, Day and Today are the three things that can be pressed in the calendar');
  for (const m of pressables) {
    const tag = cal.slice(m.index, (m.index ?? 0) + 760);
    assert.match(tag, /accessibilityRole="button"/);
    assert.match(tag, /accessibilityLabel=/);
    assert.match(tag, /\bTOUCH\b/, 'its size is the 44 of layout.ts');
  }
  assert.match(cal, /accessibilityLabel=\{dayLabel\(day, \{ today, selected \}\)\}/, 'a day says its whole date, "today" and "selected"');
  assert.match(cal, /label=\{previousMonthLabel\(shown, range\)\}/);
  assert.match(cal, /label=\{nextMonthLabel\(shown, range\)\}/);
  assert.match(cal, /accessibilityLabel="Today"/);
  assert.match(cal, /width: TOUCH, height: TOUCH/, 'the arrows are 44 by 44');
  assert.match(cal, /\{ flex: 1, height: TOUCH,/, 'a day is as wide as its seventh of the card and 44 high');
  assert.match(cal, /minHeight: TOUCH, justifyContent: 'center'/, 'Today is 44 high');
  assert.match(cal, /accessibilityState=\{\{ disabled: !enabled \}\}\s+disabled=\{!enabled\}/, 'an arrow at the limit is off, and says so');
  assert.match(source(`${DIR}/DailyHeader.tsx`), /<BackButton fallback="\/library" \/>/, 'Back is the Back button of the app, which goes to the Library when the screen was opened by a link');
  assert.match(source(ROUTE), /<DailyHeader onCalendar=\{openCalendar\} /);
  // and what each one does: a day selects itself, the arrows go back and forward (and look it), Today goes to today
  assert.match(cal, /onPress=\{\(\) => onSelect\(day\)\}/, 'a day selects itself');
  assert.match(cal, /<Arrow direction="back" label=\{previousMonthLabel\(shown, range\)\} enabled=\{canGoBack\} onPress=\{onPrevious\} \/>/, 'the left arrow goes to the month before');
  assert.match(cal, /<Arrow direction="chevron" label=\{nextMonthLabel\(shown, range\)\} enabled=\{canGoForward\} onPress=\{onNext\} \/>/, 'the right arrow goes to the month after');
  assert.match(cal, /accessibilityHint="Goes back to today"\s+onPress=\{onToday\}/, 'Today goes to today');
  assert.match(cal, /<Icon name=\{direction\} color=/, 'the arrow draws the icon it was given: back (pointing left) before, chevron (pointing right) after');
  assert.match(cal, />\{monthTitle\(shown\)\}<\/AppText>/, 'the title is the month on show');
  assert.match(cal, />\{day\.d\}<\/AppText>/, 'a day shows its number');
  assert.match(read('src/components/ui.tsx'), /size = 48/, 'the shared round button is 48');
  assert.equal(TOUCH, 44);
  assert.match(read(`${DIR}/layout.ts`), /export const TOUCH = 44;/);
});

check('the calendar: ring for today, fill for the chosen day, a ring inside the fill for both; weekday row hidden from a screen reader; six rows from monthGrid; the text of the days stops growing at 1.3', () => {
  const cal = source(`${DIR}/MonthCalendar.tsx`);
  assert.match(cal, /borderWidth: today \? 2 : 0, borderColor: role\.action, backgroundColor: selected \? role\.action : 'transparent'/);
  assert.match(cal, /\{selected && today && <View pointerEvents="none" style=\{\{ position: 'absolute', top: 3, left: 3, right: 3, bottom: 3, borderRadius: radius\.pill, borderWidth: 2, borderColor: role\.onAction \}\} \/>\}/);
  assert.match(cal, /color=\{selected \? role\.onAction : role\.text\}/);
  assert.match(cal, /<View aria-hidden style=\{\{ flexDirection: 'row', height: 28, alignItems: 'center' \}\}>\s*\{WEEKDAYS_SHORT\.map/);
  assert.match(cal, /monthGrid\(shown\)\.map\(\(row, r\) => \(/);
  assert.equal((cal.match(/maxFontSizeMultiplier=\{FONT_LIMIT\}/g) ?? []).length, 2, 'the numbers of the days and the weekday names');
  assert.match(cal, /const FONT_LIMIT = 1\.3;/);
  assert.match(cal, /sameDay\(cell, today\)/);
  assert.match(cal, /sameDay\(cell, selected\)/);
  assert.match(cal, /: <View key=\{c\} style=\{\{ flex: 1, height: TOUCH \}\} \/>/, 'a place outside the month is empty and keeps its size: the height never changes');
  assert.match(cal, /accessibilityRole="header" accessibilityLiveRegion="polite"/, 'the month is a heading, said again when it changes (Android and the web)');
  assert.match(cal, /<Card style=\{\{ paddingHorizontal: metrics\.pad, paddingVertical: 8 \}\}>/);
  assert.match(cal, /const metrics = calendarMetrics\(width, layout\.screenMargin\);/);
  assert.match(cal, /<View style=\{\{ marginHorizontal: -metrics\.bleed \}\}>/, 'on a 320 phone the card reaches into the margins so that every day is 44 wide');
  assert.match(cal, /useWindowDimensions\(\)/);
  assert.match(cal, /maxWidth: GRID_MAX, alignSelf: 'center'/, 'a tablet or a browser window does not get days of 150 px');
});

check('the screen is a stack screen like Bookmarks: one row (Back, the title, the calendar, the bookmark), the week strip, then the reading of the picked day', () => {
  const src = source(ROUTE);
  assert.match(src, /<Screen tabBar=\{false\}>/);
  assert.doesNotMatch(src, /\brouter\.|useRouter|goBack\(/, 'the way back is the Back button of the header, the app\'s: the screen has no router and no goBack of its own');
  assert.match(src, /const daily = useDailyReading\(undefined, parseDateKey\(Array\.isArray\(date\) \? date\[0\] : date\)\);/, 'the clock is the phone\'s, and the date param is read, anything that is not a day meaning today');
  assert.ok(src.indexOf('<DailyHeader') < src.indexOf('<WeekStrip') && src.indexOf('<WeekStrip') < src.indexOf('<DayReading') && src.indexOf('<DayReading') < src.indexOf('<CalendarSheet'), 'order: header, strip, reading, the sheet');
  assert.match(src, /<DayReading day=\{daily\.selected\} \/>/);
  for (const prop of ['selected={daily.selected}', 'today={daily.today}', 'range={daily.range}', 'canGoBack={daily.canGoBackWeek}', 'canGoForward={daily.canGoForwardWeek}', 'onSelect={daily.select}', 'onPrevious={daily.previousWeek}', 'onNext={daily.nextWeek}', 'onToday={daily.goToday}']) assert.ok(src.includes(prop), prop);
  assert.match(src, /export default function DailyReading\(\)/);
  // the header: the title is next to Back, in the same row, with the calendar and the bookmark at the right edge, each at least 44
  const header = source(`${DIR}/DailyHeader.tsx`);
  assert.ok(header.indexOf('<BackButton') < header.indexOf('>Daily reading</AppText>') && header.indexOf('>Daily reading</AppText>') < header.indexOf('name="calendar"') && header.indexOf('name="calendar"') < header.indexOf('name="bookmark"'), 'order in the row: Back, title, calendar, bookmark');
  assert.match(header, /flexDirection: 'row', alignItems: 'center'/);
  assert.match(header, /<AppText variant="h3" accessibilityRole="header" numberOfLines=\{2\}/, 'the Fraunces title, a header, which wraps to a second line rather than run under a button');
  assert.match(header, /const SIZE = 48;/, 'the two buttons are as big as the Back button next to them');
  assert.match(header, /width: SIZE, height: SIZE/);
  assert.equal((header.match(/<HeaderButton /g) ?? []).length, 2, 'calendar and bookmark: Back is the BackButton of the app');
  assert.match(header, /label="Open calendar"/);
  assert.match(header, /label=\{bookmarked \? UNBOOKMARK_DAY : BOOKMARK_DAY\} selected=\{bookmarked\}/, 'the bookmark button says what a tap will do and exposes whether the day is bookmarked');
  // NEW RULE: selected and expanded are exposed with the aria props of React Native (aria-selected, aria-expanded), because the web does not draw the older accessibilityState object
  assert.match(header, /aria-selected=\{selected\}/);
  assert.match(source(`${DIR}/WeekStrip.tsx`), /accessibilityLabel=\{dayCellLabel\(day, today\)\}\s+aria-selected=\{selected\}/, 'a day of the strip says whether it is the picked one');
  assert.doesNotMatch(all(), /accessibilityState=\{\{[^}]*\b(selected|expanded|checked)\b/, 'no state the web would not draw');
  assert.equal(BOOKMARK_DAY, 'Bookmark this day');
  assert.equal(UNBOOKMARK_DAY, 'Remove bookmark');
  // the calendar button opens the sheet, a day chosen in it closes it and picks the day, Today picks today and closes it, Close and the backdrop close it
  assert.match(src, /const openCalendar = \(\) => \{ daily\.showMonth\(\); setCalendar\(true\); \};/);
  assert.match(src, /onSelect=\{\(day\) => \{ daily\.select\(day\); setCalendar\(false\); \}\}/);
  assert.match(src, /onToday=\{\(\) => \{ daily\.goToday\(\); setCalendar\(false\); \}\}/);
  assert.match(src, /onClose=\{\(\) => setCalendar\(false\)\}/);
  const sheet = source(`${DIR}/CalendarSheet.tsx`);
  assert.match(sheet, /<Modal visible transparent animationType="fade" onRequestClose=\{onClose\} statusBarTranslucent>/, 'the back button of the phone, and Escape in a browser, close it');
  assert.match(sheet, /accessibilityLabel="Close the calendar" onPress=\{onClose\}/, 'a tap on the dimmed part closes it');
  assert.match(sheet, /accessibilityLabel="Close calendar"\s+onPress=\{onClose\}/, 'the Close button');
  assert.match(sheet, /<MonthCalendar\s+shown=\{shown\}/, 'the month calendar of v1, with its five years back and ahead');
  assert.match(sheet, /<AppText variant="label" color=\{role\.action\}>Close<\/AppText>/);
  // and the bookmark: the Library's own list, under the key of the day
  assert.match(src, /const marks = useLibraryBookmarks\(\);/);
  assert.match(src, /const key = dailyKey\(daily\.selected\);/);
  assert.match(src, /bookmarked=\{marks\.has\(key\)\} onBookmark=\{\(\) => marks\.toggle\(key\)\}/);
  assert.match(src, /\{marks\.failed && <FormMessage>\{BOOKMARK_NOT_SAVED\}<\/FormMessage>\}/, 'a bookmark that could not be saved says so');
  const bookmarks = source('app/library/bookmarks.tsx');
  for (const shared of [/<Screen tabBar=\{false\}>/, /<BackButton fallback="\/library" \/>/]) assert.match(bookmarks, shared, 'Bookmarks still has what this screen copies');
});

check('a bookmarked day is a row on the Bookmarks screen: "Daily reading" as the heading, the date and the liturgical name in the row, opening the Daily reading on that day, with a bookmark that takes it off', () => {
  // NEW RULE: the Bookmarks screen grows by one import and one line (app/library/bookmarks.tsx), and everything else it does is left as it was
  const screen = source('app/library/bookmarks.tsx');
  assert.match(screen, /import \{ DailyBookmarks \} from '@\/features\/library\/daily\/DailyBookmarks';/);
  assert.equal((screen.match(/<DailyBookmarks marks=\{marks\} \/>/g) ?? []).length, 1);
  assert.ok(screen.indexOf('<LibraryGroups') < screen.indexOf('<DailyBookmarks') && screen.indexOf('<DailyBookmarks') < screen.indexOf('>Posts</AppText>'), 'between the Library rows and the Posts');
  assert.match(screen, /\) : marks\.ready && \(\s*<Card><AppText variant="small" muted>\{LIBRARY_BOOKMARKS_EMPTY\}<\/AppText><\/Card>/, 'the Library part says what it said before');
  const part = source(`${DIR}/DailyBookmarks.tsx`);
  assert.match(part, /const days = useMemo\(\(\) => dailyDaysOf\(marks\.shown\), \[marks\.shown\]\);/, 'made of the keys of the Library\'s own bookmark list, as they were when the screen came into view');
  assert.match(part, /if \(days\.length === 0\) return null;/, 'with no day bookmarked it draws nothing');
  assert.match(part, /<AppText variant="h4" accessibilityRole="header" style=\{\{ marginTop: space\[2\] \}\}>\{DAILY_GROUP\}<\/AppText>/);
  assert.equal(DAILY_GROUP, 'Daily reading');
  assert.match(part, /accessibilityLabel=\{`\$\{DAILY_GROUP\}, \$\{date\}, \$\{title\}`\}/, 'a screen reader says "Daily reading", the date and the name');
  assert.match(part, /<AppText variant="label">\{date\}<\/AppText>\s*<AppText variant="small" muted>\{title\}<\/AppText>/, 'the date at 17 (label), its name under it at 17 (small)');
  assert.match(part, /const date = formatDate\(day\);/);
  assert.match(part, /const title = dailyTitle\(day\);/);
  assert.match(part, /router\.push\(\{ pathname: '\/library\/daily', params: \{ date: dateKey\(day\) \} \}\)/, 'a tap opens the Daily reading on that date');
  assert.match(part, /<BookmarkToggle on=\{marks\.has\(key\)\} title=\{`\$\{DAILY_GROUP\}, \$\{date\}`\} toggle=\{\(\) => marks\.toggle\(key\)\} \/>/, 'the same bookmark button as the other rows');
  assert.match(part, /minHeight: 48/, 'the row is a touch target of at least 44');
  assert.doesNotMatch(part, /SampleNotice|SampleTag/, 'a day is real: its date and its name are worked out on the phone');
  // what the part shows for a day is what the screen of that day says
  const day = { y: 2026, m: 11, d: 8 };
  assert.equal(formatDate(day), 'Sunday 8 November 2026');
  assert.equal(dailyTitle(day), '32nd Sunday in Ordinary Time');
  assert.equal(dailyKey(day), 'daily:2026-11-08');
});

check('the route is registered once, in the block for someone with a journey, next to library/bookmarks and with the same (no) options', () => {
  const layout = read('app/_layout.tsx');
  const daily = [...layout.matchAll(/<Stack\.Screen name="library\/daily"([^>]*)\/>/g)];
  const bookmarks = [...layout.matchAll(/<Stack\.Screen name="library\/bookmarks"([^>]*)\/>/g)];
  assert.equal(daily.length, 1, 'registered exactly once');
  assert.equal(bookmarks.length, 1);
  assert.equal(daily[0][1].trim(), bookmarks[0][1].trim(), 'the options of Bookmarks, which are none');
  assert.equal(daily[0][1].trim(), '');
  assert.match(layout, /<Stack\.Screen name="library\/bookmarks" \/>\n(\s+<Stack\.Screen name="library\/[\w/\[\]-]+" \/>\n)*\s+<Stack\.Screen name="library\/daily" \/>/, 'next to Bookmarks (other Library screens may be between them)');
  const guard = layout.indexOf('<Stack.Protected guard={onboarded}>');
  const at = layout.indexOf('<Stack.Screen name="library/daily" />');
  const end = layout.indexOf('</Stack.Protected>', guard);
  assert.ok(guard > 0 && at > guard && at < end && layout.indexOf('<Stack.Screen name="library/bookmarks" />') > guard, 'in the same guard as Bookmarks');
  assert.ok(fs.existsSync(path.join(root, ROUTE)));
  assert.ok(!fs.existsSync(path.join(root, 'app/library/_layout.tsx')), 'no layout of its own for the Library screens: the root one is the only place they are registered');
  const layouts: string[] = [];
  const walk = (dir: string) => { for (const name of fs.readdirSync(path.join(root, dir))) { const rel = `${dir}/${name}`; if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel); else if (name === '_layout.tsx') layouts.push(rel); } };
  walk('app');
  assert.deepEqual(layouts.filter((f) => /name="library\/daily"/.test(read(f))), ['app/_layout.tsx'], 'no other layout registers it');
});

check('the reading under the strip: the liturgical day, then the readings with their references and the words from the Bible, then one line of small print; nothing is a sample, and there is no handwritten line', () => {
  const src = source(`${DIR}/DayReading.tsx`);
  assert.match(src, /const content = useMemo\(\(\) => dayContent\(key\), \[key\]\);/, 'the screen asks the one provider function for the day, and nothing else');
  assert.match(src, /import \{ dayContent \} from '\.\/dayData';/, 'the real readings and the real Bible, through dayData.ts');
  assert.doesNotMatch(src, /Sample|sample|SAMPLE|Preview|Buen Camino|variant="accent"/, 'nothing of the sample is left, and the handwritten line is gone');
  assert.ok(src.indexOf('<LiturgicalCard') < src.indexOf('>Readings</AppText>') && src.indexOf('>Readings</AppText>') < src.indexOf('READINGS_SOURCE}'), 'order: liturgical day, readings, small print');
  assert.match(src, /<LiturgicalCard day=\{day\} title=\{content\.title\} under=\{content\.under\} \/>/);
  assert.match(src, /accessibilityRole="button"[\s\S]*aria-expanded=\{open\}/, 'a reading is a button that says whether its text is open');
  assert.match(src, /accessibilityLabel=\{label\}\s+accessibilityHint=\{open \? 'Hides the text' : 'Shows the text'\}/);
  assert.match(src, /const label = `\$\{reading\.title\}, \$\{reading\.reference\}`;/, 'a screen reader says the name and the reference');
  assert.match(src, /<AppText variant="label">\{reading\.title\}<\/AppText>\s*<AppText variant="mono" muted>\{reading\.reference\}<\/AppText>/, 'the name in Inter, the reference in JetBrains Mono');
  assert.match(src, /<AppText key=\{r\} variant="body">/, 'the words are at the body size of the Bible reader (19)');
  assert.match(src, /<AppText variant="caption" muted>\{`\$\{line\.n\} `\}<\/AppText>/, 'the verse numbers are small and muted');
  assert.match(src, /\{text\.whole && <AppText variant="caption" muted>\{WHOLE_PSALM_NOTE\}<\/AppText>\}/, 'a psalm shown whole says so');
  assert.match(src, /<AppText variant="small" muted style=\{\{ paddingVertical: space\[3\] \}\}>\{NO_READINGS\}<\/AppText>/, 'a day with no readings says so');
  assert.match(src, /\{!!content\.readings && <AppText variant="caption" muted>\{READINGS_SOURCE\}<\/AppText>\}/, 'the source line is under readings that are there, and only then');
  assert.match(src, /if \(!reading\.text\) \{\s*return <View accessible accessibilityLabel=\{label\}/, 'a reference with no words is a line, not a button');
  assert.match(src, /<Card key=\{key\} style=\{\{ paddingVertical: space\[3\] \}\}>/, 'keyed by the day, so that a text opened on one day is closed again on the next');
  const card = source(`${DIR}/LiturgicalCard.tsx`);
  assert.match(card, /const lit = liturgicalDayOf\(day\);/, 'the season, the colour, the rank and the cycles are worked out from the day');
  assert.match(card, /<AppText variant="h4" accessibilityRole="header" accessibilityLiveRegion="polite">\{title\}<\/AppText>/, 'what the day is called, in Fraunces, said again when another day is picked');
  assert.match(card, /\{!!under && <AppText variant="small" muted>\{under\}<\/AppText>\}/, 'the day of the calendar under a memorial');
  for (const label of ['Season', 'Sunday cycle', 'Weekday cycle']) assert.ok(card.includes(`<Fact label="${label}">`), label);
  assert.match(card, /\{!under && <Fact label="Rank">/, 'the rank is left out under a memorial: the calendar of the app does not know the saints');
  assert.match(card, /<AppText variant="small" muted>\{label\}<\/AppText>/, 'the labels of the facts are 17');
  assert.match(card, /<AppText variant="caption" muted>\{LITURGY_NOTE\}<\/AppText>/, 'the small print');
  assert.doesNotMatch(card, /onPress|Pressable/, 'the card shows what the day is: nothing on it can be pressed');
  assert.doesNotMatch(all(), /\$\d|€\d|\brating\b|★|available now|download/i, 'nothing claims to be what it is not');
});

check('every text of the Daily reading, of its banner, its calendar sheet and its bookmarks list is an AppText variant of the type scale: no size of its own, nothing under 15, and nothing that shrinks to fit', () => {
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { text: Record<string, { size: number }> };
  const banner = read('src/features/library/LibraryBanner.tsx');
  const dailyBanner = code(banner.slice(banner.indexOf('export function DailyBanner')));
  const parts: Array<[string, string]> = [...dailyFiles.filter((f) => f.endsWith('.tsx')).map((f): [string, string] => [f, source(f)]), ['the daily banner', dailyBanner]];
  const used = new Map<string, string[]>();
  for (const [where, src] of parts) {
    assert.doesNotMatch(src, /fontSize|lineHeight|letterSpacing|fontFamily|adjustsFontSizeToFit|minimumFontScale/, `${where}: a size of its own, or text that shrinks`);
    for (const m of src.matchAll(/<AppText\b([^>]*)>/g)) {
      // variant="small", or variant={selected || today ? 'label' : 'small'}, or none (the body)
      const dynamic = /variant=\{([^}]*)\}/.exec(m[1])?.[1];
      const variants = dynamic ? [...dynamic.matchAll(/'(\w+)'/g)].map((v) => v[1]) : [/variant="(\w+)"/.exec(m[1])?.[1] ?? 'body'];
      for (const variant of variants) {
        assert.ok(tokens.text[variant], `${where}: ${variant} is a variant of the type scale`);
        assert.ok(tokens.text[variant].size >= 15, `${where}: ${variant} is ${tokens.text[variant].size}, under 15`);
        used.set(variant, [...(used.get(variant) ?? []), where]);
      }
    }
  }
  // what the screen uses: the headings h3 (the title) and h4, the reading text at body 19, the labels and the facts at 17 (small, label), the small print at 15 (caption, mono)
  assert.deepEqual([...used.keys()].sort(), ['body', 'caption', 'h3', 'h4', 'label', 'mono', 'small']);
  assert.equal(tokens.text.body.size, 19);
  assert.equal(tokens.text.small.size, 17);
  assert.equal(tokens.text.label.size, 17);
  assert.equal(tokens.text.caption.size, 15);
  assert.equal(tokens.text.mono.size, 15);
  assert.ok(used.get('body')!.every((w) => w.endsWith('DayReading.tsx')), 'body is the reading text, in one place');
  for (const f of ['WeekStrip.tsx', 'MonthCalendar.tsx']) {
    const src = source(`${DIR}/${f}`);
    assert.match(src, /<AppText variant="small" muted maxFontSizeMultiplier=\{FONT_LIMIT\}>/, `${f}: the weekday letters and names are 17, not 15`);
    assert.doesNotMatch(src, /variant="caption"/, `${f}: nothing at 15`);
  }
});

check('the clock is handed in once and read in one place: the phone\'s own is the default, today is read again when the screen draws and when the app comes back, and Today goes to the clock\'s day', () => {
  const hook = source(`${DIR}/useDailyReading.ts`);
  assert.match(hook, /const systemNow = \(\): Date => new Date\(\);/);
  assert.match(hook, /export function useDailyReading\(now: \(\) => Date = systemNow, requested: Ymd \| null = null\): DailyReading/);
  assert.equal((all().match(/new Date\(|Date\.now\(/g) ?? []).length, 1, 'the clock is read in exactly one place: the default of the hook');
  assert.match(hook, /useReducer\(dailyReducer, undefined, \(\) => initDaily\(todayOf\(now\(\)\), requested\)\)/);
  assert.match(hook, /const today = todayOf\(now\(\)\);/);
  assert.match(hook, /AppState\.addEventListener\('change', \(s\) => \{ if \(s === 'active'\) redraw\(\); \}\)/);
  assert.match(hook, /return \(\) => sub\.remove\(\);/);
  assert.match(hook, /dispatch\(\{ type: 'today', today: t \}\)/);
  assert.match(hook, /Platform\.OS === 'ios'/, 'iOS says the new month and the picked day out loud; Android and the web have the live regions');
  assert.match(hook, /AccessibilityInfo\.announceForAccessibility\(text\)/);
  assert.match(hook, /dispatch\(\{ type: 'month', by \}\)/);
  assert.match(hook, /previousMonth: \(\) => move\(-1\), nextMonth: \(\) => move\(1\)/, 'the left arrow goes back, the right one forward');
  assert.match(hook, /canGoBack: flags\.back, canGoForward: flags\.forward/, 'the back arrow is off at the first month, the forward one at the last');
  assert.match(hook, /dispatch\(\{ type: 'select', day \}\)/, 'a day that is tapped is selected');
  assert.doesNotMatch(hook, /setInterval|setTimeout/, 'no timer: nothing to clean up');
  assert.match(all(), /accessibilityLiveRegion="polite"/);
});

check('the feature uses no console, no interval and no timer', () => {
  const offenders: string[] = [];
  for (const f of dailyFiles) source(f).split('\n').forEach((line, i) => { if (/\bconsole\.|\bsetInterval\(|\bsetTimeout\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`); });
  assert.deepEqual(offenders, []);
});

check('this test is run by npm test: its file is in tsconfig.librarytest.json, and test:library runs it (or an entry point of the library tests imports it), and npm test runs test:library', () => {
  assert.match(read('tsconfig.librarytest.json'), /"src\/features\/library\/__tests__\/daily\.test\.ts"/);
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  const named = scripts['test:library'].includes('library-test/features/library/__tests__/daily.test.js');
  const imported = ['library.test.ts', 'wiring.test.ts'].some((f) => /^import '\.\/daily\.test';/m.test(read(`src/features/library/__tests__/${f}`)));
  assert.ok(named || imported, 'nothing runs daily.test: name it in test:library or import it from library.test.ts or wiring.test.ts');
  assert.ok(/npm run test:library\b/.test(scripts.test), 'npm test does not run test:library');
});

/* ================================================================================ the design page shows the same screen */

const design = fs.readFileSync(path.join(root, '..', 'design', 'index.html'), 'utf8');
const group = design.slice(design.indexOf('id="daily-reading"'), design.indexOf('<!-- =================================================================== ICONS -->'));
const phones = group.split('<div class="phone-wrap">').slice(1);
const labelOf = (p: string) => /<p class="phone-label"><b>([^<]+)<\/b>/.exec(p)?.[1] ?? '';
const plain = (s: string) => s.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
// THE SHAPE: the page draws the screen (the header row with the two buttons, the week strip, the liturgical card, the readings with their references and the words of the one that is opened, the line of
// small print, the calendar sheet) in light and in dark, a memorial, a solemnity, a day with no readings, the 320 phone, and the Bookmarks screen with a bookmarked day. Everything under the frame of a
// phone is drawn by designDaily.ts from the functions of the app, so the checks below read the page to see that it is what they say.
const PHONE_LABELS = [
  'Daily reading', 'Daily reading · Another day', 'Daily reading · The reading', 'Daily reading · Calendar', 'Daily reading · Dark', 'Daily reading · Dark, the reading', 'Daily reading · Dark, calendar',
  'Daily reading · 320 wide', 'Daily reading · Solemnity', 'Daily reading · No readings yet', 'Daily reading · In Bookmarks',
];
const SCREEN_NAMES = ['daily', 'memorial', 'reading', 'calendar', 'dark', 'darkreading', 'darkcalendar', 'narrow', 'solemnity', 'none'] as const;
const SCREENS = phones.filter((p) => labelOf(p) !== 'Daily reading · In Bookmarks');
const BOOKMARKS_PHONE = phones.find((p) => labelOf(p) === 'Daily reading · In Bookmarks') ?? '';
const TODAY = day(2026, 11, 8);

check('the design page has the Daily reading phones, in a group of their own at the end of the Screens section: light, dark, a memorial, the reading, the calendar sheet, the 320 phone, a solemnity, a day with no readings and the Bookmarks screen', () => {
  assert.ok(group.length > 20000, 'the group was not found in design/index.html');
  assert.deepEqual(phones.map(labelOf), PHONE_LABELS);
  assert.equal(design.split('id="daily-reading"').length, 2, 'the group is there once');
  assert.ok(design.indexOf('id="daily-reading"') > design.indexOf('<b>Business · Dashboard</b>') && design.indexOf('id="daily-reading"') < design.indexOf('id="icons"'), 'after the last phone of Screens, before Icons');
  assert.equal((phones.filter((p) => /class="phone dk"/.test(p))).length, 3, 'three dark phones');
  assert.equal((phones.filter((p) => /style="width:320px"/.test(p))).length, 1, 'one 320 phone');
  assert.equal((phones.filter((p) => /class="dr-scrim"/.test(p))).length, 2, 'the calendar sheet, in light and in dark');
  const labels = [...design.matchAll(/<p class="phone-label"><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.equal(new Set(labels).size, labels.length, 'no two phones of the page have the same label (render_screens.mjs finds a picture by its label)');
  assert.doesNotMatch(group, /dr-cal fit|<h1 class="scr-title" style="margin:0">Daily reading<\/h1>/, 'the v1 screen (the title on a line of its own, the month calendar as the body) is gone');
});

check('the page is what the app draws: every phone of the Daily reading and every daily banner is exactly what the functions of the app make of its day (designDaily.ts), and the marks are where it expects them', () => {
  assert.equal(applyDaily(design), design, 'design/index.html is not what the app draws: run  npx tsc -p tsconfig.librarytest.json && node node_modules/.cache/library-test/features/library/__tests__/designDaily.js --write');
  assert.equal(SCREENS.length, SCREEN_NAMES.length);
  SCREEN_NAMES.forEach((name, i) => {
    const marks = MARKERS('screen', name);
    assert.equal(SCREENS[i].split(marks.start).length, 2, `${name}: marked once`);
    assert.ok(SCREENS[i].includes(screenHtml(name)), `${name}: drawn`);
  });
  assert.equal(Object.keys(BANNER_WIDTH).length, 5);
  for (const name of Object.keys(BANNER_WIDTH)) assert.equal(design.split(MARKERS('banner', name).start).length, 2, `the banner of ${name} is marked once`);
  assert.throws(() => applyDaily(design.replace(MARKERS('screen', 'daily').start, '')), /no \(or two\) marks/, 'a place without its marks is an error');
  assert.equal(TODAY.d, 8);
});

check('each phone draws the screen of the app: the header row (Back, the title, the calendar, the bookmark), the week strip with its seven days, the arrows and Today, the liturgical card, the readings', () => {
  const range = rangeAround(TODAY);
  const iso = (x: Ymd) => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
  const picked: Ymd[] = [];
  SCREENS.forEach((p, i) => {
    const where = `phone ${i + 1} (${labelOf(p)})`;
    // the header: one row, in this order, with the labels the app gives, the bookmark said and exposed the way the app does
    const header = /<div class="dr-hd">(.*?)<\/div>/s.exec(p)?.[1] ?? '';
    assert.ok(header, `${where}: the header row`);
    const bookmarked = /<button class="dr-hb on" aria-label="Remove bookmark" aria-selected="true">/.test(header);
    assert.deepEqual([...header.matchAll(/aria-label="([^"]+)"/g)].map((m) => m[1]), ['Back', 'Open calendar', bookmarked ? UNBOOKMARK_DAY : BOOKMARK_DAY], `${where}: the three buttons`);
    assert.ok(header.indexOf('#i-back') < header.indexOf('>Daily reading</h1>') && header.indexOf('>Daily reading</h1>') < header.indexOf('#i-calendar') && header.indexOf('#i-calendar') < header.indexOf('#i-bookmark'), `${where}: Back, the title, the calendar, the bookmark`);
    if (!bookmarked) assert.match(header, /<button class="dr-hb" aria-label="Bookmark this day" aria-selected="false">/, where);
    // the strip: seven days, the days of the week of the picked one, each with the label, letter, number and dot colour the app gives it
    const cells = [...p.matchAll(/<button class="dr-c([^"]*)" aria-label="([^"]+)" aria-selected="(true|false)"><span class="w">(\w)<\/span><span class="k">(\d+)<\/span><span class="dr-dot (\w+)"><\/span><\/button>/g)];
    assert.equal(cells.length, 7, `${where}: exactly seven days`);
    const selectedAt = cells.findIndex((m) => /\bsel\b/.test(m[1]));
    assert.ok(selectedAt >= 0, `${where}: one day is picked`);
    assert.equal(cells.filter((m) => /\bsel\b/.test(m[1])).length, 1);
    const title = /<span class="m" role="heading" aria-level="3" aria-label="([^"]+)">([^<]+)<\/span>/.exec(p);
    assert.ok(title, `${where}: the title of the week`);
    // the picked day is the one whose label is that of the picked cell and whose week has the title of the strip (a label has no year, the title has)
    let found: Ymd | null = null;
    for (let k = toDays(day(2021, 1, 1)); k <= toDays(day(2031, 12, 31)) && !found; k++) {
      const x = fromDays(k);
      if (dayCellLabel(x, sameDay(x, TODAY)) === plain(cells[selectedAt][2]) && weekTitle(weekDays(x)) === title![2]) found = x;
    }
    assert.ok(found, `${where}: the picked day`);
    const guess: Ymd = found!;
    picked.push(guess);
    const week = weekDays(guess);
    assert.equal(weekdayIndex(week[0]), 0, 'Monday first');
    assert.equal(title![1], weekSpoken(week), `${where}: the title of the week, said aloud`);
    assert.equal(title![2], weekTitle(week), `${where}: the title of the week`);
    week.forEach((x, k) => {
      const isToday = sameDay(x, TODAY), isSelected = sameDay(x, guess);
      const [, classes, label, state, letter, number, colour] = cells[k];
      assert.equal(plain(label), dayCellLabel(x, isToday), `${where}: the label of ${x.d}`);
      assert.equal(/\bsel\b/.test(classes), isSelected, `${where}: the fill of ${x.d}`);
      assert.equal(state === 'true', isSelected);
      assert.equal(/\btoday\b/.test(classes), isToday, `${where}: the ring of ${x.d}`);
      assert.equal(letter, WEEKDAY_LETTERS[k]);
      assert.equal(number, String(x.d));
      assert.equal(colour, liturgicalDay(x.y, x.m, x.d).colour, `${where}: the dot of ${x.d}`);
    });
    const away = !sameDay(guess, TODAY);
    assert.equal(/<span class="m" role="heading" aria-level="3" aria-label="[^"]+">[^<]+<\/span><button class="dr-today" aria-label="Today">Today<\/button>/.test(p), away, `${where}: Today shows when another day is picked`);
    const arrow = (label: string, on: boolean) => on ? `<button class="dr-arrow" aria-label="${label}">` : `<button class="dr-arrow" disabled aria-label="${label}">`;
    assert.ok(p.includes(arrow(previousWeekLabel(guess, range), canMoveWeek(guess, -1, range))), `${where}: the back arrow`);
    assert.ok(p.includes(arrow(nextWeekLabel(guess, range), canMoveWeek(guess, 1, range))), `${where}: the forward arrow`);
    // the liturgical card: the title the screen gives (the memorial of the readings file when it names one), the season and colour, the cycles, the small print
    const l = liturgicalDay(guess.y, guess.m, guess.d);
    const c = dayOf(guess);
    assert.ok(p.includes(`<div class="dr-eyebrow">Liturgical day</div><div class="dr-titles"><div class="dr-title" role="heading" aria-level="3">${c.title}</div>`), `${where}: the name of the day`);
    assert.equal(p.includes(`<div class="dr-under">${c.under}</div>`), c.under !== null, `${where}: the day of the calendar under a memorial, and only then`);
    assert.ok(p.includes(`<span class="l">Season</span><span class="v"><i class="dr-sw ${l.colour}"></i>${SEASON_NAMES[l.season]} · ${COLOUR_NAMES[l.colour]}</span>`), `${where}: the season and its colour`);
    assert.equal(p.includes(`<span class="l">Rank</span><span class="v">${RANK_NAMES[l.rank]}</span>`), c.under === null, `${where}: the rank, left out under a memorial`);
    assert.ok(p.includes(`<span class="l">Sunday cycle</span><span class="v">Year ${l.sundayCycle}</span>`), `${where}: the Sunday cycle`);
    assert.ok(p.includes(`<span class="l">Weekday cycle</span><span class="v">Year ${l.weekdayCycle}</span>`), `${where}: the weekday cycle`);
    assert.ok(p.includes(`<div class="dr-cap">${LITURGY_NOTE}</div>`), `${where}: the small print of the calendar`);
    // the order: header, strip, card, readings, and the line of small print under the readings (not under a day with none)
    const at = (s: string) => p.indexOf(s);
    assert.ok(at('class="dr-hd"') < at('class="dr-strip') && at('class="dr-strip') < at('class="cp-card dr-lit"') && at('class="cp-card dr-lit"') < at('dr-readings'), `${where}: the order of the screen`);
    assert.equal((p.match(/class="dr-src"/g) ?? []).length, c.readings ? 1 : 0, `${where}: the line of small print is under readings that are there`);
    assert.ok(!/class="dr-hand"|lib-notice|lib-chip sample|Sample|Preview|Buen Camino/.test(p), `${where}: nothing of the sample, and no handwritten line`);
  });
  // today picked on the first, a weekday with a memorial on the second, and the reading phones keep today; the 320 phone has the third Sunday of Advent, then a solemnity and a day with no readings
  assert.deepEqual(picked.map(iso), ['2026-11-08', '2026-11-11', '2026-11-08', '2026-11-08', '2026-11-08', '2026-11-08', '2026-11-08', '2026-12-13', '2026-12-08', '2027-01-17']);
  assert.match(SCREENS[1], /<button class="dr-hb on" aria-label="Remove bookmark" aria-selected="true">/, 'a bookmarked day shows its bookmark filled');
  assert.match(SCREENS[7], /<div class="dr-strip fit">/, 'the card of the 320 phone reaches into the margins');
  assert.ok(SCREENS.filter((_, i) => i !== 7).every((p) => /<div class="dr-strip">/.test(p)), 'the others stay inside them');
  assert.match(group, /\.dr-dot\.white, \.dr-sw\.white \{ background: var\(--dr-white\); box-shadow: inset 0 0 0 1\.5px var\(--cp-text-muted\); \}/);
});

check('the phones show what the screen shows for each kind of day: the Sunday with four readings, a weekday with a memorial and three, a solemnity, a canticle in the place of the psalm, and a day with no readings', () => {
  const rows = (p: string) => [...p.matchAll(/<(?:button|div) class="dr-rb(?: plain)?"(?: aria-expanded="(true|false)")?(?: role="group")? aria-label="([^"]+)"><span class="tx"><span class="t">([^<]+)<\/span><span class="c">([^<]+)<\/span><\/span>/g)];
  const sunday = rows(SCREENS[0]);
  assert.deepEqual(sunday.map((m) => plain(m[2])), ['First Reading, Wisdom 6:12-16', 'Responsorial Psalm, Psalm 63:2, 3-4, 5-6, 7-8', 'Second Reading, 1 Thessalonians 4:13-18', 'Gospel, Matthew 25:1-13']);
  assert.ok(sunday.every((m) => m[1] === 'false'), 'nothing is open when the screen opens');
  assert.ok(SCREENS[0].includes('<div class="dr-eyebrow">Liturgical day</div><div class="dr-titles"><div class="dr-title" role="heading" aria-level="3">32nd Sunday in Ordinary Time</div></div>'));
  assert.ok(SCREENS[0].includes(`<div class="dr-src">${READINGS_SOURCE}</div>`), 'where readings and words come from');
  // a weekday with a memorial: the saint is the title, the day of the calendar under it, no second reading
  assert.ok(SCREENS[1].includes('<div class="dr-title" role="heading" aria-level="3">Saint Martin of Tours, Bishop</div><div class="dr-under">Wednesday of the 32nd Week in Ordinary Time</div>'));
  assert.deepEqual(rows(SCREENS[1]).map((m) => plain(m[2])), ['First Reading, Titus 3:1-7', 'Responsorial Psalm, Psalm 23:1b-3a, 3bc-4, 5, 6', 'Gospel, Luke 17:11-19']);
  // the Psalm opened: the whole psalm, a verse to a line, and it says so
  const reading = SCREENS[2];
  assert.equal(rows(reading).filter((m) => m[1] === 'true').map((m) => m[3]).join(), 'Responsorial Psalm', 'one reading is open: the Psalm');
  const opened = reading.slice(reading.indexOf('<div class="dr-rt">'));
  const psalmWords = opened.slice(0, opened.indexOf('</div></div>', opened.indexOf('class="dr-cap"')) + '</div>'.length);
  assert.equal([...psalmWords.matchAll(/<p class="dr-v">/g)].length, 11, 'the 11 verses of the psalm, one to a line');
  assert.match(psalmWords, /<p class="dr-v">God, you are my God\. I will earnestly seek you/);
  assert.ok(!/<i>\d+<\/i>/.test(psalmWords), 'a psalm shown whole has no verse numbers: they would not be the lectionary\'s');
  assert.ok(psalmWords.includes(`<div class="dr-cap">${WHOLE_PSALM_NOTE}</div>`), 'and it says so');
  // the Gospel opened: prose, a paragraph with its small verse numbers
  const gospel = SCREENS[5].slice(SCREENS[5].indexOf('aria-expanded="true"'));
  assert.match(gospel, /<p class="dr-v"><i>1<\/i> “Then the Kingdom of Heaven will be like ten virgins/);
  assert.match(gospel, /<i>13<\/i> Watch therefore, for you don’t know the day nor the hour in which the Son of Man is coming\.<\/p><\/div><\/div>/);
  // a solemnity: the title of the calendar, no memorial; four readings
  assert.ok(SCREENS[8].includes('<div class="dr-title" role="heading" aria-level="3">The Immaculate Conception of the Blessed Virgin Mary</div></div>'));
  assert.deepEqual(rows(SCREENS[8]).map((m) => plain(m[3])), ['First Reading', 'Responsorial Psalm', 'Second Reading', 'Gospel']);
  assert.equal(rows(SCREENS[8]).filter((m) => m[1] === 'true').length, 1);
  // the third Sunday of Advent: a canticle (the Magnificat) in the place of the psalm, kept as the lectionary writes it, and shown whole only for a psalm
  assert.ok(plain(SCREENS[7]).includes('Responsorial Psalm, Luke 1:46-48, 49-50, 53-54'));
  assert.ok(SCREENS[7].includes('<div class="dr-title" role="heading" aria-level="3">3rd Sunday of Advent</div>') || SCREENS[7].includes('Third Sunday of Advent'));
  // no readings: the card and one honest line; no small print under it
  assert.ok(SCREENS[9].includes(`<div class="dr-none">${NO_READINGS}</div>`));
  assert.equal(rows(SCREENS[9]).length, 0);
  assert.ok(!SCREENS[9].includes('class="dr-src"'));
  assert.ok(SCREENS[9].includes('<div class="dr-title" role="heading" aria-level="3">2nd Sunday in Ordinary Time</div>'), 'the day of the calendar, worked out on the phone');
  // the phones that are scrolled to the readings are those with a reading open
  assert.deepEqual(SCREENS.map((p) => /data-scroll-card="1"/.test(p)), [false, false, true, false, false, true, false, false, true, false]);
});

check('the calendar sheet of the page is the one of the app: a dimmed page, the sheet with "Calendar" and Close, and the month calendar of the picked day with its Today', () => {
  for (const p of SCREENS.filter((q) => /class="dr-scrim"/.test(q))) {
    assert.match(p, /<div class="dr-scrim"><\/div><div class="dr-sheet" role="dialog" aria-label="Calendar"><div class="dr-sh2"><span class="h" role="heading" aria-level="3">Calendar<\/span><button class="dr-close" aria-label="Close calendar">Close<\/button><\/div><div class="dr-cal">/);
    assert.match(p, /<span class="m" role="heading" aria-level="3">November 2026<\/span><button class="dr-today" aria-label="Today">Today<\/button>/);
    const days = [...p.matchAll(/<button class="dr-d([^"]*)" aria-label="([^"]+)"><span class="k">(\d+)<\/span><\/button>/g)];
    assert.equal(days.length, 30, 'the 30 days of November');
    assert.ok(days.some((m) => m[2] === 'Sunday 8 November 2026, today, selected' && /\bsel\b/.test(m[1]) && /\btoday\b/.test(m[1])), 'today is picked');
    assert.match(p, /<div class="dr-week" aria-hidden="true"><span>Mo<\/span><span>Tu<\/span><span>We<\/span><span>Th<\/span><span>Fr<\/span><span>Sa<\/span><span>Su<\/span><\/div>/);
  }
  assert.match(group, /\.dr-scrim \{ position: absolute; inset: 0; background: rgba\(20,54,93,\.45\); z-index: 8; \}/, 'the dimming of the app (theme scrim): navy at 45 %');
  assert.match(read('src/theme/index.ts'), /export const scrim = 'rgba\(20,54,93,0\.45\)';/);
});

check('the type of the phones is the type scale of the app: the eyebrows and the references are the 15 of mono, the facts and the weekday letters 17, the words of a reading 19, the title of the card 24', () => {
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { text: Record<string, { size: number; lineHeight: number }> };
  const rule = (selector: string, text: string = group) => new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\{([^}]*)\\}`).exec(text)?.[1] ?? '';
  assert.match(rule('.dr-eyebrow'), /font-size: var\(--cp-text-mono-size\); line-height: var\(--cp-text-mono-lh\); letter-spacing: 0;/, 'no 12 any more');
  assert.match(rule('.dr-rb .c'), /font-size: var\(--cp-text-mono-size\); line-height: var\(--cp-text-mono-lh\)/, 'the reference: mono 15, not 14');
  assert.match(rule('.dr-fact .l'), /font-size: var\(--cp-text-small-size\); line-height: var\(--cp-text-small-lh\)/, 'the labels of the facts: 17');
  assert.match(rule('.dr-under'), /font-size: var\(--cp-text-small-size\)/, 'the day of the calendar under a memorial: 17');
  assert.match(rule('.dr-c .w'), /font-size: var\(--cp-text-small-size\)/, 'the weekday letters of the strip: 17');
  assert.match(rule('.dr-week span'), /font-size: var\(--cp-text-small-size\)/, 'and the weekday names of the month: 17');
  assert.match(rule('.dr-title'), /font-size: var\(--cp-text-h4-size\); line-height: var\(--cp-text-h4-lh\)/);
  assert.match(rule('.dr-v'), /font-size: 19px; line-height: 28px/, 'the words of a reading are the body of the Bible reader');
  assert.equal(tokens.text.body.size, 19);
  assert.match(rule('.dr-src'), /font-size: var\(--cp-text-caption-size\)/);
  assert.match(rule('.dr-none'), /font-size: var\(--cp-text-small-size\)/);
  assert.doesNotMatch(group, /font-size: (?:1[0-4]|[0-9])px/, 'nothing of the Daily reading is drawn under 15');
  assert.match(rule('.cp-banner.cmp.dl .ey', design), /font-size: var\(--cp-text-mono-size\)/, 'the date line of the daily banner: mono 15');
  assert.match(rule('.cp-banner.cmp.dl .dd', design), /font: 600 var\(--cp-text-label-size\)\/var\(--cp-text-label-lh\)/, 'the day: Inter 17');
  assert.match(rule('.cp-banner.cmp.dl .rf', design), /font: 500 var\(--cp-text-caption-size\)\/var\(--cp-text-caption-lh\)/, 'the readings: Inter 15');
});

check('the Bible tab banner of the page is the daily banner of the app, with no handwritten note, and the Books banner of the page is as it was', () => {
  const library = ['library', 'continue', 'dark', 'deutero', 'narrow'].map((name) => {
    const m = MARKERS('banner', name);
    const a = design.indexOf(m.start);
    return design.slice(a, design.indexOf(m.end, a));
  });
  assert.deepEqual(library.map((b) => b.includes('class="cp-banner cmp dl below"')), [false, false, false, false, true], 'the pill is beside the title on 390 and under the last line on 320');
  for (const b of library) {
    assert.match(b, /role="button" aria-label="Read today\. Daily reading\. Sunday 8 November\. 32nd Sunday in Ordinary Time\. Readings: Wisdom 6:12-16; Psalm 63:2, 3-4, 5-6, 7-8; 1 Thessalonians 4:13-18; Matthew 25:1-13">/, 'one button, and what it says');
    assert.match(b, /<div class="ey">Sunday 8 November<\/div>/);
    assert.match(b, /<div class="dd">32nd Sunday in Ordinary Time<\/div>\s*<div class="rf">Wisdom&nbsp;6:12-16&nbsp;· Psalm&nbsp;63&nbsp;· 1&nbsp;Thessalonians&nbsp;4:13-18&nbsp;· Matthew&nbsp;25:1-13<\/div>/);
    assert.doesNotMatch(b, /class="hw"|Buen Camino/, 'no handwritten note');
    assert.equal((b.match(/class="pill"/g) ?? []).length, 1, 'one pill');
  }
  assert.match(library[0], /<div class="tr"><h4>Daily reading<\/h4><span class="pill">Read today<\/span><\/div>/);
  assert.match(library[4], /<div class="tr"><h4>Daily reading<\/h4><\/div>[\s\S]*<div class="pr"><span class="pill">Read today<\/span><\/div>/);
  // the Books banners keep their handwritten note and their classes
  const books = [...design.matchAll(/<div class="cp-banner cmp" role="button" aria-label="Start reading\. Books for the road[^"]*">.*?<\/div><\/div>/g)];
  assert.equal(books.length, 3, 'the Books banner on three phones');
  for (const m of books) assert.match(m[0], /<div class="row"><span class="hw">No rush<\/span><span class="pill">Start reading<\/span><\/div>/);
});

check('the Bookmarks phone draws the part of the app: Library as it was, then "Daily reading" with a row for each bookmarked day (its date, its liturgical name at 17, its bookmark), then Posts', () => {
  const p = BOOKMARKS_PHONE;
  assert.ok(p.length > 1000);
  assert.ok(p.indexOf('<h4 class="lib-h">Library</h4>') < p.indexOf(`<h4 class="lib-h" style="margin-top:8px">${DAILY_GROUP}</h4>`) && p.indexOf(`>${DAILY_GROUP}</h4>`) < p.indexOf('style="margin-top:8px">Posts</h4>'), 'Library, Daily reading, Posts');
  const rows = [...p.matchAll(/<div class="lib-row"><div class="lib-tx"><div class="t">([^<]+)<\/div><div class="n dr-bn">([^<]+)<\/div><\/div><button class="lib-mark on" aria-label="([^"]+)">/g)];
  assert.deepEqual(rows.map((m) => [m[1], plain(m[2]), plain(m[3])]), [
    ['Sunday 22 November 2026', 'Our Lord Jesus Christ, King of the Universe', 'Remove bookmark: Daily reading, Sunday 22 November 2026'],
    ['Sunday 8 November 2026', '32nd Sunday in Ordinary Time', 'Remove bookmark: Daily reading, Sunday 8 November 2026'],
  ]);
  for (const m of rows) assert.ok(/^(Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day \d+ \w+ \d{4}$/.test(m[1]));
  assert.equal(formatDate(day(2026, 11, 22)), rows[0][1]);
  assert.equal(dailyTitle(day(2026, 11, 22)), plain(rows[0][2]));
  assert.match(p, /Nothing bookmarked in the Library yet\. Tap the bookmark on a row to keep it here\./, 'the Library part says what it said before');
});

check('the dark phones are the dark palette of tokens.json, role by role (the page has no second copy of it that could drift)', () => {
  type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Tokens;
  const dark = { ...tokens.color, ...tokens.dark.color };
  const roleDark = (name: string) => { const lit = tokens.dark.role[name]; return (lit ? (lit.startsWith('#') ? lit : dark[lit]) : dark[tokens.role[name]]).toUpperCase(); };
  const rule = /\.phone\.dk \{([^}]*)\}/.exec(group)?.[1] ?? '';
  assert.ok(rule.length > 100, 'the .phone.dk rule');
  const props = Object.fromEntries([...rule.matchAll(/(--cp-[\w-]+):\s*(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]));
  const expected: Record<string, string> = {
    '--cp-bg': roleDark('bg'), '--cp-surface': roleDark('surface'), '--cp-surface-sunken': roleDark('surfaceSunken'), '--cp-surface-inverse': roleDark('surfaceInverse'),
    '--cp-border': roleDark('border'), '--cp-border-strong': roleDark('borderStrong'), '--cp-text': roleDark('text'), '--cp-text-muted': roleDark('textMuted'),
    '--cp-text-placeholder': roleDark('textPlaceholder'), '--cp-tab-inactive': roleDark('tabInactive'), '--cp-tab-bar': roleDark('tabBar'), '--cp-tab-bar-border': roleDark('tabBarBorder'), '--cp-text-inverse': roleDark('textInverse'), '--cp-text-accent': roleDark('textAccent'), '--cp-action': roleDark('action'),
    '--cp-on-action': roleDark('onAction'), '--cp-highlight': roleDark('highlight'), '--cp-on-highlight': roleDark('onHighlight'), '--cp-danger': roleDark('danger'), '--cp-on-danger': roleDark('onDanger'),
    '--cp-color-gold-ink': dark.goldInk.toUpperCase(), '--cp-color-gold-soft': dark.goldSoft.toUpperCase(), '--cp-color-gold-wash': dark.goldWash.toUpperCase(),
  };
  assert.deepEqual(props, expected);
});

check('the five colours of the liturgical year are the theme\'s, in light and in dark, and each keeps 3 : 1 on the page and on a card in both modes (the white one has a ring)', () => {
  const theme = read('src/theme/index.ts');
  const grab = (name: string) => Object.fromEntries([...(new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(theme)?.[1] ?? '').matchAll(/(\w+): '(#[0-9A-Fa-f]{6})'/g)].map((m) => [m[1], m[2].toUpperCase()]));
  const light = grab('LITURGICAL_LIGHT'), dark = grab('LITURGICAL_DARK');
  assert.deepEqual(Object.keys(light), ['green', 'violet', 'white', 'red', 'rose']);
  assert.deepEqual(Object.keys(dark), ['green', 'violet', 'white', 'red', 'rose']);
  const css = (selector: string) => Object.fromEntries([...(new RegExp(`${selector} \\{ (--dr-green[^}]*)\\}`).exec(group)?.[1] ?? '').matchAll(/--dr-(\w+):(#[0-9A-Fa-f]{6})/g)].map((m) => [m[1], m[2].toUpperCase()]));
  assert.deepEqual(css('\\.phone'), light, 'the page draws the light dots with the theme\'s colours');
  assert.deepEqual(css('\\.phone\\.dk'), dark, 'and the dark ones');
  assert.match(theme, /Object\.assign\(liturgical, scheme === 'dark' \? LITURGICAL_DARK : LITURGICAL_LIGHT\);/, 'applyScheme swaps them with the rest of the theme');
  type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Tokens;
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string): number => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const [mode, colours, palette] of [['light', light, tokens.color], ['dark', dark, { ...tokens.color, ...tokens.dark.color }]] as const) {
    const page = palette[tokens.role.bg], card = palette[tokens.role.surface];
    for (const [name, hex] of Object.entries(colours)) {
      if (name === 'white') { assert.ok(contrast(palette[tokens.role.textMuted], card) >= 3, `${mode}: the ring of the white dot on a card`); continue; }
      assert.ok(contrast(hex, card) >= 3, `${mode}: ${name} on a card is ${contrast(hex, card).toFixed(2)} : 1`);
      assert.ok(contrast(hex, page) >= 3, `${mode}: ${name} on the page is ${contrast(hex, page).toFixed(2)} : 1`);
    }
  }
  assert.match(read('src/features/library/daily/WeekStrip.tsx'), /backgroundColor: liturgical\[colour\], borderWidth: colour === 'white' \? 1\.5 : 0, borderColor: role\.muted/);
});

check('the 320 phone is drawn as the app draws it there: the card reaches 10 px into each margin, the phone is 320 wide, and the same screen in 390 does not; every button and day is 44 or more', () => {
  const small = SCREENS[7];
  assert.match(small, /<div class="phone" style="width:320px">/);
  const bleed = calendarMetrics(320, 16).bleed;
  assert.equal(bleed, 10);
  assert.match(group, new RegExp(`\\.dr-strip\\.fit \\{ margin: 0 -${bleed}px; padding: 8px 0; \\}`), 'the margin of the page is the bleed of layout.ts');
  assert.match(group, /\.dr-cal\.fit \{ margin: 0 -10px; padding: 8px 0; \}/, 'and the month calendar of the sheet the same');
  assert.match(group, /\.dr-c \{ flex: 1; min-height: 84px;/, 'a day of the strip is a seventh of the card and 84 high');
  assert.match(group, /\.dr-arrow \{ width: 44px; height: 44px;/);
  assert.match(group, /\.dr-hb \{ width: 48px; height: 48px;/, 'the three buttons of the header, as big as the Back button of every screen');
  assert.match(group, /\.dr-sh \{ display: flex; align-items: center; min-height: 44px; \}/);
  assert.match(group, /\.dr-d \{ flex: 1; height: 44px;/, 'a day of the month calendar is 44 high in the page too');
  assert.match(group, /\.dr-rb \{ width: 100%; min-height: 64px;/);
  assert.match(group, /\.dr-h1 \{ flex: 1; min-width: 0; margin: 0; font-family: var\(--cp-font-title\); font-weight: 600; font-size: 28px; line-height: 34px; letter-spacing: -\.25px; \}/, 'the title is the h3 of the type scale: Fraunces 600, 28 on 34');
  assert.match(group, /\.dr-c\.sel \.k \{ background: var\(--cp-action\); color: var\(--cp-on-action\);/);
  assert.match(group, /\.dr-c\.today \.k \{ box-shadow: inset 0 0 0 2px var\(--cp-action\);/);
  assert.doesNotMatch(group, /\.dr-hand|class="dr-hand"/, 'no handwritten line on the screen any more');
});

check('the page and the app keep the same icon: the calendar glyph of Icon.tsx and the symbol i-calendar of the sprite are one drawing', () => {
  const icon = read('src/components/Icon.tsx');
  const paths = [...(/\n  calendar: \[([^\]]*)\],/.exec(icon)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.equal(paths.length, 3, 'the page, a line under its top, two rings');
  const sprite = /<symbol id="i-calendar"[^>]*>(.*?)<\/symbol>/.exec(design);
  assert.ok(sprite, 'the sprite of the design page has no i-calendar');
  assert.deepEqual([...sprite![1].matchAll(/ d="([^"]+)"/g)].map((m) => m[1]), paths, 'the calendar glyph of the design page and of the app are the same drawing');
  assert.notDeepEqual(paths, [...(/\n  diary: \[([^\]]*)\],/.exec(icon)?.[1] ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]), 'not the diary');
});

console.log(`${n} of ${n} passed`);
