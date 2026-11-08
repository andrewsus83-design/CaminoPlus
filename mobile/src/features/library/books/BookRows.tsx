import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { radius, role } from '@/theme';
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

/** The width of the small cover in a row; it is an A5 page that wide (74 high). */
export const THUMB_WIDTH = 52;

/** The kind of book as a small label: caps in mono on a pale ground ("GUIDE", "READINGS"). */
const Mark = ({ kind }: { kind: string }) => (
  <View accessibilityLabel={kindName(kind)} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
    <AppText variant="mono" color={role.muted} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1 }}>{kindMark(kind)}</AppText>
  </View>
);

export function BookRows({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  return (
    <Card style={{ padding: 4 }}>
      {items.map((b, i) => {
        const key = itemKey('Books', b.id);
        return (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 12, paddingRight: marks ? 6 : 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={coverLabel(b)}
              accessibilityHint="Opens the book"
              onPress={() => router.push(bookPath(b.id))}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <BookCover book={b} width={THUMB_WIDTH} thumb />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <AppText variant="h4" style={{ fontSize: 19, lineHeight: 24 }}>{b.title}</AppText>
                <AppText variant="caption" muted>{b.subtitle}</AppText>
                <AppText variant="small" numberOfLines={3}>{b.description}</AppText>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Mark kind={b.kind} />
                  <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 19 }}>{formatMinutes(b.minutes)}</AppText>
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
