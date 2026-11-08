import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { READING_NAME, packReading, parseReading, rememberPlace, type ReadingPlace } from './reading';

export type ReadingPlaces = {
  /** The places have been read from the phone. */
  ready: boolean;
  places: readonly ReadingPlace[];
  /** This chapter or day is now where the pilgrim is in the book. Ignored until the places were read (it could write over what is saved). */
  remember: (bookId: string, chapterId: string) => void;
};

type Read = { key: string; list: ReadingPlace[] };
const NONE: readonly ReadingPlace[] = [];

/**
 * Where each book was last read, for "Continue reading": kept only on this phone, per person, under `u.<userId>.library.reading` (see
 * reading.ts). Read again every time the screen comes back into view, because the reader changes it while the book screen stays under it.
 * Nothing here uses the network and nothing throws: a list that cannot be read is an empty list, and a write that fails is simply not
 * remembered (a place is a convenience, not something to warn about).
 */
export function useReadingPlaces(): ReadingPlaces {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, READING_NAME) : null;
  const [read, setRead] = useState<Read | null>(null);
  const latest = useRef<Read | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!key) { latest.current = null; setRead(null); return; }
      let alive = true;
      void localStore.getJSON<unknown>(key).then((raw) => {
        if (!alive) return;
        const now = { key, list: parseReading(raw) ?? [] };
        latest.current = now;
        setRead(now);
      });
      return () => { alive = false; };
    }, [key]),
  );

  const remember = useCallback((bookId: string, chapterId: string) => {
    const cur = latest.current;
    if (!key || !cur || cur.key !== key) return;
    const next = { key, list: rememberPlace(cur.list, bookId, chapterId, Date.now()) };
    latest.current = next;
    setRead(next);
    void localStore.setJSON(key, packReading(next.list));
  }, [key]);

  const ready = !!read && read.key === key;
  return { ready, places: ready ? read!.list : NONE, remember };
}
