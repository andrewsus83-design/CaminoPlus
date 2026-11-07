import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import type { Post, PostMediaUrl } from '@/lib/api';
import { localStore, userKey } from '@/lib/localStore';
import { c, fonts, layout, radius, role } from '@/theme';
import { coverUrl, firstLetter, highlightLabel, nextHighlightIndex, parseSeen, type DayLike, type Highlight, type SeenSaved } from './highlights';

// Story highlights under the My Camino card, one round picture for every destination of the plan (design page, "Me · Journey"
// phone: .highlights, .cp-ring, .cp-ring.seen, .add). What a highlight is and which posts belong to it is highlights.ts.
const RING = 66; // a 3 px ring around the 60 px picture
const PICTURE = 60; // its outer 3 px are the page colour, so the picture sits clear of the ring, as in the design
const ITEM_W = 72;
const GAP = 16;
const STRIDE = ITEM_W + GAP;
const SEEN_NAME = 'highlights.seen';

/**
 * Which highlights this person has opened (their ring is grey instead of gold). Kept on the phone under their own keys
 * (u.<id>.highlights.seen), so signing out clears it with the rest of their data. The saved copy is read first and nothing is
 * written before that, so a tap in the first moments cannot overwrite what is on the phone.
 */
function useSeen(userId: string | null | undefined) {
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set());
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void localStore.getJSON<unknown>(userKey(userId, SEEN_NAME)).then((raw) => {
      if (!alive) return;
      const saved = parseSeen(raw);
      setSeen((cur) => (saved.every((k) => cur.has(k)) ? cur : new Set([...cur, ...saved])));
      setLoadedFor(userId);
    });
    return () => { alive = false; };
  }, [userId]);

  useEffect(() => {
    if (!userId || loadedFor !== userId) return;
    const saved: SeenSaved = { v: 1, keys: [...seen] };
    void localStore.setJSON(userKey(userId, SEEN_NAME), saved);
  }, [seen, userId, loadedFor]);

  const mark = useCallback((key: string) => setSeen((cur) => (cur.has(key) ? cur : new Set(cur).add(key))), []);
  return { seen, mark };
}

function Item({ h, cover, seen, active, onPress }: { h: Highlight<Post>; cover: string | null; seen: boolean; active: boolean; onPress: () => void }) {
  // The link that did not load (a signed link lasts an hour) is drawn as the letter, not as an empty circle, until a new link comes.
  const [failed, setFailed] = useState<string | null>(null);
  const visited = h.state === 'visited';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={highlightLabel(h, active)} onPress={onPress} style={{ width: ITEM_W, alignItems: 'center', gap: 6 }}>
      {visited ? (
        // gold until it is opened, then the quiet strong border colour
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, padding: 3, backgroundColor: seen ? role.borderStrong : c.gold }}>
          <View style={{ width: PICTURE, height: PICTURE, borderRadius: PICTURE / 2, borderWidth: 3, borderColor: role.bg, overflow: 'hidden', backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
            {cover && cover !== failed
              ? <Image source={{ uri: cover }} resizeMode="cover" accessibilityIgnoresInvertColors onError={() => setFailed(cover)} style={{ width: '100%', height: '100%' }} />
              : <AppText color={role.muted} style={{ fontFamily: fonts.title, fontSize: 24, lineHeight: 30 }}>{firstLetter(h.name)}</AppText>}
          </View>
        </View>
      ) : (
        // not visited yet: no ring, no picture, a dashed circle with a pin
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: role.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" color={role.muted} size={24} />
        </View>
      )}
      <AppText variant="caption" numberOfLines={1} style={{ width: ITEM_W, textAlign: 'center', fontSize: 12, lineHeight: 16, letterSpacing: 0, fontFamily: active ? fonts.bodyBold : fonts.bodyMedium }}>{h.name}</AppText>
    </Pressable>
  );
}

/**
 * The row. A visited destination (it has posts) is opened with `onPick`: the screen filters the Journey grid to its posts. A
 * destination with no post opens that day in the planner, as the plan tracker does. With no destinations nothing is drawn, not
 * even the space. The row reaches out to the screen edges (the screen pads its content by layout.screenMargin) and, on a long
 * plan, opens at the next destination, so it does not open at the first day.
 */
export function Highlights({ items, days, media, activeKey, userId, onPick }: {
  items: Highlight<Post>[];
  days: readonly DayLike[];
  /** The photos of the posts (usePostMedia). */
  media: Record<string, PostMediaUrl[]>;
  /** The highlight whose posts the Journey grid shows now, if any. */
  activeKey: string | null;
  userId: string | null | undefined;
  onPick: (h: Highlight<Post>) => void;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { seen, mark } = useSeen(userId);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const placedFor = useRef<string | null>(null);
  const nextAt = useMemo(() => nextHighlightIndex(days, items), [days, items]);
  if (items.length === 0) return null;

  // Once for each plan, when the row has its width. If the next destination is already on the first screen the row stays at its
  // start. If not, the row opens with the next destination near the left and half of the one before it still showing, so it
  // can be seen that the row goes on to the left.
  const placeAtNext = () => {
    const plan = items[0].key;
    if (placedFor.current === plan) return;
    placedFor.current = plan;
    const onFirstScreen = layout.screenMargin + nextAt * STRIDE + ITEM_W <= width - layout.screenMargin;
    if (nextAt > 0 && !onFirstScreen) scroller.current?.scrollTo({ x: nextAt * STRIDE - ITEM_W / 2, animated: false });
  };
  const press = (h: Highlight<Post>) => {
    if (h.state === 'ahead') {
      router.push({ pathname: '/planner', params: { day: h.dayId } });
      return;
    }
    mark(h.key);
    onPick(h);
  };

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={placeAtNext}
      style={{ flexGrow: 0, marginHorizontal: -layout.screenMargin, marginTop: 8 }}
      contentContainerStyle={{ paddingHorizontal: layout.screenMargin, paddingVertical: 2, gap: GAP }}
    >
      {items.map((h) => (
        <Item key={h.key} h={h} cover={coverUrl(h.posts, media)} seen={seen.has(h.key)} active={h.key === activeKey} onPress={() => press(h)} />
      ))}
    </ScrollView>
  );
}

/** The slim bar above the Journey grid while it shows one destination: "Hontanas · Show all". */
export function ShowAllBar({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Show all posts" accessibilityHint={`Now showing ${name}`} onPress={onPress} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 16, paddingRight: 14, borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border }}>
      {/* a long name gives way (…), never the words "Show all" */}
      <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</AppText>
      <AppText variant="label" color={role.accentText} numberOfLines={1} style={{ flexShrink: 0 }}>· Show all</AppText>
      <View style={{ marginLeft: 'auto' }}>
        <Icon name="close" color={role.muted} size={18} />
      </View>
    </Pressable>
  );
}
