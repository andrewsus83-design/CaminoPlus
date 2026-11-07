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
        // Roles, never a fixed navy: the bar is role.surface. The tab bar has two roles of its own (design/tokens.json:
        // tabActive, tabInactive) so that what the bar needs never changes a link or a caption: white on the dark bar for
        // the active tab, a light grey-blue for the others, and in light mode the same blue and stone as always. The
        // thicker stroke and the bold label say which is which as well.
        const color = focused ? role.tabActive : role.tabInactive;
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
