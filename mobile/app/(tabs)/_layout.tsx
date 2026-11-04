import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';

export default function TabsLayout() {
  return (
    <Tabs tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="me" options={{ title: 'Me' }} />
      <Tabs.Screen name="stays" options={{ title: 'Stays' }} />
      <Tabs.Screen name="maps" options={{ title: 'Maps' }} />
      <Tabs.Screen name="explore" options={{ title: 'Explore' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
