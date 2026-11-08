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
import { DAILY_NOTICE, SAMPLE_READING, SAMPLE_REFLECTION, readingFor } from '../daily/sample';
import { arrows, dailyReducer, initDaily, type DailyAction, type DailyState } from '../daily/state';

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

/* ================================================================================================ the sample */

check('every day shows the same sample: no reading, saint or feast belongs to a date', () => {
  const first = readingFor(nov8);
  const next = rng(31);
  for (let i = 0; i < 3000; i++) assert.deepEqual(readingFor(randomDay(next, 2021, 2031)), first);
  assert.equal(readingFor(day(2026, 12, 25)).reading, SAMPLE_READING);
  assert.equal(readingFor(day(2028, 2, 29)).reflection, SAMPLE_REFLECTION);
});

check('the one real piece of scripture is Psalm 121:1-4 in the World English Bible, word for word, with its reference and its translation named', () => {
  assert.equal(SAMPLE_READING.reference, 'Psalm 121:1–4');
  assert.equal(SAMPLE_READING.translation, 'World English Bible');
  assert.equal(SAMPLE_READING.licence, 'public domain');
  assert.equal(SAMPLE_READING.title, 'A Song of Ascents.');
  // the text of the World English Bible (eng-web-c, ENGWEBP, eng_webu), read on 8 November 2026
  assert.deepEqual(SAMPLE_READING.verses.map((v) => v.text), [
    'I will lift up my eyes to the hills. Where does my help come from?',
    'My help comes from the LORD, who made heaven and earth.',
    'He will not allow your foot to be moved. He who keeps you will not slumber.',
    'Behold, he who keeps Israel will neither slumber nor sleep.',
  ]);
  assert.deepEqual(SAMPLE_READING.verses.map((v) => v.n), [1, 2, 3, 4], 'the verse numbers of the reference, in order');
  assert.doesNotMatch(JSON.stringify(SAMPLE_READING.verses), /Yahweh|Jehovah|\bthee\b|\bthy\b|\bhath\b/, 'not the Classic edition, not the King James');
});

check('the notice says it is a sample, that every day is the same, and why', () => {
  assert.equal(DAILY_NOTICE, 'This is a sample. Daily readings and reflections are not in the app yet; every day shows the same example while we choose texts we are allowed to include.');
});

check('the reflection is short (3 to 5 sentences), labelled "Sample reflection", and names no date, weekday, saint or feast', () => {
  const sentences = SAMPLE_REFLECTION.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  assert.ok(sentences.length >= 3 && sentences.length <= 5, `${sentences.length} sentences`);
  assert.equal(SAMPLE_REFLECTION.label, 'Sample reflection');
  assert.equal(SAMPLE_REFLECTION.title, 'Reflection');
  const words = [...MONTHS, ...WEEKDAYS, 'today', 'tomorrow', 'saint', 'feast', 'advent', 'lent', 'easter', 'christmas', 'pentecost', 'liturg', 'sunday'];
  for (const w of words) assert.ok(!new RegExp(`\\b${w}`, 'i').test(SAMPLE_REFLECTION.text), `the reflection mentions "${w}"`);
  assert.ok(SAMPLE_REFLECTION.text.length < 420, 'short enough to read on a rest by the road');
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
  assert.deepEqual(dailyFiles.map((f) => path.basename(f)).sort(), ['DayReading.tsx', 'MonthCalendar.tsx', 'calendar.ts', 'daily.tsx', 'layout.ts', 'sample.ts', 'state.ts', 'useDailyReading.ts']);
});

