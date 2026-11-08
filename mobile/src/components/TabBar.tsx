import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { useTabBarHidden } from '@/lib/tabBarVisibility';
import { fonts, layout, radius, role, shadowStyle } from '@/theme';

// Floating pill tab bar. The active tab is white (dark) or blue (light) with a thicker stroke and a bold label.
export function TabBar({ state, descriptors, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const hidden = useTabBarHidden();
  if (hidden) return null;
  return (
    <View style={{ position: 'absolute', left: layout.screenMargin, right: layout.screenMargin, bottom: Math.max(insets.bottom - 14, 10), height: 88, borderRadius: radius.pill, backgroundColor: role.tabBar, borderWidth: 1, borderColor: role.tabBarBorder, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, ...shadowStyle('lg') }}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const label = descriptors[route.key].options.title ?? route.name;
        // Roles, never a fixed navy. The tab bar has four roles of its own (design/tokens.json: tabBar, tabBarBorder, tabActive,
        // tabInactive) so that what the bar needs never changes a card, a link or a caption. The bar and its hairline: in light
        // mode the card white (the shadow separates it); in dark mode a navy darker than the page and every card, with a lighter
        // hairline, because a shadow cannot be seen on a dark screen and a bar in the card colour was swallowed by any card that
        // scrolled under it. The tabs: white on the dark bar for the active tab, a dimmer grey-blue for the others (4.5 : 1 or
        // more), and in light mode the same blue and stone as always. Weight says which is which as well as colour: the active tab has a thick
        // stroke (2.6) and a SemiBold label, the inactive ones a thin stroke (1.3) and a Light label.
        const color = focused ? role.tabActive : role.tabInactive;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => navigateToTab(route.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name={route.name as IconName} color={color} size={28} strokeWidth={focused ? 2.6 : 1.3} />
            <AppText variant="caption" color={color} style={{ fontFamily: focused ? fonts.bodyBold : fonts.bodyLight, fontSize: 14, lineHeight: 18 }}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
