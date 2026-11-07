import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { useTabBarHidden } from '@/lib/tabBarVisibility';
import { layout, radius, role, shadowStyle } from '@/theme';

// Floating pill tab bar: gold pill behind the active icon.
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden();
  if (hidden) return null;
  return (
    <View style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom: Math.max(insets.bottom - 14, 10), height: 88, borderRadius: radius.pill, backgroundColor: role.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, ...shadowStyle('lg') }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key].options.title ?? route.name;
        // Roles, never a fixed navy: the bar is role.surface, so the inactive tab is role.muted (readable on it in
        // both modes) and the active one role.action; the thicker stroke and the bold label say which is which.
        const color = focused ? role.action : role.muted;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => navigateToTab(route.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name={route.name as IconName} color={color} size={28} strokeWidth={focused ? 2.6 : 1.6} />
            <AppText variant="caption" color={color} style={{ fontFamily: focused ? 'Inter_600SemiBold' : 'Inter_400Regular', fontSize: 14, lineHeight: 18 }}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
