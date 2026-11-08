import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { c, fonts, layout, radius, role, shadowStyle } from '@/theme';

/**
 * The gold round button that floats at the bottom right, just above the tab bar. On Me it is the chat button, the same on every sub-tab (Notes, Journey,
 * Plan, Health: features/me/tabs.ts), and it opens the inbox. One component so every FAB looks and sits the same, and one button at a time.
 *
 * 60 px round with a 26 px icon, as the design page says (.cp-fab-write), above the 56 px touch minimum. It sits 8 px
 * above the floating tab bar. The two numbers (14 and 88) are the tab bar's own, see TabBar.tsx;
 * src/lib/__tests__/navigation.test.ts fails when they drift apart. Gold stays gold in dark mode and what is
 * drawn on it is role.onHighlight, so it keeps its contrast in both modes.
 *
 * `badge` is the text of an unread badge ("3", "99+"; none or '' draws none): a red round label on the top right rim of the button, ringed in the colour of the page
 * so the red and the gold never touch. It sticks out 4 px, so it stays 12 px inside the screen edge (the button is `layout.screenMargin` from it). The
 * words come from the caller (features/me/tabs.ts: badgeText), the button draws what it is given. Drawn in the roles danger / onDanger, which keep 4.5 : 1 in
 * light and dark. It is for the eye only: a screen reader hears the same number in the label.
 */
export function Fab({ label, onPress, icon = 'pen', badge, hint }: { label: string; onPress: () => void; icon?: IconName; badge?: string; hint?: string }) {
  const insets = useSafeAreaInsets();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ position: 'absolute', right: layout.screenMargin, bottom: Math.max(insets.bottom - 14, 10) + 88 + 8, width: 60, height: 60, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1, ...shadowStyle('gold') })}
    >
      <Icon name={icon} color={role.onHighlight} size={26} strokeWidth={2.2} />
      {!!badge && (
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={{ position: 'absolute', top: -4, right: -4, minWidth: 26, height: 26, paddingHorizontal: 5, borderRadius: radius.pill, backgroundColor: role.danger, borderWidth: 2, borderColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
          <AppText color={role.onDanger} numberOfLines={1} style={{ fontFamily: fonts.bodyBold, fontSize: 12, lineHeight: 14, letterSpacing: 0 }}>{badge}</AppText>
        </View>
      )}
    </Pressable>
  );
}
