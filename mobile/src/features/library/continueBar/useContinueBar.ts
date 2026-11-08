import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { LAST_READ_NAME } from '../bible/lastRead';
import { hasBookText } from '../books/bookText';
import { READING_NAME } from '../books/reading';
import { loadReading } from '../books/readingStore';
import { safeText } from '../books/safeText';
import { HIDDEN_NAME, isHidden, markOf, packHidden, parseHidden, type HiddenMark } from './hidden';
import { bibleSpotOf, bookSpotOf, describeBible, describeBook, latestSpot, type Spot, type SpotView } from './spot';

/** What the bar needs: the place to continue and how to say it, or none, and the place that was closed, if one was. */
type Loaded = { uid: string; found: { spot: Spot; view: SpotView } | null; hidden: HiddenMark | null };

/** The bar's view of the phone: what to draw (null when there is nothing to continue from, or the person closed this very place) and the way to close it. */
export type ContinueBarModel = {
  view: SpotView | null;
  /** Closes the bar for the place it shows: kept on the phone, and the bar stays away until the saved place is another one (hidden.ts). */
  hide: () => void;
};

/**
 * Reads the two places and the mark from the phone and picks the place to continue from. Nothing throws and nothing is sent anywhere: what cannot be read is no place, and a
 * mark that cannot be read hides nothing. A book is offered only if it has a text, and its chapter is told from that text, which the reader opens anyway (it is read once and kept).
 */
async function loadContinue(uid: string): Promise<Loaded> {
  try {
    const [bibleRaw, reading, hiddenRaw] = await Promise.all([
      localStore.getJSON<unknown>(userKey(uid, LAST_READ_NAME)),
      loadReading(userKey(uid, READING_NAME)),
      localStore.getJSON<unknown>(userKey(uid, HIDDEN_NAME)),
    ]);
    const book = bookSpotOf(reading, hasBookText);
    const bookView = book ? describeBook(book, safeText(book.id)?.chapters ?? null) : null;
    const spot = latestSpot(bibleSpotOf(bibleRaw), bookView ? book : null);
    const view = !spot ? null : spot.kind === 'bible' ? describeBible(spot) : bookView;
    return { uid, found: spot && view ? { spot, view } : null, hidden: parseHidden(hiddenRaw) };
  } catch {
    return { uid, found: null, hidden: null };
  }
}

/**
 * The "Continue reading" bar's data. Read again every time the screen comes into view, because the readers change the places while the Library stays under them (the
 * same as the cards it replaces did). Closing it is kept under `u.<userId>.library.continueHidden` the way the other Library stores are kept (hidden.ts); the person's own
 * closing is also held in memory, so a read that was started just before the tap cannot bring the bar back.
 */
export function useContinueBar(): ContinueBarModel {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const latest = useRef<Loaded | null>(null);
  const mine = useRef<{ uid: string; mark: HiddenMark } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) { latest.current = null; setLoaded(null); return; }
      let alive = true;
      void loadContinue(uid).then((l) => {
        if (!alive) return;
        const closed = mine.current && mine.current.uid === uid ? mine.current.mark : null;
        latest.current = { ...l, hidden: closed ?? l.hidden };
        setLoaded(latest.current);
      });
      return () => { alive = false; };
    }, [uid]),
  );

  const hide = useCallback(() => {
    const cur = latest.current;
    if (!cur || !cur.found) return;
    const mark = markOf(cur.found.spot);
    mine.current = { uid: cur.uid, mark };
    latest.current = { ...cur, hidden: mark };
    setLoaded(latest.current);
    void localStore.setJSON(userKey(cur.uid, HIDDEN_NAME), packHidden(mark));
  }, []);

  const now = loaded && loaded.uid === uid ? loaded : null;
  const view = now && now.found && !isHidden(now.hidden, now.found.spot) ? now.found.view : null;
  return { view, hide };
}
