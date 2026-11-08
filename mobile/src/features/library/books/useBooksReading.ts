import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { userKey } from '@/lib/localStore';
import { bookById } from './catalog';
import { loadReading } from './readingStore';
import { READING_NAME, emptyReading, lastRead, placeOf, readSet, type BookPlace, type StoredReading } from './reading';

/** What the Books tab, the banner and the book page need to know about reading. */
export type BooksReading = {
  /** The places have been read from the phone. Until then nothing is offered, so that "Continue" never flashes in after "Start". */
  ready: boolean;
  /** The book read last that still has a text, or null. */
  last: BookPlace | null;
  placeOf: (bookId: string) => BookPlace | null;
  /** The chapters of this book that are read. */
  readSet: (bookId: string) => ReadonlySet<string>;
};

type Read = { key: string; stored: StoredReading };

/** A book that is in the Library: the place in one that was taken out of a later bundle is never offered. */
const inLibrary = (id: string): boolean => !!bookById(id);

/**
 * Where this person has got to in the books, kept only on this phone under `u.<userId>.library.reading` (see reading.ts). Read again every time the
 * screen comes into view, because the reader changes the places while the Books tab or the book page stays under it. Nothing here uses the network
 * and nothing throws: a place that cannot be read is no place.
 */
export function useBooksReading(): BooksReading {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, READING_NAME) : null;
  const [read, setRead] = useState<Read | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!key) { setRead(null); return; }
      let alive = true;
      void loadReading(key).then((stored) => { if (alive) setRead({ key, stored }); });
      return () => { alive = false; };
    }, [key]),
  );

  const ready = !!read && read.key === key;
  const stored = ready ? read!.stored : emptyReading();
  return {
    ready,
    last: ready ? lastRead(stored, inLibrary) : null,
    placeOf: (id) => placeOf(stored, id),
    readSet: (id) => readSet(stored, id),
  };
}
