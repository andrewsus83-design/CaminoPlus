import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { BookmarkToggle } from '@/features/library/BookmarkToggle';
import { ChapterNumbers } from '@/features/library/bible/ChapterGrid';
import { MISSING_BOOK, PlaceMissing } from '@/features/library/bible/PlaceMissing';
import { bookByCode, chaptersLabel } from '@/features/library/bible/books';
import { CHAPTERS_NOTE } from '@/features/library/bible/credit';
import { readerHref } from '@/features/library/bible/order';
import { itemKey } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { role } from '@/theme';

// Library > Bible > a book: its chapters as a grid of numbered square tiles (4 in a row on a 320 wide phone, 5 on 390, 6 on 430), the name of the book as the
// title, how many chapters it has, one handwritten note, and, in the corner, the bookmark of the BOOK (a tile of the Bible tab is too small to carry one). The
// address is /library/bible/<code>; a tile opens /library/bible/<code>/<chapter>. A code that is no book is a calm "not found" with a way back. Bookmarks kept
// under the id of a book ("bible:bible-genesis") are this same button's: the Bookmarks screen opens this screen for them.
export default function BibleBook() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();
  const marks = useLibraryBookmarks();
  const book = bookByCode(typeof code === 'string' ? code.toUpperCase() : '');
  if (!book) return <PlaceMissing message={MISSING_BOOK} />;
  const key = itemKey('Bible', book.id);
  return (
    <Screen tabBar={false}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <BackButton fallback="/library" />
        <BookmarkToggle on={marks.has(key)} title={book.name} toggle={() => marks.toggle(key)} />
      </View>
      <View style={{ gap: 2 }}>
        <AppText variant="h2" accessibilityRole="header">{book.name}</AppText>
        <AppText variant="mono" muted style={{ fontSize: 15, lineHeight: 22 }}>{chaptersLabel(book.chapters)}</AppText>
        <AppText variant="accent" color={role.accentText}>{CHAPTERS_NOTE}</AppText>
      </View>
      <ChapterNumbers book={book} onOpen={(n) => router.push(readerHref({ code: book.code, chapter: n }))} />
    </Screen>
  );
}
