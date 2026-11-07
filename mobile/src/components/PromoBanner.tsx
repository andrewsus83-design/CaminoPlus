import { useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { Icon, IconName } from './Icon';
import { c, fonts, layout, radius, role } from '@/theme';

export type Promo = { id: string; eyebrow: string; title: string; cta: string; icon: IconName; onPress?: () => void };

/** OTA-style promo carousel from the design system: blue card, gold art, gold button, dots. */
export function PromoBanner({ promos }: { promos: Promo[] }) {
  const { width } = useWindowDimensions();
  const w = width - layout.screenMargin * 2;
  const [i, setI] = useState(0);
  const onEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => setI(Math.round(e.nativeEvent.contentOffset.x / (w + 12)));
  return (
    <View style={{ gap: 12 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} snapToInterval={w + 12} decelerationRate="fast" onMomentumScrollEnd={onEnd} contentContainerStyle={{ gap: 12 }} style={{ flexGrow: 0 }}>
        {promos.map((p) => (
          <View key={p.id} style={{ width: w, minHeight: 190, borderRadius: radius.xl, backgroundColor: role.inverse, padding: 24, overflow: 'hidden', justifyContent: 'space-between' }}>
            <View style={{ position: 'absolute', right: -36, bottom: -44, opacity: 0.9 }}><Icon name={p.icon} color={c.gold} size={200} strokeWidth={1.2} /></View>
            <View style={{ gap: 8 }}>
              <AppText variant="mono" color={role.onInverseAccent} style={{ textTransform: 'uppercase', letterSpacing: 1.5 }}>{p.eyebrow}</AppText>
              <AppText style={{ fontFamily: fonts.title, fontSize: 28, lineHeight: 34, color: role.onInverse, maxWidth: 230 }}>{p.title}</AppText>
            </View>
            <Pressable accessibilityRole="button" onPress={p.onPress} style={{ alignSelf: 'flex-start', height: 48, paddingHorizontal: 24, borderRadius: radius.pill, backgroundColor: c.gold, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}>
              <AppText variant="label" color={role.onHighlight}>{p.cta}</AppText>
            </Pressable>
          </View>
        ))}
      </ScrollView>
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        {promos.map((p, k) => <View key={p.id} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: radius.pill, backgroundColor: k === i ? c.blue : c.sand300 }} />)}
      </View>
    </View>
  );
}
