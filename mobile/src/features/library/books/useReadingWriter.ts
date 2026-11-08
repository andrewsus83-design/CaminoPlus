import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/lib/auth';
import { userKey } from '@/lib/localStore';
import { loadReading, saveReading } from './readingStore';
import { READING_NAME, emptyReading, markRead, placeOf, savePlace, type BookPlace, type StoredReading } from './reading';

/** How long after the last scroll the place is written: a person scrolling does not make a write for every line. */
export const SAVE_AFTER_MS = 700;

export type ReadingWriter = {
  /** The places have been read from the phone: the reader shows the text once they have, so that it opens where the person was. */
  ready: boolean;
  /** Where the person is in this book now: the place kept, with every save made since the reader opened, or null for a book never opened. */
  peek: () => BookPlace | null;
  /** Keeps "this chapter, this far down" as the place in the book. Written a moment after the last call, and at once when the screen is left. */
  save: (chapterId: string, y: number) => void;
  /** Marks a chapter read. */
  markRead: (chapterId: string) => void;
  /** Writes now what is not written yet. */
  flush: () => void;
};

/**
 * The reader's way to keep where the person is in one book: only on this phone, under `u.<userId>.library.reading` (see reading.ts). The reader does not
 * re-draw when it saves (nothing in the result changes), and it writes a moment after the last scroll, when the screen is left and when the app goes to the
 * background, so a person who closes the app mid-chapter is brought back to the line. Nothing here uses the network and nothing throws.
 */
export function useReadingWriter(bookId: string): ReadingWriter {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, READING_NAME) : null;
  const [loaded, setLoaded] = useState<{ key: string | null } | null>(null);
  const current = useRef<StoredReading>(emptyReading());
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;
    current.current = emptyReading();
    if (!key) { setLoaded({ key: null }); return; }
    setLoaded(null);
    void loadReading(key).then((stored) => {
      if (!alive) return;
      current.current = stored;
      setLoaded({ key });
    });
    return () => { alive = false; };
  }, [key]);

  const flush = useCallback(() => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current || !key) return;
    dirty.current = false;
    void saveReading(key, current.current);
  }, [key]);

  const touch = useCallback(() => {
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, SAVE_AFTER_MS);
  }, [flush]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') flush(); });
    return () => { sub.remove(); flush(); };
  }, [flush]);

  const ready = !!loaded && loaded.key === key;
  const save = useCallback((chapterId: string, y: number) => {
    if (!ready) return;
    current.current = savePlace(current.current, bookId, chapterId, y, Date.now());
    touch();
  }, [ready, bookId, touch]);
  const mark = useCallback((chapterId: string) => {
    if (!ready) return;
    const next = markRead(current.current, bookId, chapterId, Date.now());
    if (next === current.current) return;
    current.current = next;
    touch();
  }, [ready, bookId, touch]);

  const peek = useCallback(() => placeOf(current.current, bookId), [bookId]);

  return useMemo(() => ({ ready, peek, save, markRead: mark, flush }), [ready, peek, save, mark, flush]);
}
