import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';
import { DayReading } from '@/features/library/daily/DayReading';
import { MonthCalendar } from '@/features/library/daily/MonthCalendar';
import { sameDay } from '@/features/library/daily/calendar';
import { useDailyReading } from '@/features/library/daily/useDailyReading';

// Library > Bible > Daily reading: a month calendar and, under it, the reading of the chosen day (today when it opens). There are no real
// readings yet: every day shows the same sample, and the screen says so in its Preview notice (features/library/daily/sample.ts). The
// calendar goes five years back and ahead; the day comes from the phone's clock, and nothing is fetched or kept, so it works offline.
export default function DailyReading() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const daily = useDailyReading();

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <AppText variant="h2" accessibilityRole="header">Daily reading</AppText>
      <MonthCalendar
        shown={daily.shown}
        today={daily.today}
        selected={daily.selected}
        range={daily.range}
        canGoBack={daily.canGoBack}
        canGoForward={daily.canGoForward}
        onSelect={daily.select}
        onPrevious={daily.previousMonth}
        onNext={daily.nextMonth}
        onToday={daily.goToday}
      />
      <DayReading day={daily.selected} isToday={sameDay(daily.selected, daily.today)} />
    </Screen>
  );
}
