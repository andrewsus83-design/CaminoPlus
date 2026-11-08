import { loadBookContent } from '../bookBundle';
import type { BookContent } from './index';
import { cleanBook } from './reading';

/**
 * The text of a book, or null: the bundle has no such book, or its text cannot be read (a damaged file, no chapter in it). The screens never trust a text to be there, so
 * a book whose text fails to load is shown as a book that could not be opened, and nothing throws. What is returned has only the chapters and blocks that read (reading.ts
 * cleanBook), so the page and the reader do not have to ask.
 */
export function safeText(id: string): BookContent | null {
  try {
    return cleanBook(loadBookContent(id));
  } catch {
    return null;
  }
}
