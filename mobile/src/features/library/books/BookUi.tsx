import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { c, radius, role, space } from '@/theme';

// The few buttons of the book page and the reader that nothing else in the app has: the gold bar that starts or goes on reading (a screen reader says
// the whole title of the chapter it opens), the round button of the reader's bar (an icon, 56 there, dimmed and disabled when there is nothing to go to) and the
// two "A" buttons of its header that make the text smaller and larger (48, like every round button of a header). The way back is not here: it is the Back button
// of the app (components/BackButton.tsx). Colours are roles and the gold, read while drawing, so dark mode follows.

/** The button of the book page: "Start reading" or "Continue: Chapter 7", gold, as wide as the page, at least 56 high. */
export function ReadButton({ label, spoken, hint, onPress }: { label: string; spoken: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint={hint}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 56, paddingHorizontal: space[6], paddingVertical: space[3], borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
    >
      <AppText variant="label" color={role.onHighlight} style={{ textAlign: 'center' }}>{label}</AppText>
    </Pressable>
  );
}

/** The notice every book page shows (notices.ts says what it says): small and plain, in a quiet box with a flag, so that it is seen and is not an alarm. */
export function BookNotice({ text }: { text: string }) {
  return (
    <View accessibilityRole="summary" style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.lg, backgroundColor: role.sunken, alignItems: 'flex-start' }}>
      <Icon name="flag" color={role.muted} size={20} />
      <AppText variant="small" style={{ flex: 1, minWidth: 0 }}>{text}</AppText>
    </View>
  );
}

/** A round 48 button with an icon (24; 32 in a button of 56 or more). `disabled` dims it and tells a screen reader; it is still drawn, so that nothing moves. */
export function IconTap({ icon, label, hint, disabled, size = 48, onPress }: { icon: IconName; label: string; hint?: string; disabled?: boolean; size?: number; onPress: () => void }) {
  const glyph = size >= 56 ? 32 : 24;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? role.sunken : 'transparent', opacity: disabled ? 0.35 : 1 })}
    >
      <Icon name={icon} color={role.text} size={glyph} />
    </Pressable>
  );
}

/** The round buttons of a header are 48 by 48, the size of IconButton (components/ui.tsx) and so of the Back button next to these two. */
const HEADER_BUTTON = 48;

/** "Smaller text" and "Larger text": the letter A, small or large, in the title font of the brand, in the round 48 button of the header (the surface colour, a hairline, like IconButton). */
export function SizeTap({ larger, disabled, onPress }: { larger: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={larger ? 'Larger text' : 'Smaller text'}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ width: HEADER_BUTTON, height: HEADER_BUTTON, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, opacity: disabled ? 0.35 : 1 })}
    >
      <AppText variant={larger ? 'h4' : 'h6'} maxFontSizeMultiplier={1}>A</AppText>
    </Pressable>
  );
}
