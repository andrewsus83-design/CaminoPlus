// Highlights per destination: the round pictures under the My Camino card on Me (the design page's "Me · Journey" phone).
// One for every place the plan ends a walking day in, in walking order, like story highlights. A destination where the
// pilgrim has posted is "visited" (its newest picture; a tap shows those posts in the Journey grid). One with no post is
// "ahead" (a dashed circle; a tap opens that day in the planner).
//
// Pure, no React and no network: everything comes from what useMeData has already loaded, the days of the plan and the
// pilgrim's own posts. Plain-node tests: src/features/me/__tests__/highlights.test.ts (npm run test:me).
import { norm } from './text';

/** The most highlights the row draws. A Camino plan has thirty-odd days; this keeps the row, and its pictures, small. */
export const MAX_HIGHLIGHTS = 40;

/** What is needed of a plan day (the app's JourneyDay has all of it). */
export type DayLike = { id: string; to_name?: string | null; stage?: { name: string } | null; status?: string | null };
/** What is needed of a post (the app's Post has all of it). */
export type PostLike = { id: string; place_name: string | null; published_at: string | null };
type MediaLike = { type: 'image' | 'video'; url: string };

export type Highlight<P extends PostLike = PostLike> = {
  /** The id of the day: unique in the row and the same after every reload. It is the React key and what "seen" remembers. */
  key: string;
  dayId: string;
  name: string;
  /** The posts of this destination, newest first. */
  posts: P[];
  state: 'visited' | 'ahead';
};

/**
 * Where a walking day ends: the day's `to_name`, else what follows the last " to " in the stage's name ("Pamplona to Puente
 * la Reina" is Puente la Reina). A day with neither has no destination (null) and gets no highlight.
 */
export function destinationName(day: DayLike): string | null {
  const to = day.to_name?.trim();
  if (to) return to;
  const fromStage = /^.*\sto\s+(\S.*)$/i.exec(day.stage?.name?.trim() ?? '')?.[1]?.trim();
  return fromStage || null;
}

/** A place as lower case words without accents: every run of letters and digits is one word, so "Puente-la-Reina" is "puente la reina". */
const words = (t: string | null | undefined): string[] => norm(t).split(/[^\p{L}\p{M}\p{N}]+/u).filter(Boolean);
const headOf = (t: string | null | undefined) => (t ?? '').split(',')[0];
const sameWords = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => w === b[i]);
const hasPhrase = (long: string[], short: string[]) => {
  for (let i = 0; i + short.length <= long.length; i++) if (short.every((w, j) => long[i + j] === w)) return true;
  return false;
};
const letterCount = (ws: string[]) => (ws.join('').match(/\p{L}/gu) ?? []).length;

/** A place as one comparable id: its words, lower case and without accents, joined by one space ("Puente-la-Reina" and "puente la reina" are the same id). */
export const placeKey = (t: string | null | undefined): string => words(t).join(' ');

export type Match = 0 | 1 | 2 | 3;

/**
 * How well the place a pilgrim typed on a post ("Where are you?", free text) names a destination of the plan. Case and
 * accents never matter, and nor does punctuation. A post belongs to a destination when this is 1 or more:
 *   3  the same words                              "najera"           and  "Nájera"
 *   2  the same first part, before a comma         "Hontanas, Burgos" and  "Hontanas"
 *   1  one contains the other as WHOLE words, and the shorter has at least 3 letters
 *                                                  "Albergue San Anton, Castrojeriz" and "Castrojeriz"
 *   0  anything else (so "San" is not "Santo Domingo", and "O" is not "O Cebreiro")
 */
export function placeMatch(place: string | null | undefined, destination: string): Match {
  const p = words(place);
  const d = words(destination);
  if (p.length === 0 || d.length === 0) return 0;
  if (sameWords(p, d)) return 3;
  const ph = words(headOf(place));
  if (ph.length > 0 && sameWords(ph, words(headOf(destination)))) return 2;
  const [short, long] = p.length <= d.length ? [p, d] : [d, p];
  return letterCount(short) >= 3 && hasPhrase(long, short) ? 1 : 0;
}

const timeOf = (p: PostLike) => {
  const t = p.published_at ? Date.parse(p.published_at) : NaN;
  return Number.isFinite(t) ? t : -Infinity; // no date: oldest
};
/** Newest first. Posts with the same time (or none) keep the order they came in. */
const newestFirst = (a: PostLike, b: PostLike) => { const x = timeOf(a), y = timeOf(b); return x < y ? 1 : x > y ? -1 : 0; };

/**
 * Which place each post belongs to: for every name in `names` the posts whose place matches it best (placeMatch), newest first. A post goes to ONE
 * place only, the one it matches best; on a tie the earlier name wins; a post that matches no name is in none. The same rule serves the row of
 * destinations (buildHighlights) and the stamps of the All view (routePoints.ts), so a post is never under two names and "Hontanas, Burgos" is Hontanas.
 */
