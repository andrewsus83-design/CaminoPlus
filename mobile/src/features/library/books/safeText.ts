import { hasBookText, loadBookText } from './bookText';
import type { BookText } from './bookTextTypes';

/**
 * The text of a book, or null: the book has none, or its text cannot be read (a damaged file). The screens never trust a text to be there, so a book whose
 * text fails to load is shown as a book that is not in the app yet, and nothing throws.
 */
export function safeText(id: string): BookText | null {
  try {
    if (!hasBookText(id)) return null;
    const text = loadBookText(id);
    return text && Array.isArray(text.chapters) && text.chapters.length > 0 ? text : null;
  } catch {
    return null;
  }
}
