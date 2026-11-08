// The words of the diary and how a page is read for a list, as pure functions (no React): what a page is called, its
// preview, its date, and the gentle messages. Plain node tests cover them (npm run test:diary).
import { DIARY_MEDIA_BYTES_MAX, DIARY_MEDIA_COUNT_MAX, MEDIA_PER_PAGE_MAX, PHOTO_BYTES_MAX, VIDEO_BYTES_MAX, mediaOf, type RefusalReason } from './media';
import { normalizePlace, type PlaceFailure } from './place';
import { plainText } from './richtext';
import { BODY_MAX, ENTRIES_MAX, TITLE_MAX, TOTAL_MAX, type DiaryEntry, type SaveProblem } from './store';

export const UNTITLED = 'Untitled page';
/** Said on the list, honestly: where the pages are, what is in them, and what that means. */
export const PRIVACY_LINE = 'Only on this phone. Pages, photos, videos and places are not uploaded and not shared. If you delete the app or lose this phone, they are gone.';
/** The line for a diary with no page in it. "Write a note" is the card at the top of the Notes tab of Me. */
export const EMPTY_CARD_LINE = 'Your diary is empty. Tap Write a note to write the first page.';

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

/** How much of a page is read for a name or a preview: whole lines, until this many characters are in hand. A list never needs the rest. */
const READ_CHARS = 600;

/** The first line of the text that has something in it, on one line, without the marks of bold, italic, headings, bullets and quotes. */
export function firstLine(body: string): string {
  for (const line of plainText(body, READ_CHARS).split('\n')) {
    const t = squash(line);
    if (t) return t;
  }
  return '';
}

/** What the list calls a page: its title, else the first line of the text (clean: never a mark), else "Untitled page". */
export function pageTitle(e: Pick<DiaryEntry, 'title' | 'body'>): string {
  const t = squash(e.title) || firstLine(e.body);
  return t ? clip(t, 100) : UNTITLED;
}

/**
 * The preview under the name: the text as one paragraph, without the marks of the rich text. When the name is the first line of
 * the text, that line is not said twice, so the preview starts after it. Cut short: a list never needs the 20,000 characters.
 */
export function pagePreview(e: Pick<DiaryEntry, 'title' | 'body'>): string {
  const lines = plainText(e.body, READ_CHARS).split('\n');
  if (squash(e.title)) return clip(squash(lines.join(' ')), 200);
  const at = lines.findIndex((l) => squash(l));
  return at < 0 ? '' : clip(squash(lines.slice(at + 1).join(' ')), 200);
}

/** The photos and videos of a page, and its place, for the line under its preview on the list. */
export function pageMeta(e: Pick<DiaryEntry, 'media' | 'place'>): { photos: number; videos: number; place: boolean; placeName: string | null } {
  const media = mediaOf(e);
  const place = normalizePlace(e.place);
  return { photos: media.filter((m) => m.kind === 'image').length, videos: media.filter((m) => m.kind === 'video').length, place: place !== null, placeName: place?.name ?? null };
}

/** "2 photos · 1 video · Hontanas": what is attached to a page, in words; empty when nothing is. */
export function metaLine(e: Pick<DiaryEntry, 'media' | 'place'>): string {
  const m = pageMeta(e);
  const parts: string[] = [];
  if (m.photos > 0) parts.push(`${m.photos} ${m.photos === 1 ? 'photo' : 'photos'}`);
  if (m.videos > 0) parts.push(`${m.videos} ${m.videos === 1 ? 'video' : 'videos'}`);
  if (m.place) parts.push(m.placeName ?? 'A place');
  return parts.join(' · ');
}

