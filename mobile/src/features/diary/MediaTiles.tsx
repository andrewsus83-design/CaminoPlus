import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Modal, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { FIXED } from '@/components/fixedColors';
import { Icon } from '@/components/Icon';
import { layout, radius, role } from '@/theme';
import { device } from './device';
import type { DiaryMedia } from './media';
import { MISSING_FILE, formatBytes, formatDuration } from './present';

// The photos and videos of a page: small tiles in the editor (tap one to see it full screen, a corner button takes it off), a grid
// of bigger ones when the page is read, and the full-screen viewer that swipes between them and plays the videos.
//
// A picture or clip whose file is not on the phone (deleted, damaged, or this is the web) is a calm tile that says so; nothing here
// throws for a missing or damaged file, and a damaged picture (one that will not decode) becomes the same tile.
// A video tile has no still picture (the app has no thumbnail maker): a dark tile with a play mark, its length and its size.

const kindWord = (m: DiaryMedia) => (m.kind === 'video' ? 'video' : 'photo');

function useFile(uid: string, m: DiaryMedia): string | null {
  return useMemo(() => device.fileUri(uid, m.name), [uid, m.name]);
}

function Missing({ small }: { small?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: role.sunken, borderWidth: 1, borderColor: role.border, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', padding: 6, gap: 4 }}>
      <Icon name="image" color={role.muted} size={small ? 22 : 28} />
      <AppText variant="caption" muted style={{ textAlign: 'center', letterSpacing: 0, fontSize: small ? 13 : 15, lineHeight: small ? 17 : 20 }}>{MISSING_FILE}</AppText>
    </View>
  );
}

