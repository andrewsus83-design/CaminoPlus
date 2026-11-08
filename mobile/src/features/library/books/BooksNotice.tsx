import { SampleNotice } from '@/components/SampleNotice';
import { hasBookText } from './bookText';
import { BOOK_CATALOG } from './catalog';
import { booksNotice } from './copy';

/**
 * The notice under the banner of the Books tab: what is still missing, said honestly. With no text in any book it is the Preview notice, with some it says
 * how many are in the app (and that they work with no signal) and that the others say Soon while their editions are checked; with all twelve there is none.
 * What a book has is asked of bookText.ts, never kept here.
 */
export function BooksNotice() {
  const readable = BOOK_CATALOG.filter((b) => hasBookText(b.id)).length;
  const notice = booksNotice(readable, BOOK_CATALOG.length);
  return notice ? <SampleNotice title={notice.title}>{notice.text}</SampleNotice> : null;
}
