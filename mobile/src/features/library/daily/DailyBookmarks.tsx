import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Card } from '@/components/ui';
import { BookmarkToggle } from '@/features/library/BookmarkToggle';
import type { LibraryMarks } from '@/features/library/useLibraryBookmarks';
import { role, space } from '@/theme';
import { DAILY_GROUP, dailyDaysOf, dailyKey, dailyTitle } from './bookmarks';
import { formatDate } from './calendar';
import { dateKey } from './datekey';

// The days of the Daily reading that were bookmarked, as their own part of the Bookmarks screen, between the Library rows and the Posts: one row
// for each day, the newest first, with "Daily reading" as the heading, the date of the day, and its liturgical name; a tap on the row opens the
// Daily reading on that day (/library/daily?date=2026-11-08), and the bookmark at its end takes the day off again. It is made of nothing but the keys
// of the Library's own bookmark list (bookmarks.ts, "daily:2026-11-08"), so the days and the other rows are kept, cleared at logout and read again
// in the same way: a row taken off here stays, with an empty bookmark, until the screen is left. With no day bookmarked it draws nothing at all.
// Unlike the example rows of the Library, a day is real: the date and the name are worked out on the phone, so this part has no Preview notice.
export function DailyBookmarks({ marks }: { marks: LibraryMarks }) {
  const router = useRouter();
  const days = useMemo(() => dailyDaysOf(marks.shown), [marks.shown]);
  if (days.length === 0) return null;
  return (
    <>
      <AppText variant="h4" accessibilityRole="header" style={{ marginTop: space[2] }}>{DAILY_GROUP}</AppText>
      <Card style={{ padding: space[1] }}>
        {days.map((day, i) => {
          const key = dailyKey(day);
          const date = formatDate(day);
          const title = dailyTitle(day);
          return (
            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: 64, paddingLeft: space[4], paddingRight: space[2], paddingVertical: space[2], borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${DAILY_GROUP}, ${date}, ${title}`}
                accessibilityHint="Opens this day"
                onPress={() => router.push({ pathname: '/library/daily', params: { date: dateKey(day) } })}
                style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', gap: space[1], opacity: pressed ? 0.6 : 1 })}
              >
                <AppText variant="label">{date}</AppText>
                <AppText variant="caption" muted>{title}</AppText>
              </Pressable>
              <BookmarkToggle on={marks.has(key)} title={`${DAILY_GROUP}, ${date}`} toggle={() => marks.toggle(key)} />
            </View>
          );
        })}
      </Card>
    </>
  );
}
