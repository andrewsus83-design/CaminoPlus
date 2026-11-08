import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { radius, role, space } from '@/theme';
import { BookmarkToggle } from '../BookmarkToggle';
import { itemKey } from '../search';
import type { LibraryMarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import type { CatalogBook } from './catalog';
import { bookPath, kindMark, kindName } from './copy';
import { coverLabel } from './cover';
import { formatMinutes } from './reading';

// The books as rows, one under the other, for a list of results (the search) and for the Bookmarks screen: the Books tab itself draws them as covers
// (BooksGrid.tsx). A row is a small cover, the title in Fraunces, the subtitle, the description (at most three lines), and a small mark with the kind of book and how long it
// takes. The row is ONE button that opens the book page; the bookmark button is another one beside it, not inside it.
// The card holds its rows at 20 from its edge (4 of the card and 16 of the row, 8 at the end where the bookmark button is, which is itself 48 wide).

/** The width of the small cover in a row; it is an A5 page that wide (74 high). */
export const THUMB_WIDTH = 52;

/** The kind of book as a small label: caps in mono on a pale ground ("GUIDE", "READINGS"), with 8 above and below the words and 12 at the sides like every pill. */
const Mark = ({ kind }: { kind: string }) => (
  <View accessibilityLabel={kindName(kind)} style={{ alignSelf: 'flex-start', paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.pill, backgroundColor: role.sunken }}>
    <AppText variant="mono" color={role.muted}>{kindMark(kind)}</AppText>
  </View>
);

export function BookRows({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  return (
    <Card style={{ padding: space[1] }}>
      {items.map((b, i) => {
        const key = itemKey('Books', b.id);
        return (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingLeft: space[4], paddingRight: marks ? space[2] : space[4], paddingVertical: space[3], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={coverLabel(b)}
              accessibilityHint="Opens the book"
              onPress={() => router.push(bookPath(b.id))}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: space[4], paddingVertical: space[1], opacity: pressed ? 0.7 : 1 })}
            >
              <BookCover book={b} width={THUMB_WIDTH} thumb />
              <View style={{ flex: 1, minWidth: 0, gap: space[1] }}>
                <AppText variant="h5">{b.title}</AppText>
                <AppText variant="caption" muted>{b.subtitle}</AppText>
                <AppText variant="small" numberOfLines={3}>{b.description}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: space[3], rowGap: space[1] }}>
                  <Mark kind={b.kind} />
                  <AppText variant="mono" muted>{formatMinutes(b.minutes)}</AppText>
                </View>
              </View>
            </Pressable>
            {marks && <BookmarkToggle on={marks.has(key)} title={b.title} toggle={() => marks.toggle(key)} />}
          </View>
        );
      })}
    </Card>
  );
}
