// The date line on the daily reading banner: "Sunday 8 November", in the phone's own time zone (the day the pilgrim is living). Written
// out instead of asked of Intl, so it reads the same on every phone and in a browser, and in the same words as the diary's dates.
// Pure: no React, no React Native (plain node tests cover it, npm run test:library).

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "Sunday 8 November" for `now`; empty for a date that does not read (an invalid Date). */
export function todayLine(now: Date = new Date()): string {
  if (Number.isNaN(now.getTime())) return '';
  return `${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

/**
 * The milliseconds from `now` to the start of the next day on the phone's own clock, and never less than a second: when the date of the banner has to be read again by an app that stays
 * open overnight. The next midnight is worked out as a date (not as 24 hours), so a day of 23 or 25 hours where the clocks change is the right length. A Date that does not read gives a minute.
 */
export function msUntilTomorrow(now: Date = new Date()): number {
  if (Number.isNaN(now.getTime())) return 60_000;
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(1000, next.getTime() - now.getTime());
}
