import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { LAST_READ_NAME, packLastRead, parseLastRead, samePlace } from './lastRead';
import { isPlace, type Place } from './order';

/** The chapter last read, and the way to say a chapter was read. */
export type LastRead = {
  /** The chapter last read on this phone, or null when none was or the one kept is no chapter of the Bible. */
  place: Place | null;
  /** Keeps this chapter as the one last read. A place that is no chapter of the Bible is not kept. */
  remember: (p: Place) => void;
};

/**
 * The chapter this person read last: kept only on this phone, under `u.<userId>.library.lastRead` (see lastRead.ts). Read again every time the screen
 * comes into view, because the reader changes it while the Bible tab stays under it. Nothing here uses the network and nothing throws: a value that cannot
 * be read is no place, a write that fails is dropped (the Continue reading bar is only a convenience). The reader is what writes it (`remember`); the bar reads it
 * itself, with the places of the books, so that one bar can go back to whichever was read last (features/library/continueBar).
 */
export function useLastRead(): LastRead {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, LAST_READ_NAME) : null;
  const [place, setPlace] = useState<Place | null>(null);
  const latest = useRef<Place | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!key) { latest.current = null; setPlace(null); return; }
      let alive = true;
      void localStore.getJSON<unknown>(key).then((raw) => {
        if (!alive) return;
        const p = parseLastRead(raw);
        latest.current = p;
        setPlace(p);
      });
      return () => { alive = false; };
    }, [key]),
  );

  const remember = useCallback((p: Place) => {
    if (!key || !isPlace(p) || samePlace(latest.current, p)) return;
    latest.current = { code: p.code, chapter: p.chapter };
    setPlace(latest.current);
    void localStore.setJSON(key, packLastRead(p, Date.now()));
  }, [key]);

  return { place, remember };
}
