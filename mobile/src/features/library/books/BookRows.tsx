import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { c, radius, role } from '@/theme';
import { BookmarkToggle } from '../BookmarkToggle';
import { itemKey } from '../search';
import type { LibraryMarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import { hasBookText } from './bookText';
import { bookByline, type CatalogBook } from './catalog';
import { bookPath } from './copy';
import { coverLabel } from './cover';

// The books as rows, one under the other, for a list of results (the search) and for the Bookmarks screen: the Books tab itself draws them as covers
// (BooksGrid.tsx). A row is a small cover, the title in Fraunces, "author · era", the blurb, and the mark "Free" or "Soon" (the same words as the cover: a book
// with a text says Free, one without says Soon). The row is ONE button that opens the book page; the bookmark button is another one beside it, not inside it.

/** The width of the small cover in a row; it is an A5 page that wide (74 high). */
export const THUMB_WIDTH = 52;

/** A small label on a row: caps in mono on a pale ground. */
const Chip = ({ label, spoken, bg, fg }: { label: string; spoken: string; bg: string; fg: string }) => (
  <View accessibilityLabel={spoken} style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: bg, justifyContent: 'center' }}>
    <AppText variant="mono" color={fg} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1 }}>{label}</AppText>
  </View>
);

/** The mark of a book that has a text (it costs nothing to read), and of one that has none yet. */
const Free = () => <Chip label="FREE" spoken="Free to read" bg={c.successWash} fg={c.success} />;
const Soon = () => <Chip label="SOON" spoken="Coming soon" bg={role.sunken} fg={role.muted} />;

export function BookRows({ items, marks }: { items: readonly CatalogBook[]; marks?: LibraryMarks }) {
  const router = useRouter();
  return (
    <Card style={{ padding: 4 }}>
      {items.map((b, i) => {
        const has = hasBookText(b.id);
        const key = itemKey('Books', b.id);
        return (
          <View key={b.id} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 12, paddingRight: marks ? 6 : 12, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={coverLabel(b, has)}
              accessibilityHint={has ? 'Opens the book' : 'Opens its page'}
              onPress={() => router.push(bookPath(b.id))}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 14, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <BookCover book={b} width={THUMB_WIDTH} hasText={has} thumb />
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <AppText variant="h4" style={{ fontSize: 19, lineHeight: 24 }}>{b.title}</AppText>
                <AppText variant="caption" muted>{bookByline(b)}</AppText>
                <AppText variant="small">{b.blurb}</AppText>
                {has ? <Free /> : <Soon />}
              </View>
            </Pressable>
            {marks && <BookmarkToggle on={marks.has(key)} title={b.title} toggle={() => marks.toggle(key)} />}
          </View>
        );
      })}
    </Card>
  );
}
