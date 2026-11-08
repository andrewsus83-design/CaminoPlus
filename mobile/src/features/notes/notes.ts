// The pilgrim's notes: what is stored on the phone and the few things that can be done to it. A pure module (no React, no React Native,
// no network, nothing stored here): plain node tests cover it (npm run test:notes). useNotes.ts keeps the list on the phone.
//
// What a note is. Writing in the margin of a book, not a post: it is anchored to the thing it is about (anchor.ts), it keeps the words it
// was made on (`quote`, so it can be found again if a book is revised), the pilgrim's own words (`text`), and the context the app
// already knows when it is written. `type` is 'note', or 'reflection' for the answer to the questions at the end of a day of a
// reflection book (one reflection for each day: it is a note on the day's anchor). There is no feed, no like, no comment and no
// share here, and nothing in this folder talks to a server: a note exists only on this phone.
//
// Where it lives. In the phone's key-value store under `u.<userId>.notes` (lib/localStore.ts userKey), the same way the bookmarks of
// the Library are kept. Every `u.<userId>.…` key is wiped when that person logs out (lib/auth.tsx, clearUserData), which is meant, and
// said on screen. (The Diary is the one thing that stays: a note can be grown into a Diary page, and that page is the pilgrim's.)
// Another account on the same phone has another id, so other keys, and never sees these.
//
// Never trust what is stored. A stored value that is not this shape (nothing, a file from a newer app, a damaged one) parses as null,
// the caller shows an empty list and, when something WAS there, never writes over it (useNotes.ts `blocked`). A note in a readable
// list that does not read is left out, and a note of a kind of anchor this build does not know is kept exactly as it is.
import { formatAnchor, parseAnchor, bookPlaceOf } from './anchor';

/** The name after `u.<userId>.`. */
export const NOTES_NAME = 'notes';

/** Notes one person can keep. Far above what anyone writes in the margin of twenty books; it only keeps a damaged or hostile file from growing a list. */
export const NOTES_MAX = 1_000;
/** Characters in one note. The field stops typing here and says so; addNote and editNote refuse more. */
export const NOTE_TEXT_MAX = 5_000;
/** Characters of the quote a note keeps of the words it was made on. */
export const NOTE_QUOTE_MAX = 300;
/**
 * Characters of the words and the quotes of all notes. Every change writes the whole list, so this is what bounds the cost of one (and of
 * reading it): a person who writes 500 characters a day for a year has 180,000, far below it. A change that would take the list past it is
 * refused, unless it makes the list no bigger (a note that is shortened can always be saved).
 */
export const NOTES_TOTAL_MAX = 1_000_000;

export type NoteType = 'note' | 'reflection';

/**
 * What the app knew when the note was written: the day (the phone's own date, "2026-11-08"), and, only when known, the Camino the pilgrim has
 * chosen (its slug) and the stage (its number on that route). A stage is never guessed: today nothing the phone has offline says which stage
 * someone is on, so it is left out (context.ts).
 */
export type NoteContext = { date: string; caminoSlug?: string; stage?: number };

export type Note = {
  id: string;
  /** Where it is anchored (anchor.ts): a paragraph, a chapter or day, a book, or an anchor of a kind this build does not know. */
  anchor: string;
  /** The words it was made on, one line, at most NOTE_QUOTE_MAX characters. */
  quote: string;
  text: string;
  type: NoteType;
  /** ISO times. */
  createdAt: string;
  updatedAt: string;
  context: NoteContext;
};

/** What is stored: the notes, newest first. `v` is the version of the shape. */
export type StoredNotes = { v: 1; items: Note[] };

