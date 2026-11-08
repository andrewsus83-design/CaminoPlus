import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { c, radius, role } from '@/theme';

// The few buttons of the book page and the reader that nothing else in the app has: the gold bar that starts or goes on reading (a screen reader says
// the whole title of the chapter it opens), the 44 round button of the reader's header (an icon, dimmed and disabled when there is nothing to go to) and the
// two "A" buttons that make the text smaller and larger. Colours are roles and the gold, read while drawing, so dark mode follows.

/** The button of the book page: "Start reading" or "Continue: Chapter 7", gold, as wide as the page, at least 56 high. */
export function ReadButton({ label, spoken, hint, onPress }: { label: string; spoken: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: 24, paddingVertical: 12, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
    >
      <AppText variant="label" color={role.onHighlight} style={{ textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}

/** The notice every book page shows (notices.ts says what it says): small and plain, in a quiet box with a flag, so that it is seen and is not an alarm. */
export function BookNotice({ text }: { text: string }) {
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: 12, padding: 14, borderRadius: radius.lg, backgroundColor: role.sunken, alignItems: 'flex-start' }}>
      <Icon name="flag" color={role.muted} size={20} />
      <AppText variant="small" style={{ flex: 1, minWidth: 0 }}>{text}</AppText>
    </View>
  );
}

/** A round 44 button with an icon. `disabled` dims it and tells a screen reader; it is still drawn, so that nothing moves. */
export function IconTap({ icon, label, hint, disabled, onPress }: { icon: IconName; label: string; hint?: string; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={2}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? role.sunken : 'transparent', opacity: disabled ? 0.35 : 1 })}
    >
      <Icon name={icon} color={role.text} size={24} />
    </Pressable>
  );
}

/** "Smaller text" and "Larger text": the letter A, small or large, in the title font of the brand. */
export function SizeTap({ larger, disabled, onPress }: { larger: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={larger ? 'Larger text' : 'Smaller text'}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, opacity: disabled ? 0.35 : 1 })}
    >
      <AppText variant="h4" maxFontSizeMultiplier={1} style={{ fontSize: larger ? 24 : 15, lineHeight: larger ? 28 : 20 }}>A</AppText>
    </Pressable>
  );
}
