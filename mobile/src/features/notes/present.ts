// The words of the notes, as plain constants and pure functions (no React): what the screens say, so one test can read them all against the
// brand voice (calm, plain, honest, "pilgrim" not "user") and against what the app really does.
import { shownQuery } from '../library/search';
import { NOTE_TEXT_MAX, NOTES_MAX, type NoteProblem } from './notes';

/** Said where the notes are listed (the Notebook), honestly: where they are, what that means, and what clears them. */
export const NOTES_PRIVACY_LINE = 'Only on this phone. Notes are not uploaded and not shared. Logging out clears them, and if you delete the app or lose this phone, they are gone.';
/** The short form, in the sheet where a note is written. */
export const NOTE_SHEET_PRIVACY = 'Only on this phone, never uploaded. Logging out clears your notes.';

export const NOTEBOOK_EMPTY_TITLE = 'No notes yet';
export const NOTEBOOK_EMPTY = 'When you add a note beside a paragraph in a book, or write a reflection at the end of a day, it will be here.';
export const NOTEBOOK_HINT = 'Tap a paragraph in a book, then Add a note.';

/** The reader's one line of help under the title of a chapter. */
export const READER_HINT = 'Tap a paragraph to bookmark it or add a note beside it. Notes stay on this phone.';

export const thousands = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** When the stored notes could not be read: nothing is changed, and it says so. */
export const NOTES_BLOCKED = 'Your notes could not be read on this phone, so nothing was changed. What is stored there is untouched.';

/** The gentle sentence for a note that was not written. */
export function noteProblemMessage(p: NoteProblem): string {
  switch (p) {
    case 'empty': return 'Write a few words first.';
    case 'too-long': return `A note can have up to ${thousands(NOTE_TEXT_MAX)} characters. Your words are still here: you can shorten them, or keep the rest in a Diary page.`;
    case 'too-many': return `You have ${thousands(NOTES_MAX)} notes, the most this phone keeps. Delete an old note to save this one.`;
    case 'full': return 'Your notes are full. Your words are still here, so copy them, delete an old note, then add them again.';
    case 'bad-anchor': return 'This note could not be attached to its place. Nothing was changed.';
    case 'not-found': return 'That note is not here any more.';
    case 'blocked': return NOTES_BLOCKED;
    default: return 'This note could not be saved. Your phone may be full. Your words are still here, so copy them before you leave.';
  }
}

/** When a change could not be written to the phone and was undone. */
export const NOTES_NOT_SAVED = 'That note could not be saved on this phone. Please try again.';

/** "Tuesday 4 November", the day a note was written; empty when the date does not read. */
export function noteDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const day = `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? day : `${day} ${d.getFullYear()}`;
}

/** "3 notes", "1 note". */
export const notesLabel = (n: number) => `${n} ${n === 1 ? 'note' : 'notes'}`;

export const GROW_LABEL = 'Grow into a Diary page';
export const GROW_DONE_HINT = 'Opens the new page in your Diary.';
export const GROW_NOTE = 'A Diary page is yours to keep: logging out leaves the pages of your Diary.';

/** "3 notes for “road”", "1 note for “psalms”", "Nothing found for “zzz”": the line over a search of the Notebook. */
export function notesResultsLine(count: number, query: string): string {
  const q = shownQuery(query);
  return count === 0 ? `Nothing found for “${q}”` : `${notesLabel(count)} for “${q}”`;
}
export const NOTES_NOTHING_FOUND_HINT = 'Check the spelling, try a shorter word, or clear the search to see all your notes.';
