import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Pill } from '@/components/Pill';
import { Wordmark } from '@/components/auth/Wordmark';
import { GoogleButton } from '@/components/auth/GoogleButton';
import { FormMessage } from '@/components/auth/Field';
import { c, layout, role } from '@/theme';

export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ flex: 1, backgroundColor: role.bg, paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24, paddingHorizontal: layout.screenMargin }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 20 }}>
        <Wordmark size={52} />
        <AppText variant="h3">Every Camino, every stage, even offline.</AppText>
        <AppText variant="lead" muted>Plan your pilgrimage, collect stamps, find a bed for tonight and share the way with friends.</AppText>
        <AppText variant="accent" color={c.goldInk}>Buen Camino!</AppText>
      </View>
      <View style={{ gap: 12 }}>
        {!!error && <FormMessage>{error}</FormMessage>}
        <Pill label="Create account" onPress={() => router.push('/sign-up')} />
        <GoogleButton onError={setError} />
        <Pill variant="ghost" label="I already have an account" onPress={() => router.push('/sign-in')} />
        <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: 4 }}>By continuing you agree to the Terms and Privacy Policy at camino.plus.</AppText>
      </View>
    </View>
  );
}
