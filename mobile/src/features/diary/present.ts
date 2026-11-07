// The words of the diary and how a page is read for a list, as pure functions (no React): what a page is called, its
// preview, its date, and the gentle messages. Plain node tests cover them (npm run test:diary).
import { BODY_MAX, ENTRIES_MAX, TITLE_MAX, type DiaryEntry, type SaveProblem } from './store';

export const UNTITLED = 'Untitled page';
/** Said on the list, honestly: where the pages are, and what that means. */
export const PRIVACY_LINE = 'Only on this phone. Not uploaded, not shared. If you delete the app or lose this phone, these pages are gone.';
/** The diary card on the Library screen when there is no page. "The pen" is the gold button on that screen. */
export const EMPTY_CARD_LINE = 'Your diary is empty. Tap the pen to write the first page.';

export const pagesLabel = (n: number) => `${n} ${n === 1 ? 'page' : 'pages'}`;

/** 20000 -> "20,000". */
export const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * "Tuesday 4 November", in the phone's own time zone (the day the pilgrim lived it), with the year when it is not this
 * year. Written out rather than asked of Intl, so it reads the same on every phone and in a browser. Empty for a date that
 * does not read.
 */
export function dateLine(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const day = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** At most `max` characters, with an ellipsis; never cuts an emoji (a surrogate pair) in half. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  let end = max - 1;
  const last = s.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // the first half of a pair: leave it out
  return `${s.slice(0, end).trimEnd()}…`;
}

/** The first line of the text that has something in it, on one line. */
export function firstLine(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const t = squash(line);
    if (t) return t;
  }
  return '';
}

/** What the list calls a page: its title, else the first line of the text, else "Untitled page". */
export function pageTitle(e: Pick<DiaryEntry, 'title' | 'body'>): string {
  const t = squash(e.title) || firstLine(e.body);
  return t ? clip(t, 100) : UNTITLED;
}

/**
 * The preview under the name: the text as one paragraph. When the name is the first line of the text, that line is not
 * said twice, so the preview starts after it. Cut short: a list never needs the 20,000 characters.
 */
export function pagePreview(e: Pick<DiaryEntry, 'title' | 'body'>): string {
  if (squash(e.title)) return clip(squash(e.body), 200);
  const lines = e.body.split(/\r?\n/);
  const at = lines.findIndex((l) => squash(l));
  return at < 0 ? '' : clip(squash(lines.slice(at + 1).join(' ')), 200);
}

/** The gentle sentence for a page that was not written. */
export function problemMessage(p: SaveProblem): string {
  switch (p) {
    case 'body-too-long': return `This page is full (${thousands(BODY_MAX)} characters). Start a new page to keep writing.`;
    case 'title-too-long': return `A title can have up to ${TITLE_MAX} characters.`;
    case 'too-many-pages': return `Your diary holds ${thousands(ENTRIES_MAX)} pages, the most it can keep. Delete an old page to save this one.`;
    default: return 'This page could not be saved. Your phone may be full. Your words are still here, so copy them before you leave.';
  }
}