export function assignPosts<P extends PostLike>(names: readonly string[], posts: readonly P[]): P[][] {
  const out: P[][] = names.map(() => []);
  for (const post of [...posts].sort(newestFirst)) {
    let at = -1;
    let rank = 0;
    names.forEach((n, i) => {
      const r = placeMatch(post.place_name, n);
      if (r > rank) { at = i; rank = r; }
    });
    if (at >= 0) out[at].push(post);
  }
  return out;
}

/**
 * The row: one highlight for each destination of the plan, in the plan's order, at most MAX_HIGHLIGHTS.
 *  - Two days that end in the same place (a rest day) are one highlight, at the first of them: the same name and the same
 *    pictures twice would only be noise.
 *  - Each post goes to ONE destination, the one its place matches best (placeMatch; on a tie the earlier day), so a post
 *    never shows under two names and "Hontanas, Burgos" is Hontanas, not Burgos. A post that matches no destination is in
 *    no highlight (it is still in the Journey grid).
 *  - A destination with a post is "visited", the others are "ahead".
 */
export function buildHighlights<P extends PostLike>(days: readonly DayLike[], posts: readonly P[]): Highlight<P>[] {
  const out: Highlight<P>[] = [];
  const known = new Set<string>();
  for (const day of days) {
    const name = destinationName(day);
    const id = placeKey(name);
    if (!name || !id || known.has(id)) continue;
    known.add(id);
    out.push({ key: day.id, dayId: day.id, name, posts: [], state: 'ahead' });
    if (out.length === MAX_HIGHLIGHTS) break;
  }
  const byPlace = assignPosts(out.map((h) => h.name), posts);
  out.forEach((h, i) => {
    h.posts = byPlace[i];
    if (h.posts.length > 0) h.state = 'visited';
  });
  return out;
}

/**
 * Where the pilgrim goes next, as a place in the row: the highlight of the first day that is not done (the plan's "Up next"),
 * or of the first day after it that has a destination. -1 when every day is done or none has one.
 */
export function nextHighlightIndex(days: readonly DayLike[], items: readonly { name: string }[]): number {
  const start = days.findIndex((d) => d.status !== 'done');
  if (start < 0) return -1;
  const ids = items.map((h) => words(h.name).join(' '));
  for (let i = start; i < days.length; i++) {
    const name = destinationName(days[i]);
    const at = name ? ids.indexOf(words(name).join(' ')) : -1;
    if (at >= 0) return at;
  }
  return -1;
}

/**
 * Where the row of destinations opens, as the x it is scrolled to (0 = at its start). On a long plan it opens at the next destination, with half of the one
 * before it showing so it can be seen that the row goes on to the left; if the next destination is already on the first screen the row stays at its start.
 * `pinned`: the All item sits at the left, outside the scrolling part, so the destinations have less room and no margin of their own on the left.
 */
export function rowStartOffset(o: { nextAt: number; width: number; pinned: boolean; item: number; gap: number; margin: number }): number {
  if (!(o.nextAt > 0)) return 0;
  const stride = o.item + o.gap;
  const pad = o.pinned ? 0 : o.margin; // the room before the first destination, inside the scrolling part
  const room = o.pinned ? o.width - o.margin - stride : o.width; // the width of the scrolling part
  const onFirstScreen = pad + o.nextAt * stride + o.item <= room - o.margin;
  return onFirstScreen ? 0 : pad + o.nextAt * stride - (o.item / 2 + o.gap);
}

/**
 * The picture of a highlight: the first photo of its newest post that has one (a clip is not a picture here), or null, and
 * then the row draws the first letter of the name. A picture is never made up for a destination that has none.
 * `posts` is newest first, as buildHighlights gives it; `media` is what the grid already fetched, by post id.
 */
export function coverUrl(posts: readonly PostLike[], media: Readonly<Record<string, readonly MediaLike[] | undefined>>): string | null {
  for (const p of posts) {
    const photo = media[p.id]?.find((m) => m.type === 'image' && !!m.url);
    if (photo) return photo.url;
  }
  return null;
}

/** First letter of a name, upper case, for the circle of a destination without a picture. Whole characters, not half of an emoji. */
export const firstLetter = (name: string) => (Array.from(name.trim())[0] ?? '').toUpperCase();

/** What a screen reader says for a highlight. `active`: the Journey grid is showing just its posts, and a second tap shows all again. */
export function highlightLabel(h: { name: string; posts: readonly unknown[]; state: 'visited' | 'ahead' }, active = false): string {
  if (h.state === 'ahead') return `${h.name}, no posts yet, open the day plan`;
  const n = h.posts.length;
  const them = n === 1 ? 'it' : 'them';
  return `${h.name}, ${n} ${n === 1 ? 'post' : 'posts'}, ${active ? `showing ${them}, tap to show all posts` : `show ${them}`}`;
}

/** What is kept on the phone, per person, of the highlights that were opened: their keys. */
export type SeenSaved = { v: 1; keys: string[] };

/** The keys in a saved copy. The file is whatever the phone has, so anything that is not the expected shape is nothing seen. */
export function parseSeen(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const { v, keys } = raw as { v?: unknown; keys?: unknown };
  if (v !== 1 || !Array.isArray(keys)) return [];
  return keys.filter((k): k is string => typeof k === 'string' && k.length > 0);
}
