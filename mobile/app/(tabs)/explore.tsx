import { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Share, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { exploreItems } from '@/data/mock';
import { c, fonts, layout, radius, role } from '@/theme';
// Sample content is never shared outside the app: share the invitation instead of an invented place or caption.
const SHARE_APP = 'Walking the Camino? CaminoPlus has offline maps, stays and a pilgrim passport: https://camino.plus';

const TABS = ['For you', 'Friends', 'Photos of you', 'Favourites'] as const;
const FAV_KEY = 'discover.favs';
type Comment = { id: string; user: string; text: string };
const SEED: Record<string, Comment[]> = {
  e1: [{ id: 'a', user: 'lucas', text: 'Golden light! Which stage was this?' }],
  e2: [{ id: 'b', user: 'hannah', text: 'Left my stone here too.' }, { id: 'c', user: 'ana', text: 'Buen Camino!' }],
};
type Favs = { loved: string[]; saved: string[] };

// Full-screen. Swipe UP/DOWN for the next/previous story, LEFT/RIGHT to change category
// (For you, Friends, ...). The swipe tutorial shows on first open only.
let tutorialSeen = false;

// Fixed light colours: Discover is always photos under dark overlays, in light and dark mode.
const WHITE = '#FFFDF8';
const PARCH = '#F6EFE2';

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
  const [favs, setFavs] = useState<Favs>({ loved: [], saved: [] });
  const { session } = useAuth();
  const favKey = session ? userKey(session.user.id, FAV_KEY) : null;
  useEffect(() => {
    if (!favKey) return;
    localStore.getJSON<Favs>(favKey).then((v) => { if (v && Array.isArray(v.loved) && Array.isArray(v.saved)) setFavs(v); });
  }, [favKey]);
  const toggle = (kind: keyof Favs, id: string) => setFavs((f) => {
    const list = f[kind].includes(id) ? f[kind].filter((x) => x !== id) : [...f[kind], id];
    const next = { ...f, [kind]: list };
    if (favKey) void localStore.setJSON(favKey, next);
    return next;
  });
  const [comments, setComments] = useState<Record<string, Comment[]>>(SEED);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const sendComment = () => {
    const t = draft.trim();
    if (!t || !openId) return;
    setComments((cm) => ({ ...cm, [openId]: [...(cm[openId] ?? []), { id: `c${Date.now()}`, user: 'you', text: t }] }));
    setDraft('');
  };
  const share = (item: (typeof exploreItems)[number]) =>
    Share.share({ message: SHARE_APP }).catch(() => {});
  const itemsFor = (t: (typeof TABS)[number]) => (t === 'Favourites' ? exploreItems.filter((i) => favs.loved.includes(i.id) || favs.saved.includes(i.id)) : exploreItems);
  const dismiss = () => { tutorialSeen = true; setShowTip(false); };
  return (
    <View style={{ flex: 1, backgroundColor: c.blue900 }}>
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
            ListEmptyComponent={<View style={{ width, height, alignItems: 'center', justifyContent: 'center', padding: 40, gap: 12 }}><Icon name="heart" color="rgba(255,255,255,0.8)" size={44} /><AppText variant="lead" color={WHITE} style={{ textAlign: 'center' }}>Nothing saved yet. Tap the heart or bookmark on a story to keep it here.</AppText></View>}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
          <View style={{ width, height, backgroundColor: item.tint, justifyContent: 'flex-end', paddingHorizontal: layout.screenMargin, paddingTop: 24, paddingBottom: insets.bottom + 120 }}>
            <AppText variant="h3" color={c.blue900}>{item.caption}</AppText>
            <AppText variant="mono" color={c.blue900}>@{item.user}</AppText>
            <View style={{ position: 'absolute', right: layout.screenMargin, bottom: insets.bottom + 120, gap: 14, alignItems: 'center' }}>
              {(['loved', 'saved'] as const).map((k) => {
                const on = favs[k].includes(item.id);
                return (
                  <Pressable key={k} accessibilityRole="button" accessibilityLabel={k === 'loved' ? (on ? 'Remove love' : 'Love') : (on ? 'Remove bookmark' : 'Bookmark')} onPress={() => toggle(k, item.id)} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.85)' }}>
                    <Icon name={k === 'loved' ? 'heart' : 'bookmark'} color={k === 'loved' ? c.red : c.blue} filled={on} size={28} />
                  </Pressable>
                );
              })}
              <Pressable accessibilityRole="button" accessibilityLabel="Comments" onPress={() => setOpenId(item.id)} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.85)' }}>
                <Icon name="chat" color={c.blue} size={26} />
                <AppText variant="caption" color={c.blue} style={{ fontSize: 11, lineHeight: 13 }}>{(comments[item.id] ?? []).length}</AppText>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={() => share(item)} style={{ width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.85)' }}>
                <Icon name="share" color={c.blue} size={26} />
              </Pressable>
            </View>
          </View>
            )}
          />
        )}
      />
      <View style={{ position: 'absolute', top: insets.top + layout.screenTop, left: 0, right: 0 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ minWidth: width, justifyContent: 'center', gap: 22, paddingHorizontal: layout.screenMargin }}>
          {TABS.map((t) => (
            <Pressable key={t} accessibilityRole="tab" accessibilityState={{ selected: tab === t }} onPress={() => goTab(t)} hitSlop={10} style={{ paddingVertical: 8, borderBottomWidth: 3, borderBottomColor: tab === t ? WHITE : 'transparent' }}>
              <AppText variant="body" color={tab === t ? WHITE : 'rgba(255,255,255,0.65)'} style={{ fontFamily: fonts.bodyBold, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 6 }}>{t}</AppText>
            </Pressable>
          ))}
        </ScrollView>
        <View accessibilityLabel="Sample stories" style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 14, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,253,248,0.92)', justifyContent: 'center' }}>
          <AppText variant="caption" color={c.goldInk}>Sample stories · real ones from pilgrims are coming</AppText>
        </View>
      </View>
      <Modal visible={!!openId} transparent animationType="slide" onRequestClose={() => setOpenId(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(12,35,64,0.5)' }}>
          <Pressable accessibilityLabel="Close comments" onPress={() => setOpenId(null)} style={{ flex: 1 }} />
          <View style={{ maxHeight: height * 0.65, backgroundColor: role.bg, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingHorizontal: layout.screenMargin, paddingTop: 20, paddingBottom: insets.bottom + 16, gap: 14 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="h4">Comments</AppText>
              <Pressable accessibilityLabel="Close" onPress={() => setOpenId(null)} hitSlop={12}><Icon name="close" color={role.text} size={26} /></Pressable>
            </View>
            <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12 }}>
              {(openId ? comments[openId] ?? [] : []).length === 0 && <AppText variant="small" muted>No comments yet. Be the first.</AppText>}
              {(openId ? comments[openId] ?? [] : []).map((cm) => (
                <View key={cm.id} style={{ gap: 2 }}>
                  <AppText variant="caption" muted>@{cm.user}</AppText>
                  <AppText variant="small">{cm.text}</AppText>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: 'row', alignItems: 'center', height: 56, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, paddingLeft: 18, paddingRight: 6 }}>
              <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={sendComment} returnKeyType="send" maxLength={200} placeholder="Add a comment…" placeholderTextColor={role.muted} style={{ flex: 1, fontFamily: fonts.body, fontSize: 17, color: role.text }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Send comment" onPress={sendComment} style={{ height: 44, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: c.gold, justifyContent: 'center' }}>
                <AppText variant="label" color={c.blue}>Send</AppText>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {showTip && (
        <Pressable onPress={dismiss} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(12,35,64,0.6)', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <AppText variant="accent" color={PARCH}>Swipe up or down</AppText>
          <AppText variant="small" color={PARCH}>for the next story</AppText>
          <AppText variant="accent" color={PARCH} style={{ marginTop: 12 }}>Swipe left or right</AppText>
          <AppText variant="small" color={PARCH}>for For you, Friends and more</AppText>
          <AppText variant="small" color={c.goldSoft} style={{ marginTop: 16 }}>Tap anywhere to start</AppText>
        </Pressable>
      )}
    </View>
  );
}
