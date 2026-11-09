// Empty, error, loading and offline pieces. Every list in the social screens uses these, so
// "nothing here yet" and "it did not load" always look and sound the same.
import { ReactNode, useEffect, useRef } from 'react';
import { Animated, Platform, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, IconName } from '@/components/Icon';
import { c, layout, radius, role, space } from '@/theme';
import { Btn } from './primitives';

export function EmptyState({ icon = 'shell', title, text, action, secondary }: { icon?: IconName; title: string; text: string; action?: { label: string; onPress: () => void; icon?: IconName }; secondary?: { label: string; onPress: () => void } }) {
  return (
    <View style={{ alignItems: 'center', paddingHorizontal: space[8], paddingTop: space[16], paddingBottom: space[8], gap: space[3] }}>
      <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: c.goldWash, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] }}>
        <Icon name={icon} color={role.accentText} size={32} />
      </View>
      <AppText variant="h4" style={{ textAlign: 'center' }} accessibilityRole="header">{title}</AppText>
      <AppText variant="small" muted style={{ textAlign: 'center', maxWidth: 320 }}>{text}</AppText>
      {action && <View style={{ marginTop: space[3] }}><Btn label={action.label} icon={action.icon} onPress={action.onPress} variant="gold" /></View>}
      {secondary && <Btn label={secondary.label} onPress={secondary.onPress} variant="ghost" size="sm" />}
    </View>
  );
}

export function ErrorState({ text, onRetry, title = 'That did not load' }: { text: string; onRetry: () => void; title?: string }) {
  return (
    <View accessibilityRole="alert" style={{ alignItems: 'center', paddingHorizontal: space[8], paddingTop: space[16], paddingBottom: space[8], gap: space[3] }}>
      <View style={{ width: 88, height: 88, borderRadius: radius.pill, backgroundColor: c.red100, alignItems: 'center', justifyContent: 'center', marginBottom: space[2] }}>
        <Icon name={/offline/i.test(text) ? 'wifi-off' : 'info'} color={c.red700} size={32} />
      </View>
      <AppText variant="h4" style={{ textAlign: 'center' }}>{title}</AppText>
      <AppText variant="small" muted style={{ textAlign: 'center', maxWidth: 320 }}>{text}</AppText>
      <View style={{ marginTop: space[3] }}><Btn label="Try again" icon="refresh" onPress={onRetry} /></View>
    </View>
  );
}

/** A bar with an icon and a sentence: offline notice, "could not refresh", and so on. */
export function Notice({ icon = 'info', text, tone = 'info', action }: { icon?: IconName; text: string; tone?: 'info' | 'warn'; action?: ReactNode }) {
  const bg = tone === 'warn' ? c.red100 : c.goldWash;
  const fg = tone === 'warn' ? c.red700 : role.accentText;
  return (
    <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], backgroundColor: bg }}>
      <Icon name={icon} color={fg} size={20} />
      <AppText variant="caption" color={fg} style={{ flex: 1 }}>{text}</AppText>
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
        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: layout.screenMargin, paddingVertical: space[3] }}>
          <View style={{ width: avatar, height: avatar, borderRadius: radius.pill, backgroundColor: role.sunken }} />
          <View style={{ flex: 1, gap: space[3] }}>
            <View style={{ height: 14, width: `${48 + ((i * 17) % 30)}%`, borderRadius: radius.xs, backgroundColor: role.sunken }} />
            <View style={{ height: 12, width: `${62 + ((i * 11) % 28)}%`, borderRadius: radius.xs, backgroundColor: role.sunken }} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export const Section = ({ children, right }: { children: string; right?: ReactNode }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenMargin, paddingTop: space[5], paddingBottom: space[2] }}>
    <AppText variant="mono" muted style={{ textTransform: 'uppercase' }} accessibilityRole="header">{children}</AppText>
    {right}
  </View>
);

