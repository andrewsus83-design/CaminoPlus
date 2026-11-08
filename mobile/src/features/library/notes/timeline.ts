// The Notes tab of the Library: the pages of the diary as a feed, like a timeline. This file is the logic of it and nothing else: no
// React, no React Native, so plain node can import it (npm run test:library). It decides which notes a filter shows, what time a row
// says ("now", "5m", "2h", "Yesterday", "6 Nov", "6 Nov 2025"), how the photos and videos of a note are laid out in the grid, what the
// share sheet is given, what a screen reader says for a row, and the words of the tab.
//
// Notes are the pages of the diary (features/diary), private and only on this phone. Nothing here reads or writes the store: the
// screen gets the pages from useDiary and hands them in. Nothing here touches the network.
import { mediaOf, type DiaryMedia } from '../../diary/media';
import { normalizePlace, placeLabel, type DiaryPlace } from '../../diary/place';
import { clip, metaLine } from '../../diary/present';
import { parseRich, plainText } from '../../diary/richtext';
import type { DiaryEntry } from '../../diary/store';

/** What a note needs from a page. A page of the diary is one; so is a smaller thing a test builds. */
export type NoteLike = Pick<DiaryEntry, 'id' | 'createdAt' | 'title' | 'body'> & Partial<Pick<DiaryEntry, 'media' | 'place'>>;

/* ------------------------------------------------------------------------------------------------ the words */

/** The prompt in the composer row on top of the feed: a tap on it opens a new page. */
export const COMPOSER_PLACEHOLDER = "What's happening on your Camino?";
/** The one quiet line under the composer. It is true: the pages are kept only on this phone. */
export const NOTES_PRIVACY = 'Notes stay on this phone.';
export const EMPTY_TITLE = 'No notes yet';
export const EMPTY_TEXT = 'Write a few lines about your day on the Way: what you saw, who you met, how you feel.';
export const EMPTY_BUTTON = 'Write your first note';
export const LOADING_LABEL = 'Loading your notes';
export const SHOW_ALL = 'Show all notes';
export const SHOW_MORE = 'Show more';
export const SHOW_LESS = 'Show less';
/** What the person is told when something did not work: the title and the sentence of the system's own dialog. */
export type Telling = { title: string; text: string };
export const DELETE_FAILED: Telling = { title: 'Not deleted', text: 'That note could not be deleted. Please try again.' };
export const SHARE_FAILED: Telling = { title: 'Not shared', text: 'The note could not be shared this time. Please try again.' };
export const MAPS_FAILED: Telling = { title: 'No maps app', text: 'No maps app on this phone could open the place.' };
/** A note with nothing in it (no title, no words, no photo, no place): the row says so instead of showing a blank. */
export const BLANK_NOTE = 'Nothing written yet';
/** The name a person has when they have set neither a display name nor a username. */
export const FALLBACK_NAME = 'Pilgrim';

/* ------------------------------------------------------------------------------------------------ the filter */

export const NOTE_FILTERS = ['all', 'media', 'places'] as const;
export type NoteFilter = (typeof NOTE_FILTERS)[number];

export const FILTER_LABEL: Record<NoteFilter, string> = { all: 'All', media: 'Photos and videos', places: 'Places' };

/** What a filter says when it has nothing to show though the diary has notes. */
export const FILTER_EMPTY: Record<'media' | 'places', { title: string; text: string }> = {
  media: { title: 'No photos or videos yet', text: 'Notes that have a photo or a video are shown here.' },
  places: { title: 'No places yet', text: 'Notes that have a place are shown here.' },
};

export const hasMedia = (e: NoteLike): boolean => mediaOf(e).length > 0;
export const hasPlace = (e: NoteLike): boolean => normalizePlace(e.place) !== null;

export function matchesFilter(e: NoteLike, filter: NoteFilter): boolean {
  if (filter === 'media') return hasMedia(e);
  if (filter === 'places') return hasPlace(e);
  return true;
}

/** The notes a filter shows, in the order they came (newest first). "All" answers the very list it was given. */
export function filterNotes<T extends NoteLike>(entries: readonly T[], filter: NoteFilter): readonly T[] {
  return filter === 'all' ? entries : entries.filter((e) => matchesFilter(e, filter));
}

