// Empty, error, loading and offline pieces. Every list in the social screens uses these, so
// "nothing here yet" and "it did not load" always look and sound the same.
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, radius, layout } from '@/theme';
import { Btn } from './primitives';

export function EmptyState({ icon = 'shell', title, text, action, secondary }: { icon?: IconName; title: string; text: string; action?: { label: string; onPress: () => void; icon?: IconName }; secondary?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 56, paddingBottom: 32, gap: 12 }}>
      <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={icon} color={c.goldInk} size={40} strokeWidth={1.6} />
      </View>
      <AppText variant="h4" style={{ textAlign: 'center' }} accessibilityRole="header">{title}</AppText>
      <AppText variant="small" muted style={{ textAlign: 'center', maxWidth: 320 }}>{text}</AppText>
      {action && <View style={{ marginTop: 10 }}><Btn label={action.label} icon={action.icon} onPress={action.onPress} variant="gold" /></View>}
      {secondary && <Btn label={secondary.label} onPress={secondary.onPress} variant="ghost" size="sm" />}
    </View>
  );
}

export function ErrorState({ text, onRetry, title = 'That did not load' }: { text: string; onRetry: () => void; title?: string }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', paddingHorizontal: 32, paddingTop: 56, paddingBottom: 32, gap: 12 }}>
      <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: c.red100, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Icon name={/offline/i.test(text) ? 'wifi-off' : 'info'} color={c.red700} size={38} strokeWidth={1.7} />
      </View>
      <AppText variant="h4" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText variant="small" muted style={{ textAlign: 'center', maxWidth: 320 }}>{text}</AppText>
      <View style={{ marginTop: 10 }}><Btn label="Try again" icon="refresh" onPress={onRetry} /></View>
    </View>
  );
}

/** A bar with an icon and a sentence: offline notice, "could not refresh", and so on. */
export function Notice({ icon = 'info', text, tone = 'info', action }: { icon?: IconName; text: string; tone?: 'info' | 'warn'; action?: ReactNode }) {
  const bg = tone === 'warn' ? c.red100 : c.goldWash;
  const fg = tone === 'warn' ? c.red700 : c.goldInk;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: bg }}>
      <Icon name={icon} color={fg} size={20} />
      <AppText variant="caption" color={fg} style={{ flex: 1, letterSpacing: 0, fontSize: 15, lineHeight: 20 }}>{text}</AppText>
      {action}
    </View>
  );
}

export const OFFLINE_TEXT = 'You are offline: messages will send when you are back.';

/** Grey placeholder rows while a list loads (a soft pulse; static when motion is not available). */
export function LoadingRows({ count = 6, avatar = 56 }: { count?: number; avatar?: number }) {
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View accessibilityRole="progressbar" accessibilityLabel="Loading" style={{ opacity: pulse }}>
      {Array.from({ length: count }, (_, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: layout.screenMargin, paddingVertical: 12 }}>
          <View style={{ width: avatar, height: avatar, borderRadius: radius.pill, backgroundColor: c.sand200 }} />
          <View style={{ flex: 1, gap: 10 }}>
            <View style={{ height: 14, width: `${48 + ((i * 17) % 30)}%`, borderRadius: 7, backgroundColor: c.sand200 }} />
            <View style={{ height: 12, width: `${62 + ((i * 11) % 28)}%`, borderRadius: 6, backgroundColor: c.sand200 }} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export const Section = ({ children, right }: { children: string; right?: ReactNode }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: 6 }}>
    <AppText variant="mono" muted style={{ textTransform: 'uppercase', letterSpacing: 1.4, fontSize: 12 }} accessibilityRole="header">{children}</AppText>
    {right}
  </View>
);

