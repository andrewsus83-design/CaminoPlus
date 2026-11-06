import { ReactNode } from 'react';
import { Pressable, View, ViewStyle } from 'react-native';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { c, layout, radius, role, shadowStyle } from '@/theme';

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const base: ViewStyle = { backgroundColor: role.surface, borderRadius: radius.lg, padding: layout.cardPadding, ...shadowStyle('sm') };
  return onPress ? <Pressable onPress={onPress} style={[base, style]}>{children}</Pressable> : <View style={[base, style]}>{children}</View>;
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ height: 48, paddingHorizontal: 20, borderRadius: radius.pill, justifyContent: 'center', backgroundColor: selected ? role.action : role.surface, borderWidth: 1, borderColor: selected ? role.action : role.border }}>
      <AppText variant="label" color={selected ? role.onAction : role.text}>{label}</AppText>
    </Pressable>
  );
}

export function IconButton({ name, onPress, label, badge, size = 48, flat, active }: { name: IconName; onPress?: () => void; label: string; badge?: number; size?: number; flat?: boolean; active?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ width: size, height: size, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: flat ? 'transparent' : role.surface, borderWidth: flat ? 0 : 1, borderColor: role.border }}>
      <Icon name={name} color={active ? c.red : role.text} filled={active} />
      {!!badge && (
        <View style={{ position: 'absolute', top: 2, right: 2, minWidth: 20, height: 20, paddingHorizontal: 5, borderRadius: radius.pill, backgroundColor: c.red, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="caption" color={c.white} style={{ fontSize: 11, lineHeight: 14 }}>{badge}</AppText>
        </View>
      )}
    </Pressable>
  );
}

export function Avatar({ size = 56, tint = c.goldSoft, ring }: { size?: number; tint?: string; ring?: boolean }) {
  return <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tint, borderWidth: ring ? 3 : 0, borderColor: c.gold }} />;
}

export function SectionLabel({ children }: { children: string }) {
  return <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.2, fontSize: 12, marginTop: 8 }}>{children}</AppText>;
}

export function SubTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly T[]; value: T; onChange: (t: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: role.border }}>
      {tabs.map((t) => (
        <Pressable key={t} onPress={() => onChange(t)} style={{ flex: 1, alignItems: 'center', paddingTop: 14, paddingBottom: 12, borderBottomWidth: 3, borderBottomColor: value === t ? c.blue : 'transparent', marginBottom: -1 }}>
          <AppText variant="label" color={value === t ? role.text : role.muted}>{t}</AppText>
        </Pressable>
      ))}
    </View>
  );
}

export function Photo({ tint, height, style }: { tint: string; height: number; style?: ViewStyle }) {
  return <View style={[{ height, backgroundColor: tint, borderRadius: radius.md }, style]} />;
}
