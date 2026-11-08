// A bookmarked day of the Daily reading, as a key of the Library's own bookmark list (features/library/bookmarks.ts): "daily:2026-11-08", the same
// shape as the keys of the tabs ("bible:psalms", "books:confessions"), so the one list, the one store and the one logout that clears it serve all of
// them. Pure: no React, no storage. The Library's search and its rows ignore a key they do not know, so nothing there changes for these.
import type { Ymd } from './calendar';
import { dateKey, parseDateKey } from './datekey';
import { liturgicalDayOf } from './liturgy';

export const DAILY_KEY_PREFIX = 'daily:';

/** The key a day is bookmarked under: "daily:2026-11-08". It never changes for a day. */
export const dailyKey = (day: Ymd): string => `${DAILY_KEY_PREFIX}${dateKey(day)}`;

/** The day of a bookmark key, or null when the key is not one of a day (or the day is not a real one). */
export const dayOfDailyKey = (key: string): Ymd | null => (key.startsWith(DAILY_KEY_PREFIX) ? parseDateKey(key.slice(DAILY_KEY_PREFIX.length)) : null);

/** The days among some bookmark keys, in the order of the keys (newest first, as they are kept), each once. */
export function dailyDaysOf(keys: readonly string[]): Ymd[] {
  const seen = new Set<string>();
  const out: Ymd[] = [];
  for (const key of keys) {
    const day = dayOfDailyKey(key);
    if (day && !seen.has(key)) { seen.add(key); out.push(day); }
  }
  return out;
}

/** The title of a day for a list: its liturgical name ("32nd Sunday in Ordinary Time"). */
export const dailyTitle = (day: Ymd): string => liturgicalDayOf(day).title;

/** What the bookmark button of the screen says, and what the Bookmarks screen calls the group of these rows. */
export const BOOKMARK_DAY = 'Bookmark this day';
export const UNBOOKMARK_DAY = 'Remove bookmark';
export const DAILY_GROUP = 'Daily reading';
