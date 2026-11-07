import { useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { config } from '@/lib/config';
import { c, layout, radius, role, shadowStyle } from '@/theme';

// Swipeable plan / storage cards. The first card is the plan you are on now.
// A function, not a constant: a constant would keep the colours of the mode the app was in when this file loaded.
const plans = () => [
  { id: 'free', name: 'Free', price: '$0', note: 'Browse every route and stage, stays and Discover.', perks: ['Basic app', 'Journal and passport'], bg: role.bg, fg: role.action },
  { id: 'plus', name: 'Pilgrim Plus', price: config.priceLabel, note: 'Walk the whole Camino offline.', perks: ['Offline maps per stage', '5 GB cloud storage'], bg: role.inverse, fg: role.onInverse },
  { id: 'storage', name: 'Extra storage', price: '$5 / year', note: 'Add 5 GB for photos and videos.', perks: ['+5 GB cloud storage', 'Stack as many as you need'], bg: c.gold, fg: role.onHighlight },
] as const;

/** `plan` is the plan the pilgrim is on now (from the server); the badge follows it. */
export function PlanCarousel({ plan, onPick }: { plan: 'free' | 'plus'; onPick: (id: string) => void }) {
  const { width } = useWindowDimensions();
  const cardW = width - layout.screenMargin * 2 - 28;
  const gap = 14;
  const [idx, setIdx] = useState(0);
  const PLANS = plans();
  return (
    <View style={{ gap: 14 }}>
      <FlatList
        horizontal data={PLANS} keyExtractor={(p) => p.id}
        showsHorizontalScrollIndicator={false} decelerationRate="fast"
        snapToInterval={cardW + gap} snapToAlignment="start"
        style={{ marginHorizontal: -layout.screenMargin }}
        contentContainerStyle={{ paddingHorizontal: layout.screenMargin, gap }}
        onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / (cardW + gap)))}
        renderItem={({ item: p }) => (
          <Pressable accessibilityRole="button" onPress={() => onPick(p.id)} style={{ width: cardW, minHeight: 230, borderRadius: radius.lg, padding: 22, gap: 8, backgroundColor: p.bg, borderWidth: p.id === 'free' ? 1 : 0, borderColor: role.border, ...shadowStyle('md') }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h4" color={p.fg}>{p.name}</AppText>
              {p.id === plan && (
                <View style={{ paddingHorizontal: 12, height: 30, borderRadius: radius.pill, backgroundColor: role.action, justifyContent: 'center' }}>
                  <AppText variant="caption" color={c.parchment}>Your plan</AppText>
                </View>
              )}
            </View>
            <AppText variant="h3" color={p.fg}>{p.price}</AppText>
            <AppText variant="small" color={p.fg} style={{ opacity: p.id === 'storage' ? 1 : 0.85 }}>{p.note}</AppText>
            <View style={{ gap: 6, marginTop: 6 }}>
              {p.perks.map((k) => (
                <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="check" color={p.fg} size={18} />
                  <AppText variant="small" color={p.fg}>{k}</AppText>
                </View>
              ))}
            </View>
          </Pressable>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {PLANS.map((p, i) => <View key={p.id} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === idx ? c.blue : c.sand300 }} />)}
      </View>
    </View>
  );
}
