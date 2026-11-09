import { ReactNode } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../AppText';
import { BackButton } from '../BackButton';
import { layout, role, space } from '@/theme';

/** Spacious form screen with optional back button, title and lead text. */
export function AuthShell({ title, lead, back = true, hero, children, footer }: { title: string; lead?: string; back?: boolean; hero?: boolean; children: ReactNode; footer?: ReactNode }) {
  const insets = useSafeAreaInsets();
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
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingTop: insets.top + layout.screenTop, paddingBottom: insets.bottom + space[6], paddingHorizontal: layout.screenMargin, gap: space[6] }}>
        {back && <BackButton />}
        {/* Only the hero title is pushed down (it sits below the photo). Without a back button the title is the first
            element and starts at the same distance from the camera as everything else: no margin of its own. */}
        <View style={{ gap: space[2], marginTop: hero ? space[24] : 0 }}>
          <AppText variant="h2">{title}</AppText>
          {!!lead && <AppText variant="lead" muted>{lead}</AppText>}
        </View>
        <View style={{ gap: space[5] }}>{children}</View>
        {footer && <View style={{ marginTop: 'auto', gap: space[3] }}>{footer}</View>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
