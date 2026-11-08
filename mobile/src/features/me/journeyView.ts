// What the Journey area of Me shows, and how a tap changes it. The path is: all the posts > "All" (the stamps, one for each place of the Camino) > a place
// (the Journey grid filtered to the posts there) > back to the stamps > "All" again, which closes the stamps. A destination of the row (a highlight) is
// the older way to filter the grid: it shows that destination's posts, and "Show all" brings the whole grid back.
//
// Pure, no React: the screen keeps ONE JourneyView in its state and draws what resolveJourney says. The tests are in __tests__/allPlaces.test.ts (npm run test:me).
import type { Highlight, PostLike } from './highlights';
import type { RoutePoint } from './routePoints';

/** `destination` is the key of a highlight (the day), `place` the key of a point (the words of its name). */
export type JourneyView = { view: 'posts'; destination: string | null } | { view: 'all'; place: string | null };

/** Every post, no filter: where Me opens. */
export const POSTS_VIEW: JourneyView = { view: 'posts', destination: null };
/** The stamps of the route. */
export const ALL_PLACES: JourneyView = { view: 'all', place: null };

/** A tap on the All item. On another sub-tab (Plan, Health, Notes) it always brings you to the stamps; on Journey it is the switch of that view, so a second tap closes it. */
export function tapAll(v: JourneyView, onJourney: boolean): JourneyView {
  if (!onJourney) return ALL_PLACES;
  return v.view === 'all' ? POSTS_VIEW : ALL_PLACES;
}

/** A tap on a destination that has posts. From another sub-tab it shows that destination; on Journey the same one again clears it. A destination always leaves the stamps. */
export function tapDestination(v: JourneyView, key: string, onJourney: boolean): JourneyView {
  if (onJourney && v.view === 'posts' && v.destination === key) return POSTS_VIEW;
  return { view: 'posts', destination: key };
}

/** A tap on a stamp: the posts at that place. */
export const tapPlace = (key: string): JourneyView => ({ view: 'all', place: key });

/** The bar above the grid, one step back: from a place to the stamps, from a destination to all the posts. */
export const stepBack = (v: JourneyView): JourneyView => (v.view === 'all' ? ALL_PLACES : POSTS_VIEW);

/**
 * What the Journey area draws.
 *   grid         every post (or the sample journey while there are none)
 *   destination  the grid with the posts of one destination, and the bar "<name> · Show all"
 *   stamps       the stamp for every point of the route
 *   place        the grid with the posts at one point, and the bar "All places · <name>"; `empty` when there are none: the line "No journeys at ..." goes over the grid,
 *                which is then the card that writes a post alone
 * A key that does not name anything any more (the data was reloaded, another Camino was chosen) is no filter: a destination falls back to `grid`, a place to `stamps`,
 * and the stamps with no point at all (no stages) to `grid`.
 */
export type JourneyShown =
  | { kind: 'grid' }
  | { kind: 'destination'; name: string; ids: ReadonlySet<string> }
  | { kind: 'stamps' }
  | { kind: 'place'; name: string; ids: ReadonlySet<string>; empty: boolean };

export function resolveJourney(v: JourneyView, highlights: readonly Highlight<PostLike>[], points: readonly RoutePoint<PostLike>[]): JourneyShown {
  if (v.view === 'all') {
    if (points.length === 0) return { kind: 'grid' };
    const at = v.place === null ? undefined : points.find((p) => p.key === v.place);
    if (!at) return { kind: 'stamps' };
    return { kind: 'place', name: at.name, ids: new Set(at.posts.map((p) => p.id)), empty: at.posts.length === 0 };
  }
  const h = v.destination === null ? undefined : highlights.find((x) => x.key === v.destination && x.state === 'visited');
  return h ? { kind: 'destination', name: h.name, ids: new Set(h.posts.map((p) => p.id)) } : { kind: 'grid' };
}
