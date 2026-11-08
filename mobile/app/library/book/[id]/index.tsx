import { Redirect, useLocalSearchParams } from 'expo-router';
import { BookPage } from '@/features/library/books/BookPage';
import { readerPath } from '@/features/library/books/copy';

// Library > Books > a book: its page (the cover, the blurb, "Start reading" or "Continue: Chapter 7", the contents), or, for a book with no text, "Not in the app
// yet". The address is /library/book/<id>; a cover of the Books tab, a bookmark, a search result and the banner all lead here the same way, and it works as a first
// screen (Back then goes to the Library). An id that is no book of the twelve is a calm "not found" with a way on. A link that names a chapter
// (/library/book/imitation-of-christ?c=c12) goes on to the reader at that chapter, which is /library/book/<id>/read?c=<chapter>.
export default function Book() {
  const { id, c } = useLocalSearchParams<{ id?: string; c?: string }>();
  const book = typeof id === 'string' ? id : '';
  const chapter = typeof c === 'string' && c ? c : null;
  if (book && chapter) return <Redirect href={readerPath(book, chapter)} />;
  return <BookPage id={book} />;
}
