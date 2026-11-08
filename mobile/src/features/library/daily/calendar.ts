// The calendar of the Daily reading screen, as pure functions: no React, no React Native, and no Date or Intl either, apart from
// reading the day off the clock (todayOf). A phone's Date and Intl can differ (Hermes, the time zone, the language of the phone), and a
// calendar that shows the wrong weekday for a day is worse than none, so the arithmetic is written out here and plain node tests
// check it against two other ways of finding the weekday (npm run test:library).
//
// The weeks start on Monday, as they do in Europe. A month is always drawn as six rows of seven days, so that nothing under the
// calendar moves up or down when the month changes; a place that belongs to the days before or after the month is empty (null).
// The months and the weekdays are in English, from the tables below.

/** A day: the year, the month 1 to 12, the day 1 to 31. */
export type Ymd = { y: number; m: number; d: number };
/** A month: the year and the month 1 to 12. */
export type Ym = { y: number; m: number };
/** A place in the grid: a day of the month, or nothing (before the 1st, after the last day). */
export type Cell = Ymd | null;

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
/** The weekday row above the grid, Monday first. A screen reader skips it: every day says its own weekday. */
export const WEEKDAYS_SHORT = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] as const;
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export const DAYS_IN_WEEK = 7;
/** Rows of the grid: the longest month (31 days starting on a Sunday) needs six, and every month gets six. */
export const GRID_WEEKS = 6;

export const isLeapYear = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
export const daysInMonth = (y: number, m: number): number => (m === 2 && isLeapYear(y) ? 29 : MONTH_LENGTHS[m - 1]);

/** Whether this is a day that exists: a whole year, a month 1 to 12, a day that month has. */
export const isValidDay = (day: Ymd | null | undefined): day is Ymd =>
  !!day && Number.isInteger(day.y) && Number.isInteger(day.m) && Number.isInteger(day.d) && day.m >= 1 && day.m <= 12 && day.d >= 1 && day.d <= daysInMonth(day.y, day.m);

/**
 * The number of days since 1 January 1970 (a Thursday), negative before it. This is the whole calendar in one number: the weekday,
 * the difference of two days and the next day are all read from it. It is Howard Hinnant's days_from_civil, which counts in
 * 400-year cycles so that the leap years (every 4th year, not every 100th, but every 400th) fall out right.
 */
export function toDays({ y, m, d }: Ymd): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yearOfEra = yy - era * 400; // 0 to 399
  const dayOfYear = Math.floor((153 * (m > 2 ? m - 3 : m + 9) + 2) / 5) + d - 1; // from 1 March: 0 to 365
  const dayOfEra = yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear; // 0 to 146096
  return era * 146097 + dayOfEra - 719468;
}

/** The day that is this many days after 1 January 1970: the reverse of toDays. */
export function fromDays(days: number): Ymd {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const dayOfEra = z - era * 146097; // 0 to 146096
  const yearOfEra = Math.floor((dayOfEra - Math.floor(dayOfEra / 1460) + Math.floor(dayOfEra / 36524) - Math.floor(dayOfEra / 146096)) / 365); // 0 to 399
  const dayOfYear = dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100)); // from 1 March: 0 to 365
  const monthFromMarch = Math.floor((5 * dayOfYear + 2) / 153); // 0 (March) to 11 (February)
  const d = dayOfYear - Math.floor((153 * monthFromMarch + 2) / 5) + 1;
  const m = monthFromMarch < 10 ? monthFromMarch + 3 : monthFromMarch - 9;
  return { y: era * 400 + yearOfEra + (m <= 2 ? 1 : 0), m, d };
}

/** 0 for Monday up to 6 for Sunday. 1 January 1970 was a Thursday, which is 3. */
export const weekdayIndex = (day: Ymd): number => (((toDays(day) + 3) % 7) + 7) % 7;

export const addDays = (day: Ymd, n: number): Ymd => fromDays(toDays(day) + n);

export const sameDay = (a: Ymd | null | undefined, b: Ymd | null | undefined): boolean => !!a && !!b && a.y === b.y && a.m === b.m && a.d === b.d;
export const sameMonth = (a: Ym, b: Ym): boolean => a.y === b.y && a.m === b.m;

/** The months counted from year 0: what addMonths and the limits are worked out in. */
export const monthNumber = (ym: Ym): number => ym.y * 12 + (ym.m - 1);
export const compareMonths = (a: Ym, b: Ym): number => monthNumber(a) - monthNumber(b);

/** The month this many months later (earlier when negative), across the turn of the year. */
export function addMonths(ym: Ym, n: number): Ym {
  const total = monthNumber(ym) + n;
  return { y: Math.floor(total / 12), m: (((total % 12) + 12) % 12) + 1 };
}

