import { useState } from 'react';
import { FlatList, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { exploreItems } from '@/data/mock';
import { c, fonts } from '@/theme';

const TABS = ['For you', 'Following', 'Photos of you'] as const;

// Full-screen, swipe left/right. The swipe tutorial shows on first open only (persist with storage later).
let tutorialSeen = false;

export default function Explore() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]>('For you');
  const [showTip, setShowTip] = useState(!tutorialSeen);
  const dismiss = () => { tutorialSeen = true; setShowTip(false); };
  return (
    <View style={{ flex: 1, backgroundColor: c.blue900 }}>
      <FlatList
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={exploreItems} keyExtractor={(i) => i.id}
        onScrollBeginDrag={dismiss}
        renderItem={({ item }) => (
          <View style={{ width, height, backgroundColor: item.tint, justifyContent: 'flex-end', padding: 24, paddingBottom: insets.bottom + 120 }}>
            <AppText variant="h3" color={c.blue900}>{item.caption}</AppText>
            <AppText variant="mono" color={c.blue900}>@{item.user}</AppText>
          </View>
        )}
      />
      <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 28 }}>
        {TABS.map((t) => (
          <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} hitSlop={10} style={{ paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: tab === t ? c.white : 'transparent' }}>
            <AppText variant="lead" color={tab === t ? c.white : 'rgba(255,255,255,0.65)'} style={{ fontFamily: fonts.bodyBold, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{t}</AppText>
          </Pressable>
        ))}
      </View>
      {showTip && (
        <Pressable onPress={dismiss} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12,35,64,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <AppText variant="accent" color={c.parchment}>Swipe left or right</AppText>
          <AppText variant="small" color={c.parchment}>Tap anywhere to start</AppText>
        </Pressable>
      )}
    </View>
  );
}
