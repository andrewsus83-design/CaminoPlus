import { useCallback, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { uuid } from '@/lib/uuid';
import { contextFor } from './context';
import {
  NOTES_NAME, addNote, chapterNotes, editNote, packNotes, parseNotes, removeNote,
  type ChapterNotes, type Note, type NoteProblem, type NoteType,
} from './notes';

/** What a screen needs to show the notes and to change them. */
export type NotesApi = {
  /** The notes have been read from the phone. A change before that is refused: it could write over what is saved. */
  ready: boolean;
  /** The notes, newest first, as the screen last read them (and as changed since). */
  notes: readonly Note[];
  /** Something is stored under the key that this app cannot read (a newer app wrote it, or it is damaged): the list shows empty and nothing is ever written over it. */
  blocked: boolean;
  /** The last change could not be written to the phone (and was undone). */
  failed: boolean;
  add: (input: { anchor: string; quote: string; text: string; type: NoteType }) => Promise<{ ok: true; note: Note } | { ok: false; reason: NoteProblem }>;
  edit: (id: string, text: string) => Promise<{ ok: true; note: Note } | { ok: false; reason: NoteProblem }>;
  remove: (id: string) => Promise<boolean>;
};

type Read = { key: string; list: Note[]; blocked: boolean };

const NONE: readonly Note[] = [];

/**
 * The pilgrim's notes: kept only on this phone, under `u.<userId>.notes` (see notes.ts). The same way as the bookmarks of the Library
 * (library/useLibraryBookmarks.ts): read again every time the screen comes back into view, a change is shown at once and written after, a
 * change that cannot be written is undone and said (`failed`). Nothing here uses the network and nothing throws.
 *
 * Writing is more careful than for a bookmark, because words cost more than a tap. Writes take their turn, one after the other, so two quick
 * changes are written in the order they were made. When something is stored that this app cannot read, `blocked` is true, the list is empty,
 * and every change is refused: the stored value is never written over. (lib/localStore.ts answers null both for a key that is not there and
 * for a file that cannot be parsed, so only a readable value of another shape, which is what a newer app leaves, is told apart.)
 */
export function useNotes(): NotesApi {
  const { session, journey } = useAuth();
  const uid = session?.user.id ?? null;
  const key = uid ? userKey(uid, NOTES_NAME) : null;
  const [read, setRead] = useState<Read | null>(null);
  const [failed, setFailed] = useState(false);
  // What is true now, for a change that comes before React has drawn the last one.
  const latest = useRef<Read | null>(null);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const journeyRef = useRef(journey);
  journeyRef.current = journey;

  useFocusEffect(
    useCallback(() => {
      if (!key) { latest.current = null; setRead(null); return; }
      let alive = true;
      void localStore.getJSON<unknown>(key).then((raw) => {
        if (!alive) return;
        const list = raw === null ? [] : parseNotes(raw);
        const now: Read = { key, list: list ?? [], blocked: raw !== null && list === null };
        latest.current = now;
        setRead(now);
      });
      return () => { alive = false; };
    }, [key]),
  );

  // Shows `next` at once, writes it in its turn, and puts `before` back when it could not be written (unless something newer was shown meanwhile).
  const commit = useCallback((cur: Read, before: Note[], list: Note[]): Promise<boolean> => {
    const next: Read = { ...cur, list };
    latest.current = next;
    setRead(next);
    const run = queue.current.then(() => localStore.setJSON(cur.key, packNotes(list)));
    queue.current = run.catch(() => undefined);
    return run.then((ok) => {
      if (ok) { setFailed(false); return true; }
      if (latest.current === next) { latest.current = { ...next, list: before }; setRead(latest.current); }
      setFailed(true);
      return false;
    });
  }, []);

  const usable = useCallback((): Read | null => {
    const cur = latest.current;
    return key && cur && cur.key === key && !cur.blocked ? cur : null;
  }, [key]);

  const add = useCallback<NotesApi['add']>(async (input) => {
    const cur = usable();
    if (!cur) return { ok: false, reason: 'not-saved' };
    const now = new Date();
    const res = addNote(cur.list, { id: uuid(), anchor: input.anchor, quote: input.quote, text: input.text, type: input.type, context: contextFor(now, journeyRef.current) }, now);
    if (!res.ok) return res;
    return (await commit(cur, cur.list, res.notes)) ? { ok: true, note: res.note } : { ok: false, reason: 'not-saved' };
  }, [commit, usable]);

  const edit = useCallback<NotesApi['edit']>(async (id, text) => {
    const cur = usable();
    if (!cur) return { ok: false, reason: 'not-saved' };
    const res = editNote(cur.list, id, text, new Date());
    if (!res.ok) return res;
    return (await commit(cur, cur.list, res.notes)) ? { ok: true, note: res.note } : { ok: false, reason: 'not-saved' };
  }, [commit, usable]);

  const remove = useCallback(async (id: string): Promise<boolean> => {
    const cur = usable();
    if (!cur) return false;
    if (!cur.list.some((n) => n.id === id)) return true;
    return commit(cur, cur.list, removeNote(cur.list, id));
  }, [commit, usable]);

  const ready = !!read && read.key === key;
  return { ready, notes: ready ? read!.list : NONE, blocked: ready && read!.blocked, failed, add, edit, remove };
}

/** The notes of one chapter or day, for the reader: those on the whole chapter, the reflection of a day, and those of each paragraph by block index. */
export function useChapterNotes(bookId: string, chapterId: string): NotesApi & { here: ChapterNotes } {
  const api = useNotes();
  const here = useMemo(() => chapterNotes(api.notes, bookId, chapterId), [api.notes, bookId, chapterId]);
  return { ...api, here };
}
