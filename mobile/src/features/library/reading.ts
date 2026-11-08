// Where each book was last read, for "Continue reading": a pure module (no React, no React Native, nothing stored here; plain node tests
// cover it, npm run test:library). useReadingPlaces.ts keeps it on the phone.
//
// Only on this phone, per person, under `u.<userId>.library.reading` (lib/localStore.ts userKey): logging out clears it, like the
// bookmarks. It is a convenience of this phone, separate from the bookmarks (a bookmark is something the pilgrim chose to keep; this is just
// "where was I"), and it remembers the chapter or day, not the scroll position: a chapter is a few minutes of reading.
import type { CatalogBook } from './books';

/** The name after `u.<userId>.`. */
export const READING_NAME = 'library.reading';

/** Books whose place is remembered. Far above the twenty there are; it only keeps a damaged file from growing a list. The oldest go first. */
export const READING_MAX = 100;

/** The last place read in one book: the chapter's id and when, in milliseconds. */
export type ReadingPlace = { bookId: string; chapterId: string; at: number };

/** What is stored: one place per book, the most recently read first. `v` is the version of the shape. */
export type StoredReading = { v: 1; items: ReadingPlace[] };

/**
 * The places in a stored value. null when what was stored is not this shape (nothing, a newer or damaged file): the caller then starts from
 * an empty list. An item that does not read is skipped, a book twice is kept once (the first, which is the most recent).
 */
export function parseReading(raw: unknown): ReadingPlace[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, items } = raw as { v?: unknown; items?: unknown };
  if (v !== 1 || !Array.isArray(items)) return null;
  const out: ReadingPlace[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (out.length >= READING_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const { bookId, chapterId, at } = item as { bookId?: unknown; chapterId?: unknown; at?: unknown };
    if (typeof bookId !== 'string' || bookId.length === 0 || bookId.length > 80 || seen.has(bookId)) continue;
    if (typeof chapterId !== 'string' || chapterId.length === 0 || chapterId.length > 120) continue;
    seen.add(bookId);
    out.push({ bookId, chapterId, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 });
  }
  return out;
}

export const packReading = (list: readonly ReadingPlace[]): StoredReading => ({ v: 1, items: list.map((p) => ({ bookId: p.bookId, chapterId: p.chapterId, at: p.at })) });

/** The list with this place in front (the book's earlier place replaced), at most READING_MAX. The list it is given is not changed. */
export function rememberPlace(list: readonly ReadingPlace[], bookId: string, chapterId: string, now: number): ReadingPlace[] {
  return [{ bookId, chapterId, at: now }, ...list.filter((p) => p.bookId !== bookId)].slice(0, READING_MAX);
}

/**
 * Where "Continue reading" goes in a book: the chapter last read, when the book still has it, and `resumed` is true; otherwise the first
 * chapter (a book never read, or a chapter that a new edition does not have any more), and `resumed` is false: the button then says
 * "Start reading". Null for a book with no chapters.
 */
export function resumePoint(book: Pick<CatalogBook, 'id' | 'chapters'>, list: readonly ReadingPlace[]): { chapterId: string; title: string; resumed: boolean } | null {
  if (book.chapters.length === 0) return null;
  const last = list.find((p) => p.bookId === book.id);
  const at = last ? book.chapters.find((c) => c.id === last.chapterId) : undefined;
  const chapter = at ?? book.chapters[0];
  return { chapterId: chapter.id, title: chapter.title, resumed: !!at };
}
