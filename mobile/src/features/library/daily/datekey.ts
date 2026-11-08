// A day as the text "2026-11-08": what the Daily reading screen takes in its `date` route param, what a bookmark of a day is kept under
// ("daily:2026-11-08") and what the readings provider is asked for. Pure: no React, no Date. Anything that is not a real day of the Gregorian
// calendar (1583 to 9999) reads as nothing, and the screen then opens on today.
import { isValidDay, type Ymd } from './calendar';
import { FIRST_YEAR, LAST_YEAR } from './liturgy';

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/** "2026-11-08". */
export const dateKey = (day: Ymd): string => `${pad(day.y, 4)}-${pad(day.m)}-${pad(day.d)}`;

/** The day of a "YYYY-MM-DD" text, or null for anything else (30 February, 2026-1-5, a number, nothing). */
export function parseDateKey(text: unknown): Ymd | null {
  if (typeof text !== 'string') return null;
  const found = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!found) return null;
  const day: Ymd = { y: Number(found[1]), m: Number(found[2]), d: Number(found[3]) };
  return isValidDay(day) && day.y >= FIRST_YEAR && day.y <= LAST_YEAR ? day : null;
}