check('no new native module, no network and nothing stored: React, React Native, expo-router and the app\'s own components and theme, and no call to the account, the network or the phone\'s storage', () => {
  const allowed = /^(react|react-native|expo-router)$|^\.{1,2}\/|^@\/(components\/|theme$|features\/library\/daily\/)/;
  const offenders: string[] = [];
  for (const f of dailyFiles) for (const m of read(f).matchAll(/^import [^;]*? from '([^']+)';/gm)) if (!allowed.test(m[1])) offenders.push(`${f}: ${m[1]}`);
  assert.deepEqual(offenders, []);
  const text = all();
  assert.doesNotMatch(text, /supabase|@\/lib\/|localStore|secureStorage|AsyncStorage|expo-file-system|\bfetch\(|XMLHttpRequest|WebSocket|NetInfo|navigator\.onLine/i, 'the screen works offline: it asks for nothing and keeps nothing');
});

check('the calendar, the reducer, the layout and the sample are plain TypeScript: no React and no React Native in them', () => {
  for (const f of ['calendar.ts', 'state.ts', 'layout.ts', 'sample.ts']) {
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
    assert.doesNotMatch(src, /\bfixed\.|\bc\.[a-z]/, `${f}: only role.* (and the theme's radius and layout) are used here`);
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
  assert.match(source(ROUTE), /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/);
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

check('the screen is a stack screen like Bookmarks: Back, the title "Daily reading", no room for a tab bar, the calendar, then the reading of the chosen day', () => {
  const src = source(ROUTE);
  assert.match(src, /<Screen tabBar=\{false\}>/);
  assert.match(src, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/);
  assert.match(src, /<AppText variant="h2" accessibilityRole="header">Daily reading<\/AppText>/);
  assert.match(src, /const daily = useDailyReading\(\);/, 'the clock is the phone\'s unless a caller hands one in');
  assert.ok(src.indexOf('<IconButton') < src.indexOf('<AppText variant="h2"') && src.indexOf('<AppText variant="h2"') < src.indexOf('<MonthCalendar') && src.indexOf('<MonthCalendar') < src.indexOf('<DayReading'), 'order: Back, title, calendar, reading');
  assert.match(src, /<DayReading day=\{daily\.selected\} isToday=\{sameDay\(daily\.selected, daily\.today\)\} \/>/);
  for (const prop of ['shown={daily.shown}', 'today={daily.today}', 'selected={daily.selected}', 'range={daily.range}', 'canGoBack={daily.canGoBack}', 'canGoForward={daily.canGoForward}', 'onSelect={daily.select}', 'onPrevious={daily.previousMonth}', 'onNext={daily.nextMonth}', 'onToday={daily.goToday}']) assert.ok(src.includes(prop), prop);
  assert.match(src, /export default function DailyReading\(\)/);
  const bookmarks = source('app/library/bookmarks.tsx');
  for (const shared of [/<Screen tabBar=\{false\}>/, /router\.canGoBack\(\) \? router\.back\(\) : router\.replace\('\/library'\)/, /<IconButton name="back" label="Back" onPress=\{goBack\} \/>/]) assert.match(bookmarks, shared, 'Bookmarks still has what this screen copies');
});

check('the route is registered once, in the block for someone with a journey, right after library/bookmarks and with the same (no) options', () => {
  const layout = read('app/_layout.tsx');
  const daily = [...layout.matchAll(/<Stack\.Screen name="library\/daily"([^>]*)\/>/g)];
  const bookmarks = [...layout.matchAll(/<Stack\.Screen name="library\/bookmarks"([^>]*)\/>/g)];
  assert.equal(daily.length, 1, 'registered exactly once');
  assert.equal(bookmarks.length, 1);
  assert.equal(daily[0][1].trim(), bookmarks[0][1].trim(), 'the options of Bookmarks, which are none');
  assert.equal(daily[0][1].trim(), '');
  assert.match(layout, /<Stack\.Screen name="library\/bookmarks" \/>\n\s+<Stack\.Screen name="library\/daily" \/>/);
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

check('the reading under the calendar: heading of the day, the Preview notice, one sample reading and one sample reflection, each marked as a sample', () => {
  const src = source(`${DIR}/DayReading.tsx`);
  assert.match(src, /<SampleNotice title="Preview">\{DAILY_NOTICE\}<\/SampleNotice>/);
  assert.match(src, /<CardTop label="Sample reading" \/>/);
  assert.match(src, /<CardTop label=\{reflection\.label\} \/>/);
  assert.match(src, /<SampleTag \/>/);
  assert.equal((src.match(/<ReadingCard /g) ?? []).length, 1, 'ONE sample reading');
  assert.equal((src.match(/<ReflectionCard /g) ?? []).length, 1);
  assert.match(src, /const \{ reading, reflection \} = readingFor\(day\);/);
  assert.match(src, /<View accessible accessibilityRole="header" accessibilityLabel=\{heading\.label\} accessibilityLiveRegion="polite"/, 'one heading for a screen reader, said again when another day is picked');
  assert.ok(src.indexOf('accessibilityLabel={heading.label}') < src.indexOf('<SampleNotice') && src.indexOf('<SampleNotice') < src.indexOf('<ReadingCard reading') && src.indexOf('<ReadingCard reading') < src.indexOf('<ReflectionCard reflection'), 'order: heading, notice, reading, reflection');
  assert.match(src, /\{reading\.reference\}/);
  assert.match(src, /reading\.translation/);
  assert.match(src, /reading\.verses\.map\(\(v\) => \(/);
  assert.match(src, /<AppText variant="caption" muted>\{`\$\{v\.n\} `\}<\/AppText>\{v\.text\}/, 'the verse numbers are small and muted');
  assert.match(src, /\.replace\(\/ \/g, NO_BREAK\)/, '"public domain" is not broken between its words');
  assert.match(src, /const NO_BREAK = '\\u00A0';/);
  const data = read(`${DIR}/sample.ts`) + src;
  assert.doesNotMatch(data, /\$\d|€\d|\brating\b|★|available now|download|onPress/i, 'a sample never claims to be real');
  assert.doesNotMatch(src, /onPress|Pressable/, 'the cards show what a reading will look like: nothing on them can be pressed');
});

check('the clock is handed in once and read in one place: the phone\'s own is the default, today is read again when the screen draws and when the app comes back, and Today goes to the clock\'s day', () => {
  const hook = source(`${DIR}/useDailyReading.ts`);
  assert.match(hook, /const systemNow = \(\): Date => new Date\(\);/);
  assert.match(hook, /export function useDailyReading\(now: \(\) => Date = systemNow\): DailyReading/);
  assert.equal((all().match(/new Date\(|Date\.now\(/g) ?? []).length, 1, 'the clock is read in exactly one place: the default of the hook');
  assert.match(hook, /useReducer\(dailyReducer, undefined, \(\) => initDaily\(todayOf\(now\(\)\)\)\)/);
  assert.match(hook, /const today = todayOf\(now\(\)\);/);
  assert.match(hook, /AppState\.addEventListener\('change', \(s\) => \{ if \(s === 'active'\) redraw\(\); \}\)/);
  assert.match(hook, /return \(\) => sub\.remove\(\);/);
  assert.match(hook, /dispatch\(\{ type: 'today', today: t \}\)/);
  assert.match(hook, /Platform\.OS === 'ios'/, 'iOS says the new month and the picked day out loud; Android and the web have the live regions');
  assert.match(hook, /AccessibilityInfo\.announceForAccessibility\(text\)/);
  assert.match(hook, /dispatch\(\{ type: 'month', by \}\)/);
  assert.doesNotMatch(hook, /setInterval|setTimeout/, 'no timer: nothing to clean up');
  assert.match(all(), /accessibilityLiveRegion="polite"/);
});

check('the feature uses no console, no interval and no timer', () => {
  const offenders: string[] = [];
  for (const f of dailyFiles) source(f).split('\n').forEach((line, i) => { if (/\bconsole\.|\bsetInterval\(|\bsetTimeout\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`); });
  assert.deepEqual(offenders, []);
});

check('this test is run by npm test: its file is in tsconfig.librarytest.json, test:library runs it, and npm test runs test:library', () => {
  assert.match(read('tsconfig.librarytest.json'), /"src\/features\/library\/__tests__\/daily\.test\.ts"/);
  const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> }).scripts;
  assert.ok(scripts['test:library'].includes('library-test/features/library/__tests__/daily.test.js'), 'test:library does not run daily.test.js');
  assert.ok(/npm run test:library\b/.test(scripts.test), 'npm test does not run test:library');
});

/* ================================================================================ the design page shows the same screen */

const design = fs.readFileSync(path.join(root, '..', 'design', 'index.html'), 'utf8');
const group = design.slice(design.indexOf('id="daily-reading"'), design.indexOf('<!-- =================================================================== ICONS -->'));
const phones = group.split('<div class="phone-wrap">').slice(1);
const labelOf = (p: string) => /<p class="phone-label"><b>([^<]+)<\/b>/.exec(p)?.[1] ?? '';
const plain = (s: string) => s.replace(/&nbsp;/g, '\u00A0').replace(/&amp;/g, '&');
const PHONE_LABELS = ['Daily reading', 'Daily reading · Another day', 'Daily reading · The reading', 'Daily reading · Dark', 'Daily reading · Dark, the reading', 'Daily reading · 320 wide', 'Daily reading · The last month'];

check('the design page has the Daily reading phones, in a group of their own at the end of the Screens section: light, dark, the reading, the 320 phone and the last month', () => {
  assert.ok(group.length > 20000, 'the group was not found in design/index.html');
  assert.deepEqual(phones.map(labelOf), PHONE_LABELS);
  assert.equal(design.split('id="daily-reading"').length, 2, 'the group is there once');
  assert.ok(design.indexOf('id="daily-reading"') > design.indexOf('<b>Business · Dashboard</b>') && design.indexOf('id="daily-reading"') < design.indexOf('id="icons"'), 'after the last phone of Screens, before Icons');
  assert.equal((phones.filter((p) => /class="phone dk"/.test(p))).length, 2, 'two dark phones');
  assert.equal((phones.filter((p) => /style="width:320px"/.test(p))).length, 1, 'one 320 phone');
  const labels = [...design.matchAll(/<p class="phone-label"><b>([^<]+)<\/b>/g)].map((m) => m[1]);
  assert.equal(new Set(labels).size, labels.length, 'no two phones of the page have the same label (render_screens.mjs finds a picture by its label)');
});

check('each phone draws the calendar of the app: the title, Today, the arrows with their labels (off at the end), the weekdays, and the days with the labels the app says, in the places the app draws them', () => {
  const today = day(2026, 11, 8);
  const range = rangeAround(today);
  const chosen: Ymd[] = [];
  phones.forEach((p, i) => {
    const where = `phone ${i + 1} (${labelOf(p)})`;
    const [, , d, monthName, y] = /aria-level="2" aria-label="(?:Today, )?(\w+) (\d+) (\w+) (\d{4})"/.exec(p) ?? [];
    const selected = day(Number(y), MONTHS.indexOf(monthName as (typeof MONTHS)[number]) + 1, Number(d));
    assert.ok(isValidDay(selected), `${where}: the day of the heading`);
    chosen.push(selected);
    const shown = /<span class="m" role="heading" aria-level="3">(\w+) (\d{4})<\/span>/.exec(p);
    assert.ok(shown, `${where}: the month title`);
    const month: Ym = { y: Number(shown![2]), m: MONTHS.indexOf(shown![1] as (typeof MONTHS)[number]) + 1 };
    assert.ok(month.m >= 1 && monthInRange(month, range), `${where}: a month the calendar goes to`);
    assert.match(p, /<button class="dr-today" aria-label="Today">Today<\/button>/, where);
    // the arrows: where they go, and "disabled" with the plain name when there is nowhere to go
    const arrow = (label: string, on: boolean) => on ? `<button class="dr-arrow" aria-label="${label}">` : `<button class="dr-arrow" disabled aria-label="${label}">`;
    assert.ok(p.includes(arrow(previousMonthLabel(month, range), canGoBack(month, range))), `${where}: the back arrow`);
    assert.ok(p.includes(arrow(nextMonthLabel(month, range), canGoForward(month, range))), `${where}: the forward arrow`);
    assert.match(p, /<div class="dr-week" aria-hidden="true"><span>Mo<\/span><span>Tu<\/span><span>We<\/span><span>Th<\/span><span>Fr<\/span><span>Sa<\/span><span>Su<\/span><\/div>/, where);
    // the 42 places, in order: an empty one, or a day with the label, the ring and the fill that the app gives it
    const grid = monthGrid(month).flat();
    const places = [...p.matchAll(/<(?:button class="dr-d([^"]*)" aria-label="([^"]+)"><span class="k">(\d+)<\/span><\/button>|span class="dr-d"><\/span>)/g)];
    assert.equal(places.length, 42, `${where}: six rows of seven`);
    places.forEach((m, k) => {
      const cell = grid[k];
      if (!cell) { assert.equal(m[2], undefined, `${where}: place ${k} is empty`); return; }
      const isToday = sameDay(cell, today), isSelected = sameDay(cell, selected);
      assert.equal(m[2], dayLabel(cell, { today: isToday, selected: isSelected }), `${where}: place ${k}`);
      assert.equal(m[3], String(cell.d));
      assert.equal(/\bsel\b/.test(m[1]), isSelected, `${where}: the fill of ${cell.d}`);
      assert.equal(/\btoday\b/.test(m[1]), isToday, `${where}: the ring of ${cell.d}`);
    });
    const head = readingHeading(selected, sameDay(selected, today));
    assert.ok(p.includes(`aria-label="${head.label}"><div class="dr-eyebrow">${head.eyebrow}</div><div class="dr-title">${head.title}</div>`), `${where}: the heading of the day`);
  });
  assert.deepEqual(chosen, [day(2026, 11, 8), day(2026, 11, 14), day(2026, 11, 14), day(2026, 11, 14), day(2026, 11, 14), day(2026, 11, 30), day(2026, 11, 8)], 'today selected on the first, another day on the others, and the reading stays on today in the last month');
  assert.match(phones[6], /<span class="m" role="heading" aria-level="3">November 2031<\/span>/, 'the last phone is the last month the calendar goes to');
  assert.ok(phones[6].includes('<button class="dr-arrow" disabled aria-label="Next month">'), 'the forward arrow is off there');
});

check('each phone has the same sample as the app, word for word: the notice, the passage, the reflection and the labels', () => {
  for (const p of phones) {
    assert.ok(p.includes(`<div class="p">${DAILY_NOTICE}</div>`), 'the Preview notice');
    assert.ok(p.includes('<div class="h">Preview</div>'));
    assert.ok(p.includes(`>${SAMPLE_READING.reference}</div>`), 'the reference');
    assert.ok(p.includes(`${SAMPLE_READING.translation} · ${SAMPLE_READING.licence.replace(/ /g, '&nbsp;')}`), 'the translation, named');
    assert.ok(p.includes(`<div class="note">${SAMPLE_READING.title}</div>`));
    const verses = [...p.matchAll(/<p class="dr-v"><i>(\d+)<\/i> ([^<]+)<\/p>/g)].map((m) => ({ n: Number(m[1]), text: plain(m[2]) }));
    assert.deepEqual(verses, SAMPLE_READING.verses.map((v) => ({ ...v })), 'the verses');
    assert.ok(p.includes(`<p class="dr-text">${SAMPLE_REFLECTION.text}</p>`), 'the reflection');
    assert.ok(p.includes('<span class="dr-eyebrow">Sample reading</span><span class="lib-chip sample">Sample</span>'));
    assert.ok(p.includes(`<span class="dr-eyebrow">${SAMPLE_REFLECTION.label}</span><span class="lib-chip sample">Sample</span>`));
    assert.ok(p.includes(`aria-level="3">${SAMPLE_REFLECTION.title}</div>`));
  }
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
    '--cp-text-placeholder': roleDark('textPlaceholder'), '--cp-text-inverse': roleDark('textInverse'), '--cp-text-accent': roleDark('textAccent'), '--cp-action': roleDark('action'),
    '--cp-on-action': roleDark('onAction'), '--cp-highlight': roleDark('highlight'), '--cp-on-highlight': roleDark('onHighlight'), '--cp-danger': roleDark('danger'), '--cp-on-danger': roleDark('onDanger'),
    '--cp-color-gold-ink': dark.goldInk.toUpperCase(), '--cp-color-gold-soft': dark.goldSoft.toUpperCase(), '--cp-color-gold-wash': dark.goldWash.toUpperCase(),
  };
  assert.deepEqual(props, expected);
});

check('the 320 phone is drawn as the app draws it there: the card reaches 10 px into each margin, the phone is 320 wide, and the same screen in 390 does not', () => {
  const small = phones[5];
  assert.match(small, /<div class="phone" style="width:320px">/);
  assert.match(small, /<div class="dr-cal fit">/);
  assert.ok(phones.filter((_, i) => i !== 5).every((p) => /<div class="dr-cal">/.test(p)), 'the others are inside the margins');
  const bleed = calendarMetrics(320, 16).bleed;
  assert.equal(bleed, 10);
  assert.match(group, new RegExp(`\\.dr-cal\\.fit \\{ margin: 0 -${bleed}px; padding: 8px 0; \\}`), 'the margin of the page is the bleed of layout.ts');
  assert.match(group, /\.dr-d \{ flex: 1; height: 44px;/, 'a day is 44 high in the page too');
  assert.match(group, /\.dr-arrow \{ width: 44px; height: 44px;/);
  assert.match(group, /\.dr-head \{ display: flex; align-items: center; min-height: 44px; \}/);
  assert.match(group, /\.dr-d\.sel \.k \{ background: var\(--cp-action\); color: var\(--cp-on-action\);/);
  assert.match(group, /\.dr-d\.today \.k \{ box-shadow: inset 0 0 0 2px var\(--cp-action\);/);
});

console.log(`${n} of ${n} passed`);
