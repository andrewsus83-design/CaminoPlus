import { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { layout, role } from '@/theme';

// Spacious screen: 24 margin, scrolls above the floating tab bar.
export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const insets = useSafeAreaInsets();
  const pad = { paddingTop: insets.top + layout.screenTop, paddingHorizontal: layout.screenMargin };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: role.bg }, pad]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: role.bg }} contentContainerStyle={[pad, { paddingBottom: layout.tabbarHeight + insets.bottom + 40, gap: 16 }]}>
      {children}
    </ScrollView>
  );
}
