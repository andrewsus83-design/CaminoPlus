import { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, PixelRatio, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ActionRail, RAIL_CIRCLE } from '@/components/ActionRail';
import { AppText } from '@/components/AppText';
import { CommentsSheet } from '@/components/CommentsSheet';
import { FIXED } from '@/components/fixedColors';
import { Icon } from '@/components/Icon';
import { Post, PostMediaUrl, listPostMediaUrls } from '@/lib/api';
import { gridMetrics, gridRows } from '@/lib/gridLayout';
import { SAMPLE_VIEWER_LABEL } from '@/lib/sampleJourney';
import { c, fixed, fonts, radius, layout } from '@/theme';
import { PostRail, usePostRail } from './usePostRail';

// My journey: 9:16 tiles in an even two-column grid, square corners, 2 px between tiles (sideways and downwards) and
// 2 px from the left and right screen edge (the TikTok / Reels profile grid; the maths is in lib/gridLayout.ts).
// Tap a tile to open the full-screen viewer, which scrolls vertically one post at a time, like TikTok. The viewer has the
// app's one action rail (love, bookmark, comments, share), the same component and comments sheet as Discover.
// The colour of a text card belongs to the post, not to the mode the viewer is in: always the light palette.
const CARD_COLORS = [
  { bg: fixed.blue, fg: fixed.parchment },
  { bg: fixed.gold, fg: fixed.blue },
  { bg: '#2F5D50', fg: fixed.parchment },
  { bg: fixed.red, fg: fixed.parchment },
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
/** `source` is a URL, or the asset id of a bundled clip (the sample journey). */
function LoopVideo({ source, active }: { source: string | number; active: boolean }) {
  const { useVideoPlayer, VideoView } = VideoModule!;
  const player = useVideoPlayer(source, (p) => { p.loop = true; p.muted = true; });
  useEffect(() => { if (active) player.play(); else player.pause(); }, [active, player]);
  return <VideoView player={player} nativeControls={false} contentFit="cover" style={{ width: '100%', height: '100%' }} />;
}

const dateOf = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** A picture or clip of a post. A bundled sample has `source` (an asset id) and `poster` (its still picture) instead of a URL. */
type Visual = PostMediaUrl & { source?: number; poster?: number };

/** The small "this is a clip" mark on a grid tile. */
function PlayBadge() {
  return (
    <View accessibilityLabel="Video" style={{ position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ marginLeft: 2, width: 0, height: 0, borderTopWidth: 6, borderBottomWidth: 6, borderLeftWidth: 10, borderTopColor: 'transparent', borderBottomColor: 'transparent', borderLeftColor: FIXED.onPhoto }} />
    </View>
  );
}

/** Fills its parent: photo, video or colour card with the text of the post. */
function PostVisual({ post, media, index, active, small }: { post: Post; media?: Visual; index: number; active: boolean; small?: boolean }) {
  const col = CARD_COLORS[index % CARD_COLORS.length];
  if (media?.type === 'image') return <Image source={media.source ?? { uri: media.url }} resizeMode="cover" style={{ width: '100%', height: '100%' }} />;
  if (media?.type === 'video') {
    // A clip that comes with a poster (the sample journey) shows the poster in the grid, and only the page that is on
    // screen starts a player, so swiping through many clips never keeps many players alive at once.
    if (media.poster !== undefined) {
      const playing = !small && active && !!VideoModule;
      return (
        <View style={{ width: '100%', height: '100%', backgroundColor: FIXED.black }}>
          {playing ? <LoopVideo source={media.source ?? media.url} active /> : <Image source={media.poster} resizeMode="cover" style={{ width: '100%', height: '100%' }} />}
          {small && <PlayBadge />}
        </View>
      );
    }
    return (
      <View style={{ width: '100%', height: '100%', backgroundColor: FIXED.black, alignItems: 'center', justifyContent: 'center' }}>
        {VideoModule && !small ? <LoopVideo source={media.url} active={active} /> : <Icon name="steps" color={FIXED.onPhoto} size={small ? 28 : 48} />}
      </View>
    );
  }
  return (
    <View style={{ width: '100%', height: '100%', backgroundColor: col.bg, justifyContent: 'center', padding: small ? 12 : 32 }}>
      <AppText style={{ fontFamily: fonts.title, fontSize: small ? 16 : 30, lineHeight: small ? 22 : 40, color: col.fg, textAlign: 'center' }} numberOfLines={small ? 7 : 12}>{post.body || post.place_name || 'On the Camino'}</AppText>
    </View>
  );
}

export function JourneyGrid({ posts, margin = layout.screenMargin, sample, media: given, only }: { posts: Post[]; margin?: number; sample?: Record<string, Visual[]>; media?: Record<string, Visual[]>; only?: ReadonlySet<string> | null }) {
  // `sample`: the bundled sample journey. Its pictures and clips come with the app, so nothing is fetched.
  // `media`: the pictures when the screen has already fetched them (Me shares one fetch with the highlights), so nothing is fetched here either.
  const [own, setOwn] = useState<Record<string, Visual[]>>(sample ?? {});
  const media = given ?? own;
  const [openAt, setOpenAt] = useState<number | null>(null);
  const { width } = useWindowDimensions();
  // The rail's state lives here, not in the viewer: the grid stays while the viewer opens and closes, so a like keeps its count.
  const rail = usePostRail({ posts, sample: !!sample });
  // `margin` is the screen's side padding. The grid reaches out of it, down to 2 px from the screen edge (marginHorizontal).
  const { colW, tileH, gap, marginHorizontal } = gridMetrics(width, { margin, pixelRatio: PixelRatio.get() });

  useEffect(() => {
    if (sample || given) return;
    const ids = posts.filter((p) => p.media_count > 0).map((p) => p.id);
    listPostMediaUrls(ids).then(setOwn).catch(() => {});
  }, [posts, sample, given]);

  // `only`: show just these posts (the destination picked in the highlights). The rail and the pictures above keep working on
  // all of `posts`, so picking a destination, and going back to all, asks the network for nothing. The viewer pages through what is shown.
  const shown = useMemo(() => (only ? posts.filter((p) => only.has(p.id)) : posts), [posts, only]);
  // Even rows of two tiles. The only space between tiles is `gap` (2 px, sideways and downwards); the page background shows through it.
  const rows = useMemo(() => gridRows(shown.length), [shown.length]);

  return (
    <>
      <View style={{ marginHorizontal, gap }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap }}>
            {row.map((i) => {
              const p = shown[i];
              const first = media[p.id]?.[0];
              const count = Math.max(media[p.id]?.length ?? 0, p.media_count);
              return (
                <Pressable key={p.id} accessibilityRole="button" accessibilityLabel={`Open post from ${p.place_name ?? 'the Camino'}`} onPress={() => setOpenAt(i)} style={{ width: colW, height: tileH, overflow: 'hidden', backgroundColor: c.sand200 }}>
                  <PostVisual post={p} media={first} index={i} active={false} small />
                  {count > 1 && (
                    <View style={{ position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, height: 24, borderRadius: radius.pill, backgroundColor: FIXED.photoChip }}>
                      <AppText variant="caption" color={FIXED.onPhoto} style={{ fontSize: 12, lineHeight: 14 }}>{count}</AppText>
                    </View>
                  )}
                  <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: 10, backgroundColor: FIXED.tileScrim }}>
                    <AppText variant="caption" color={FIXED.onPhoto} numberOfLines={1} style={{ fontSize: 13, lineHeight: 16 }}>{p.place_name || dateOf(p.published_at) || 'On the Camino'}</AppText>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {openAt !== null && <Viewer posts={shown} media={media} start={openAt} rail={rail} sampleLabel={sample ? SAMPLE_VIEWER_LABEL : undefined} onClose={() => setOpenAt(null)} />}
    </>
  );
}

const CLOSE_SIZE = 52;

function Viewer({ posts, media, start, rail, onClose, sampleLabel }: { posts: Post[]; media: Record<string, Visual[]>; start: number; rail: PostRail; onClose: () => void; sampleLabel?: string }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [cur, setCur] = useState(start);
  const ref = useRef<FlatList<Post>>(null);
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: FIXED.black }}>
        <FlatList
          ref={ref}
          data={posts}
          extraData={rail.itemsFor}
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
                {/* The caption keeps clear of the rail on the right. */}
                <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0 }}>
                  <View style={{ paddingLeft: layout.screenMargin, paddingRight: layout.screenMargin + RAIL_CIRCLE + 12, paddingTop: 60, paddingBottom: insets.bottom + 28, gap: 6, backgroundColor: FIXED.photoScrim }}>
                    {!!sampleLabel && <AppText variant="caption" color={FIXED.goldSoft} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>{sampleLabel}</AppText>}
                    <AppText variant="label" color={FIXED.onPhoto}>{[item.place_name, dateOf(item.published_at)].filter(Boolean).join(' · ') || 'On the Camino'}</AppText>
                    {!!item.body && list.length > 0 && <AppText variant="small" color={FIXED.onPhoto} numberOfLines={4}>{item.body}</AppText>}
                    {list.length > 1 && <AppText variant="caption" color={FIXED.onPhoto}>Swipe sideways for {list.length} slides</AppText>}
                  </View>
                </View>
                <ActionRail bottom={insets.bottom + 28} items={rail.itemsFor(item)} onPress={(kind) => rail.press(item, kind)} />
              </View>
            );
          }}
        />
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12} style={{ position: 'absolute', top: insets.top + layout.screenTop, left: 16, width: CLOSE_SIZE, height: CLOSE_SIZE, borderRadius: CLOSE_SIZE / 2, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" color={FIXED.onPhoto} size={28} />
        </Pressable>
        {/* One short sentence when a like, bookmark or share did not work (offline, refused). Next to the close button, clear of the caption and the rail. */}
        {!!rail.notice && (
          <View pointerEvents="none" style={{ position: 'absolute', top: insets.top + layout.screenTop, left: 16 + CLOSE_SIZE + 12, right: 16, minHeight: CLOSE_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <View accessibilityLiveRegion="polite" accessibilityRole="alert" style={{ maxWidth: 420, backgroundColor: FIXED.blue900, borderRadius: radius.pill, paddingHorizontal: 20, paddingVertical: 12 }}>
              <AppText variant="small" color={FIXED.parchment} style={{ textAlign: 'center' }}>{rail.notice}</AppText>
            </View>
          </View>
        )}
        <CommentsSheet {...rail.sheet} />
      </View>
    </Modal>
  );
}