export type NoteCounts = Record<NoteFilter, number>;

export function noteCounts(entries: readonly NoteLike[]): NoteCounts {
  let media = 0;
  let places = 0;
  for (const e of entries) {
    if (hasMedia(e)) media += 1;
    if (hasPlace(e)) places += 1;
  }
  return { all: entries.length, media, places };
}

/** What a screen reader says for a tab of the filter: its name, how many notes it holds, and (said by the tab role) whether it is on. */
export const filterLabel = (filter: NoteFilter, count: number): string => `${FILTER_LABEL[filter]}, ${count} ${count === 1 ? 'note' : 'notes'}`;

/** What the list under the filter row is showing: nothing yet, an empty diary, a filter with nothing in it, or the notes. */
export type FeedState = 'loading' | 'empty' | 'none-for-filter' | 'list';
export function feedState(o: { ready: boolean; total: number; shown: number }): FeedState {
  if (!o.ready) return 'loading';
  if (o.total === 0) return 'empty';
  return o.shown === 0 ? 'none-for-filter' : 'list';
}

/* ------------------------------------------------------------------------------------------------ the time of a row */

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** The same time twice: short for the row, spoken for a screen reader ("2h" is read as "two h"). */
export type TimeParts = { short: string; spoken: string };

/** The number of the calendar day in the phone's own time zone, so "yesterday" is the day before, whatever the hour and the clock changes. */
const dayNumber = (d: Date): number => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * What a row says about when the note was begun, measured against `now` (the clock is given, never read here):
 *   less than a minute  "now"            a minute to an hour  "5m"           an hour to a day  "2h"
 *   the day before      "Yesterday"      earlier, this year   "6 Nov"         another year     "6 Nov 2025"
 * Days are the days of the phone's own time zone (the day the pilgrim lived it), written out rather than asked of Intl so every
 * phone and the browser say the same. A time that is more than a minute in the future (a clock that was wrong) is given as a date,
 * never as "-5m". null for a date that does not read.
 */
export function noteTime(iso: string, now: Date): TimeParts | null {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime()) || Number.isNaN(now.getTime())) return null;
  const age = now.getTime() - then.getTime();
  if (age >= -MINUTE && age < MINUTE) return { short: 'now', spoken: 'just now' };
  if (age >= MINUTE && age < HOUR) { const m = Math.floor(age / MINUTE); return { short: `${m}m`, spoken: `${plural(m, 'minute')} ago` }; }
  if (age >= HOUR && age < DAY) { const h = Math.floor(age / HOUR); return { short: `${h}h`, spoken: `${plural(h, 'hour')} ago` }; }
  if (age >= DAY) {
    const days = dayNumber(now) - dayNumber(then);
    if (days === 1) return { short: 'Yesterday', spoken: 'Yesterday' };
    // A day of 25 hours (the night the clocks go back): a note from this very day can be more than 24 hours old. Hours, not a date that says today.
    if (days === 0) { const h = Math.floor(age / HOUR); return { short: `${h}h`, spoken: `${plural(h, 'hour')} ago` }; }
  }
  const sameYear = then.getFullYear() === now.getFullYear();
  const day = then.getDate();
  return {
    short: sameYear ? `${day} ${SHORT_MONTHS[then.getMonth()]}` : `${day} ${SHORT_MONTHS[then.getMonth()]} ${then.getFullYear()}`,
    spoken: sameYear ? `${day} ${LONG_MONTHS[then.getMonth()]}` : `${day} ${LONG_MONTHS[then.getMonth()]} ${then.getFullYear()}`,
  };
}

/* ------------------------------------------------------------------------------------------------ the person on the rows */

/**
 * The name and the handle printed on every row, like the name on a post: the display name, else the username, else "Pilgrim"; the
 * handle is "@username", and is left out when it would only say the name again.
 */
