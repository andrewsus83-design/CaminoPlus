import { useState } from 'react';
import { Pressable, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { AppText } from '../AppText';
import { signInWithGoogle } from '@/lib/authLinks';
import { layout, radius, role } from '@/theme';

export function GoogleButton({ onError }: { onError: (msg: string | null) => void }) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    onError(null); setBusy(true);
    const res = await signInWithGoogle();
    setBusy(false);
    if (!res.ok && !res.cancelled) onError(res.error ?? 'Google sign-in failed.');
  };
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={go} style={({ pressed }) => ({ minHeight: layout.touchMin, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, opacity: busy ? 0.55 : pressed ? 0.85 : 1 })}>
      <View>
        <Svg width={20} height={20} viewBox="0 0 48 48">
          <Path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.2l7.8 6.1C12.4 13.7 17.7 9.5 24 9.5z" />
          <Path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
          <Path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.8l7.8-6.1z" />
          <Path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.8-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6.1C6.6 42.6 14.6 48 24 48z" />
        </Svg>
      </View>
      <AppText variant="label">{busy ? 'Opening Google…' : 'Continue with Google'}</AppText>
    </Pressable>
  );
}
