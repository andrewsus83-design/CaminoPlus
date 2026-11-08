// A note grown into a Diary page: the page it makes, as a pure function (no React, no network; plain node tests cover it, npm run test:notes).
// The Diary's own store writes it (growIntoDiaryPage in useNotes.ts, through features/diary/storage.ts saveEntry), under the Diary's own limits.
// Nothing about the Diary changes: a page is a title and a body of the Diary's small rich text (diary/richtext.ts: "> " is a quote line).
import { clip } from '../diary/present';
import { BODY_MAX, TITLE_MAX } from '../diary/store';
import type { Note } from './notes';

/** What names the place a note is on, from the book: the title of the book and of the chapter or day, when they are known. */
export type NoteTitles = { book?: string | null; chapter?: string | null };

/**
 * The title and the text of the Diary page for a note. The title is the chapter or day (else the book, else "A note from a book"), cut to the
 * Diary's title limit; the text is the words the note was made on as a quote line, then the pilgrim's words. A reflection says so in its title and
 * has no quote line (the words it was made on are the name of the day, which the title already is). The text is cut to the Diary's page limit (a note
 * is never longer than that, so only a very long quote could be: it is the quote that gives way).
 */
export function diaryDraft(note: Pick<Note, 'quote' | 'text' | 'type'>, titles: NoteTitles): { title: string; body: string } {
  const place = (titles.chapter ?? '').trim() || (titles.book ?? '').trim() || 'A note from a book';
  const title = clip(note.type === 'reflection' ? `Reflection: ${place}` : place, TITLE_MAX);
  const quote = note.type === 'reflection' ? '' : note.quote.trim();
  const text = note.text.trim();
  const head = quote ? `> ${quote}\n\n` : '';
  const room = Math.max(0, BODY_MAX - text.length - 2);
  const body = head && head.length <= room ? `${head}${text}` : text;
  return { title, body: body.slice(0, BODY_MAX) };
}