/** The picture, or the play tile of a clip, or the calm tile of a file that is not there. Fills its parent. */
function Face({ uid, m, small }: { uid: string; m: DiaryMedia; small?: boolean }) {
  const uri = useFile(uid, m);
  const [broken, setBroken] = useState(false);
  if (uri === null || broken) return <Missing small={small} />;
  if (m.kind === 'image') {
    return <Image source={{ uri }} resizeMode="cover" onError={() => setBroken(true)} accessibilityIgnoresInvertColors style={{ flex: 1, borderRadius: radius.sm, backgroundColor: role.sunken }} />;
  }
  return (
    <View style={{ flex: 1, borderRadius: radius.sm, backgroundColor: FIXED.black, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <View style={{ width: small ? 44 : 56, height: small ? 44 : 56, borderRadius: radius.pill, backgroundColor: FIXED.photoChip, borderWidth: 2, borderColor: FIXED.onPhoto, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="play" color={FIXED.onPhoto} size={small ? 20 : 26} filled />
      </View>
      <View style={{ position: 'absolute', left: 6, bottom: 6, right: 6, flexDirection: 'row' }}>
        <View style={{ backgroundColor: FIXED.photoChip, borderRadius: radius.xs, paddingHorizontal: 6, paddingVertical: 2 }}>
          <AppText variant="caption" color={FIXED.onPhoto} style={{ letterSpacing: 0, fontSize: 13, lineHeight: 17 }}>
            {[m.durationMs ? formatDuration(m.durationMs) : '', formatBytes(m.bytes)].filter(Boolean).join(' · ')}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function Tile({ uid, m, index, count, size, onOpen, onRemove }: { uid: string; m: DiaryMedia; index: number; count: number; size: number; onOpen: (i: number) => void; onRemove?: (id: string) => void }) {
  const uri = useFile(uid, m);
  const here = uri !== null;
  const label = `${kindWord(m) === 'video' ? 'Video' : 'Photo'} ${index + 1} of ${count}`;
  return (
    <View style={{ width: size, height: size }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={here ? `${label}. Opens it full screen` : `${label}, ${MISSING_FILE.toLowerCase()}`}
        disabled={!here}
        onPress={() => onOpen(index)}
        style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.85 : 1 })}
      >
        <Face uid={uid} m={m} small={size < 120} />
      </Pressable>
      {onRemove && (
        // 48 by 48 to touch, with a smaller dark chip drawn in its corner, so it shows on any picture
        <Pressable accessibilityRole="button" accessibilityLabel={`Remove ${kindWord(m)} ${index + 1}`} onPress={() => onRemove(m.id)} style={{ position: 'absolute', top: 0, right: 0, width: layout.touchMin - 8, height: layout.touchMin - 8, alignItems: 'flex-end', padding: 5 }}>
          <View style={{ width: 28, height: 28, borderRadius: radius.pill, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={FIXED.onPhoto} size={16} strokeWidth={2.2} />
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** The editor's row of tiles, scrolling sideways; while files are being copied the last tile says so. */
export function MediaStrip({ uid, items, adding, onOpen, onRemove }: { uid: string; items: DiaryMedia[]; adding?: boolean; onOpen: (i: number) => void; onRemove: (id: string) => void }) {
  if (items.length === 0 && !adding) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, flexShrink: 0 }} contentContainerStyle={{ gap: 10, paddingVertical: 2 }}>
      {items.map((m, i) => <Tile key={m.id} uid={uid} m={m} index={i} count={items.length} size={104} onOpen={onOpen} onRemove={onRemove} />)}
      {adding && (
        <View accessibilityRole="progressbar" accessibilityLabel="Adding to this page" style={{ width: 104, height: 104, borderRadius: radius.sm, backgroundColor: role.sunken, borderWidth: 1, borderColor: role.border, alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ActivityIndicator color={role.action} />
          <AppText variant="caption" muted style={{ letterSpacing: 0 }}>Adding…</AppText>
        </View>
      )}
    </ScrollView>
  );
}

/** The reading view's grid: two to a row, square, as big as the page allows. */
export function MediaGrid({ uid, items, onOpen }: { uid: string; items: DiaryMedia[]; onOpen: (i: number) => void }) {
  const { width } = useWindowDimensions();
  const size = Math.floor((Math.min(width, 600) - layout.screenMargin * 2 - 10) / 2);
  if (items.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {items.map((m, i) => <Tile key={m.id} uid={uid} m={m} index={i} count={items.length} size={size} onOpen={onOpen} />)}
    </View>
  );
}

/** One clip, playing, with the system's own controls. Only the page that is on screen has a player, so swiping never keeps several alive. */
function ClipPage({ uri }: { uri: string }) {
  const V = device.video();
  if (!V) return <Notice text="Playing videos needs the newest version of the app." />;
  return <Player V={V} uri={uri} />;
}

function Player({ V, uri }: { V: NonNullable<ReturnType<typeof device.video>>; uri: string }) {
  const player = V.useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  return <V.VideoView player={player} nativeControls contentFit="contain" style={{ width: '100%', height: '100%' }} />;
}

function Notice({ text }: { text: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <Icon name="image" color={FIXED.onPhoto} size={40} />
      <AppText color={FIXED.onPhoto} style={{ textAlign: 'center' }}>{text}</AppText>
    </View>
  );
}

function ViewerPage({ uid, m, active, width, height }: { uid: string; m: DiaryMedia; active: boolean; width: number; height: number }) {
  const uri = useFile(uid, m);
  const [broken, setBroken] = useState(false);
  return (
    <View style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
      {uri === null || broken ? <Notice text={`${MISSING_FILE}. The file may have been deleted or damaged.`} />
        : m.kind === 'video' ? (active ? <ClipPage uri={uri} /> : <Icon name="play" color={FIXED.onPhoto} size={56} filled />)
        : <Image source={{ uri }} resizeMode="contain" onError={() => setBroken(true)} accessibilityIgnoresInvertColors style={{ width, height }} />}
    </View>
  );
}

/**
 * Full screen on black: swipe sideways between the page's photos and videos, a video plays with the system's controls, the close
 * button (and the phone's back) goes back to the page. When `onRemove` is given (the editor) a trash button takes the one on show
 * off the page; the viewer closes when none are left.
 */
export function MediaViewer({ uid, items, start, onClose, onRemove }: { uid: string; items: DiaryMedia[]; start: number; onClose: () => void; onRemove?: (id: string) => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [index, setIndex] = useState(Math.min(Math.max(start, 0), Math.max(items.length - 1, 0)));
  const list = useRef<FlatList<DiaryMedia>>(null);
  const at = Math.min(index, Math.max(items.length - 1, 0));
  const m = items[at];

  useEffect(() => { if (items.length === 0) onClose(); }, [items.length, onClose]);
  useEffect(() => { if (index !== at) setIndex(at); }, [index, at]);
  if (!m) return null;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: FIXED.black }}>
        <FlatList
          ref={list}
          data={items}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(x) => x.id}
          initialScrollIndex={at}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / Math.max(width, 1)))}
          windowSize={3}
          renderItem={({ item, index: i }) => <ViewerPage uid={uid} m={item} active={i === at} width={width} height={height} />}
        />
        <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + 8, left: 12, right: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" color={FIXED.onPhoto} />
          </Pressable>
          <View style={{ backgroundColor: FIXED.photoChip, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
            <AppText variant="label" color={FIXED.onPhoto} accessibilityLiveRegion="polite">{`${at + 1} of ${items.length}`}</AppText>
          </View>
          {onRemove ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove this ${kindWord(m)} from the page`} onPress={() => onRemove(m.id)} style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: FIXED.photoChip, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" color={FIXED.onPhoto} />
            </Pressable>
          ) : <View style={{ width: 48, height: 48 }} />}
        </View>
      </View>
    </Modal>
  );
}
