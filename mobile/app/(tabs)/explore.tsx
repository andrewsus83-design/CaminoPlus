import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { secureStorage } from '@/lib/secureStorage';
import { exploreItems } from '@/data/mock';
import { c, fonts } from '@/theme';

const TABS = ['For you', 'Following', 'Photos of you', 'Favourites'] as const;
const FAV_KEY = 'discover.favs';
type Favs = { loved: string[]; saved: string[] };

// Full-screen, swipe left/right. The swipe tutorial shows on first open only (persist with storage later).
let tutorialSeen = false;

export default function Discover() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]>('For you');
  const [showTip, setShowTip] = useState(!tutorialSeen);
  const [favs, setFavs] = useState<Favs>({ loved: [], saved: [] });
  useEffect(() => {
    secureStorage.getItem(FAV_KEY).then((v) => { if (v) setFavs(JSON.parse(v) as Favs); }).catch(() => {});
  }, []);
  const toggle = (kind: keyof Favs, id: string) => setFavs((f) => {
    const list = f[kind].includes(id) ? f[kind].filter((x) => x !== id) : [...f[kind], id];
    const next = { ...f, [kind]: list };
    secureStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
    return next;
  });
  const items = useMemo(() => (tab === 'Favourites' ? exploreItems.filter((i) => favs.loved.includes(i.id) || favs.saved.includes(i.id)) : exploreItems), [tab, favs]);
  const dismiss = () => { tutorialSeen = true; setShowTip(false); };
  return (
    <View style={{ flex: 1, backgroundColor: c.blue900 }}>
      <FlatList
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={items}
        ListEmptyComponent={<View style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}><Icon name="heart" color="rgba(255,255,255,0.8)" size={44} /><AppText variant="lead" color={c.white} style={{ textAlign: 'center' }}>Nothing saved yet. Tap the heart or bookmark on a story to keep it here.</AppText></View>} keyExtractor={(i) => i.id}
        onScrollBeginDrag={dismiss}
        renderItem={({ item }) => (
          <View style={{ width, height, backgroundColor: item.tint, justifyContent: 'flex-end', padding: 24, paddingBottom: insets.bottom + 120 }}>
            <AppText variant="h3" color={c.blue900}>{item.caption}</AppText>
            <AppText variant="mono" color={c.blue900}>@{item.user}</AppText>
            <View style={{ position: 'absolute', right: 16, bottom: insets.bottom + 130, gap: 18, alignItems: 'center' }}>
              {(['loved', 'saved'] as const).map((k) => {
                const on = favs[k].includes(item.id);
                return (
                  <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'loved' ? (on ? 'Remove love' : 'Love') : (on ? 'Remove bookmark' : 'Bookmark')} onPress={() => toggle(k, item.id)} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.85)' }}>
                    <Icon name={k === 'loved' ? 'heart' : 'bookmark'} color={k === 'loved' ? c.red : c.blue} filled={on} size={28} />
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
      />
      <View style={{ position: 'absolute', top: insets.top + 12, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: width, justifyContent: 'center', gap: 22, paddingHorizontal: 16 }}>
          {TABS.map((t) => (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => setTab(t)} hitSlop={10} style={{ paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: tab === t ? c.white : 'transparent' }}>
              <AppText variant="body" color={tab === t ? c.white : 'rgba(255,255,255,0.65)'} style={{ fontFamily: fonts.bodyBold, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{t}</AppText>
            </Pressable>
          ))}
        </ScrollView>
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
