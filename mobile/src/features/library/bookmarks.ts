// The Library rows a pilgrim bookmarked, as a plain list and the few things that can be done to it. Pure: no React, no React
// Native, nothing stored here (plain node tests cover it, npm run test:library). useLibraryBookmarks.ts keeps the list on the
// phone.
//
// Where it lives. Only on this phone, in the phone's key-value store under `u.<userId>.library.bookmarks` (lib/localStore.ts
// userKey). Every `u.<userId>.…` key is wiped when that person logs out (lib/auth.tsx, clearUserData), which is meant: a
// bookmark of a Library row is a small convenience of this phone, not something the server knows. Another account on the
// same phone has another id, so other keys, and never sees these.

/** The name after `u.<userId>.`. */
export const BOOKMARKS_NAME = 'library.bookmarks';

/** Rows one person can bookmark. Far above the examples there are today; it only keeps a damaged or hostile file from growing a list. */
export const BOOKMARKS_MAX = 500;

/** A bookmarked row: its key (search.ts itemKey: "bible:psalms") and when, in milliseconds. */
export type Bookmark = { key: string; at: number };

/** What is stored: the list, newest first. `v` is the version of the shape. */
export type StoredBookmarks = { v: 1; items: Bookmark[] };

/**
 * The list in a stored value. null when what was stored is not this shape (nothing stored, a newer or damaged file): the caller
 * then starts from an empty list. An item that does not read is skipped, a key twice is kept once (the first, which is the newest).
 */
export function parseBookmarks(raw: unknown): Bookmark[] | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, items } = raw as { v?: unknown; items?: unknown };
  if (v !== 1 || !Array.isArray(items)) return null;
  const out: Bookmark[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (out.length >= BOOKMARKS_MAX) break;
    if (!item || typeof item !== 'object') continue;
    const { key, at } = item as { key?: unknown; at?: unknown };
    if (typeof key !== 'string' || key.length === 0 || key.length > 80 || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, at: typeof at === 'number' && Number.isFinite(at) ? at : 0 });
  }
  return out;
}

export const packBookmarks = (list: readonly Bookmark[]): StoredBookmarks => ({ v: 1, items: list.map((b) => ({ key: b.key, at: b.at })) });

export const hasBookmark = (list: readonly Bookmark[], key: string): boolean => list.some((b) => b.key === key);

/** The same list with `key` put in front (newest first), or taken out when it was there. Does not change the list it is given. */
export function toggleBookmark(list: readonly Bookmark[], key: string, now: number): Bookmark[] {
  if (hasBookmark(list, key)) return list.filter((b) => b.key !== key);
  return [{ key, at: now }, ...list].slice(0, BOOKMARKS_MAX);
}

/** The keys, in the order of the list. */
export const bookmarkKeys = (list: readonly Bookmark[]): string[] => list.map((b) => b.key);

/** The Library part of the Bookmarks screen when nothing is bookmarked in the Library: it says how to. */
export const LIBRARY_BOOKMARKS_EMPTY = 'Nothing bookmarked in the Library yet. Tap the bookmark on a row to keep it here.';

/** The sentence for a change that could not be written to the phone (a full disk): what is shown goes back to what is saved. */
export const BOOKMARK_NOT_SAVED = 'That bookmark could not be saved on this phone. Please try again.';
