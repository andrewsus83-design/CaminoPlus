import { useMemo } from 'react';
import { loadBookContent, CATALOG } from './bookBundle';
import { findBook, type BookContent, type CatalogBook } from './books';

/** A book of the bundle: its catalog entry and its text. */
export type OpenBook = { book: CatalogBook; content: BookContent };

/**
 * The book with this id, read from the bundle when the screen opens it (the text is parsed only now, never when the Library lists the books).
 * Null when the catalog has no such book (a link, a bookmark or a note from an earlier version), or its text cannot be read: the screens say
 * the book is not here, they never throw.
 */
export function useBook(id: string | undefined): OpenBook | null {
  return useMemo(() => {
    const book = findBook(CATALOG, id);
    if (!book) return null;
    try {
      const content = loadBookContent(book.id);
      return content && Array.isArray(content.chapters) ? { book, content } : null;
    } catch {
      return null;
    }
  }, [id]);
}
