import { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, role } from '@/theme';

// Spacious screen: layout.screenMargin (16) left/right, or `margin`, scrolls above the floating tab bar.
// The first element sits layout.screenTop below the safe area (the camera / notch). Every screen and overlay uses that
// one token, the Map's "Whole route / Near me" switch included, so the distance to the top is the same everywhere.
// src/lib/__tests__/screenTop.test.ts fails when a screen brings its own number back.
export function Screen({ children, scroll = true, margin = layout.screenMargin }: { children: ReactNode; scroll?: boolean; margin?: number }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + layout.screenTop, paddingHorizontal: margin };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: role.bg }, pad]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: role.bg }} contentContainerStyle={[pad, { paddingBottom: layout.tabbarHeight + insets.bottom + 40, gap: 16 }]}>
      {children}
    </ScrollView>
  );
}
