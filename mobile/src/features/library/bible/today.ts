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
