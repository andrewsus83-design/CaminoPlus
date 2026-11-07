import { useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
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
  const { height } = useWindowDimensions();
  const heroH = height * 0.64;
  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      {/* Photo melts into the parchment background: no radius, soft vertical fade. */}
      <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: heroH }}>
        <Image source={require('../../assets/images/welcome-hero.webp')} resizeMode="cover" style={{ width: '100%', height: '100%' }} accessibilityLabel="Pilgrim path through golden wheat fields" />
        <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={role.bg} stopOpacity={0} />
              <Stop offset="0.38" stopColor={role.bg} stopOpacity={0} />
              <Stop offset="0.62" stopColor={role.bg} stopOpacity={0.55} />
              <Stop offset="0.82" stopColor={role.bg} stopOpacity={0.92} />
              <Stop offset="1" stopColor={role.bg} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + layout.screenTop, left: 0, right: 0, alignItems: 'center' }}>
        <Wordmark size={30} />
      </View>
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1, paddingTop: height * 0.4, paddingBottom: insets.bottom + 24, paddingHorizontal: layout.screenMargin, gap: 28 }}
      >
        <View style={{ gap: 12 }}>
          <AppText variant="accent" color={c.goldInk}>Buen Camino!</AppText>
          <AppText variant="h3">Every Camino, every stage, even offline.</AppText>
          <AppText variant="lead" muted>Plan your pilgrimage, collect stamps, find a bed for tonight and share the way with friends.</AppText>
        </View>
        <View style={{ gap: 12, marginTop: 'auto' }}>
          {!!error && <FormMessage>{error}</FormMessage>}
          <Pill large label="Create account" onPress={() => router.push('/sign-up')} />
          <GoogleButton large onError={setError} />
          <Pressable accessibilityRole="link" onPress={() => router.push('/sign-in')} style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="lead" color={c.blue} style={{ fontWeight: '600' }}>I already have an account</AppText>
          </Pressable>
          <AppText variant="caption" muted style={{ textAlign: 'center' }}>By continuing you agree to the Terms and Privacy Policy at camino.plus.</AppText>
        </View>
      </ScrollView>
    </View>
  );
}
