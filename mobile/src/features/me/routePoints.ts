// The places of a Camino as stamps: the "All" view of Me (the first item of the row under the My Camino card). Every place of the ROUTE the app knows,
// not only the ones of the pilgrim's plan, is a point: the town where the first stage starts and the town where every stage ends, in walking order, the
// way the passport (app/passport.tsx) builds its towns. A point where the pilgrim has posted is "visited" (a filled stamp with a count); the others are
// the dashed slots. A tap on a point shows the pilgrim's OWN posts there in the Journey grid.
//
// Pure, no React and no network: it works on what useMeData has loaded (the stages of the route and the pilgrim's posts). Which post belongs to
// which point is the rule of the highlights (assignPosts in highlights.ts): a post goes to the ONE point it matches best.
// Plain-node tests: src/features/me/__tests__/allPlaces.test.ts (npm run test:me).
import { assignPosts, placeKey, type PostLike } from './highlights';

/** What is needed of a stage (the app's Stage has all of it). `start` and `end` are the linked places, which a stage may not have yet. */
export type StageLike = { stage_number?: number | null; name: string; start?: { name: string } | null; end?: { name: string } | null };

export type RoutePoint<P extends PostLike = PostLike> = {
  /** The words of the name ("puente la reina"): unique in the route and the same after every reload. It is the React key and what a tap picks. */
  key: string;
  name: string;
  /** The posts of this point, newest first. None: the stamp is a dashed slot. */
  posts: P[];
};

const clean = (t: string | null | undefined): string | null => (t && t.trim()) || null;
/** "A to B": the part before the last " to " and the part after it (the same cut as destinationName in highlights.ts). */
const NAME = /^(.*\S)\s+to\s+(\S.*)$/i;

/**
 * Where a stage starts and ends: its linked places, else the two halves of its name ("Pamplona to Puente la Reina"). The stages of the Camino Francés
 * from 4 to 33 have a name and no linked places yet, so the name is what gives their towns. null for a half nothing names.
 */
export function stageEnds(stage: StageLike): { from: string | null; to: string | null } {
  const parts = NAME.exec(stage.name?.trim() ?? '');
  return { from: clean(stage.start?.name) ?? clean(parts?.[1]), to: clean(stage.end?.name) ?? clean(parts?.[2]) };
}

const numberOf = (s: StageLike) => (typeof s.stage_number === 'number' && Number.isFinite(s.stage_number) ? s.stage_number : Infinity);

/**
 * The points of a route in walking order: the start of the first stage, then the end of every stage. A town that comes twice (two stages end in it, or
 * it is written with other accents or capitals) is one point, at its first place. No stages: no points.
 */
export function routePoints(stages: readonly StageLike[]): { key: string; name: string }[] {
  const ordered = [...stages].sort((a, b) => numberOf(a) - numberOf(b)); // stable: stages without a number keep the order they came in
  const out: { key: string; name: string }[] = [];
  const known = new Set<string>();
  const add = (name: string | null) => {
    const key = placeKey(name);
    if (!name || !key || known.has(key)) return;
    known.add(key);
    out.push({ key, name: name.trim() });
  };
  ordered.forEach((s, i) => {
    const { from, to } = stageEnds(s);
    if (i === 0) add(from);
    add(to);
  });
  return out;
}

/** The points of the route, each with the posts that belong to it (newest first), in walking order. A post that matches no point is in none (it is still in the Journey grid). */
export function buildRoutePlaces<P extends PostLike>(stages: readonly StageLike[], posts: readonly P[]): RoutePoint<P>[] {
  const points = routePoints(stages);
  const byPoint = assignPosts(points.map((p) => p.name), posts);
  return points.map((p, i) => ({ ...p, posts: byPoint[i] }));
}

/** How many points have at least one post. */
export const visitedCount = (points: readonly { posts: readonly unknown[] }[]): number => points.filter((p) => p.posts.length > 0).length;

/** The line on top of the stamps: "5 of 33 places". Nothing for a route with no points. */
export function placesLine(visited: number, total: number): string {
  if (!(total > 0)) return '';
  return `${visited} of ${total} ${total === 1 ? 'place' : 'places'}`;
}

const journeys = (n: number) => `${n} ${n === 1 ? 'journey' : 'journeys'}`;

/** What a screen reader says for the All item of the row: how many places have journeys. */
export const allLabel = (visited: number, total: number): string => `All places, ${visited} of ${total} with journeys`;
/** And what a tap does: the item is the switch of the All view. */
export const allHint = (on: boolean): string => (on ? 'Showing every place. Tap to go back to your journey posts' : 'Shows every place of your Camino as a stamp');

/** What a screen reader says for a stamp. */
export function stampLabel(p: { name: string; posts: readonly unknown[] }): string {
  return p.posts.length > 0 ? `${p.name}, ${journeys(p.posts.length)}` : `${p.name}, no journeys yet`;
}

/** The friendly line over the Journey grid of a place where the pilgrim has not posted yet (the first tile of the grid, the card that writes a post, is under it). */
export const emptyPlaceLine = (name: string): string => `No journeys at ${name} yet`;
