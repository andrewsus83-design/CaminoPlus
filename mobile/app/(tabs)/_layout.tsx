import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';

// Five tabs. Settings is not one of them: it opens from the gear at the top right of Me (app/settings.tsx).
// Every tab's route name is also the name of its icon in components/Icon.tsx (TabBar reads it from there).
export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
      <Tabs.Screen name="stays" options={{ title: 'Stays' }} />
      <Tabs.Screen name="maps" options={{ title: 'Maps' }} />
      <Tabs.Screen name="explore" options={{ title: 'Discover' }} />
      <Tabs.Screen name="library" options={{ title: 'Library' }} />
    </Tabs>
  );
}
