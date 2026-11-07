import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { IconButton } from '@/components/ui';

// Placeholder: the diary feature replaces this with the list of pages (newest first).
export default function DiaryList() {
  const router = useRouter();
  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      <AppText variant="h2" accessibilityRole="header">My diary</AppText>
    </Screen>
  );
}
