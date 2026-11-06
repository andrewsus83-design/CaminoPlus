// Small UI pieces shared by the inbox, chat and friends screens, built from the app's tokens.
import { ReactNode, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, TextInput, View, ViewStyle } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { IconButton } from '@/components/ui';
import { c, fonts, radius, role } from '@/theme';
import { avatarTint, badgeLabel, initials } from '../logic';

/** Browsers draw a focus outline on inputs; the pill border already shows focus. (Web only: native rejects the value.) */
export const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

/* ------------------------------------------------------------ avatar */

type AvatarProps = { name: string; uri?: string | null; seed?: string; size?: number; group?: boolean; ring?: boolean };

/** Photo when there is one, else initials on a soft colour. Groups get a little "people" badge. */
export function PilgrimAvatar({ name, uri, seed, size = 56, group, ring }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const tint = avatarTint(seed ?? name);
  const showPhoto = !!uri && !broken;
  return (
    <View style={{ width: size, height: size }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={{ width: size, height: size, borderRadius: radius.pill, backgroundColor: tint, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderWidth: ring ? 2.5 : 0, borderColor: c.gold }}>
        {showPhoto
          ? <Image source={{ uri: uri! }} onError={() => setBroken(true)} style={{ width: size, height: size }} />
          : <AppText variant="label" color={c.blue} style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.44), fontFamily: fonts.bodyBold }}>{initials(name)}</AppText>}
      </View>
      {group && (
        <View style={{ position: 'absolute', right: -2, bottom: -2, width: Math.max(20, size * 0.38), height: Math.max(20, size * 0.38), borderRadius: radius.pill, backgroundColor: c.blue, borderWidth: 2, borderColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="group" color={c.parchment} size={Math.max(11, size * 0.22)} strokeWidth={2.2} />
        </View>
      )}
    </View>
  );
}

/* ------------------------------------------------------------ badges and buttons */

type Tone = 'red' | 'blue' | 'sand';
const TONES: Record<Tone, { bg: string; fg: string }> = {
  red: { bg: c.red, fg: c.white },
  blue: { bg: c.blue, fg: c.parchment },
  sand: { bg: c.sand300, fg: c.blue },
};

/** Round count: nothing for 0, "99+" above 99. */
export function CountBadge({ count, tone = 'red', style }: { count: number; tone?: Tone; style?: ViewStyle }) {
  const label = badgeLabel(count);
  if (!label) return null;
  const t = TONES[tone];
  return (
    <View style={[{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }, style]}>
      <AppText variant="caption" color={t.fg} style={{ fontSize: 12, lineHeight: 16, fontFamily: fonts.bodyBold, letterSpacing: 0 }}>{label}</AppText>
    </View>
  );
}

type BtnProps = {
  label: string; onPress?: () => void; variant?: 'primary' | 'gold' | 'ghost' | 'danger' | 'dangerGhost' | 'soft'; size?: 'sm' | 'md';
  loading?: boolean; disabled?: boolean; icon?: IconName; full?: boolean; hint?: string; accessibilityLabel?: string; style?: ViewStyle;
};

/** Pill button. sm = 48 dp (inside rows), md = 56 dp (main actions). */
export function Btn({ label, onPress, variant = 'primary', size = 'md', loading, disabled, icon, full, hint, accessibilityLabel, style }: BtnProps) {
  const palette = {
    primary: { bg: role.action, fg: role.onAction, border: role.action },
    gold: { bg: role.highlight, fg: c.blue, border: role.highlight },
    ghost: { bg: role.surface, fg: role.text, border: role.border },
    soft: { bg: c.blue50, fg: c.blue, border: c.blue50 },
    danger: { bg: c.red, fg: c.white, border: c.red },
    dangerGhost: { bg: role.surface, fg: c.red, border: c.red100 },
  }[variant];
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? label} accessibilityHint={hint} accessibilityState={{ disabled: !!off, busy: !!loading }}
      disabled={off} onPress={onPress}
      style={({ pressed }) => [{ minHeight: size === 'sm' ? 48 : 56, paddingHorizontal: size === 'sm' ? 18 : 26, borderRadius: radius.pill, backgroundColor: palette.bg, borderWidth: 1, borderColor: palette.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off ? 0.55 : pressed ? 0.85 : 1 }, full ? { alignSelf: 'stretch' } : null, style]}
    >
      {loading ? <ActivityIndicator color={palette.fg} /> : (
        <>
          {icon && <Icon name={icon} color={palette.fg} size={20} />}
          <AppText variant="label" color={palette.fg} numberOfLines={1}>{label}</AppText>
        </>
      )}
    </Pressable>
  );
}

