import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BackButton } from '@/components/BackButton';
import { Icon } from '@/components/Icon';
import { Card } from '@/components/ui';
import type { Post } from '@/lib/api';
import { c, fonts, radius, role, space } from '@/theme';
import { ProgressBar } from './shared';
import { placesLine, stampLabel, visitedCount, type RoutePoint } from './routePoints';

// The "All" view of Me: every place of the Camino as a stamp, in the look of the passport (app/passport.tsx): three round slots in a row, the name of the place under
// each, filled when there is something, dashed when there is not. Here "something" is a journey post of the pilgrim at that place, and the filled stamp carries
// how many. A tap on a stamp shows those posts in the Journey grid (the bar over the grid goes back to these stamps). Which post belongs to which place is routePoints.ts.
// the round of a stamp is 78, as in the passport
const SLOT = 78;
// The count on a filled stamp is the caption variant (15 px, 21 high), so it keeps 8 px from the outline on every side: 8 + 21 + 8 = 37, and the round is 40. It sits on
// the rim of the stamp (8 px out at the top right), not over the shell: a round this size at the corner would cover a part of the glyph.
const BADGE = 40;

function Stamp({ p, onPress }: { p: RoutePoint<Post>; onPress: () => void }) {
  const done = p.posts.length > 0;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={stampLabel(p)} onPress={onPress} style={{ width: '33.33%', alignItems: 'center', gap: space[2], paddingHorizontal: space[1] }}>
      <View style={{ width: SLOT, height: SLOT }}>
        <View style={{ width: SLOT, height: SLOT, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.goldSoft : 'transparent', borderWidth: done ? 0 : 2, borderStyle: 'dashed', borderColor: role.borderStrong, transform: [{ rotate: done ? '-8deg' : '0deg' }] }}>
          <Icon name="shell" color={done ? role.action : role.borderStrong} size={32} />
        </View>
        {done && (
          // the number of posts, upright (the stamp itself is turned a little), on its own ring of the page colour
          <View style={{ position: 'absolute', top: -8, right: -8, minWidth: BADGE, height: BADGE, paddingHorizontal: space[2], borderRadius: radius.pill, backgroundColor: role.highlight, borderWidth: 2, borderColor: role.bg, alignItems: 'center', justifyContent: 'center' }}>
            <AppText variant="caption" color={role.onHighlight} style={{ fontFamily: fonts.bodyBold }}>{p.posts.length}</AppText>
          </View>
        )}
      </View>
      <AppText variant="caption" color={done ? role.text : role.muted} numberOfLines={2} style={{ textAlign: 'center', fontFamily: done ? fonts.bodyBold : fonts.bodyMedium }}>{p.name}</AppText>
    </Pressable>
  );
}

/** The stamps of the route, under a card that says how many of them have journeys ("5 of 33 places") with the passport's progress bar. */
export function AllPlaces({ places, onPick }: { places: readonly RoutePoint<Post>[]; onPick: (p: RoutePoint<Post>) => void }) {
  const visited = visitedCount(places);
  return (
    <View style={{ gap: space[4] }}>
      <Card style={{ gap: space[3] }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: space[3] }}>
          <AppText variant="h4">All places</AppText>
          <AppText variant="label" color={role.accentText}>{placesLine(visited, places.length)}</AppText>
        </View>
        <ProgressBar value={places.length ? visited / places.length : 0} />
        <AppText variant="small" muted>Tap a place to see your journeys there.</AppText>
      </Card>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space[5] }}>
        {places.map((p) => <Stamp key={p.key} p={p} onPress={() => onPick(p)} />)}
      </View>
    </View>
  );
}

/**
 * The head of the Journey grid while it shows one place of the All view: the Back button of the app (components/BackButton.tsx, the round 48, with its own onPress: a
 * step back inside the screen, to the stamps, not out of it) and the name of the place, with "All places" under it to say where Back goes.
 */
export function PlaceHeader({ name, onBack }: { name: string; onBack: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <BackButton onPress={onBack} hint="Back to all places" />
      <View style={{ flex: 1 }}>
        <AppText variant="h4" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption" muted numberOfLines={1}>All places</AppText>
      </View>
    </View>
  );
}
