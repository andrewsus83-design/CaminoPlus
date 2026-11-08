import { ReactNode } from 'react';
import { Pressable, TextInput, TextInputProps, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, fonts, layout, radius, role, space, textStyle } from '@/theme';

// A function, not a constant: the colours follow the light/dark mode.
const tones = () => ({
  gold: { bg: role.highlight, fg: role.onHighlight },
  green: { bg: c.successWash, fg: c.success },
  red: { bg: c.red100, fg: c.red700 },
  blue: { bg: c.blue100, fg: role.action },
  neutral: { bg: role.sunken, fg: role.text },
  /** The pale gold tag of a stay ("Pilgrims only"). */
  wash: { bg: c.goldWash, fg: role.accentText },
  /** A tag that says "not yet": quiet, on the sunken colour ("Soon" on the watches). */
  quiet: { bg: role.sunken, fg: role.muted },
});

/** A small tag. The word keeps 8 px from the outline on every side (padding 8 above and below the 21 px line, 12 at the sides). */
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: keyof ReturnType<typeof tones>; icon?: IconName }) {
  const t = tones()[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], alignSelf: 'flex-start', paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.pill, backgroundColor: t.bg }}>
      {icon && <Icon name={icon} color={t.fg} size={18} />}
      <AppText variant="caption" color={t.fg} style={{ fontFamily: fonts.bodyBold }}>{label}</AppText>
    </View>
  );
}

export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[2] }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: i < step ? role.highlight : role.sunken }} />
      ))}
    </View>
  );
}

export function Field({ label, help, ...props }: TextInputProps & { label: string; help?: string }) {
  return (
    <View style={{ gap: space[2] }}>
      <AppText variant="label">{label}</AppText>
      <TextInput placeholderTextColor={role.muted} {...props}
        style={{ height: 56, borderRadius: radius.pill, borderWidth: 1.5, borderColor: role.border, backgroundColor: role.surface, paddingHorizontal: space[6], fontFamily: fonts.body, fontSize: textStyle('small').fontSize, color: role.text }} />
      {help && <AppText variant="caption" muted style={{ paddingLeft: space[6] }}>{help}</AppText>}
    </View>
  );
}

// Big tappable option card (business type, toggles).
export function OptionCard({ title, hint, icon, selected, onPress, style }: { title: string; hint?: string; icon?: IconName; selected?: boolean; onPress?: () => void; style?: object }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[{ padding: layout.cardPadding, gap: space[3], borderRadius: radius.lg, borderWidth: selected ? 2.5 : 1.5, borderColor: selected ? role.action : role.border, backgroundColor: selected ? c.blue50 : role.surface }, style]}>
      {icon && (
        <View style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? role.action : c.goldWash }}>
          <Icon name={icon} color={selected ? role.onAction : role.accentText} size={24} />
        </View>
      )}
      <View>
        <AppText variant="label">{title}</AppText>
        {hint && <AppText variant="caption" muted>{hint}</AppText>}
      </View>
    </Pressable>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{children}</View>;
}

export function Highlight({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={role.accentText} size={24} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="small" muted>{text}</AppText>
      </View>
    </View>
  );
}
