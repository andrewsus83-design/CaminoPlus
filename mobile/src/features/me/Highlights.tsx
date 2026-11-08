import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import type { Post, PostMediaUrl } from '@/lib/api';
import { localStore, userKey } from '@/lib/localStore';
import { fonts, icon, layout, radius, role, space } from '@/theme';
import { coverUrl, firstLetter, highlightLabel, nextHighlightIndex, parseSeen, rowStartOffset, type DayLike, type Highlight, type SeenSaved } from './highlights';
import { allHint, allLabel } from './routePoints';

// Story highlights under the My Camino card, one round picture for every destination of the plan (design page, "Me · Journey"
// phone: .highlights, .cp-ring, .cp-ring.seen, .add). What a highlight is and which posts belong to it is highlights.ts.
// The first item at the left is "All": a round item with the shell, pinned there while the destinations scroll next to it. It opens the stamps, one for
// every place of the Camino (AllPlaces.tsx, routePoints.ts). It is never "seen" or "unseen"; when its view is on, its ring is gold and its label bold.
// The words under a round are the caption variant (15 px, the smallest text there is) on one line of the item's width; a name that does not fit ends in "…" and
// the item's label (the screen reader's) says it whole.
const RING = 66; // a 3 px ring (a border, so it is a stroke and not a padding) around the 60 px picture
const PICTURE = 60; // its outer 3 px are the page colour, so the picture sits clear of the ring, as in the design
const ITEM_W = 72;
const GAP = space[4];
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

/** The first item of the row: every place of the Camino as stamps. The shell in a round of the card's surface with a hairline; gold ring and bold label while its view is on. */
function AllItem({ visited, total, on, onPress }: { visited: number; total: number; on: boolean; onPress: () => void }) {
  const glyph = <Icon name="shell" color={role.action} size={icon.mdPlus} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={allLabel(visited, total)} accessibilityHint={allHint(on)} accessibilityState={{ selected: on }} aria-selected={on} onPress={onPress} style={{ width: ITEM_W, alignItems: 'center', gap: space[2] }}>
      {on ? (
        // the ring of an opened highlight: gold, then the page colour, then the round itself
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: role.highlight }}>
          <View style={{ width: PICTURE, height: PICTURE, borderRadius: PICTURE / 2, borderWidth: 3, borderColor: role.bg, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
        </View>
      ) : (
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
      )}
      <AppText variant="caption" numberOfLines={1} style={{ width: ITEM_W, textAlign: 'center', fontFamily: on ? fonts.bodyBold : fonts.bodyMedium }}>All</AppText>
    </Pressable>
  );
}

function Item({ h, cover, seen, active, onPress }: { h: Highlight<Post>; cover: string | null; seen: boolean; active: boolean; onPress: () => void }) {
  // The link that did not load (a signed link lasts an hour) is drawn as the letter, not as an empty circle, until a new link comes.
  const [failed, setFailed] = useState<string | null>(null);
  const visited = h.state === 'visited';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={highlightLabel(h, active)} onPress={onPress} style={{ width: ITEM_W, alignItems: 'center', gap: space[2] }}>
      {visited ? (
        // gold until it is opened, then the quiet strong border colour
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: seen ? role.borderStrong : role.highlight }}>
          <View style={{ width: PICTURE, height: PICTURE, borderRadius: PICTURE / 2, borderWidth: 3, borderColor: role.bg, overflow: 'hidden', backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
            {cover && cover !== failed
              ? <Image source={{ uri: cover }} resizeMode="cover" accessibilityIgnoresInvertColors onError={() => setFailed(cover)} style={{ width: '100%', height: '100%' }} />
              : <AppText variant="h4" color={role.muted}>{firstLetter(h.name)}</AppText>}
          </View>
        </View>
      ) : (
        // not visited yet: no ring, no picture, a dashed circle with a pin
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 2, borderStyle: 'dashed', borderColor: role.borderStrong, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="pin" color={role.muted} size={icon.md} />
        </View>
      )}
      <AppText variant="caption" numberOfLines={1} style={{ width: ITEM_W, textAlign: 'center', fontFamily: active ? fonts.bodyBold : fonts.bodyMedium }}>{h.name}</AppText>
    </Pressable>
  );
}