export function identity(profile: { display_name?: string | null; username?: string | null } | null | undefined): { name: string; handle: string } {
  const display = typeof profile?.display_name === 'string' ? profile.display_name.replace(/\s+/g, ' ').trim() : '';
  const user = typeof profile?.username === 'string' ? profile.username.trim() : '';
  const name = display || user || FALLBACK_NAME;
  return { name, handle: user && user.toLowerCase() !== name.toLowerCase() ? `@${user}` : '' };
}

/* ------------------------------------------------------------------------------------------------ the words of a note */

/** The part of a note's words that the feed draws: the most it ever needs, so a page of 20,000 characters costs a row no more than a short one. */
export const FEED_CHARS = 1_200;

/**
 * The beginning of the text, at most FEED_CHARS characters, cut at the end of a word when there is one near the end (never in the middle
 * of an emoji). The row clamps to a few lines anyway, so the cut is never seen; "Show more" shows the whole text.
 */
export function feedBody(body: string): string {
  if (typeof body !== 'string') return '';
  if (body.length <= FEED_CHARS) return body;
  let end = FEED_CHARS;
  const room = body.slice(end - 200, end);
  const at = Math.max(room.lastIndexOf('\n'), room.lastIndexOf(' '));
  if (at >= 0) end = end - 200 + at;
  const last = body.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // the first half of a pair: leave it out
  return body.slice(0, end);
}

/** How many lines of text a row shows before "Show more", and how high a line of it is (the body text of RichText: tokens text.body). */
export const BODY_LINES = 8;
export const BODY_LINE_PX = 28;
export const BODY_CLAMP_PX = BODY_LINES * BODY_LINE_PX;

/** The last pixels of a cut text fade out, in this many steps (a stack of thin bands of the background colour, each a little more opaque than the one above). */
export const FADE_PX = 16;
export const FADE_STEPS = 8;

/** The text is taller than what a row shows: it is cut, and "Show more" says so. A pixel of slack, so rounding never invents a button. */
export const needsMore = (naturalHeight: number): boolean => Number.isFinite(naturalHeight) && naturalHeight > BODY_CLAMP_PX + 1;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/**
 * What the share sheet is given: the title, a blank line, the words, as plain text (no marks of bold, italic, headings or quotes; a
 * bullet is a bullet). Only the note's text: no photos, no videos, no place and no coordinates, no link, nothing about the app. ''
 * when the note has no text, and then there is nothing to share.
 */
export function shareText(e: Pick<NoteLike, 'title' | 'body'>): string {
  const title = squash(typeof e.title === 'string' ? e.title : '');
  const lines = parseRich(e.body).map((b) => {
    if (b.kind === 'gap') return '';
    const text = b.spans.map((s) => s.text).join('');
    return b.kind === 'li' ? `• ${text}` : text;
  });
  const body = lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return [title, body].filter(Boolean).join('\n\n');
}

/* ------------------------------------------------------------------------------------------------ the photos and videos */

/** At most this many tiles are drawn on a row, like a post; the others are behind a "+N" on the last tile and in the full-screen viewer. */
export const MEDIA_SHOWN_MAX = 4;

export type MediaPlan = {
  kind: 'none' | 'single' | 'pair' | 'trio' | 'quad';
  /** Left to right, the tiles of each column from top to bottom, by number (the order the note keeps them in). Every tile shown is in one column. */
  columns: number[][];
  shown: number;
  /** How many more the note has than are shown. */
  more: number;
};

/**
 * How the photos and videos of a note sit in the grid, like the grid of a post:
 *   1  one wide tile        2  two side by side        3  one tall tile and two stacked beside it        4  two by two
 * The grid is always the same shape (16 : 9), so a row is as tall with one photo as with four.
 */
export function mediaPlan(count: number): MediaPlan {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const shown = Math.min(n, MEDIA_SHOWN_MAX);
  const more = n - shown;
  if (shown === 0) return { kind: 'none', columns: [], shown, more };
  if (shown === 1) return { kind: 'single', columns: [[0]], shown, more };
  if (shown === 2) return { kind: 'pair', columns: [[0], [1]], shown, more };
  if (shown === 3) return { kind: 'trio', columns: [[0], [1, 2]], shown, more };
  return { kind: 'quad', columns: [[0, 2], [1, 3]], shown, more };
}

