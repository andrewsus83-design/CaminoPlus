import { AppText } from '@/components/AppText';
import { SampleNotice } from '@/components/SampleNotice';
import { hasBookText } from './bookText';
import { BOOK_CATALOG } from './catalog';
import { booksNotice } from './copy';

/**
 * What stands under the banner of the Books tab, said honestly (copy.ts booksNotice): while no book has a text, the Preview notice; while some have, one quiet line
 * that says how many are in the app (and that they work with no signal) and that the others say Soon while their editions are checked; with all twelve, nothing.
 * What a book has is asked of bookText.ts, never kept here.
 */
export function BooksNotice() {
  const readable = BOOK_CATALOG.filter((b) => hasBookText(b.id)).length;
  const notice = booksNotice(readable, BOOK_CATALOG.length);
  if (!notice) return null;
  if (notice.kind === 'card') return <SampleNotice title={notice.title}>{notice.text}</SampleNotice>;
  return <AppText variant="caption" muted>{notice.text}</AppText>;
}
