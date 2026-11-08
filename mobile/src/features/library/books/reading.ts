// The logic of reading a book, as pure functions: no React, no React Native, nothing stored here (plain node tests cover all of it,
// npm run test:library). It answers: which chapter comes before and after this one (across parts), how the table of contents is
// grouped, how far down a chapter the person is, which chapters are read, where to open the book next time, and how long a text takes.
// The screens (BookPage.tsx, Reader.tsx) draw what this says; useBooksReading.ts keeps the places on the phone.
//
// Where a place is kept. Only on this phone, in the phone's key-value store under `u.<userId>.library.reading` (lib/localStore.ts
// userKey), next to the Library bookmarks: every `u.<userId>.…` key is wiped when that person logs out, which is meant (what someone
// reads is theirs, and another account on the same phone has another id). Nothing here is sent anywhere.
//
// A saved place is never trusted. It can be missing, from an older or newer version of the app, damaged, or about a chapter that the
// text no longer has: parseReading leaves out what does not read, and resumeAt falls back to the start of the book. Nothing throws.
import type { Block, BookContent, Span } from './index';

/** What this logic needs to know of a chapter: its id, its title and its part. The blocks are not needed to find a neighbour. */
export type ChapterRef = { id: string; title: string; part?: string };

const NO_BREAK_SPACE = '\u00a0';

/** Index of the chapter with this id, or -1 (an unknown id, nothing, or a book without chapters). */
export function chapterIndex(chapters: readonly ChapterRef[], id: string | null | undefined): number {
  if (typeof id !== 'string' || id.length === 0) return -1;
  return chapters.findIndex((c) => c.id === id);
}

/* ============================================================ neighbours */

export type Neighbour = { index: number; id: string; title: string; part: string | null };

export type ChapterNav = {
  /** Where this chapter is in the book, from 0. */
  index: number;
  /** The same counted from 1, for people ("Chapter 7 of 40"). */
  position: number;
  total: number;
  prev: Neighbour | null;
  next: Neighbour | null;
  /** The part of this chapter, null when the book has none. */
  part: string | null;
};

const partOf = (c: ChapterRef | undefined): string | null => (c?.part && c.part.trim() ? c.part.trim() : null);

const neighbour = (chapters: readonly ChapterRef[], index: number): Neighbour | null => {
  const c = chapters[index];
  return c ? { index, id: c.id, title: c.title, part: partOf(c) } : null;
};

/**
 * The chapter at `index` with its neighbours. The next chapter is the next in reading order, also when it is in another part
 * (the last chapter of "Book One" is followed by the first of "Book Two"). The first chapter has no previous and the last has no next.
 * null when there is no such chapter.
 */
export function chapterNav(chapters: readonly ChapterRef[], index: number): ChapterNav | null {
  if (!Number.isInteger(index) || index < 0 || index >= chapters.length) return null;
  return {
    index,
    position: index + 1,
    total: chapters.length,
    prev: neighbour(chapters, index - 1),
    next: neighbour(chapters, index + 1),
    part: partOf(chapters[index]),
  };
}

/** "Chapter 7 of 40": where this chapter is in the whole book, whatever the parts. */
export const positionLine = (nav: Pick<ChapterNav, 'position' | 'total'>): string => `Chapter ${nav.position} of ${nav.total}`;

/** The destination as it is named in a label: "The Second Book, Chapter I. Of the inward life" when it is in another part than `from`, else just its title. */
export function destination(n: Neighbour, from: string | null): string {
  return n.part && n.part !== from ? `${partName(n.part)}, ${n.title}` : n.title;
}

/** What a screen reader says for the Previous button: the destination, or why there is none. */
export const previousLabel = (nav: ChapterNav): string => (nav.prev ? `Previous: ${destination(nav.prev, nav.part)}` : 'Previous chapter. This is the first chapter');
/** What a screen reader says for the Next button. */
export const nextLabel = (nav: ChapterNav): string => (nav.next ? `Next: ${destination(nav.next, nav.part)}` : 'Next chapter. This is the last chapter');

