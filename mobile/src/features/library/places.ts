// The chapters, days and paragraphs a pilgrim bookmarked, as rows for the Bookmarks screen: a pure module (no React, no React Native;
// plain node tests cover it, npm run test:library). The bookmark of a whole book is a row of the Books tab (search.ts hitsForKeys); these are
// the smaller places, kept under the same anchors the notes use (notes/anchor.ts).
import { bookPlaceOf } from '../notes/anchor';
import { isNotable } from '../notes/blocks';
import { blockText, findBook, findChapter, snippet, type BookContent, type CatalogBook } from './books';

/** A bookmarked chapter, day or paragraph, ready to be drawn and opened. */
export type BookPlace = {
  /** The bookmark key: the anchor. */
  key: string;
  level: 'chapter' | 'paragraph';
  bookId: string;
  chapterId: string;
  /** The block index for a paragraph, else null. */
  block: number | null;
  /** What the row says: the title of the chapter or day, or the first words of the paragraph. */
  title: string;
  /** Where it is, under that: the book (for a chapter), the chapter and the book (for a paragraph). */
  line: string;
};

/** The longest stretch of a paragraph a row shows. */
export const PLACE_SNIPPET_MAX = 140;

/**
 * The places of these bookmark keys (newest first, as they are kept). A key that is not a chapter or a paragraph of a book (an example row, a
 * whole book, an anchor of another kind), or whose book, chapter or paragraph is not there any more (the text of a book can be revised), is
 * left out: it stays in the saved list, it just shows nothing. `load` reads a book's text, only asked for when there is a paragraph to show,
 * and only once for each book.
 */
export function bookPlaces(keys: readonly string[], catalog: readonly CatalogBook[], load: (bookId: string) => BookContent | null): BookPlace[] {
  const out: BookPlace[] = [];
  const texts = new Map<string, BookContent | null>();
  const text = (id: string) => {
    if (!texts.has(id)) texts.set(id, load(id));
    return texts.get(id) ?? null;
  };
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const a = bookPlaceOf(key);
    if (!a || a.chapterId === null) continue;
    const book = findBook(catalog, a.bookId);
    const chapter = book ? findChapter(book.chapters, a.chapterId) : null;
    if (!book || !chapter) continue;
    if (a.block === null) {
      out.push({ key, level: 'chapter', bookId: book.id, chapterId: chapter.id, block: null, title: chapter.title, line: book.title });
      continue;
    }
    const block = findChapter(text(book.id)?.chapters ?? [], chapter.id)?.blocks[a.block];
    if (!isNotable(block)) continue;
    out.push({ key, level: 'paragraph', bookId: book.id, chapterId: chapter.id, block: a.block, title: snippet(blockText(block!), PLACE_SNIPPET_MAX), line: `${chapter.title} · ${book.title}` });
  }
  return out;
}