/** "Photos and videos: 120 MB of 2 GB": what the files of the whole diary use, for the top of the list; empty when there are none. */
export function mediaUsageLine(entries: Pick<DiaryEntry, 'media'>[]): string {
  let bytes = 0;
  let count = 0;
  for (const e of entries) for (const m of mediaOf(e)) { bytes += m.bytes; count += 1; }
  return count === 0 ? '' : `Photos and videos: ${formatBytes(bytes)} of ${formatBytes(DIARY_MEDIA_BYTES_MAX)}`;
}

/** 1536 -> "2 KB", 38 MB -> "38 MB", 1.5 GB -> "1.5 GB": a size in the words a phone uses. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '';
  const units: [number, string][] = [[1024 ** 3, 'GB'], [1024 ** 2, 'MB'], [1024, 'KB']];
  for (const [size, name] of units) {
    if (n >= size) { const v = n / size; return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)} ${name}`; }
  }
  return `${Math.round(n)} B`;
}

/** 42_000 -> "0:42", 725_000 -> "12:05", 3_723_000 -> "1:02:03": the length of a clip. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  const two = (v: number) => String(v).padStart(2, '0');
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

/** The gentle sentence for a page that was not written. */
export function problemMessage(p: SaveProblem): string {
  switch (p) {
    case 'body-too-long': return `This page is full (${thousands(BODY_MAX)} characters). Start a new page to keep writing.`;
    case 'title-too-long': return `A title can have up to ${TITLE_MAX} characters.`;
    case 'too-many-pages': return `Your diary holds ${thousands(ENTRIES_MAX)} pages, the most it can keep. Delete an old page to save this one.`;
    case 'diary-full': return `Your diary is full: it can hold ${thousands(TOTAL_MAX)} characters in all. Your words are still here, so copy them, delete an old page, then paste them into a new one.`;
    case 'too-many-media': return `A page holds up to ${MEDIA_PER_PAGE_MAX} photos and videos. Start a new page for more.`;
    case 'media-full': return `The photos and videos in your diary fill all the room it has (${formatBytes(DIARY_MEDIA_BYTES_MAX)}). Remove some from an older page to add more.`;
    default: return 'This page could not be saved. Your phone may be full. Your words are still here, so copy them before you leave.';
  }
}

/* ------------------------------------------------------------------------------------------------ photos, videos and the place */

const REFUSAL_TEXT: Record<RefusalReason, string> = {
  'page-full': `A page holds up to ${MEDIA_PER_PAGE_MAX} photos and videos. Start a new page for more.`,
  'video-too-big': `A video can be up to ${formatBytes(VIDEO_BYTES_MAX)}, about a minute and a half. Choose a shorter one, or trim it first.`,
  'photo-too-big': `A photo can be up to ${formatBytes(PHOTO_BYTES_MAX)}.`,
  'diary-bytes': `The photos and videos in your diary fill all the room it has (${formatBytes(DIARY_MEDIA_BYTES_MAX)}). Remove some from an older page to make room.`,
  'diary-count': `Your diary holds ${thousands(DIARY_MEDIA_COUNT_MAX)} photos and videos, the most it can keep. Remove some from an older page to add more.`,
  'disk-full': 'Your phone is almost full, so no more can be added. Your words are safe.',
  'copy-failed': 'One of them could not be copied. Your words are safe.',
  unusable: 'One of them could not be used.',
};

/**
 * What to tell the person after they added photos or videos: nothing when all went in, a gentle sentence for what did not (with
 * the numbers in it), or the reason the page could not be written (then none were added). tone is how the screen draws it.
 */
export function attachMessage(o: { added: number; refused: { reason: RefusalReason }[]; failed: SaveProblem | null }): { tone: 'info' | 'error'; text: string } | null {
  if (o.failed) return { tone: 'error', text: problemMessage(o.failed) };
  if (o.refused.length === 0) return null;
  const reasons = [...new Set(o.refused.map((r) => r.reason))].slice(0, 2).map((r) => REFUSAL_TEXT[r]);
  const lead = o.added > 0 ? `Added ${o.added} of ${o.added + o.refused.length}. ` : '';
  return { tone: o.added > 0 ? 'info' : 'error', text: `${lead}${reasons.join(' ')}` };
}