/* ============================================================ table of contents */

export type TocEntry = { index: number; id: string; title: string };
export type TocGroup = { part: string | null; entries: TocEntry[] };

/**
 * The table of contents: the chapters in reading order, grouped by their part. Chapters that follow each other and have the same part
 * are one group; a chapter with no part (a preface before "Book One") is in a group with part null, which has no heading. A part that
 * comes back later is a new group, so the order of reading is never changed. A book with no parts is one group with part null.
 */
export function tocGroups(chapters: readonly ChapterRef[]): TocGroup[] {
  const groups: TocGroup[] = [];
  chapters.forEach((c, index) => {
    const part = partOf(c);
    const last = groups[groups.length - 1];
    const entry = { index, id: c.id, title: c.title };
    if (last && last.part === part) last.entries.push(entry);
    else groups.push({ part, entries: [entry] });
  });
  return groups;
}

/** The book has parts worth a heading in its table of contents. */
export const hasParts = (chapters: readonly ChapterRef[]): boolean => chapters.some((c) => partOf(c) !== null);

/* ============================================================ titles */

// "Chapter VII. Of fleeing from vain hope and pride" -> "Chapter VII". Only a title that starts with a word and a number is cut like that;
// any other title is kept whole, or cut at a word when it is longer than the button can hold.
const NUMBERED = /^(chapter|book|part|section|letter|stanza|canto|mansion|week|treatise|discourse|day)\s+([0-9]+|[ivxlcdm]+)(?![a-z])/i;