/** The ratio of the grid: wide and low, as on a post. */
export const MEDIA_RATIO = 16 / 9;
/** The line between two tiles, in pixels. */
export const MEDIA_GAP = 2;

/** What a screen reader says for a tile: which one of how many, and that it opens full screen (or that its file is not on this phone). */
export function tileLabel(m: Pick<DiaryMedia, 'kind'>, index: number, count: number, here: boolean, more = 0): string {
  const label = `${m.kind === 'video' ? 'Video' : 'Photo'} ${index + 1} of ${count}`;
  if (!here) return `${label}, not on this phone`;
  return more > 0 ? `${label}. Opens it full screen. ${more} more` : `${label}. Opens it full screen`;
}

/* ------------------------------------------------------------------------------------------------ a row */

export type NoteRow = {
  id: string;
  title: string;
  /** The text as written (with its marks), cut to what the feed draws. */
  body: string;
  /** The whole text, for "Show more". */
  full: string;
  media: DiaryMedia[];
  place: DiaryPlace | null;
  placeText: string;
  time: TimeParts | null;
  /** What the share sheet gets; '' when the note has no text. */
  share: string;
  /** Nothing in it at all. */
  blank: boolean;
  /** What a screen reader reads for the whole row. */
  label: string;
};

const stop = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);

/** The sentence a screen reader reads for a row: who, when, the title, the first words, and what is attached (photos, videos, the place). */
export function rowLabel(o: { name: string; time: TimeParts | null; title: string; text: string; meta: string }): string {
  return [o.name, o.time?.spoken ?? '', o.title, o.text, o.meta].filter((p) => p !== '').map(stop).join(' ');
}

/** Everything a row draws, from a page. `now` and the person are given; nothing is read from anywhere else. */
export function noteRow(e: NoteLike, now: Date, who: { name: string }): NoteRow {
  const title = squash(typeof e.title === 'string' ? e.title : '');
  const full = typeof e.body === 'string' ? e.body : '';
  const media = mediaOf(e);
  const place = normalizePlace(e.place);
  const words = squash(plainText(full, 600));
  const time = noteTime(e.createdAt, now);
  const blank = title === '' && words === '' && media.length === 0 && place === null;
  const meta = metaLine({ media: e.media, place: e.place });
  return {
    id: e.id,
    title,
    body: feedBody(full),
    full,
    media,
    place,
    placeText: place ? placeLabel(place) : '',
    time,
    share: shareText(e),
    blank,
    label: rowLabel({ name: who.name, time, title, text: blank ? BLANK_NOTE : clip(words, 160), meta }),
  };
}

/** The set of rows that are opened out ("Show less" is on them), with one more toggled. A new set: the one given is never changed. */
export function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/* ------------------------------------------------------------------------------------------------ a page of notes at a time */

/**
 * When the tab is drawn in the page of its host (inside the Library's own scroll view, with no list of its own) it cannot draw only the rows on
 * screen, so it draws this many notes, and a button adds this many more. A tab with a list of its own has no need of it.
 */
export const NOTES_PAGE = 30;

/** The first `limit` notes of the list (the very list when it is not longer). */
export function pageOf<T>(list: readonly T[], limit: number): readonly T[] {
  const n = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  return n >= list.length ? list : list.slice(0, n);
}

/** How many notes are still behind the button. */
export const notesLeft = (total: number, drawn: number): number => Math.max(0, Math.floor(total) - Math.max(0, Math.floor(drawn)));

/** The limit after the button: one more page, never past the end. */
export const nextLimit = (limit: number, total: number): number => Math.min(Math.max(0, Math.floor(total)), Math.max(0, Math.floor(limit)) + NOTES_PAGE);

/** "Show 30 more notes", "Show 1 more note": what the button says, and how many it adds. */
export function moreNotesLabel(left: number): string {
  const n = Math.min(Math.max(0, Math.floor(left)), NOTES_PAGE);
  return `Show ${n} more ${n === 1 ? 'note' : 'notes'}`;
}

/** The smallest a thing to touch is, in pixels: every button of the feed is at least this big, with or without the room around it. */
export const TOUCH_MIN = 44;