/** Round 48 dp icon-only button (always give it a label for screen readers). */
export function RoundBtn({ icon, label, onPress, tone = 'blue', loading, size = 48 }: { icon: IconName; label: string; onPress: () => void; tone?: 'blue' | 'ghost'; loading?: boolean; size?: number }) {
  const blue = tone === 'blue';
  return (
    <Pressable
      accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ busy: !!loading }} disabled={loading} onPress={onPress}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: radius.pill, backgroundColor: blue ? role.action : role.surface, borderWidth: 1, borderColor: blue ? role.action : role.border, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}
    >
      {loading ? <ActivityIndicator color={blue ? role.onAction : role.text} /> : <Icon name={icon} color={blue ? role.onAction : role.text} size={22} />}
    </Pressable>
  );
}

/* ------------------------------------------------------------ inputs */

export function SearchField({ value, onChangeText, placeholder, label, autoFocus }: { value: string; onChangeText: (t: string) => void; placeholder: string; label: string; autoFocus?: boolean }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ minHeight: 56, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: focus ? 2 : 1, borderColor: focus ? c.gold : role.border, flexDirection: 'row', alignItems: 'center', paddingLeft: 18, paddingRight: 6, gap: 10 }}>
      <Icon name="search" color={role.muted} size={22} />
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={role.muted} accessibilityLabel={label}
        autoCapitalize="none" autoCorrect={false} autoFocus={autoFocus} returnKeyType="search" clearButtonMode="never"
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        style={[{ flex: 1, minWidth: 0, minHeight: 52, fontFamily: fonts.body, fontSize: 17, color: role.text, paddingVertical: 8 }, noOutline]}
      />
      {value.length > 0 && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear search" onPress={() => onChangeText('')} hitSlop={6} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={role.muted} size={20} />
        </Pressable>
      )}
    </View>
  );
}

/* ------------------------------------------------------------ header and tabs */

/** Back button, title (and optional subtitle), actions on the right. */
export function ScreenHeader({ title, onBack, right, variant = 'h2' }: { title: string; onBack?: () => void; right?: ReactNode; variant?: 'h2' | 'h3' | 'h4' }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      {onBack && <IconButton name="back" label="Back" onPress={onBack} />}
      <AppText variant={variant} numberOfLines={1} accessibilityRole="header" style={{ flex: 1 }}>{title}</AppText>
      {right}
    </View>
  );
}

export type TabDef<T extends string> = { key: T; label: string; badge?: number };

/** Underlined tabs with an unread badge on the label's corner (three tabs do not fit with an inline badge). */
export function SegmentedTabs<T extends string>({ tabs, value, onChange }: { tabs: readonly TabDef<T>[]; value: T; onChange: (k: T) => void }) {
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: role.border }}>
      {tabs.map((t) => {
        const on = t.key === value;
        const unread = t.badge ?? 0;
        return (
          <Pressable
            key={t.key} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={unread > 0 ? `${t.label}, ${unread} unread` : t.label}
            onPress={() => onChange(t.key)}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 56, paddingTop: 6, borderBottomWidth: 3, borderBottomColor: on ? c.blue : 'transparent', marginBottom: -1 }}
          >
            <View>
              <AppText variant="label" numberOfLines={1} color={on ? role.text : role.muted}>{t.label}</AppText>
              {unread > 0 && <CountBadge count={unread} style={{ position: 'absolute', top: -14, right: -20 }} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export const Hairline = ({ inset = 0 }: { inset?: number }) => <View style={{ height: 1, backgroundColor: role.border, marginLeft: inset }} />;
