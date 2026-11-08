import { ComponentRef, ReactNode, Ref } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAboveTabBar } from '@/lib/aboveTabBar';
import { layout, role } from '@/theme';

// Spacious screen: layout.screenMargin (16) left/right, or `margin`, scrolls above the floating tab bar.
// The first element sits layout.screenTop below the safe area (the camera / notch). Every screen and overlay uses that
// one token, the Map's "Whole route / Near me" switch included, so the distance to the top is the same everywhere.
// src/lib/__tests__/screenTop.test.ts fails when a screen brings its own number back.
// A screen pushed over the tabs (Settings) has no tab bar under it: `tabBar={false}` drops the room kept for the bar.
// A screen with a text field at the top (the Library search) sets `keyboard`: a tap on a button still works while the keyboard is up
// (without it the first tap only closes the keyboard), and scrolling the list closes the keyboard.
// A screen that has to move or read its own scroll position (the Bible reader, which scrolls to the verse a link names) passes `scrollRef` and
// `onScroll`; nothing else uses them.
// A screen that floats something over its list, above the tab bar (the Library's "Continue reading" bar), passes it as `overlay`: it is drawn over the scroll, pinned to the screen and
// not part of what scrolls. What floats says how much room it takes (lib/aboveTabBar.ts), and a screen with a tab bar keeps that much more at the end of its list, so the last row can
// be scrolled clear of it. Only for a screen that scrolls (`scroll`, the default).
export function Screen({ children, scroll = true, margin = layout.screenMargin, tabBar = true, keyboard = false, scrollRef, onScroll, overlay }: { children: ReactNode; scroll?: boolean; margin?: number; tabBar?: boolean; keyboard?: boolean; scrollRef?: Ref<ComponentRef<typeof ScrollView>>; onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void; overlay?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const above = useAboveTabBar();
  const pad = { paddingTop: insets.top + layout.screenTop, paddingHorizontal: margin };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: role.bg }, pad]}>{children}</View>;
  const list = (
    <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={onScroll ? 16 : undefined} style={{ flex: 1, backgroundColor: role.bg }} keyboardShouldPersistTaps={keyboard ? 'handled' : 'never'} keyboardDismissMode={keyboard ? 'on-drag' : 'none'} contentContainerStyle={[pad, { paddingBottom: (tabBar ? layout.tabbarHeight + above : 0) + insets.bottom + 40, gap: 16 }]}>
      {children}
    </ScrollView>
  );
  return overlay ? <View style={{ flex: 1 }}>{list}{overlay}</View> : list;
}
