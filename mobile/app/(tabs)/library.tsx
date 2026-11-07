import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Fab } from '@/components/Fab';
import { DiaryCard } from '@/features/diary/DiaryCard';
import { View } from 'react-native';

// Work in progress: the banner and the Bible / Books / Music tabs come next.
export default function Library() {
  const router = useRouter();
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <AppText variant="h2" accessibilityRole="header">Library</AppText>
        <DiaryCard />
      </Screen>
      <Fab label="Write in your diary" icon="compose" onPress={() => router.push('/diary/new')} />
    </View>
  );
}