/** Said before the phone asks for the position, so the person knows what it is for and where it goes. */
export const PLACE_EXPLAIN_TITLE = 'Add where you are';
export const PLACE_EXPLAIN = 'CaminoPlus reads your position once and keeps it in this page, only on this phone. It is never uploaded or shared.';
export const PLACE_LOOKUP_NOTE = "To find the name of the place, your phone's own map service may be asked, which needs a signal. Without one you can type a name.";
export const PLACE_FINDING = 'Finding where you are…';
export const PLACE_PRIVATE = 'Only on this phone. It is not uploaded or shared.';

/** The calm sentence for a place that could not be added. */
export function placeProblemMessage(f: PlaceFailure): string {
  switch (f) {
    case 'denied': return 'Location is off for CaminoPlus, so the place was not added. Your page is untouched, and you can try again whenever you like.';
    case 'blocked': return "Location is off for CaminoPlus. To add a place, turn it on in your phone's Settings. Your page is untouched.";
    case 'services-off': return "Location is switched off on this phone. Turn it on in your phone's Settings, then try again.";
    case 'timeout': return 'Could not find where you are. Try again outdoors, with a clear view of the sky.';
    case 'unsupported': return 'Adding a place needs the newest version of the app.';
    default: return 'Could not read your position this time. Try again in a moment.';
  }
}

/** Said where photos, videos and places cannot be added: the web preview, or an app that is older than this feature. */
export const MEDIA_ON_WEB = 'Photos, videos and places are added in the phone app.';
export const MEDIA_NEEDS_NEW_APP = 'Adding photos and videos needs the newest version of the app.';
export const FEATURES_NEED_NEW_APP = 'Adding photos, videos and places needs the newest version of the app.';
export const MISSING_FILE = 'Not on this phone';

/* ------------------------------------------------------------------------------------------------ drafts and the buttons under a page */

/** The tag a draft carries in the Notes feed, in the list of pages and under the date of the page itself. */
export const DRAFT_TAG = 'Draft';
/** The button at the top right of the page while a draft is written: it keeps the page as a draft and goes back. */
export const SAVE_DRAFT = 'Save draft';
/** The big button under the page: it makes the draft a note of the feed. */
export const PUBLISH = 'Publish';
/** The big button under a page that is already published: its words are saved as they are typed, so this only goes back. */
export const DONE = 'Done';

/** "Tuesday 4 November · Draft": the date of the page, and when it is a draft, that it is. */
export const dateWithDraft = (date: string, draft: boolean): string => (draft ? (date ? `${date} · ${DRAFT_TAG}` : DRAFT_TAG) : date);

/**
 * What the row of buttons under a page is made of. The first is the small one (a third of the row): "Read" while writing, "Edit" while
 * reading. The second is the big one (two thirds): "Publish" for a draft, "Done" for a published page that is being written, and none
 * for a published page that is being read (then the first one takes the whole row). A draft with nothing in it cannot be published
 * or kept, and there is nothing to read yet. `saveDraft` says whether the button at the top right is there: only while a draft that
 * has something in it is written (a page being read has not changed, and Back already keeps it).
 */
export type PageFooter = { toggle: 'Read' | 'Edit'; toggleOff: boolean; primary: typeof PUBLISH | typeof DONE | null; primaryOff: boolean; saveDraft: boolean };

export function pageFooter(o: { draft: boolean; reading: boolean; hasContent: boolean }): PageFooter {
  return {
    toggle: o.reading ? 'Edit' : 'Read',
    toggleOff: !o.reading && !o.hasContent,
    primary: o.draft ? PUBLISH : o.reading ? null : DONE,
    primaryOff: o.draft && !o.hasContent,
    saveDraft: o.draft && !o.reading && o.hasContent,
  };
}
