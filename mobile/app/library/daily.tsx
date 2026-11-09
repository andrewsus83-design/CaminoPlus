import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { Screen } from '@/components/Screen';
import { FormMessage } from '@/components/auth/Field';
import { BOOKMARK_NOT_SAVED } from '@/features/library/bookmarks';
import { CalendarSheet } from '@/features/library/daily/CalendarSheet';
import { DailyHeader } from '@/features/library/daily/DailyHeader';
import { DayReading } from '@/features/library/daily/DayReading';
import { WeekStrip } from '@/features/library/daily/WeekStrip';
import { dailyKey } from '@/features/library/daily/bookmarks';
import { parseDateKey } from '@/features/library/daily/datekey';
import { useDailyReading } from '@/features/library/daily/useDailyReading';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';

// Library > Bible > Daily reading: one row with Back, the title, the calendar and the bookmark; the week strip (the seven days of the week of the
// picked day, today when it opens, or the day of the `date` param, "2026-11-08": a bookmark opens it on its day, and anything that is not a day
// means today); and under it the liturgical day, which is worked out on the phone, then the readings of the day: their references from the Roman
// Lectionary (assets/library/daily, tools/liturgy/README.md) and, when a reference can be shown with confidence, their words from the Bible inside the
// app (features/library/daily/content.ts); a day with no readings in the app says so. The calendar button opens the month calendar in a sheet; the
// bookmark button keeps the day in the Library's own bookmarks (useLibraryBookmarks, key "daily:2026-11-08"). The day comes from the phone's clock and
// nothing is fetched, so it works offline.
export default function DailyReading() {
  const { date } = useLocalSearchParams<{ date?: string | string[] }>();
  const daily = useDailyReading(undefined, parseDateKey(Array.isArray(date) ? date[0] : date));
  const marks = useLibraryBookmarks();
  const [calendar, setCalendar] = useState(false);
  const key = dailyKey(daily.selected);

  const openCalendar = () => { daily.showMonth(); setCalendar(true); };

  return (
    <Screen tabBar={false}>
      <DailyHeader onCalendar={openCalendar} bookmarked={marks.has(key)} onBookmark={() => marks.toggle(key)} />
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      <WeekStrip
        selected={daily.selected}
        today={daily.today}
        range={daily.range}
        canGoBack={daily.canGoBackWeek}
        canGoForward={daily.canGoForwardWeek}
        onSelect={daily.select}
        onPrevious={daily.previousWeek}
        onNext={daily.nextWeek}
        onToday={daily.goToday}
      />
      <DayReading day={daily.selected} />
      {calendar && (
        <CalendarSheet
          shown={daily.shown}
          today={daily.today}
          selected={daily.selected}
          range={daily.range}
          canGoBack={daily.canGoBack}
          canGoForward={daily.canGoForward}
          onSelect={(day) => { daily.select(day); setCalendar(false); }}
          onPrevious={daily.previousMonth}
          onNext={daily.nextMonth}
          onToday={() => { daily.goToday(); setCalendar(false); }}
          onClose={() => setCalendar(false)}
        />
      )}
    </Screen>
  );
}
