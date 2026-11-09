import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionRail, RAIL_BOTTOM, RAIL_CIRCLE } from '@/components/ActionRail';
import { AppText } from '@/components/AppText';
import { CommentsSheet } from '@/components/CommentsSheet';
import { FIXED } from '@/components/fixedColors';
import { Icon } from '@/components/Icon';
import { railItems, type RailKind } from '@/lib/actionRail';
import type { SheetComment } from '@/lib/postComments';
import { SHARE_APP } from '@/lib/postShare'; // sample content is never shared outside the app: share the invitation instead of an invented place or caption
import { useLocalReactions } from '@/lib/useLocalReactions';
import { exploreItems } from '@/data/mock';
import { fonts, icon, layout, radius, space } from '@/theme';

const TABS = ['For you', 'Friends', 'Photos of you', 'Favourites'] as const;
const FAV_KEY = 'discover.favs';
const SEED: Record<string, SheetComment[]> = {
  e1: [{ id: 'a', user: 'lucas', text: 'Golden light! Which stage was this?' }],
  e2: [{ id: 'b', user: 'hannah', text: 'Left my stone here too.' }, { id: 'c', user: 'ana', text: 'Buen Camino!' }],
};

// Full-screen. Swipe UP/DOWN for the next/previous story, LEFT/RIGHT to change category
// (For you, Friends, ...). The swipe tutorial shows on first open only.
let tutorialSeen = false;

// Discover is always photos and pastel cards under dark overlays, in light and dark mode: every colour on this screen comes
// from FIXED (the light token values), never from the theme colours, which flip in dark mode.

export default function Discover() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<(typeof TABS)[number]>('For you');
  const pager = useRef<FlatList<(typeof TABS)[number]>>(null);
  const goTab = (t: (typeof TABS)[number]) => {
    setTab(t);
    pager.current?.scrollToIndex({ index: TABS.indexOf(t), animated: true });
  };
  const [showTip, setShowTip] = useState(!tutorialSeen);
  // Love, bookmark and comments of the sample stories stay on this phone (love and bookmark per person, see lib/useLocalReactions.ts).
  const { favs, toggle, comments, addComment } = useLocalReactions(FAV_KEY, SEED);
  const [openId, setOpenId] = useState<string | null>(null);
  const press = (id: string, kind: RailKind) => {
    if (kind === 'love') toggle('loved', id);
    else if (kind === 'save') toggle('saved', id);
    else if (kind === 'comments') setOpenId(id);
    else Share.share({ message: SHARE_APP }).catch(() => {});
  };
  const itemsFor = (t: (typeof TABS)[number]) => (t === 'Favourites' ? exploreItems.filter((i) => favs.loved.includes(i.id) || favs.saved.includes(i.id)) : exploreItems);
  const dismiss = () => { tutorialSeen = true; setShowTip(false); };
  return (
    <View style={{ flex: 1, backgroundColor: FIXED.blue900 }}>
      {/* Horizontal pager = categories. Each page is a vertical pager = stories. */}
      <FlatList
        ref={pager}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false}
        data={TABS}
        keyExtractor={(t) => t}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onScrollBeginDrag={dismiss}
        onMomentumScrollEnd={(e) => setTab(TABS[Math.max(0, Math.min(TABS.length - 1, Math.round(e.nativeEvent.contentOffset.x / width)))])}
        renderItem={({ item: t }) => (
          <FlatList
            style={{ width, height }}
            pagingEnabled snapToInterval={height} decelerationRate="fast" showsVerticalScrollIndicator={false}
            nestedScrollEnabled
            data={itemsFor(t)}
            getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
            onScrollBeginDrag={dismiss}
            ListEmptyComponent={<View style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: space[10], gap: space[3] }}><Icon name="heart" color={FIXED.emptyIcon} size={icon.lg} /><AppText variant="lead" color={FIXED.white} style={{ textAlign: 'center' }}>Nothing saved yet. Tap the heart or bookmark on a story to keep it here.</AppText></View>}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
          <View style={{ width, height, backgroundColor: item.tint, justifyContent: 'flex-end', paddingLeft: layout.screenMargin, paddingRight: layout.screenMargin + RAIL_CIRCLE + space[3], paddingTop: space[6], paddingBottom: insets.bottom + RAIL_BOTTOM }}>
            <AppText variant="h3" color={FIXED.blue900}>{item.caption}</AppText>
            <AppText variant="mono" color={FIXED.blue900}>@{item.user}</AppText>
            <ActionRail
              items={railItems({ loved: favs.loved.includes(item.id), saved: favs.saved.includes(item.id), counts: { comments: (comments[item.id] ?? []).length } })}
              onPress={(kind) => press(item.id, kind)}
            />
          </View>
            )}
          />
        )}
      />
      <View style={{ position: 'absolute', top: insets.top + layout.screenTop, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: width, justifyContent: 'center', gap: space[6], paddingHorizontal: layout.screenMargin }}>
          {TABS.map((t) => (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => goTab(t)} hitSlop={10} style={{ minHeight: layout.touchHard, justifyContent: 'center', paddingVertical: space[2], borderBottomWidth: 3, borderBottomColor: tab === t ? FIXED.white : 'transparent' }}>
              <AppText variant="body" color={tab === t ? FIXED.white : FIXED.tabOff} style={{ fontFamily: fonts.bodyBold, textShadowColor: FIXED.tabShadow, textShadowRadius: 6 }}>{t}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <View accessibilityLabel="Sample stories" style={{ alignSelf: 'center', marginTop: space[2], marginHorizontal: layout.screenMargin, paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.sm, backgroundColor: FIXED.pill, justifyContent: 'center' }}>
          <AppText variant="caption" color={FIXED.goldInk} style={{ textAlign: 'center' }}>Sample stories · real ones from pilgrims are coming</AppText>
        </View>
      </View>
      <CommentsSheet
        visible={!!openId}
        comments={openId ? comments[openId] ?? [] : []}
        onSend={(text) => { if (openId) addComment(openId, text); return !!openId; }}
        onClose={() => setOpenId(null)}
      />
      {showTip && (
        <Pressable onPress={dismiss} style={{ position: 'absolute', inset: 0, backgroundColor: FIXED.tutorialScrim, alignItems: 'center', justifyContent: 'center', gap: space[3] }}>
          <AppText variant="accent" color={FIXED.parchment}>Swipe up or down</AppText>
          <AppText variant="small" color={FIXED.parchment}>for the next story</AppText>
          <AppText variant="accent" color={FIXED.parchment} style={{ marginTop: space[3] }}>Swipe left or right</AppText>
          <AppText variant="small" color={FIXED.parchment}>for For you, Friends and more</AppText>
          <AppText variant="small" color={FIXED.goldSoft} style={{ marginTop: space[4] }}>Tap anywhere to start</AppText>
        </Pressable>
      )}
    </View>
  );
}
