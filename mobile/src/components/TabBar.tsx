import { Pressable, View } from 'react-native';
import { BottomTabBarProps } from 'expo-router/js-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { useTabBarHidden } from '@/lib/tabBarVisibility';
import { layout, radius, role, shadowStyle, tabActiveWeight, tabInactiveWeight } from '@/theme';

// Floating pill tab bar. The active tab is white (dark) or blue (light) with a thicker stroke and a bold label; light mode is drawn a little
// heavier than dark mode (tokens.tab), because the same stroke looks thinner dark on light than light on dark. The inactive tabs are thin, and the icon is
// drawn exactly as thick as the stem of its label (tokens.tab.inactiveStroke: 0.8 of 24 units at 28 px is 0.93 px, the stem of Inter Light at 14 px).
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
        // stroke (3 in light mode, 2.6 in dark) and a Bold (light) or SemiBold (dark) label, the inactive ones a thin stroke (0.8, which is 0.93 px, as
        // thick as the stem of the Light label) and a Light label. All of it is tokens.tab; the size of the icon (28) and of the label (14) are what the
        // stroke is worked out for (themeScheme.test.ts measures the two against each other).
        const color = focused ? role.tabActive : role.tabInactive;
        const weight = focused ? tabActiveWeight : tabInactiveWeight;
        return (
          <Pressable key={route.key} accessibilityRole="tab" accessibilityState={{ selected: focused }} onPress={() => navigateToTab(route.key)} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            <Icon name={route.name as IconName} color={color} size={28} strokeWidth={weight.stroke} />
            <AppText variant="caption" color={color} style={{ fontFamily: weight.font, fontSize: 14, lineHeight: 18 }}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