/**
 * The row. A visited destination (it has posts) is opened with `onPick`: the screen filters the Journey grid to its posts. A
 * destination with no post opens that day in the planner, as the plan tracker does. With no destinations nothing is drawn, not
 * even the space. The row reaches out to the screen edges (the screen pads its content by layout.screenMargin) and, on a long
 * plan, opens at the next destination, so it does not open at the first day.
 */
export function Highlights({ items, days, media, activeKey, userId, onPick, all }: {
  items: Highlight<Post>[];
  days: readonly DayLike[];
  /** The photos of the posts (usePostMedia). */
  media: Record<string, PostMediaUrl[]>;
  /** The highlight whose posts the Journey grid shows now, if any. */
  activeKey: string | null;
  userId: string | null | undefined;
  onPick: (h: Highlight<Post>) => void;
  /** The All item: how many of the route's places have journeys, whether its view is on, and what a tap does. null (the route has no places): no All item. */
  all?: { visited: number; total: number; on: boolean; onPress: () => void } | null;
}) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { seen, mark } = useSeen(userId);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const placedFor = useRef<string | null>(null);
  const nextAt = useMemo(() => nextHighlightIndex(days, items), [days, items]);
  const pinned = !!all && all.total > 0;
  if (items.length === 0 && !pinned) return null;

  // Once for each plan, when the row has its width. If the next destination is already on the first screen the row stays at its
  // start. If not, the row opens with the next destination near the left and half of the one before it still showing, so it
  // can be seen that the row goes on to the left (rowStartOffset). The All item is outside the scrolling part, so it is always there.
  const placeAtNext = () => {
    if (items.length === 0) return;
    const plan = items[0].key;
    if (placedFor.current === plan) return;
    placedFor.current = plan;
    const x = rowStartOffset({ nextAt, width, pinned, item: ITEM_W, gap: GAP, margin: layout.screenMargin });
    if (x > 0) scroller.current?.scrollTo({ x, animated: false });
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
    // reaches out to the screen edges (the screen pads its content by layout.screenMargin); next to the All item the margin on the left is the item's own
    <View style={{ flexDirection: 'row', marginHorizontal: -layout.screenMargin, marginTop: space[2], paddingLeft: pinned ? layout.screenMargin : 0 }}>
      {pinned && <AllItem visited={all.visited} total={all.total} on={all.on} onPress={all.onPress} />}
      {items.length > 0 && (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={placeAtNext}
          style={{ flex: 1, marginLeft: pinned ? GAP : 0 }}
          contentContainerStyle={{ paddingLeft: pinned ? 0 : layout.screenMargin, paddingRight: layout.screenMargin, gap: GAP }}
        >
          {items.map((h) => (
            <Item key={h.key} h={h} cover={coverUrl(h.posts, media)} seen={seen.has(h.key)} active={h.key === activeKey} onPress={() => press(h)} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

/** The slim bar above the Journey grid while it shows one destination of the row: "Hontanas · Show all", the cross clears the filter. One button, at least 48 high. */
export function ShowAllBar({ name, onPress }: { name: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Show all posts" accessibilityHint={`Now showing ${name}`} onPress={onPress} style={{ minHeight: layout.touchHard, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[4], borderRadius: radius.pill, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border }}>
      {/* a long name gives way (…), never the words "Show all" */}
      <AppText variant="label" numberOfLines={1} style={{ flexShrink: 1 }}>{name}</AppText>
      <AppText variant="label" color={role.accentText} numberOfLines={1} style={{ flexShrink: 0 }}>· Show all</AppText>
      <View style={{ marginLeft: 'auto' }}>
        <Icon name="close" color={role.muted} size={icon.sm} />
      </View>
    </Pressable>
  );
}