/**
 * The month as six rows of seven places, Monday first. A place before the 1st or after the last day is null; every other place is
 * the day. November 2026 starts on a Sunday, so its first row is six empty places and then the 1st.
 */
export function monthGrid(ym: Ym): Cell[][] {
  const lead = weekdayIndex({ y: ym.y, m: ym.m, d: 1 });
  const length = daysInMonth(ym.y, ym.m);
  const rows: Cell[][] = [];
  for (let r = 0; r < GRID_WEEKS; r++) {
    const row: Cell[] = [];
    for (let c = 0; c < DAYS_IN_WEEK; c++) {
      const d = r * DAYS_IN_WEEK + c - lead + 1;
      row.push(d >= 1 && d <= length ? { y: ym.y, m: ym.m, d } : null);
    }
    rows.push(row);
  }
  return rows;
}

/** How many rows the month really needs, 4 to 6 (the grid always draws six). */
export const weeksNeeded = (ym: Ym): number => Math.ceil((weekdayIndex({ y: ym.y, m: ym.m, d: 1 }) + daysInMonth(ym.y, ym.m)) / DAYS_IN_WEEK);

/* ------------------------------------------------------------------------------------------------ today and the limits */

/** What stands in for today when the clock cannot be read (an invalid Date): the screen still opens. */
export const FALLBACK_TODAY: Ymd = { y: 2026, m: 1, d: 1 };

/** The day on the phone's clock, in the phone's own time zone: a pilgrim's today is the day they are walking, wherever that is. */
export function todayOf(now: Date): Ymd {
  if (!Number.isFinite(now.getTime())) return FALLBACK_TODAY;
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
}

/** How far the calendar goes from today: five years back and five years ahead. */
export const RANGE_YEARS = 5;

/** The first and the last month the calendar shows. */
export type Range = { min: Ym; max: Ym };

/** From the same month five years back to the same month five years ahead, both included. */
export const rangeAround = (today: Ymd, years: number = RANGE_YEARS): Range => ({ min: { y: today.y - years, m: today.m }, max: { y: today.y + years, m: today.m } });

export const clampMonth = (ym: Ym, range: Range): Ym => (compareMonths(ym, range.min) < 0 ? range.min : compareMonths(ym, range.max) > 0 ? range.max : ym);
export const monthInRange = (ym: Ym, range: Range): boolean => compareMonths(ym, range.min) >= 0 && compareMonths(ym, range.max) <= 0;
export const dayInRange = (day: Ymd, range: Range): boolean => monthInRange({ y: day.y, m: day.m }, range);

/** Whether there is an earlier / a later month to go to: when not, the arrow is switched off. */
export const canGoBack = (shown: Ym, range: Range): boolean => compareMonths(shown, range.min) > 0;
export const canGoForward = (shown: Ym, range: Range): boolean => compareMonths(shown, range.max) < 0;

/* ------------------------------------------------------------------------------------------------------------- the words */

/** "November 2026". */
export const monthTitle = (ym: Ym): string => `${MONTHS[ym.m - 1]} ${ym.y}`;

/** "Sunday 8 November 2026". */
export const formatDate = (day: Ymd): string => `${WEEKDAYS[weekdayIndex(day)]} ${day.d} ${MONTHS[day.m - 1]} ${day.y}`;

/**
 * What a screen reader says for a day of the grid: the whole date, then "today" and "selected" when they are true. The words are in
 * the label, not only in the state of the button, so they are said the same way by every screen reader and in a browser.
 */
export function dayLabel(day: Ymd, { today = false, selected = false }: { today?: boolean; selected?: boolean } = {}): string {
  return [formatDate(day), today ? 'today' : '', selected ? 'selected' : ''].filter(Boolean).join(', ');
}

/** "Previous month, October 2026"; when there is none to go to, just "Previous month" (the button is switched off then). */
export const previousMonthLabel = (shown: Ym, range: Range): string => (canGoBack(shown, range) ? `Previous month, ${monthTitle(addMonths(shown, -1))}` : 'Previous month');
export const nextMonthLabel = (shown: Ym, range: Range): string => (canGoForward(shown, range) ? `Next month, ${monthTitle(addMonths(shown, 1))}` : 'Next month');

/** The heading over the reading: the small line above ("Today · Sunday") and the date under it, and the one sentence a screen reader says. */
export function readingHeading(day: Ymd, isToday: boolean): { eyebrow: string; title: string; label: string } {
  const weekday = WEEKDAYS[weekdayIndex(day)];
  return {
    eyebrow: isToday ? `Today · ${weekday}` : weekday,
    title: `${day.d} ${MONTHS[day.m - 1]} ${day.y}`,
    label: isToday ? `Today, ${formatDate(day)}` : formatDate(day),
  };
}
