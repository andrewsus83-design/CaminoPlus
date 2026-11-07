// Love and bookmark of sample content (Discover's sample stories and the bundled sample journey). They are local to the
// phone: kept per signed-in person with localStore, never sent anywhere. This is the pure part: the stored shape and the
// toggle. The hook that reads and writes it is useLocalReactions.ts. No React Native imports on purpose: plain node tests
// cover it (npm run test:lib).

/** What is stored: the ids the person loved and the ids the person bookmarked. (Discover has always stored this shape.) */
export type Favs = { loved: string[]; saved: string[] };

export const NO_FAVS: Favs = { loved: [], saved: [] };

/** The stored value, when it has the right shape. null otherwise (nothing stored, or something else): the caller keeps what it has. */
export function parseFavs(v: unknown): Favs | null {
  if (!v || typeof v !== 'object') return null;
  const { loved, saved } = v as { loved?: unknown; saved?: unknown };
  if (!Array.isArray(loved) || !Array.isArray(saved)) return null;
  const ids = (a: unknown[]) => a.filter((x): x is string => typeof x === 'string');
  return { loved: ids(loved), saved: ids(saved) };
}

/** The same favourites with `id` added to `kind`, or taken out when it was there. Does not change what it is given. */
export function toggleFav(favs: Favs, kind: keyof Favs, id: string): Favs {
  const list = favs[kind].includes(id) ? favs[kind].filter((x) => x !== id) : [...favs[kind], id];
  return { ...favs, [kind]: list };
}
