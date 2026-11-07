import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { BOOKMARKS_NAME, bookmarkKeys, hasBookmark, packBookmarks, parseBookmarks, toggleBookmark, type Bookmark } from './bookmarks';

/** What the rows of the Library and the Bookmarks screen need to draw and change their bookmark buttons. */
export type LibraryMarks = {
  /** The list has been read from the phone. A tap before that is ignored: it could write over what is saved. */
  ready: boolean;
  has: (key: string) => boolean;
  toggle: (key: string) => void;
  /** The keys (newest first) as the screen last came into view. The Bookmarks screen draws these, so a row that is taken off stays until the screen is left. */
  shown: string[];
  /** The last change could not be written to the phone (and was undone). */
  failed: boolean;
};

type Read = { key: string; list: Bookmark[]; shown: string[] };

/**
 * The Library rows this person bookmarked: kept only on this phone, under `u.<userId>.library.bookmarks` (see bookmarks.ts).
 * Read again every time the screen comes back into view, because the Bookmarks screen can change the list while the Library stays
 * under it. Nothing here uses the network and nothing throws: a list that cannot be read is an empty list, a write that fails is
 * undone and said (`failed`).
 */
export function useLibraryBookmarks(): LibraryMarks {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, BOOKMARKS_NAME) : null;
  const [read, setRead] = useState<Read | null>(null);
  const [failed, setFailed] = useState(false);
  // What is true now, for a tap that comes before React has drawn the last one.
  const latest = useRef<Read | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!key) { latest.current = null; setRead(null); return; }
      let alive = true;
      void localStore.getJSON<unknown>(key).then((raw) => {
        if (!alive) return;
        const list = parseBookmarks(raw) ?? [];
        const now = { key, list, shown: bookmarkKeys(list) };
        latest.current = now;
        setRead(now);
      });
      return () => { alive = false; };
    }, [key]),
  );

  const toggle = useCallback((itemKey: string) => {
    const cur = latest.current;
    if (!key || !cur || cur.key !== key) return;
    const next = { ...cur, list: toggleBookmark(cur.list, itemKey, Date.now()) };
    latest.current = next;
    setRead(next);
    void localStore.setJSON(key, packBookmarks(next.list)).then((ok) => {
      if (ok) { setFailed(false); return; }
      // It could not be written (a full disk): what is shown goes back to what is saved, and it is said.
      if (latest.current?.key === key) { latest.current = { ...next, list: cur.list }; setRead(latest.current); }
      setFailed(true);
    });
  }, [key]);

  const ready = !!read && read.key === key;
  return {
    ready,
    has: (k) => ready && hasBookmark(read!.list, k),
    toggle,
    shown: ready ? read!.shown : [],
    failed,
  };
}
