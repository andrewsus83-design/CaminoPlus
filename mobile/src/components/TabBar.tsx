import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { c, radius, role, shadowStyle } from '@/theme';

// Floating pill tab bar: gold pill behind the active icon.
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 8, height: 72, borderRadius: radius.pill, backgroundColor: role.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, ...shadowStyle('lg') }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key].options.title ?? route.name;
        const color = focused ? c.blue : c.stone600;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => navigateToTab(route.key)} style={{ flex: 1, alignItems: 'center', gap: 2 }}>
            <View style={{ width: 52, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: focused ? c.goldSoft : 'transparent' }}>
              <Icon name={route.name as IconName} color={color} />
            </View>
            <AppText variant="caption" color={color} style={{ fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_500Medium', fontSize: 12 }}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
