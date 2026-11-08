import { ComponentRef, ReactNode, Ref } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, role } from '@/theme';

// Spacious screen: layout.screenMargin (16) left/right, or `margin`, scrolls above the floating tab bar.
// The first element sits layout.screenTop below the safe area (the camera / notch). Every screen and overlay uses that
// one token, the Map's "Whole route / Near me" switch included, so the distance to the top is the same everywhere.
// src/lib/__tests__/screenTop.test.ts fails when a screen brings its own number back.
// A screen pushed over the tabs (Settings) has no tab bar under it: `tabBar={false}` drops the room kept for the bar.
// A screen with a text field at the top (the Library search) sets `keyboard`: a tap on a button still works while the keyboard is up
// (without it the first tap only closes the keyboard), and scrolling the list closes the keyboard.
// A screen that has to move or read its own scroll position (the Library, which brings a list back to its top when another part of it is
// chosen) passes `scrollRef` and `onScroll`; nothing else uses them.
export function Screen({ children, scroll = true, margin = layout.screenMargin, tabBar = true, keyboard = false, scrollRef, onScroll }: { children: ReactNode; scroll?: boolean; margin?: number; tabBar?: boolean; keyboard?: boolean; scrollRef?: Ref<ComponentRef<typeof ScrollView>>; onScroll?: (e: NativeSyntheticEvent<NativeScrollEvent>) => void }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + layout.screenTop, paddingHorizontal: margin };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: role.bg }, pad]}>{children}</View>;
  return (
    <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={onScroll ? 16 : undefined} style={{ flex: 1, backgroundColor: role.bg }} keyboardShouldPersistTaps={keyboard ? 'handled' : 'never'} keyboardDismissMode={keyboard ? 'on-drag' : 'none'} contentContainerStyle={[pad, { paddingBottom: (tabBar ? layout.tabbarHeight : 0) + insets.bottom + 40, gap: 16 }]}>
      {children}
    </ScrollView>
  );
}
