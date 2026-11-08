// The week strip of the Daily reading screen, as pure functions: the seven days of the week that holds the selected day (Monday first, as the
// month calendar's weeks are), the words of the strip and of each of its days, and whether the arrows may move a week. No React, no Date.
import { MONTHS, WEEKDAYS, addDays, dayInRange, weekdayIndex, type Range, type Ymd } from './calendar';
import { liturgicalDayOf } from './liturgy';

/** The letter over each day of the strip, Monday first. A screen reader never meets them: every day says its whole name. */
export const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const;

/** The Monday of the week that holds a day. */
export const weekStart = (day: Ymd): Ymd => addDays(day, -weekdayIndex(day));

/** The seven days of the week that holds a day, Monday to Sunday. */
export function weekDays(day: Ymd): Ymd[] {
  const first = weekStart(day);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(first, i));
}

const SHORT = MONTHS.map((m) => m.slice(0, 3));

/** What the strip is titled: "2–8 Nov 2026", "30 Nov – 6 Dec 2026", and across the turn of the year "28 Dec 2026 – 3 Jan 2027". */
export function weekTitle(days: readonly Ymd[]): string {
  const [a, b] = [days[0], days[days.length - 1]];
  if (a.y !== b.y) return `${a.d} ${SHORT[a.m - 1]} ${a.y} – ${b.d} ${SHORT[b.m - 1]} ${b.y}`;
  if (a.m !== b.m) return `${a.d} ${SHORT[a.m - 1]} – ${b.d} ${SHORT[b.m - 1]} ${b.y}`;
  return `${a.d}–${b.d} ${SHORT[b.m - 1]} ${b.y}`;
}

/** The same said aloud: "2 to 8 November 2026". */
export function weekSpoken(days: readonly Ymd[]): string {
  const [a, b] = [days[0], days[days.length - 1]];
  const from = a.y !== b.y ? `${a.d} ${MONTHS[a.m - 1]} ${a.y}` : a.m !== b.m ? `${a.d} ${MONTHS[a.m - 1]}` : `${a.d}`;
  return `${from} to ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
}

/**
 * What a screen reader says for a day of the strip: "Sunday 8 November, 32nd Sunday in Ordinary Time", and ", today" on today. Whether it is the
 * picked day is the selected state of the button, not a word in the label.
 */
export function dayCellLabel(day: Ymd, today: boolean): string {
  return `${WEEKDAYS[weekdayIndex(day)]} ${day.d} ${MONTHS[day.m - 1]}, ${liturgicalDayOf(day).title}${today ? ', today' : ''}`;
}

/** The arrows move the picked day a week back or on (the strip always shows the week of the picked day); they stop at the limits of the calendar. */
export const canMoveWeek = (selected: Ymd, by: number, range: Range): boolean => dayInRange(addDays(selected, 7 * by), range);

/** "Previous week, 26 October to 1 November 2026"; at the limit, only "Previous week" (the button is switched off then). */
export const previousWeekLabel = (selected: Ymd, range: Range): string => (canMoveWeek(selected, -1, range) ? `Previous week, ${weekSpoken(weekDays(addDays(selected, -7)))}` : 'Previous week');
export const nextWeekLabel = (selected: Ymd, range: Range): string => (canMoveWeek(selected, 1, range) ? `Next week, ${weekSpoken(weekDays(addDays(selected, 7)))}` : 'Next week');
