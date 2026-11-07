import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { localStore, userKey } from './localStore';
import { NO_FAVS, parseFavs, toggleFav, type Favs } from './localReactions';
import type { SheetComment } from './postComments';

/**
 * Love, bookmark and comments of SAMPLE content (Discover's sample stories, the bundled sample journey). Everything stays on
 * the phone: love and bookmark are kept per signed-in person with localStore under `name` (Discover's are 'discover.favs'),
 * comments live in memory like they always did in Discover, seeded with `seed`. Nothing here ever reaches the database.
 * Signed out, love and bookmark still work until the screen is left.
 */
export function useLocalReactions(name: string, seed: Record<string, SheetComment[]> = {}) {
  const { session } = useAuth();
  const key = session ? userKey(session.user.id, name) : null;
  const [favs, setFavs] = useState<Favs>(NO_FAVS);
  const latest = useRef(favs);
  latest.current = favs;
  const [comments, setComments] = useState<Record<string, SheetComment[]>>(seed);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    void localStore.getJSON<unknown>(key).then((v) => {
      const saved = parseFavs(v);
      if (alive && saved) setFavs(saved);
    });
    return () => { alive = false; };
  }, [key]);

  const toggle = useCallback((kind: keyof Favs, id: string) => {
    const next = toggleFav(latest.current, kind, id);
    latest.current = next;
    setFavs(next);
    if (key) void localStore.setJSON(key, next);
  }, [key]);

  const addComment = useCallback((id: string, text: string) => {
    setComments((all) => ({ ...all, [id]: [...(all[id] ?? []), { id: `c${Date.now()}`, user: 'you', text }] }));
  }, []);

  return { favs, toggle, comments, addComment };
}
