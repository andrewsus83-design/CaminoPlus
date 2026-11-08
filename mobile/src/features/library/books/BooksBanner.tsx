import { useRouter } from 'expo-router';
import { CompactBanner } from '../LibraryBanner';
import type { BooksReading } from './useBooksReading';
import { hasBookText } from './bookText';
import { BOOK_CATALOG } from './catalog';
import { bookPath, booksBanner, readerPath } from './copy';

/**
 * The banner of the Books tab: the compact one of the Bible tab (LibraryBanner.tsx CompactBanner: the same card, the same fonts, the same gold pill), with
 * words of its own, in one of three states (copy.ts booksBanner):
 *  - no book has a text yet: it says plainly that the texts are being checked, and has no button;
 *  - there is one and nothing was read: "Start reading" opens the first book that has a text, with one short handwritten note beside the button;
 *  - something was read: "Continue reading" opens the reader of the book read last, at the chapter and the line where the person stopped.
 * The whole card is ONE button for a screen reader when it has a button, as on the Bible tab. `reading` is what the screen read from the phone
 * (useBooksReading); until it has been read the banner offers "Start", which is also what a person who has read nothing sees.
 */
export function BooksBanner({ reading }: { reading: BooksReading }) {
  const router = useRouter();
  const view = booksBanner(BOOK_CATALOG, hasBookText, reading.last);
  if (view.kind === 'none') return <CompactBanner label={view.label} title={view.title} line={view.line} />;
  const open = () => router.push(view.kind === 'continue' ? readerPath(view.bookId) : bookPath(view.bookId));
  return <CompactBanner label={view.label} title={view.title} note={view.note} cta={view.cta} onPress={open} hint={view.hint} />;
}
