// What a new note starts with, for the key that the diary's page for a new note is given (/diary/new?quote=<key>): a passage of a book of the Library ("books:...") or a verse of the Bible
// ("bible:..."). A key that finds nothing gives null, and a blank note opens. This is the one file that knows both texts, so that the diary's page asks only this.
import { hasBook, loadBook } from './bible/text';
import { noteStartForVerseKey } from './bible/verseRows';
import { noteStartForKey } from './books/passages';
import { safeText } from './books/safeText';

export function noteStartFor(key: string): string | null {
  if (key.startsWith('bible:')) return noteStartForVerseKey(key, { hasBook, loadBook });
  return noteStartForKey(key, safeText);
}
