// The hooks of the diary screens. Nothing here uses the network, and nothing throws: the store answers, it does not raise.
//
//   useDiary()          the signed-in person's pages, newest first, for the list and the card on the Library screen. Read again
//                       each time the screen comes back into view (so a page written a moment ago shows after Back).
//   useDiaryPage(id)    one page for the editor, read once. `new` is a blank page. A page that is not there (deleted, or
//                       another account's) or no session at all is "missing", never an error.
//   usePageSaver()      the autosave of the editor (autosave.ts), tied to the screen: it writes when the screen goes away and
//                       when the app goes to the background, so leaving never loses text (and adds photos and videos through
//                       the same queue, so an attachment never races a save of the text).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createPageSaver, type SaverView } from './autosave';
import { attachMedia, deleteEntry, loadEntries, newId, saveEntry, sweepMedia } from './storage';
import type { DiaryEntry } from './store';

/** The route id of a blank page: /diary/new. */
export const NEW_PAGE = 'new';

const NONE: DiaryEntry[] = [];

// Files of a page that was never written (the app was killed between copying a file and writing its page) are swept once per run
// of the app and person, the first time the diary is read. The sweep takes its turn like every other thing the store does.
const swept = new Set<string>();

function useUid(): string | null {
  const { session } = useAuth();
  return session?.user.id ?? null;
}

export function useDiary() {
  const uid = useUid();
  const [loaded, setLoaded] = useState<{ uid: string | null; entries: DiaryEntry[] } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!uid) { setLoaded({ uid, entries: NONE }); return; }
      let alive = true;
      void loadEntries(uid).then((entries) => {
        if (alive) setLoaded({ uid, entries });
        if (!swept.has(uid)) { swept.add(uid); void sweepMedia(uid); }
      });
      return () => { alive = false; };
    }, [uid]),
  );

  const ready = loaded != null && loaded.uid === uid;
  const remove = useCallback(async (id: string): Promise<boolean> => {
    if (!uid) return true;
    const ok = await deleteEntry(uid, id);
    if (ok) setLoaded((l) => (l && l.uid === uid ? { uid, entries: l.entries.filter((e) => e.id !== id) } : l));
    return ok;
  }, [uid]);

  // Read the phone again now (pull to refresh in the Library's Notes tab). Never throws: the store answers, and a list that cannot be read is empty.
  const reload = useCallback(async (): Promise<void> => {
    if (!uid) return;
    const entries = await loadEntries(uid);
    setLoaded({ uid, entries });
  }, [uid]);

  // `ready` is false until the first read: the screens show nothing yet rather than "your diary is empty" to someone who has pages.
  return { uid, ready, entries: ready && loaded ? loaded.entries : NONE, remove, reload };
}

export type DiaryPageState =
  | { state: 'loading' }
  | { state: 'missing' }
  | { state: 'ready'; uid: string; entry: DiaryEntry | null };

export function useDiaryPage(id: string | undefined): DiaryPageState {
  const uid = useUid();
  const key = uid && id ? `${uid}:${id}` : null;
  const [found, setFound] = useState<{ key: string; entry: DiaryEntry | null } | null>(null);

  useEffect(() => {
    if (!uid || !id || id === NEW_PAGE) return;
    let alive = true;
    const k = `${uid}:${id}`;
    void loadEntries(uid).then((entries) => { if (alive) setFound({ key: k, entry: entries.find((e) => e.id === id) ?? null }); });
    return () => { alive = false; };
  }, [uid, id]);

  if (!uid || !id || !key) return { state: 'missing' };
  if (id === NEW_PAGE) return { state: 'ready', uid, entry: null };
  if (!found || found.key !== key) return { state: 'loading' };
  return found.entry ? { state: 'ready', uid, entry: found.entry } : { state: 'missing' };
}

export function usePageSaver(uid: string, initial: DiaryEntry | null) {
  const [view, setView] = useState<SaverView | null>(null);
  const alive = useRef(true);
  const [saver] = useState(() => createPageSaver({
    save: (entry) => saveEntry(uid, entry),
    remove: (id) => deleteEntry(uid, id),
    attach: (entry, picked) => attachMedia(uid, entry, picked),
    newId,
    onChange: (v) => { if (alive.current) setView(v); },
  }, initial));

  // Leaving the screen, by any way (the Back button, the system's back, a swipe, signing out): write what is typed.
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; void saver.flush(); };
  }, [saver]);

  // The app goes to the background (or the browser tab is hidden): the system may end it before it comes back.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => { if (state !== 'active') void saver.flush(); });
    return () => sub.remove();
  }, [saver]);

  return { saver, view: view ?? saver.view() };
}
