import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Card, SectionLabel } from '@/components/ui';
import { role } from '@/theme';
import { BookmarkToggle } from '../BookmarkToggle';
import type { LibraryMarks } from '../useLibraryBookmarks';
import type { PassageRow } from './passages';

// The passages a pilgrim bookmarked in a book, as rows for the Bookmarks screen, under "Passages · 2" (the Bible's verses have their own group in the same way).
// A row is the title of the book in Fraunces, where the passage is in JetBrains Mono ("Chapter III, passage 4") and the first words of it. The row is ONE button
// that opens the reader at that passage, chosen and in view; the bookmark button is another one beside it, not inside it. A bookmark taken off here stays in its
// place, with an empty bookmark, until the screen is left (the list the screen draws is the one it had when it came into view).

/** The label of the group: "Passages · 2". */
export const passagesLabel = (count: number): string => `Passages · ${count}`;

export function PassageRows({ rows, marks, onOpen }: { rows: readonly PassageRow[]; marks: LibraryMarks; onOpen: (row: PassageRow) => void }) {
  return (
    <View style={{ gap: 16 }}>
      <SectionLabel>{passagesLabel(rows.length)}</SectionLabel>
      <Card style={{ padding: 4 }}>
        {rows.map((r, i) => (
          <View key={r.key} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingLeft: 12, paddingRight: 6, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${r.bookTitle}, ${r.label}: ${r.excerpt}`}
              accessibilityHint="Opens the book at this passage"
              onPress={() => onOpen(r)}
              style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 44, gap: 4, paddingVertical: 4, opacity: pressed ? 0.7 : 1 })}
            >
              <AppText variant="h4" style={{ fontSize: 19, lineHeight: 24 }}>{r.bookTitle}</AppText>
              <AppText variant="mono" color={role.accentText} style={{ fontSize: 14, lineHeight: 20 }}>{r.label}</AppText>
              <AppText variant="small">{r.excerpt}</AppText>
            </Pressable>
            <BookmarkToggle on={marks.has(r.key)} title={`${r.bookTitle}, ${r.label}`} toggle={() => marks.toggle(r.key)} />
          </View>
        ))}
      </Card>
    </View>
  );
}
