// The books of the Library as data: the types of the bundle that tools/build_books.py writes (mobile/assets/library), and the small pure
// functions the screens use. No React, no React Native and no JSON import here, so plain node tests cover it (npm run test:library); the
// one module that reads the bundle is bookBundle.ts (generated), and the screens hand its catalog to the functions below.
//
// The books are in the app itself (bundled), so they read without a signal. Nothing here is fetched.
import type { CoverColour } from './sample';

export type BookKind = 'guide' | 'reflection';
export type CoverIcon = 'library' | 'book' | 'chat';

/** A piece of text with its marks: {t:'word'} plus i (italic), b (bold) or href (a link). */
export type Span = { t: string; i?: 1; b?: 1; href?: string };

/** What a chapter is made of (tools/book_kit.py: parse_markdown). A chapter's own title is not a block, it is `title`. */
export type Block =
  | { t: 'h'; level: number; spans: Span[] }
  | { t: 'p'; spans: Span[] }
  | { t: 'ul' | 'ol'; items: Span[][] }
  | { t: 'quote'; paras: Span[][]; cite: Span[] | null }
  | { t: 'hr' };

export type CatalogChapter = { id: string; title: string; minutes: number };

/** One entry of catalog.json: what the Library shows and what the contents page lists. */
export type CatalogBook = {
  id: string;
  kind: BookKind;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  words: number;
  minutes: number;
  cover: { colour: CoverColour; icon: CoverIcon };
  route_slug?: string;
  chapters: CatalogChapter[];
};

/** One book's text (books/<id>.json). */
export type BookContent = {
  id: string;
  kind: BookKind;
  title: string;
  subtitle: string;
  author: string;
  rights: string;
  ai_disclosure: string;
  sources?: { work: string; author: string; translator: string; year: string; licence: string }[];
  chapters: { id: string; title: string; blocks: Block[] }[];
};

/** A book as a row of the Books tab, a search result and a bookmark: the shape of the example covers, with a little more. */
export type LibraryBook = {
  id: string;
  title: string;
  kind: string;             // the line under the cover: "Guide · 3 h 20 min"
  colour: CoverColour;
  icon: CoverIcon;
  subtitle: string;
  minutes: number;
};

const KIND_LABEL: Record<BookKind, string> = { guide: 'Guide', reflection: 'Readings' };

export const kindLabel = (kind: BookKind): string => KIND_LABEL[kind] ?? 'Book';

/** "45 min", "2 h 24 min", "3 h": the same words as the build prints (tools/book_kit.py: format_minutes). */
export function formatMinutes(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (h === 0) return `${r} min`;
  return r === 0 ? `${h} h` : `${h} h ${r} min`;
}

/** "Guide · 3 h 20 min": what is written under a cover. */
export const coverCaption = (b: Pick<CatalogBook, 'kind' | 'minutes'>): string => `${kindLabel(b.kind)} · ${formatMinutes(b.minutes)}`;

/** The books of the catalog as rows, in the order the catalog sets (guides first, then the readings). */
export function libraryBooks(catalog: readonly CatalogBook[]): LibraryBook[] {
  return [...catalog]
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    .map((b) => ({ id: b.id, title: b.title, kind: coverCaption(b), colour: b.cover.colour, icon: b.cover.icon, subtitle: b.subtitle, minutes: b.minutes }));
}

/** A book of the catalog by its id (an id from a link or a bookmark may be one that is not there any more: then null). */
export const findBook = (catalog: readonly CatalogBook[], id: string | undefined): CatalogBook | null =>
  (id ? catalog.find((b) => b.id === id) : undefined) ?? null;

/** The place of a chapter in its book, and the chapters on each side of it; null when the book has no such chapter. */
export function chapterPlace(chapters: readonly { id: string }[], id: string | undefined) {
  const i = id ? chapters.findIndex((c) => c.id === id) : -1;
  if (i < 0) return null;
  return { index: i, count: chapters.length, prev: i > 0 ? chapters[i - 1].id : null, next: i < chapters.length - 1 ? chapters[i + 1].id : null };
}

/** The text of a span list without its marks (a screen reader label, a search). */
export const spansText = (spans: readonly Span[]): string => spans.map((s) => s.t).join('');

/** The first thing to say about where a book comes from: for the contents page, one line. */
export function creditLine(book: Pick<BookContent, 'sources' | 'author'>): string {
  const s = book.sources?.[0];
  return s ? `${s.work}, ${s.author}. Translated by ${s.translator} (${s.year}). ${s.licence}.` : `By ${book.author}.`;
}

/** The words of a block without its marks, on one line: what a search, a screen reader label, a bookmark row and a note's quote are made of. A break has none. */
export function blockText(block: Block): string {
  const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
  switch (block.t) {
    case 'h':
    case 'p':
      return squash(spansText(block.spans));
    case 'ul':
    case 'ol':
      return squash(block.items.map(spansText).join(' '));
    case 'quote':
      return squash(block.paras.map(spansText).join(' '));
    default:
      return '';
  }
}

/** At most `max` characters of a text, cut at a word where there is one and ended with an ellipsis; never in the middle of an emoji. */
export function snippet(text: string, max: number): string {
  if (text.length <= max) return text;
  let end = max - 1;
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1; // the first half of a pair: leave it out
  const cut = text.slice(0, end);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** The chapter of a book's text by its id, or null. */
export const findChapter = <C extends { id: string }>(chapters: readonly C[], id: string | undefined): C | null => (id ? chapters.find((c) => c.id === id) : undefined) ?? null;

/** How many days a reflection book has: its chapters titled "Day 1. ...", "Day 2. ...". Zero for a book that has none (a guide). */
export const dayCount = (book: Pick<CatalogBook, 'chapters'>): number => book.chapters.filter((c) => /^day\s+\d+\b/i.test(c.title)).length;

/** "Readings · 2 h 45 min · 21 days": the line under the title of a book on its own screen; a guide has no days. */
export function bookLine(book: Pick<CatalogBook, 'kind' | 'minutes' | 'chapters'>): string {
  const days = dayCount(book);
  return days > 0 ? `${coverCaption(book)} · ${days} ${days === 1 ? 'day' : 'days'}` : coverCaption(book);
}
