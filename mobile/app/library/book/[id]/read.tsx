import { useLocalSearchParams } from 'expo-router';
import { Reader } from '@/features/library/books/Reader';
import { passageParam } from '@/features/library/books/passages';

// Library > Books > a book > the reader: one chapter of the book, as a good reading app shows it. The address is /library/book/<id>/read, with ?c=<chapter> for a
// chapter (/library/book/imitation-of-christ/read?c=c12) and without it for the chapter and the line where the person stopped (the book's first chapter for a
// book never opened), so the contents, the banner of the Books tab and a link all lead here the same way. A book with no text, or a chapter the text does not have,
// shows the book page with a sentence that says so, never a crash and never a blank. With ?p=<block> next to ?c= it opens at that passage, chosen and scrolled into view
// (a bookmarked passage of the Bookmarks screen leads here); a passage the chapter does not have is ignored. The reader is features/library/books/Reader.tsx; Previous and Next replace
// this screen, so Back goes to where the reader came from and not through every chapter read.
export default function BookReader() {
  const { id, c, p } = useLocalSearchParams<{ id?: string; c?: string; p?: string }>();
  const passage = typeof c === 'string' && c ? passageParam(p) : undefined;
  return <Reader key={`${typeof id === 'string' ? id : ''}.${typeof c === 'string' ? c : ''}.${passage ?? ''}`} id={typeof id === 'string' ? id : ''} chapterId={typeof c === 'string' && c ? c : undefined} passage={passage} />;
}
