import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { role, space } from '@/theme';
import { BookmarkToggle } from '../BookmarkToggle';
import type { LibraryMarks } from '../useLibraryBookmarks';
import type { PassageRow } from './passages';

// The passages a pilgrim bookmarked in a book, as rows for the Bookmarks screen, under "Passages · 2" (the Bible's verses have their own group in the same way).
// A row is the title of the book in Fraunces, where the passage is in JetBrains Mono ("Chapter III, passage 4") and the first words of it. The row is ONE button
// that opens the reader at that passage, chosen and in view; the bookmark button is another one beside it, not inside it. A bookmark taken off here stays in its
// place, with an empty bookmark, until the screen is left (the list the screen draws is the one it had when it came into view).
// The card holds its rows at 20 from its edge (4 of the card and 16 of the row, 8 at the end where the bookmark button is, which is 48 wide).

/** The label of the group: "Passages · 2". */
export const passagesLabel = (count: number): string => `Passages · ${count}`;

export function PassageRows({ rows, marks, onOpen }: { rows: readonly PassageRow[]; marks: LibraryMarks; onOpen: (row: PassageRow) => void }) {
  return (
    <View style={{ gap: space[4] }}>
      <SectionLabel>{passagesLabel(rows.length)}</SectionLabel>
      <Card style={{ padding: space[1] }}>
        {rows.map((r, i) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space[2], paddingLeft: space[4], paddingRight: space[2], paddingVertical: space[3], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${r.bookTitle}, ${r.label}: ${r.excerpt}`}
              accessibilityHint="Opens the book at this passage"
              onPress={() => onOpen(r)}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, gap: space[1], paddingVertical: space[1], opacity: pressed ? 0.7 : 1 })}
            >
              <AppText variant="h5">{r.bookTitle}</AppText>
              <AppText variant="mono" color={role.accentText}>{r.label}</AppText>
              <AppText variant="small">{r.excerpt}</AppText>
            </Pressable>
            <BookmarkToggle on={marks.has(r.key)} title={`${r.bookTitle}, ${r.label}`} toggle={() => marks.toggle(r.key)} />
          </View>
        ))}
      </Card>
    </View>
  );
}
