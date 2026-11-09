import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import type { Post, PostMediaUrl } from '@/lib/api';
import { localStore, userKey } from '@/lib/localStore';
import { fonts, icon, layout, radius, role, space } from '@/theme';
import { NAME_TEXT_CAP, coverUrl, firstLetter, highlightCell, highlightLabel, nextHighlightIndex, parseSeen, rowStartOffset, type DayLike, type Highlight, type SeenSaved } from './highlights';
import { allHint, allLabel } from './routePoints';

// Story highlights under the My Camino card, one round picture for every destination of the plan (design page, "Me · Journey"
// phone: .highlights, .cp-ring, .cp-ring.seen, .add). What a highlight is and which posts belong to it is highlights.ts.
// The first item at the left is "All": a round item with the shell, pinned there while the destinations scroll next to it. It opens the stamps, one for
// every place of the Camino (AllPlaces.tsx, routePoints.ts). It is never "seen" or "unseen"; when its view is on, its ring is gold and its label bold.
// The words under a round are the caption variant (15 px, the smallest text there is), centred, on up to TWO lines of the cell's width; a word is never cut in the middle
// while it fits the cell (a name only ends in "…" when it needs a third line), and the item's label (the screen reader's) says the name whole.
// The cell of a destination is wider than the round (ITEM_W 108 at the normal text size, the round stays 66): the longest word of the Camino names, "Roncesvalles", is 99.4 px at this size and
// 100.8 px in the bold of the open destination, so a narrower cell cuts the first stop of the Camino Francés in the middle of the word; at 108 every name of the 54 tried, from
// "Zubiri" to "Villamayor de Monjardín", wraps at a word, and only "Santo Domingo de la Calzada" and "Terradillos de los Templarios" need more than two lines.
// The cell is in px and the text is not: a phone set to larger text draws the same word wider (1.15 is Android's "Large": "Roncesvalles" is 114 px and breaks in a cell of 108), so the cell grows
// with the text size of the phone (highlightCell: round(108 x the text size), up to NAME_TEXT_CAP, 1.5), and the name itself is held to that cap (maxFontSizeMultiplier), so cell and word stay in step.
const RING = 66; // a 3 px ring (a border, so it is a stroke and not a padding) around the 60 px picture
const PICTURE = 60; // its outer 3 px are the page colour, so the picture sits clear of the ring, as in the design
const ALL_W = 72; // the All item: its label is one short word, so its cell stays as it was
const ITEM_W = 108; // a destination at the normal text size: the round is centred in it
const GAP = space[4]; // between the All item and the first destination
const ITEM_GAP = space[1]; // between two destinations: the round to the next round is the cell - RING + ITEM_GAP = 46 at the normal text size
const ROW_PAD = space[1]; // with no All item the row pads this much on the left (the round has 21 px of air in its own cell besides); the offset of the row is worked out with the same number
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
function AllItem({ visited, total, on, dense, onPress }: { visited: number; total: number; on: boolean; dense: boolean; onPress: () => void }) {
  const glyph = <Icon name="shell" color={role.action} size={icon.mdPlus} />;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={allLabel(visited, total)} accessibilityHint={allHint(on)} accessibilityState={{ selected: on }} aria-selected={on} onPress={onPress} style={{ width: ALL_W, alignItems: 'center', gap: dense ? space[1] : space[2] }}>
      {on ? (
        // the ring of an opened highlight: gold, then the page colour, then the round itself
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 3, borderColor: role.highlight }}>
          <View style={{ width: PICTURE, height: PICTURE, borderRadius: PICTURE / 2, borderWidth: 3, borderColor: role.bg, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
        </View>
      ) : (
        <View style={{ width: RING, height: RING, borderRadius: RING / 2, borderWidth: 1, borderColor: role.border, backgroundColor: role.surface, alignItems: 'center', justifyContent: 'center' }}>{glyph}</View>
      )}
      <AppText variant="caption" numberOfLines={1} style={{ width: ALL_W, textAlign: 'center', fontFamily: on ? fonts.bodyBold : fonts.bodyMedium }}>All</AppText>
    </Pressable>
  );
}

function Item({ h, cover, seen, active, dense, cell, onPress }: { h: Highlight<Post>; cover: string | null; seen: boolean; active: boolean; dense: boolean; cell: number; onPress: () => void }) {
  // The link that did not load (a signed link lasts an hour) is drawn as the letter, not as an empty circle, until a new link comes.
  const [failed, setFailed] = useState<string | null>(null);
  const visited = h.state === 'visited';
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={highlightLabel(h, active)} onPress={onPress} style={{ width: cell, alignItems: 'center', gap: dense ? space[1] : space[2] }}>
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
      <AppText variant="caption" numberOfLines={dense ? 1 : 2} maxFontSizeMultiplier={NAME_TEXT_CAP} style={{ width: cell, textAlign: 'center', fontFamily: active ? fonts.bodyBold : fonts.bodyMedium }}>{h.name}</AppText>
    </Pressable>
  );
}

/**
 * The row. A visited destination (it has posts) is opened with `onPick`: the screen filters the Journey grid to its posts. A
 * destination with no post opens that day in the planner, as the plan tracker does. With no destinations nothing is drawn, not
 * even the space. The row reaches out to the screen edges (the screen pads its content by layout.screenMargin) and, on a long
 * plan, opens at the next destination, so it does not open at the first day. `dense` is the compact header of a short phone (features/me/headerFit.ts): less air above the
 * row and between a round and its name, and a name keeps to one line.
 */
export function Highlights({ items, days, media, activeKey, userId, onPick, all, dense = false }: {
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
  /** The compact header: tighter spacing, the same row. */
  dense?: boolean;
}) {
  const router = useRouter();
  const { width, fontScale } = useWindowDimensions();
  const cell = highlightCell(ITEM_W, fontScale); // the cell of a destination follows the text size of the phone
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
    const plan = `${items[0].key}:${cell}`; // a new plan, or a new text size, places the row again
    if (placedFor.current === plan) return;
    placedFor.current = plan;
    // with no All item the row pads ROW_PAD on the left (not the screen's margin, which the offset would assume), so that is the pad the offset is worked out with
    const x = rowStartOffset({ nextAt, width, pinned, item: cell, gap: ITEM_GAP, margin: layout.screenMargin, allItem: ALL_W, allGap: GAP, shown: (cell + RING) / 2, pad: ROW_PAD });
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
    <View style={{ flexDirection: 'row', marginHorizontal: -layout.screenMargin, marginTop: dense ? space[1] : space[2], paddingLeft: pinned ? layout.screenMargin : 0 }}>
      {pinned && <AllItem visited={all.visited} total={all.total} on={all.on} dense={dense} onPress={all.onPress} />}
      {items.length > 0 && (
        <ScrollView
          ref={scroller}
          horizontal
          showsHorizontalScrollIndicator={false}
          onContentSizeChange={placeAtNext}
          style={{ flex: 1, marginLeft: pinned ? GAP : 0 }}
          contentContainerStyle={{ paddingLeft: pinned ? 0 : ROW_PAD, paddingRight: layout.screenMargin, gap: ITEM_GAP }}
        >
          {items.map((h) => (
            <Item key={h.key} h={h} cover={coverUrl(h.posts, media)} seen={seen.has(h.key)} active={h.key === activeKey} dense={dense} cell={cell} onPress={() => press(h)} />
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
