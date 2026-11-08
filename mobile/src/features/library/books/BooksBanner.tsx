import { useRouter } from 'expo-router';
import { CompactBanner } from '../LibraryBanner';
import { BOOK_CATALOG } from './catalog';
import { bookPath, booksBanner } from './copy';

/**
 * The banner of the Books tab: the compact one of the Bible tab (LibraryBanner.tsx CompactBanner: the same card, the same fonts, the same gold pill), with
 * words of its own, in one of two states (copy.ts booksBanner):
 *  - the bundle holds no book: it says plainly that there is none to show, and has no button;
 *  - there is a book: "Start reading" opens the page of the first book, with one short handwritten note beside the button.
 * The whole card is ONE button for a screen reader when it has a button, as on the Bible tab.
 *
 * It does not continue a book any more. Going back to the place read last, in a book or in the Bible, is the "Continue reading" bar that floats above the tab bar
 * (features/library/continueBar), on this tab and on the Bible tab alike, so the banner no longer asks for the place: it passes none to booksBanner, which still has a
 * state for it ("Continue reading") that this banner never reaches.
 */
export function BooksBanner() {
  const router = useRouter();
  const view = booksBanner(BOOK_CATALOG, null);
  if (view.kind === 'none') return <CompactBanner label={view.label} title={view.title} line={view.line} />;
  return <CompactBanner label={view.label} title={view.title} note={view.note} cta={view.cta} onPress={() => router.push(bookPath(view.bookId))} hint={view.hint} />;
}
