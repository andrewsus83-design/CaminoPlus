import { useState } from 'react';
import { TextInput, TextInputProps, View } from 'react-native';
import { AppText } from '../AppText';
import { c, fonts, layout, radius, role } from '@/theme';

export function Field({ label, error, ...rest }: TextInputProps & { label: string; error?: string | null }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor={c.stone500}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e); }}
        {...rest}
        style={{
          minHeight: layout.touchPrimary + 8, paddingHorizontal: 22, borderRadius: radius.pill,
          backgroundColor: role.surface, borderWidth: focus ? 2 : 1,
          borderColor: error ? role.danger : focus ? c.gold : role.border,
          fontFamily: fonts.body, fontSize: 17, color: role.text,
        }}
      />
      {!!error && <AppText variant="caption" color={role.danger}>{error}</AppText>}
    </View>
  );
}

export function FormMessage({ tone = 'error', children }: { tone?: 'error' | 'info'; children: string }) {
  const bg = tone === 'error' ? c.red100 : c.goldWash;
  const fg = tone === 'error' ? c.red700 : role.accentText;
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.md, paddingHorizontal: 18, paddingVertical: 14 }}>
      <AppText variant="small" color={fg}>{children}</AppText>
    </View>
  );
}
