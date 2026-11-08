import { useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { config } from '@/lib/config';
import { ADDON_PRICE_LABEL, ADDON_STORAGE_LABEL, FREE_MEDIA_FACTS, FREE_STORAGE_LABEL, MEDIA_HEADLINE, PLUS_MEDIA_FACTS, PLUS_STORAGE_LABEL } from '@/lib/plan';
import { c, layout, radius, role, shadowStyle, space } from '@/theme';

// Swipeable plan / storage cards. The first card is the plan you are on now. Every number comes from lib/plan.ts.
// A function, not a constant: a constant would keep the colours of the mode the app was in when this file loaded.
type PlanCard = { id: 'free' | 'plus' | 'storage'; name: string; price: string; note: string; perks: string[]; facts?: string; bg: string; fg: string };
const plans = (): PlanCard[] => [
  { id: 'free', name: 'Free', price: '$0', note: 'Browse every route and stage, stays and Discover.', perks: ['Basic app', 'Journal and passport', `${FREE_STORAGE_LABEL} cloud storage`], facts: FREE_MEDIA_FACTS, bg: role.bg, fg: role.action },
  { id: 'plus', name: 'Pilgrim Plus', price: config.priceLabel, note: 'Walk the whole Camino offline.', perks: ['Offline maps per stage', `${PLUS_STORAGE_LABEL} cloud storage`, MEDIA_HEADLINE], facts: PLUS_MEDIA_FACTS, bg: role.inverse, fg: role.onInverse },
  { id: 'storage', name: 'Extra storage', price: ADDON_PRICE_LABEL, note: `Add ${ADDON_STORAGE_LABEL} for photos and videos.`, perks: [`+${ADDON_STORAGE_LABEL} cloud storage`, 'For Pilgrim Plus only', 'One add-on at a time'], bg: c.gold, fg: role.onHighlight },
];

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
            {p.facts ? <AppText variant="small" color={p.fg} style={{ opacity: 0.85, marginTop: space[1] }}>{p.facts}</AppText> : null}
          </Pressable>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {PLANS.map((p, i) => <View key={p.id} style={{ width: i === idx ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: i === idx ? c.blue : c.sand300 }} />)}
      </View>
    </View>
  );
}
