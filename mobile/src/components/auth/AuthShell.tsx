import { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../AppText';
import { IconButton } from '../ui';
import { layout, role } from '@/theme';

/** Spacious form screen with optional back button, title and lead text. */
export function AuthShell({ title, lead, back = true, hero, children, footer }: { title: string; lead?: string; back?: boolean; hero?: boolean; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: role.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {hero && (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 300 }}>
          <Image source={require('../../../assets/images/welcome-hero.webp')} resizeMode="cover" style={{ width: '100%', height: '100%' }} />
          <Svg width="100%" height="100%" style={{ position: 'absolute', top: 0, left: 0 }} preserveAspectRatio="none">
            <Defs>
              <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={role.bg} stopOpacity={0} />
                <Stop offset="0.5" stopColor={role.bg} stopOpacity={0.15} />
                <Stop offset="0.8" stopColor={role.bg} stopOpacity={0.85} />
                <Stop offset="1" stopColor={role.bg} stopOpacity={1} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
          </Svg>
        </View>
      )}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + 24, paddingHorizontal: layout.screenMargin, gap: 24 }}>
        {back && <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />}
        <View style={{ gap: 8, marginTop: hero ? 90 : back ? 0 : 24 }}>
          <AppText variant="h2">{title}</AppText>
          {!!lead && <AppText variant="lead" muted>{lead}</AppText>}
        </View>
        <View style={{ gap: 18 }}>{children}</View>
        {footer && <View style={{ marginTop: 'auto', gap: 12 }}>{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
