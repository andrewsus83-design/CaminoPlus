import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
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
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <View style={{ height: '34%', minHeight: 200, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: 'hidden', backgroundColor: c.blue }}>
        <Image source={require('../../assets/images/welcome-hero.webp')} resizeMode="cover" style={{ width: '100%', height: '100%' }} accessibilityLabel="Pilgrim path through golden wheat fields" />
      </View>
      <View style={{ flex: 1, paddingTop: 28, paddingBottom: insets.bottom + 24, paddingHorizontal: layout.screenMargin }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: 16 }}>
        <Wordmark size={44} />
        <AppText variant="h3">Every Camino, every stage, even offline.</AppText>
        <AppText variant="lead" muted>Plan your pilgrimage, collect stamps, find a bed for tonight and share the way with friends.</AppText>
        <AppText variant="accent" color={c.goldInk}>Buen Camino!</AppText>
      </View>
      <View style={{ gap: 12 }}>
        {!!error && <FormMessage>{error}</FormMessage>}
        <Pill large label="Create account" onPress={() => router.push('/sign-up')} />
        <GoogleButton large onError={setError} />
        <Pressable accessibilityRole="link" onPress={() => router.push('/sign-in')} style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="lead" color={c.blue} style={{ fontWeight: '600' }}>I already have an account</AppText>
        </Pressable>
        <AppText variant="caption" muted style={{ textAlign: 'center', marginTop: 4 }}>By continuing you agree to the Terms and Privacy Policy at camino.plus.</AppText>
      </View>
      </View>
    </View>
  );
}
