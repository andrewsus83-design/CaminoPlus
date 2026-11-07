import { Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from './Icon';
import { c, layout, radius, role, shadowStyle } from '@/theme';

/**
 * The gold round button that floats at the bottom right, just above the tab bar: "Write a journey post" on Me,
 * "Write in your diary" on Library. One component so every FAB looks and sits the same.
 *
 * 60 px round with a 26 px icon, as the design page says (.cp-fab-write), above the 56 px touch minimum. It sits 8 px
 * above the floating tab bar. The two numbers (14 and 88) are the tab bar's own, see TabBar.tsx;
 * src/lib/__tests__/navigation.test.ts fails when they drift apart. Gold stays gold in dark mode and what is
 * drawn on it is role.onHighlight, so it keeps its contrast in both modes.
 */
export function Fab({ label, onPress, icon = 'pen' }: { label: string; onPress: () => void; icon?: IconName }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', right: layout.screenMargin, bottom: Math.max(insets.bottom - 14, 10) + 88 + 8, width: 60, height: 60, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...shadowStyle('gold') })}
    >
      <Icon name={icon} color={role.onHighlight} size={26} strokeWidth={2.2} />
    </Pressable>
  );
}
