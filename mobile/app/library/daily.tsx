// PLACEHOLDER, replaced by agent C: the daily reading (a calendar and the reading of the day) is built on another branch and its real
// screen takes the place of this file when the two are merged. The banner at the top of the Bible tab of the Library opens this route
// (/library/daily); this stand-in only keeps that link from going nowhere until then.
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';

export default function DailyReading() {
  const router = useRouter();
  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      <AppText variant="h2" accessibilityRole="header">Daily reading</AppText>
      <AppText variant="small" muted>Today&apos;s reading and a short reflection will be here.</AppText>
    </Screen>
  );
}