/** Why a note was not written. Never thrown: it is an answer, and the screen words it gently (present.ts). */
export type NoteProblem = 'empty' | 'too-long' | 'too-many' | 'full' | 'bad-anchor' | 'not-found' | 'not-saved';

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const validTime = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= 40 && !Number.isNaN(Date.parse(v));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "2026-11-08": the day of `d` in the phone's own time zone, the day the pilgrim lived it. */
export function localDate(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

/** The quote as it is kept: one line, no runs of blanks, cut short with an ellipsis. */
export function clipQuote(text: string): string {
  const one = squash(text);
  if (one.length <= NOTE_QUOTE_MAX) return one;
  let end = NOTE_QUOTE_MAX - 1;
  const last = one.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // never half an emoji
  const cut = one.slice(0, end);
  const space = cut.lastIndexOf(' ');
  return `${(space > NOTE_QUOTE_MAX * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** A context as it is kept: a date that reads (else the day the note was written), a slug that is one, a stage that is a whole number from 1 to 999. */
export function normalizeContext(raw: unknown, fallbackDate: string): NoteContext {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const date = typeof o.date === 'string' && DATE.test(o.date) && !Number.isNaN(Date.parse(o.date)) ? o.date : fallbackDate;
  const out: NoteContext = { date };
  if (typeof o.caminoSlug === 'string' && o.caminoSlug.length <= 60 && SLUG.test(o.caminoSlug)) out.caminoSlug = o.caminoSlug;
  if (typeof o.stage === 'number' && Number.isInteger(o.stage) && o.stage >= 1 && o.stage <= 999) out.stage = o.stage;
  return out;
}

/** A stored item that reads as a note, or null. Text that is too long is cut to the limit (this app never writes one), the type falls back to 'note'. */
export function parseNote(item: unknown): Note | null {
  if (!item || typeof item !== 'object') return null;
  const o = item as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.length === 0 || o.id.length > 80) return null;
  if (typeof o.text !== 'string' || o.text.trim().length === 0) return null;
  const anchor = parseAnchor(o.anchor);
  if (!anchor) return null;
  const createdAt = validTime(o.createdAt) ? o.createdAt : validTime(o.updatedAt) ? o.updatedAt : null;
  if (!createdAt) return null;
  const updatedAt = validTime(o.updatedAt) ? o.updatedAt : createdAt;
  return {
    id: o.id,
    anchor: formatAnchor(anchor),
    quote: typeof o.quote === 'string' ? clipQuote(o.quote) : '',
    text: o.text.length > NOTE_TEXT_MAX ? o.text.slice(0, NOTE_TEXT_MAX) : o.text,
    type: o.type === 'reflection' ? 'reflection' : 'note',
    createdAt,
    updatedAt,
    context: normalizeContext(o.context, localDate(new Date(createdAt))),
  };
}

/** The newest first, a tie broken by id so the order is always the same. */
const byNewest = (a: Note, b: Note) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * The notes in a stored value, newest first. null when what was stored is not this shape (a newer or damaged file): the caller then shows
 * an empty list and does not write over it. A note that does not read is skipped, an id twice is kept once (the first), at most NOTES_MAX.
 */
export function parseNotes(raw: unknown): Note[] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const { v, items } = raw as { v?: unknown; items?: unknown };
  if (v !== 1 || !Array.isArray(items)) return null;
  const out: Note[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const note = parseNote(item);
    if (!note || seen.has(note.id)) continue;
    seen.add(note.id);
    out.push(note);
  }
  return out.sort(byNewest).slice(0, NOTES_MAX);
}

export const packNotes = (list: readonly Note[]): StoredNotes => ({
  v: 1,
  items: list.map((n) => ({ id: n.id, anchor: n.anchor, quote: n.quote, text: n.text, type: n.type, createdAt: n.createdAt, updatedAt: n.updatedAt, context: { ...n.context } })),
});

const sizeOf = (n: Pick<Note, 'text' | 'quote'>) => n.text.length + n.quote.length;
const totalOf = (list: readonly Note[]) => list.reduce((sum, n) => sum + sizeOf(n), 0);

export type Change = { ok: true; notes: Note[]; note: Note } | { ok: false; reason: NoteProblem };

export type NewNote = { id: string; anchor: string; quote: string; text: string; type: NoteType; context: NoteContext };

/**
 * The list with a new note in front, or why not: no words ('empty'), more than NOTE_TEXT_MAX ('too-long'), an anchor that is not one
 * ('bad-anchor'), an id that is not a fresh one ('not-saved'), NOTES_MAX notes already ('too-many'), the list past NOTES_TOTAL_MAX characters ('full'). The text is trimmed, the quote is
 * made one line and cut short, the context is tidied. The list it is given is not changed.
 */
export function addNote(list: readonly Note[], input: NewNote, now: Date): Change {
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  if (!text) return { ok: false, reason: 'empty' };
  if (text.length > NOTE_TEXT_MAX) return { ok: false, reason: 'too-long' };
  const anchor = parseAnchor(input.anchor);
  if (!anchor) return { ok: false, reason: 'bad-anchor' };
  if (typeof input.id !== 'string' || input.id.length === 0 || input.id.length > 80 || list.some((n) => n.id === input.id)) return { ok: false, reason: 'not-saved' };
  if (list.length >= NOTES_MAX) return { ok: false, reason: 'too-many' };
  const stamp = now.toISOString();
  const note: Note = {
    id: input.id,
    anchor: formatAnchor(anchor),
    quote: clipQuote(typeof input.quote === 'string' ? input.quote : ''),
    text,
    type: input.type === 'reflection' ? 'reflection' : 'note',
    createdAt: stamp,
    updatedAt: stamp,
    context: normalizeContext(input.context, localDate(now)),
  };
  if (totalOf(list) + sizeOf(note) > NOTES_TOTAL_MAX) return { ok: false, reason: 'full' };
  return { ok: true, notes: [note, ...list], note };
}

/** The list with the words of one note changed (and the time it was changed), or why not. The note keeps its place in the list, its anchor, quote and context. */
export function editNote(list: readonly Note[], id: string, text: string, now: Date): Change {
  const at = list.findIndex((n) => n.id === id);
  if (at < 0) return { ok: false, reason: 'not-found' };
  const words = typeof text === 'string' ? text.trim() : '';
  if (!words) return { ok: false, reason: 'empty' };
  if (words.length > NOTE_TEXT_MAX) return { ok: false, reason: 'too-long' };
  const old = list[at];
  const note: Note = { ...old, text: words, updatedAt: now.toISOString() };
  if (words === old.text) return { ok: true, notes: list.slice(), note: old };
  if (totalOf(list) - sizeOf(old) + sizeOf(note) > NOTES_TOTAL_MAX && sizeOf(note) > sizeOf(old)) return { ok: false, reason: 'full' };
  const notes = list.slice();
  notes[at] = note;
  return { ok: true, notes, note };
}

/** The list without that note. The list it is given is not changed. */
export const removeNote = (list: readonly Note[], id: string): Note[] => list.filter((n) => n.id !== id);

export const findNote = (list: readonly Note[], id: string | null | undefined): Note | null => (id ? list.find((n) => n.id === id) : undefined) ?? null;

/* ------------------------------------------------------------------------------------------------ selecting */

/** The notes on exactly this anchor (of this type, when given), oldest first: the order they were written is the order they read. */
export function notesAt(list: readonly Note[], anchor: string, type?: NoteType): Note[] {
  return list.filter((n) => n.anchor === anchor && (type === undefined || n.type === type)).sort((a, b) => -byNewest(a, b));
}

/** The one reflection on an anchor (a day): the newest, when there are several. */
export const reflectionAt = (list: readonly Note[], anchor: string): Note | null => list.find((n) => n.anchor === anchor && n.type === 'reflection') ?? null;

/** What a chapter or day of a book shows of the notes: the notes on the whole chapter, the reflection of a day, the notes of each paragraph by block index. */
export type ChapterNotes = { chapter: Note[]; reflection: Note | null; blocks: Record<number, Note[]> };

export function chapterNotes(list: readonly Note[], bookId: string, chapterId: string): ChapterNotes {
  const out: ChapterNotes = { chapter: [], reflection: null, blocks: {} };
  const mine: Note[] = [];
  for (const n of list) {
    const a = bookPlaceOf(n.anchor);
    if (a && a.bookId === bookId && a.chapterId === chapterId) mine.push(n);
  }
  mine.sort((a, b) => -byNewest(a, b));
  for (const n of mine) {
    const a = bookPlaceOf(n.anchor);
    if (!a) continue;
    if (a.block !== null) (out.blocks[a.block] ??= []).push(n);
    else if (n.type === 'reflection') out.reflection = n; // the oldest is read first above, so the newest is the one kept
    else out.chapter.push(n);
  }
  return out;
}