/** A title short enough for a button: "Chapter VII" for a numbered one, else the title, cut at a word with an ellipsis when it is over `max`. */
export function shortTitle(title: string, max = 28): string {
  const t = title.replace(/\s+/g, ' ').trim();
  const m = NUMBERED.exec(t);
  if (m) return m[0].replace(/ /g, NO_BREAK_SPACE);
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.\-–—]+$/, '')}…`;
}

/**
 * The part as a name, without its subtitle: the editions give "The First Book. Admonitions Profitable for the Spiritual Life", and a heading over a chapter, a button
 * or a label has room for "The First Book". Cut at the first full stop that ends a sentence (not at "St." or "Mr."); a part with none is kept whole.
 */
export function partName(part: string): string {
  const t = part.replace(/\s+/g, ' ').trim();
  const re = /\.\s+(?=[A-Z0-9])/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const head = t.slice(0, m.index);
    if (head.length >= 3 && !/\b(?:St|Sts|Mt|Mr|Mrs|Dr|Fr|Bl|Bp)$/.test(head)) return head;
  }
  return t;
}

/** A label longer than this is a whole sentence, not a name: the reader sets it in the size of a heading, which is smaller than a title. */
export const LONG_LABEL = 44;

/** A title longer than this that has no number is looked at for a short first sentence ("Annotations. To give some understanding of the exercises...") to make its label. */
export const LONG_TITLE = 40;

/**
 * A chapter title split in two, so that a long one does not become a wall of heading: "Chapter XXXVI. The Foundation of the Monastery of St. Joseph. Persecution
 * and Temptations." is the label "Chapter XXXVI" (Fraunces) and the rest, which says what the chapter is about (Inter, under it). A long title with no number
 * that starts with a short sentence ("Annotations. To give some understanding...") is split after that sentence; any other title ("Prologue", "Book X", "Of the
 * excellence of the obedient, and of the misery of the disobedient") is only a label.
 */
export function splitTitle(title: string): { label: string; subtitle: string } {
  const t = title.replace(/\s+/g, ' ').trim();
  const m = NUMBERED.exec(t);
  if (m) return { label: m[0].replace(/ /g, NO_BREAK_SPACE), subtitle: t.slice(m[0].length).replace(/^[\s.:;,\-–—]+/, '').trim() };
  if (t.length > LONG_TITLE) {
    const first = /^(.{3,36}?)[.:?!]\s+(?=[A-Z0-9“"‘'(])/.exec(t);
    if (first) return { label: first[1], subtitle: t.slice(first[0].length).trim() };
  }
  return { label: t, subtitle: '' };
}

/** The rest of a part after its name, for a line under it: "Counsels and Practices Suitable for the Soul's Guidance", from "Part I. Counsels and Practices Suitable for the Soul's Guidance." Empty when there is none. */
export function partSubtitle(part: string): string {
  const t = part.replace(/\s+/g, ' ').trim();
  const name = partName(t);
  return t.length > name.length ? t.slice(name.length).replace(/^[\s.:;,\-–—]+/, '').replace(/[.\s]+$/, '') : '';
}

/* ============================================================ progress */

/** From this far down a chapter (0 to 1) it counts as read. */
export const READ_AT = 0.9;
/** From this far down, someone who comes back is sent to the next chapter, not to the last lines of this one. */
export const FINISHED_AT = 0.97;

const clamp01 = (n: number): number => (Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 0);

/**
 * How far down a chapter the person is, 0 to 1: the scroll offset over the part of the text that can be scrolled (its height minus the
 * screen's). Nothing is known before the text and the screen have a size, and then it is 0; a chapter that fits on the screen is
 * entirely on it, and is 1.
 */
export function scrollProgress(offset: number, content: number, viewport: number): number {
  if (![offset, content, viewport].every(Number.isFinite) || content <= 0 || viewport <= 0) return 0;
  const room = content - viewport;
  if (room <= 1) return 1;
  return clamp01(offset / room);
}

/** The scroll offset that is this far down a chapter, in pixels, for a text of this height on a screen of this height. */
export function offsetFor(progress: number, content: number, viewport: number): number {
  if (![content, viewport].every(Number.isFinite)) return 0;
  return Math.max(0, Math.round(clamp01(progress) * (content - viewport)));
}

export const isRead = (progress: number): boolean => clamp01(progress) >= READ_AT;

/* ============================================================ size of a text */

// The rules are the ones of tools/book_kit.py, which counted the words of every book when it built the bundle: the same words and the same minutes, so that the time
// on a cover and on a book page (the catalog's) and the time at the top of a chapter (worked out here, from its blocks) never disagree. A test compares them for every book.

/** What a person reads in a minute, for a calm text (tools/book_kit.py WORDS_PER_MINUTE). */
export const WORDS_PER_MINUTE = 220;

// A word: letters and numbers, with an apostrophe or a hyphen kept inside it ("don't", "well-known"). Written with \p{L} and \p{N} so it is the same on every phone.
const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Words in a text. */
export const countWords = (text: string): number => (text.match(WORD) ?? []).length;

/** The words of spans, without any markup. */
export const plainText = (spans: readonly Span[]): string => spans.map((x) => x.t).join('');

/** All the text of a block, one string (a break has none): what its words are counted from. */
export function blockText(b: Block): string {
  switch (b.t) {
    case 'h':
    case 'p': return plainText(b.spans);
    case 'ul':
    case 'ol': return b.items.map(plainText).join('\n');
    case 'quote': return [...b.paras.map(plainText), ...(b.cite ? [plainText(b.cite)] : [])].join('\n');
    default: return '';
  }
}

/** Words in the blocks of a chapter. */
export const blockWords = (blocks: readonly Block[]): number => blocks.reduce((sum, b) => sum + countWords(blockText(b)), 0);

/** Words in a chapter as the bundle counts them: its title and its blocks. */
export const chapterWords = (title: string, blocks: readonly Block[]): number => countWords(title) + blockWords(blocks);

/** "55,000": a number with a comma between the thousands, the same on every phone (no locale involved). */
export const groupThousands = (n: number): string => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** Minutes for this many words, rounded up: a text is never "zero minutes" (and no words take none). */
export const readingMinutes = (words: number): number => (words > 0 ? Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) : 0);

/** "25 min", "2 h 40 min", "3 h". */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  if (h === 0) return `${m} min`;
  return m % 60 === 0 ? `${h} h` : `${h} h ${m % 60} min`;
}

/** The same said aloud for a screen reader: "1 minute", "51 minutes", "1 hour 8 minutes", "3 hours". */
export function spokenMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;
  if (h === 0) return part(rest, 'minute');
  return rest === 0 ? part(h, 'hour') : `${part(h, 'hour')} ${part(rest, 'minute')}`;
}

/** How long a text of this many words takes: "6 min", "2 h 29 min". */
export const readingTime = (words: number): string => formatMinutes(readingMinutes(words));

/** The line of numbers on a book page: "17 chapters · 11,077 words · 51 min". */
export function bookFacts(chapters: number, words: number): string {
  return `${chapters} ${chapters === 1 ? 'chapter' : 'chapters'} · ${groupThousands(words)} words · ${readingTime(words)}`;
}

/* ============================================================ very long paragraphs */

/** The longest text one paragraph is drawn as. Longer ones are drawn as several pieces that look like one (a text view that tall is slow to lay out). */
export const PIECE_MAX = 4000;

/**
 * A paragraph cut into pieces of at most `max` characters, at the end of a sentence when there is one in the last fifth of a piece, else at a
 * space. The pieces put together are exactly the text (nothing is lost or added), so they can be drawn one under the other as one paragraph.
 */
export function pieces(text: string, max: number = PIECE_MAX): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const from = Math.floor(max * 0.8);
    let cut = -1;
    for (let i = window.length - 1; i >= from; i -= 1) {
      if (/[.!?;:”’"')\]]/.test(window[i]) && rest[i + 1] === ' ') { cut = i + 1; break; }
    }
    if (cut < 0) cut = window.lastIndexOf(' ') > 0 ? window.lastIndexOf(' ') : max;
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  if (rest.length > 0) out.push(rest);
  return out;
}

/**
 * Spans cut into pieces of at most `max` characters, where `pieces` cuts their text: the pieces of spans put together say exactly the same words in the same bold and
 * italic, so a paragraph that was cut is drawn as one. (A span that straddles a cut is two spans, one on each side.)
 */
export function spanPieces(spans: readonly Span[], max: number = PIECE_MAX): Span[][] {
  const text = plainText(spans);
  if (text.length <= max) return [spans.slice()];
  const out: Span[][] = [];
  let current: Span[] = [];
  const lengths = pieces(text, max).map((p) => p.length);
  let which = 0;
  let room = lengths[0];
  for (const span of spans) {
    let rest = span.t;
    while (rest.length > room) {
      if (room > 0) current.push({ ...span, t: rest.slice(0, room) });
      rest = rest.slice(room);
      out.push(current);
      current = [];
      which += 1;
      room = lengths[which] ?? Number.MAX_SAFE_INTEGER;
    }
    if (rest.length > 0) {
      current.push({ ...span, t: rest });
      room -= rest.length;
    }
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** One thing the reader draws: a heading, a paragraph (or one piece of a long one), a quotation, a list, or a break. */
export type Item =
  | {
      /** Stable for a chapter: the index of the block, and of the piece in it. */
      key: string;
      k: 'p';
      spans: Span[];
      /** A piece after the first of a long paragraph: it follows the one above with no space between. */
      cont: boolean;
      /** The last piece of its block: the space after a paragraph is under this one. */
      end: boolean;
    }
  | { key: string; k: 'h'; level: number; spans: Span[] }
  | { key: string; k: 'q'; paras: Span[][]; cite: Span[] | null }
  | { key: string; k: 'list'; ordered: boolean; items: Span[][] }
  | { key: string; k: 'hr' };

/** The blocks of a chapter as the things to draw, in order. A paragraph over PIECE_MAX characters becomes several pieces; every other block is one item. */
export function layoutBlocks(blocks: readonly Block[], max: number = PIECE_MAX): Item[] {
  const out: Item[] = [];
  blocks.forEach((b, i) => {
    switch (b.t) {
      case 'hr': out.push({ key: `${i}`, k: 'hr' }); break;
      case 'h': out.push({ key: `${i}`, k: 'h', level: b.level, spans: b.spans }); break;
      case 'p': {
        const parts = spanPieces(b.spans, max);
        parts.forEach((spans, j) => out.push({ key: `${i}.${j}`, k: 'p', spans, cont: j > 0, end: j === parts.length - 1 }));
        break;
      }
      case 'quote': out.push({ key: `${i}`, k: 'q', paras: b.paras, cite: b.cite }); break;
      case 'ul':
      case 'ol': out.push({ key: `${i}`, k: 'list', ordered: b.t === 'ol', items: b.items }); break;
    }
  });
  return out;
}

/* ============================================================ a book read from its file */

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Spans that read: an object with text, and a bold, an italic and a link only when they are what they should be. Anything else is left out. */
function cleanSpans(raw: unknown): Span[] {
  if (!Array.isArray(raw)) return [];
  const out: Span[] = [];
  for (const x of raw) {
    if (!isObject(x) || typeof x.t !== 'string') continue;
    const span: Span = { t: x.t };
    if (x.b === 1) span.b = 1;
    if (x.i === 1) span.i = 1;
    if (typeof x.href === 'string') span.href = x.href;
    out.push(span);
  }
  return out;
}

const cleanLines = (raw: unknown): Span[][] => (Array.isArray(raw) ? raw.map(cleanSpans).filter((l) => l.length > 0) : []);

/** The blocks that read: an unknown kind, a heading with no text, a list with no item: left out, so the reader never has to ask. */
export function cleanBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  for (const b of raw) {
    if (!isObject(b)) continue;
    if (b.t === 'hr') { out.push({ t: 'hr' }); continue; }
    if (b.t === 'h' || b.t === 'p') {
      const spans = cleanSpans(b.spans);
      if (spans.length === 0) continue;
      if (b.t === 'p') out.push({ t: 'p', spans });
      else out.push({ t: 'h', level: typeof b.level === 'number' && Number.isFinite(b.level) ? Math.min(Math.max(Math.round(b.level), 2), 6) : 2, spans });
    } else if (b.t === 'ul' || b.t === 'ol') {
      const items = cleanLines(b.items);
      if (items.length > 0) out.push({ t: b.t, items });
    } else if (b.t === 'quote') {
      const paras = cleanLines(b.paras);
      const cite = cleanSpans(b.cite);
      if (paras.length > 0 || cite.length > 0) out.push({ t: 'quote', paras, cite: cite.length > 0 ? cite : null });
    }
  }
  return out;
}

/**
 * A book as it is read from its file, made safe: null when what was read is not a book (nothing, a damaged file, no chapter in it), else the book with only the chapters
 * and blocks that read. A chapter with no id or title, or an id seen before, is left out. The reader and the page then work with what is there and never throw.
 */
export function cleanBook(raw: unknown): BookContent | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || typeof raw.title !== 'string' || !Array.isArray(raw.chapters)) return null;
  const seen = new Set<string>();
  const chapters: BookContent['chapters'] = [];
  for (const c of raw.chapters) {
    if (!isObject(c) || typeof c.id !== 'string' || c.id.length === 0 || typeof c.title !== 'string' || seen.has(c.id)) continue;
    seen.add(c.id);
    chapters.push({ id: c.id, title: c.title, ...(typeof c.part === 'string' && c.part.trim() ? { part: c.part } : {}), blocks: cleanBlocks(c.blocks) });
  }
  if (chapters.length === 0) return null;
  const sources = Array.isArray(raw.sources)
    ? raw.sources.filter(isObject).filter((x) => typeof x.work === 'string' && typeof x.author === 'string' && typeof x.licence === 'string').map((x) => ({
        work: String(x.work), author: String(x.author), licence: String(x.licence),
        ...(typeof x.translator === 'string' ? { translator: x.translator } : {}), ...(typeof x.year === 'string' ? { year: x.year } : {}),
      }))
    : undefined;
  return {
    id: raw.id,
    kind: typeof raw.kind === 'string' ? (raw.kind as BookContent['kind']) : 'guide',
    title: raw.title,
    subtitle: typeof raw.subtitle === 'string' ? raw.subtitle : '',
    author: typeof raw.author === 'string' ? raw.author : null,
    chapters,
    ...(sources ? { sources } : {}),
    credit: typeof raw.credit === 'string' ? raw.credit : '',
  };
}

/* ============================================================ places on the phone */

/** The name after `u.<userId>.`: where the places are kept (see the top of this file). */
export const READING_NAME = 'library.reading';

/** Books one person can have a place in: the twelve, and room. It only keeps a damaged file from growing a list. */
export const READING_MAX_BOOKS = 40;
/** Chapters one book can have marked read: the longest book has about 170. */
export const READING_MAX_READ = 1200;

/** Where someone is in one book: the chapter, how far down it (0 to 1), when (in milliseconds), and the chapters read. */
export type BookPlace = { id: string; c: string; y: number; at: number; read: string[] };

/** What is stored: the places, the most recent first, and the book last read. `v` is the version of the shape. */
export type StoredReading = { v: 1; last: string | null; items: BookPlace[] };

export const emptyReading = (): StoredReading => ({ v: 1, last: null, items: [] });

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** The longest id of a chapter or of a book that is believed: the longest in the bundle has 50 characters, and a damaged file cannot make a place that is not a line. */
const ID_MAX = 80;

/**
 * The places in a stored value. null when what was stored is not this shape (nothing stored, a newer or damaged file): the caller then
 * starts from nothing. A place that does not read is left out, a book twice is kept once (the first, which is the newest), and a chapter
 * marked read twice is marked once. How far down a chapter is brought into 0 to 1.
 */
export function parseReading(raw: unknown): StoredReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, items, last } = raw as { v?: unknown; items?: unknown; last?: unknown };
  if (v !== 1 || !Array.isArray(items)) return null;
  const out: BookPlace[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (out.length >= READING_MAX_BOOKS) break;
    if (!item || typeof item !== 'object') continue;
    const { id, c, y, at, read } = item as { id?: unknown; c?: unknown; y?: unknown; at?: unknown; read?: unknown };
    if (typeof id !== 'string' || id.length > ID_MAX || !ID.test(id) || seen.has(id)) continue;
    if (typeof c !== 'string' || c.length === 0 || c.length > ID_MAX) continue;
    seen.add(id);
    const marked: string[] = [];
    if (Array.isArray(read)) {
      const once = new Set<string>();
      for (const r of read) {
        if (marked.length >= READING_MAX_READ) break;
        if (typeof r === 'string' && r.length > 0 && r.length <= ID_MAX && !once.has(r)) { once.add(r); marked.push(r); }
      }
    }
    out.push({ id, c, y: clamp01(typeof y === 'number' ? y : 0), at: typeof at === 'number' && Number.isFinite(at) ? at : 0, read: marked });
  }
  const lastId = typeof last === 'string' && seen.has(last) ? last : (out[0]?.id ?? null);
  return { v: 1, last: lastId, items: out };
}

export const packReading = (r: StoredReading): StoredReading => ({ v: 1, last: r.last, items: r.items.map((p) => ({ id: p.id, c: p.c, y: p.y, at: p.at, read: [...p.read] })) });

/** The place in one book, or null. */
export const placeOf = (r: StoredReading, bookId: string): BookPlace | null => r.items.find((p) => p.id === bookId) ?? null;

/** The chapters of one book that are read. */
export const readSet = (r: StoredReading, bookId: string): ReadonlySet<string> => new Set(placeOf(r, bookId)?.read ?? []);

/** The same places with the book put in front (newest first) and `last` set to it; the rest of what is stored is kept. Does not change what it is given. */
function put(r: StoredReading, place: BookPlace): StoredReading {
  const items = [place, ...r.items.filter((p) => p.id !== place.id)].slice(0, READING_MAX_BOOKS);
  return { v: 1, last: place.id, items };
}

/** Where the person is now: this chapter of this book, this far down. Nothing is changed for an empty id. */
export function savePlace(r: StoredReading, bookId: string, chapterId: string, y: number, now: number): StoredReading {
  if (!bookId || !chapterId) return r;
  const before = placeOf(r, bookId);
  return put(r, { id: bookId, c: chapterId, y: clamp01(y), at: now, read: before?.read ?? [] });
}

/** The same places with this chapter marked read. The place is not moved: what is read is not the same as where the person is. */
export function markRead(r: StoredReading, bookId: string, chapterId: string, now: number): StoredReading {
  if (!bookId || !chapterId) return r;
  const before = placeOf(r, bookId);
  if (before?.read.includes(chapterId)) return r;
  const read = [...(before?.read ?? []), chapterId].slice(-READING_MAX_READ);
  const place: BookPlace = before ? { ...before, read } : { id: bookId, c: chapterId, y: 0, at: now, read };
  const items = r.items.some((p) => p.id === bookId) ? r.items.map((p) => (p.id === bookId ? place : p)) : [place, ...r.items].slice(0, READING_MAX_BOOKS);
  return { v: 1, last: r.last ?? bookId, items };
}

/**
 * The book read last that still has a text (`has`): where "Continue reading" on the Books tab goes. A place in a book that has no text
 * (the text was taken out of a later version) is never offered.
 */
export function lastRead(r: StoredReading, has: (id: string) => boolean): BookPlace | null {
  const last = r.last ? placeOf(r, r.last) : null;
  if (last && has(last.id)) return last;
  return r.items.filter((p) => has(p.id)).sort((a, b) => b.at - a.at)[0] ?? null;
}

/* ============================================================ where to open */

export type Resume = {
  /** The chapter to open. */
  index: number;
  /** How far down it, 0 to 1. */
  y: number;
  /** Nothing usable was saved: the book opens at its first chapter, from the top. */
  fresh: boolean;
};

/**
 * Where a book opens: the saved chapter, this far down. No place, a place about a chapter the text does not have, or a damaged one all give
 * the start of the book. A chapter that was read to its last lines (FINISHED_AT) gives the next chapter from its top, so "Continue" does
 * not put someone at the bottom of a chapter they are done with; after the last chapter it gives that chapter from the top.
 */
export function resumeAt(chapters: readonly ChapterRef[], place: Pick<BookPlace, 'c' | 'y'> | null | undefined): Resume {
  const start: Resume = { index: 0, y: 0, fresh: true };
  if (chapters.length === 0 || !place) return start;
  const i = chapterIndex(chapters, place.c);
  if (i < 0) return start;
  const y = clamp01(place.y);
  if (y >= FINISHED_AT) return { index: Math.min(i + 1, chapters.length - 1), y: 0, fresh: false };
  return { index: i, y, fresh: false };
}

/** How far down to open this chapter: where the person was in it, when this is the chapter that was saved and not finished, else the top. */
export function startAt(place: Pick<BookPlace, 'c' | 'y'> | null | undefined, chapterId: string): number {
  if (!place || place.c !== chapterId) return 0;
  const y = clamp01(place.y);
  return y >= FINISHED_AT ? 0 : y;
}

/** The label of the button on a book page: "Start reading" the first time, "Continue: Chapter 7" after. */
export function readButtonLabel(chapters: readonly ChapterRef[], place: Pick<BookPlace, 'c' | 'y'> | null | undefined): string {
  const r = resumeAt(chapters, place);
  return r.fresh ? 'Start reading' : `Continue: ${shortTitle(chapters[r.index].title)}`;
}

/** What a screen reader says for it: the whole title of the chapter, and its part when it has one. */
export function readButtonSpoken(chapters: readonly ChapterRef[], place: Pick<BookPlace, 'c' | 'y'> | null | undefined): string {
  const r = resumeAt(chapters, place);
  if (r.fresh) return 'Start reading';
  const c = chapters[r.index];
  const part = partOf(c);
  return `Continue: ${part ? `${partName(part)}, ` : ''}${c.title}`;
}
