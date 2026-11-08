import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { c, role } from '@/theme';
import { BookmarkToggle } from '../BookmarkToggle';
import { verseKey } from '../search';
import type { LibraryMarks } from '../useLibraryBookmarks';
import type { Ref } from './ref';
import { ROW_TEXT_LINES, excerpt, segments, type VerseRow } from './verseRows';

/** What a screen reader says for a verse row: where it is, then its words ("Psalm 121:3. He will not allow your foot to be moved."). */
export const verseRowLabel = (row: VerseRow): string => `${row.label}. ${row.text}`;

/**
 * The verses of a list of results or of Bookmarks, one under the other in a card: the place in JetBrains Mono ("Psalm 121:3"), the words in Inter, at most
 * three lines of them, with the letters the search matched marked (a pale gold ground and an underline, never the colour alone); and, when `marks` is given,
 * the bookmark button at the end. The row is ONE button (it opens the reader at that verse, `onOpen` says where) and the bookmark button is another beside it,
 * not inside it. A verse is bookmarked under its place ("bible:PSA.121.3", search.ts verseKey).
 */
export function VerseRowList({ rows, marks, onOpen }: { rows: readonly VerseRow[]; marks?: LibraryMarks; onOpen: (ref: Ref) => void }) {
  return (
    <Card style={{ padding: 4 }}>
      {rows.map((row, i) => {
        const cut = excerpt(row.text, row.marks);
        const key = verseKey(row.ref);
        return (
          <View key={`${row.key}-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 64, paddingLeft: 16, paddingRight: marks ? 6 : 16, paddingVertical: 6, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable accessibilityRole="button" accessibilityLabel={verseRowLabel(row)} accessibilityHint="Opens the chapter at this verse" onPress={() => onOpen(row.ref)} style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 6 }}>
              <AppText variant="mono" color={role.accentText} style={{ fontSize: 14, lineHeight: 20 }}>{row.label}</AppText>
              <AppText variant="small" numberOfLines={ROW_TEXT_LINES}>
                {segments(cut.text, cut.marks).map((s, k) => (s.mark
                  ? <AppText key={k} variant="small" style={{ backgroundColor: c.goldSoft, textDecorationLine: 'underline' }}>{s.text}</AppText>
                  : s.text))}
              </AppText>
            </Pressable>
            {marks && <BookmarkToggle on={marks.has(key)} title={row.label} toggle={() => marks.toggle(key)} />}
          </View>
        );
      })}
    </Card>
  );
}
