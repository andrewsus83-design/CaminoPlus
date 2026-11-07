import { ReactNode } from 'react';
import { Pressable, TextInput, TextInputProps, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, radius, role } from '@/theme';

// A function, not a constant: the colours follow the light/dark mode.
const tones = () => ({
  gold: { bg: c.gold, fg: role.onHighlight },
  green: { bg: c.successWash, fg: c.success },
  red: { bg: c.red100, fg: c.red700 },
  blue: { bg: c.blue100, fg: c.blue },
  neutral: { bg: c.sand200, fg: c.ink },
});

export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: keyof ReturnType<typeof tones>; icon?: IconName }) {
  const t = tones()[tone];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', height: 28, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.bg }}>
      {icon && <Icon name={icon} color={t.fg} size={14} />}
      <AppText variant="caption" color={t.fg} style={{ fontFamily: 'Inter_600SemiBold' }}>{label}</AppText>
    </View>
  );
}

export function StepBar({ step, total }: { step: number; total: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={{ flex: 1, height: 6, borderRadius: radius.pill, backgroundColor: i < step ? c.gold : c.sand200 }} />
      ))}
    </View>
  );
}

export function Field({ label, help, ...props }: TextInputProps & { label: string; help?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">{label}</AppText>
      <TextInput placeholderTextColor={role.muted} {...props}
        style={{ height: 56, borderRadius: radius.pill, borderWidth: 1.5, borderColor: role.border, backgroundColor: role.surface, paddingHorizontal: 22, fontFamily: 'Inter_400Regular', fontSize: 16, color: role.text }} />
      {help && <AppText variant="caption" muted style={{ paddingLeft: 22 }}>{help}</AppText>}
    </View>
  );
}

// Big tappable option card (business type, toggles).
export function OptionCard({ title, hint, icon, selected, onPress, style }: { title: string; hint?: string; icon?: IconName; selected?: boolean; onPress?: () => void; style?: object }) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
      style={[{ padding: 16, gap: 10, borderRadius: radius.lg, borderWidth: selected ? 2.5 : 1.5, borderColor: selected ? c.blue : role.border, backgroundColor: selected ? c.blue50 : role.surface }, style]}>
      {icon && (
        <View style={{ width: 44, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: selected ? c.blue : c.goldWash }}>
          <Icon name={icon} color={selected ? c.parchment : c.goldInk} size={22} />
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
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;
}

export function Highlight({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
      <View style={{ width: 44, height: 44, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={c.goldInk} size={22} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label">{title}</AppText>
        <AppText variant="small" muted>{text}</AppText>
      </View>
    </View>
  );
}
