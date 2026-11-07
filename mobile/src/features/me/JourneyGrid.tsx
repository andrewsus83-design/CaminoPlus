import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, PixelRatio, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Post, PostMediaUrl, listPostMediaUrls } from '@/lib/api';
import { gridMetrics, gridRows } from '@/lib/gridLayout';
import { c, fonts, radius, layout } from '@/theme';

// My journey: 9:16 tiles in an even two-column grid, edge to edge, square corners, a 1 px line between tiles (the
// TikTok / Reels profile grid; the maths is in lib/gridLayout.ts). Tap a tile to open the full-screen viewer, which
// scrolls vertically one post at a time, like TikTok.
const CARD_COLORS = [
  { bg: c.blue, fg: c.parchment },
  { bg: c.gold, fg: c.blue },
  { bg: '#2F5D50', fg: c.parchment },
  { bg: c.red, fg: c.parchment },
  { bg: '#E9C987', fg: '#4A3A12' },
] as const;

let VideoModule: typeof import('expo-video') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  VideoModule = require('expo-video');
  if (!VideoModule?.useVideoPlayer) VideoModule = null;
} catch {
  VideoModule = null;
}
function LoopVideo({ uri, active }: { uri: string; active: boolean }) {
  const { useVideoPlayer, VideoView } = VideoModule!;
  const player = useVideoPlayer(uri, (p) => { p.loop = true; p.muted = true; });
  useEffect(() => { if (active) player.play(); else player.pause(); }, [active, player]);
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ width: '100%', height: '100%' }} />;
}

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** Fills its parent: photo, video or colour card with the text of the post. */
function PostVisual({ post, media, index, active, small }: { post: Post; media?: PostMediaUrl; index: number; active: boolean; small?: boolean }) {
  const col = CARD_COLORS[index % CARD_COLORS.length];
  if (media?.type === 'image') return <Image source={{ uri: media.url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />;
  if (media?.type === 'video') {
    return (
      <View style={{ width: '100%', height: '100%', backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' }}>
        {VideoModule && !small ? <LoopVideo uri={media.url} active={active} /> : <Icon name="steps" color="#FFFFFF" size={small ? 28 : 48} />}
      </View>
    );
  }
  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: col.bg, justifyContent: 'center', padding: small ? 12 : 32 }}>
      <AppText style={{ fontFamily: fonts.title, fontSize: small ? 16 : 30, lineHeight: small ? 22 : 40, color: col.fg, textAlign: 'center' }} numberOfLines={small ? 7 : 12}>{post.body || post.place_name || 'On the Camino'}</AppText>
    </View>
  );
}

export function JourneyGrid({ posts, bleed = true, margin = layout.screenMargin }: { posts: Post[]; bleed?: boolean; margin?: number }) {
  const [media, setMedia] = useState<Record<string, PostMediaUrl[]>>({});
  const [openAt, setOpenAt] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  // Edge to edge by default: `margin` is the screen's side padding, which the negative margin below cancels.
  // Pass bleed={false} to keep the grid inside that padding.
  const { colW, tileH, line } = gridMetrics(width, { bleed, margin, pixelRatio: PixelRatio.get() });

  useEffect(() => {
    const ids = posts.filter((p) => p.media_count > 0).map((p) => p.id);
    listPostMediaUrls(ids).then(setMedia).catch(() => {});
  }, [posts]);

  // Even rows of two tiles. The only space between tiles is `line` (1 px); the page background shows through it.
  const rows = useMemo(() => gridRows(posts.length), [posts.length]);

  return (
    <>
      <View style={{ marginHorizontal: bleed ? -margin : 0, gap: line }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: line }}>
            {row.map((i) => {
              const p = posts[i];
              const first = media[p.id]?.[0];
              const count = Math.max(media[p.id]?.length ?? 0, p.media_count);
              return (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Open post from ${p.place_name ?? 'the Camino'}`} onPress={() => setOpenAt(i)} style={{ width: colW, height: tileH, overflow: 'hidden', backgroundColor: c.sand200 }}>
                  <PostVisual post={p} media={first} index={i} active={false} small />
                  {count > 1 && (
                    <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: 'rgba(0,0,0,0.45)' }}>
                      <AppText variant="caption" color="#FFFFFF" style={{ fontSize: 12, lineHeight: 14 }}>{count}</AppText>
                    </View>
                  )}
                  <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.28)' }}>
                    <AppText variant="caption" color="#FFFFFF" numberOfLines={1} style={{ fontSize: 13, lineHeight: 16 }}>{p.place_name || dateOf(p.published_at) || 'On the Camino'}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {openAt !== null && <Viewer posts={posts} media={media} start={openAt} onClose={() => setOpenAt(null)} />}
    </>
  );
}

function Viewer({ posts, media, start, onClose }: { posts: Post[]; media: Record<string, PostMediaUrl[]>; start: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cur, setCur] = useState(start);
  const ref = useRef<FlatList<Post>>(null);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <FlatList
          ref={ref}
          data={posts}
          keyExtractor={(p) => p.id}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          initialScrollIndex={start}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          onMomentumScrollEnd={(e) => setCur(Math.round(e.nativeEvent.contentOffset.y / height))}
          renderItem={({ item, index }) => {
            const list = media[item.id] ?? [];
            return (
              <View style={{ width, height }}>
                {list.length > 1 ? (
                  <FlatList horizontal pagingEnabled data={list} keyExtractor={(_, i) => String(i)} showsHorizontalScrollIndicator={false}
                    renderItem={({ item: m }) => <View style={{ width, height }}><PostVisual post={item} media={m} index={index} active={index === cur} /></View>} />
                ) : (
                  <PostVisual post={item} media={list[0]} index={index} active={index === cur} />
                )}
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 60, paddingBottom: insets.bottom + 28, gap: 6, backgroundColor: 'rgba(0,0,0,0.35)' }}>
                  <AppText variant="label" color="#FFFFFF">{[item.place_name, dateOf(item.published_at)].filter(Boolean).join(' · ') || 'On the Camino'}</AppText>
                  {!!item.body && list.length > 0 && <AppText variant="small" color="#FFFFFF" numberOfLines={4}>{item.body}</AppText>}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Icon name="heart" color={c.red} size={18} filled />
                    <AppText variant="caption" color="#FFFFFF">{item.like_count}</AppText>
                    {list.length > 1 && <AppText variant="caption" color="#FFFFFF" style={{ marginLeft: 12 }}>Swipe sideways for {list.length} slides</AppText>}
                  </View>
                </View>
              </View>
            );
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={{ position: 'absolute', top: insets.top + 10, left: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color="#FFFFFF" size={28} />
        </Pressable>
      </View>
    </Modal>
  );
}
