// The private diary: what is stored on the phone and the few things that can be done to it.
//
// Pure logic, no React and no React Native, so plain node can import it (npm run test:diary). The phone's key-value store
// comes in as a parameter (`DiaryStorage`); storage.ts plugs the real one in, which is what the app imports.
//
// One diary per person, kept in two keys, `diary.<userId>.a` and `diary.<userId>.b`, each { v: 1, seq, entries: [...] }.
//
// Why two slots and not one file: the diary is the person's only copy of their writing, and a write on a phone is not atomic.
// A kill or a full disk in the middle of it leaves a cut-off file, and with one file that is the whole diary gone (it reads
// as damaged, and the next save would replace what is left of it). So a read takes the readable slot with the higher seq and
// a write goes to the OTHER slot with seq + 1: a write that dies half way can only damage the older slot, the newest
// complete state is still in the other one, and the next write replaces the damaged slot.
//
// Neither key starts with `u.`. Signing out wipes every `u.<userId>.…` key (lib/auth.tsx, clearUserData): that is a cache of
// what the server knows. A diary is the person's own writing and exists nowhere else, so it must be there when the same
// person signs in again. Another account on the same phone has another id, so other keys, and never sees it. Only deleting
// the account removes it (clearDiary, called by app/delete-account.tsx).
//
// A page is a draft or published (`status`, NoteStatus: only a draft says so, and a page of an earlier build says nothing and is published).
//
// A page can also keep photos and videos (`media`, small descriptors; the files are copies in the app's own folder, media.ts) and a
// place (`place`, place.ts). Both are optional fields of the page, so a page of an earlier build reads as before. The files go with
// their page: a save that drops a descriptor deletes its file, deleting a page deletes its files, clearDiary deletes the whole
// folder. A file is only deleted after the state that no longer refers to it is on the phone (in both slots, for a delete), and one
// that could not be deleted is picked up by sweepMedia, which only ever runs when both slots can be read.
import { uuid } from '../../lib/uuid';
import {
  DIARY_MEDIA_BYTES_MAX, DIARY_MEDIA_COUNT_MAX, descriptorFor, fileCapFor, isMediaName, looksFull, mediaNamesOf, mediaOf, mediaStatsOf, newMediaName, noFiles, parseMediaList, planAttach, unreferenced,
  type DiaryMedia, type MediaFiles, type PickedAsset, type Refusal,
} from './media';
import { normalizePlace, type DiaryPlace } from './place';

/**
 * Where a page is in its life: a draft is still being written (the Notes feed shows it with a "Draft" tag), a published page is a finished
 * note like any other. Both are only on this phone. A page that does not say, one of an earlier build, is published.
 */
export type NoteStatus = 'draft' | 'published';

export type DiaryEntry = { id: string; createdAt: string; updatedAt: string; title: string; body: string; media?: DiaryMedia[]; place?: DiaryPlace; status?: NoteStatus };

/** The status of a page as the screens read it: a draft only when the page says so; anything else (nothing, or a word this build does not know) is published. */
export const statusOf = (e: { status?: unknown }): NoteStatus => (e.status === 'draft' ? 'draft' : 'published');
export const isDraft = (e: { status?: unknown }): boolean => statusOf(e) === 'draft';

/** Characters in the text of one page. The editor stops typing here and says so; saveEntry refuses more. */
export const BODY_MAX = 20_000;
export const TITLE_MAX = 120;
/** Pages one person can keep. */
export const ENTRIES_MAX = 2_000;
/**
 * Characters of titles and text over all pages. Every save writes the whole diary, so this is what bounds the cost of a save
 * (and of reading it): a person who writes 2 KB a day for three months has 180 KB, far below it. A save that would take the
 * diary past it is refused, unless it makes the diary no bigger (a page that is shortened can always be saved).
 */
export const TOTAL_MAX = 2_000_000;

/** Why a page was not written. Never thrown: it is an answer, and the screen words it gently (present.ts). */
export type SaveProblem = 'body-too-long' | 'title-too-long' | 'too-many-pages' | 'diary-full' | 'too-many-media' | 'media-full' | 'not-saved';
export type SaveResult = { ok: true } | { ok: false; reason: SaveProblem };
/** Adding files to a page: the descriptors of the files that were added and why the others were not, or a page that could not be written (then none of the files were kept). */
export type AttachResult = { ok: true; added: DiaryMedia[]; refused: Refusal[] } | { ok: false; reason: SaveProblem };

/**
 * The part of the phone's key-value store the diary needs, and the way it must read: getJSON answers null only when there is
 * nothing under the key, and THROWS when there is something it cannot read (the disk said no, or the text is cut off or
 * damaged). lib/localStore.ts cannot tell the two apart (it answers null for both), so storage.ts reads strictly.
 */
export type DiaryStorage = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<boolean>;
  remove(key: string): Promise<void>;
};

export type Slot = 'a' | 'b';
export const slotKey = (uid: string, slot: Slot) => `diary.${uid}.${slot}`;
/** The first build kept the whole diary in this one key. It is read when no slot is valid, and removed once its pages are carried over. */
export const oldKey = (uid: string) => `diary.${uid}`;

/** A new page id: the app's usual client-side id (lib/uuid.ts), so nothing here needs a server or a counter. */
export const newId = (): string => uuid();

const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** A stored item that reads as a page. Extra fields (from a newer app) are allowed and are kept when others are saved. */
export function isEntry(v: unknown): v is DiaryEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && e.id.length > 0 && typeof e.title === 'string' && typeof e.body === 'string' && validDate(e.createdAt) && validDate(e.updatedAt);
}

type Stored = { v: 1; seq: number; entries: unknown[] };
const isSeq = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v < Number.MAX_SAFE_INTEGER;
const isSlot = (v: unknown): v is Stored => !!v && typeof v === 'object' && !Array.isArray(v) && (v as Stored).v === 1 && Array.isArray((v as Stored).entries) && isSeq((v as Stored).seq);
const isOldDiary = (v: unknown): v is { v: 1; entries: unknown[] } => !!v && typeof v === 'object' && !Array.isArray(v) && (v as Stored).v === 1 && Array.isArray((v as Stored).entries);

/**
 * A page as the screens get it: its files and place only when they are usable (a damaged one is left out, and the page still opens),
 * and its status only when it is a draft (published is the absence of the word, so every screen reads one thing).
 */
function tidyPage(e: DiaryEntry): DiaryEntry {
  if (!('media' in e) && !('place' in e) && !('status' in e)) return e;
  const { media: _media, place: _place, status: _status, ...rest } = e;
  void _media; void _place; void _status;
  const media = mediaOf(e);
  const place = normalizePlace(e.place);
  return { ...rest, ...(media.length > 0 ? { media } : {}), ...(place ? { place } : {}), ...(isDraft(e) ? { status: 'draft' as const } : {}) };
}

/** The pages in a stored list, newest first (by the day they were begun), once each. Anything that is not a page is left out. */
export function pagesOf(raw: unknown[]): DiaryEntry[] {
  const seen = new Set<string>();
  const pages: DiaryEntry[] = [];
  for (const item of raw) {
    if (isEntry(item) && !seen.has(item.id)) { seen.add(item.id); pages.push(tidyPage(item)); }
  }
  return pages.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

const sizeOf = (e: DiaryEntry) => e.title.length + e.body.length;
const totalOf = (raw: unknown[]) => raw.reduce<number>((sum, item) => sum + (isEntry(item) ? sizeOf(item) : 0), 0);

// What is read, and what is done with it. A slot is
//   valid       { v: 1, seq, entries } with a whole number seq;
//   missing     nothing under the key;
//   foreign     something readable that is not a v1 slot (a newer version, another shape): never read as pages;
//   unreadable  the storage threw: a read error, or text that is cut off or damaged.
// The diary is the valid slot with the higher seq. Reading never writes. A save or a delete writes the OTHER slot with seq + 1,
// so it also replaces a slot that was damaged or foreign, and if that write dies half way the newest complete state is still in
// the slot it did not touch. With no valid slot, and no slot unreadable (a new diary), the first write is seq 1 in slot a and
// slot b is left alone. When neither slot can be read at all nothing is known about what is stored: reads show an empty
// diary, saves and deletes refuse (the editor says so and keeps the words), and nothing is ever written over it.
// Items inside a valid slot that do not read as pages are not shown, but stay in the list when other pages are saved.
type SlotRead =
  | { kind: 'valid'; seq: number; entries: unknown[] }
  | { kind: 'missing' }
  | { kind: 'foreign' }
  | { kind: 'unreadable' };

// `from` is the slot the pages were read from (null for a diary that is new, or one carried over from the key of the first build),
// `target` the slot the next write goes to, and `seq` the number of the state it is based on (0 for a diary that is new).
// `adopted` is true when the pages came from the key of the first build, which is removed once they are in a slot.
// `clean` is true when every slot is either valid or empty: nothing that could not be read (or that a newer app wrote) may hold a
// newer state than the one in hand. Files are only ever swept up when it is true.
type State = { kind: 'ok'; seq: number; entries: unknown[]; from: Slot | null; target: Slot; adopted: boolean; clean: boolean } | { kind: 'blocked' };

/** The reasons a page is refused before anything is read. */
function refusal(uid: string, e: DiaryEntry): SaveProblem | null {
  if (!uid || !isEntry(e)) return 'not-saved';
  if (e.body.length > BODY_MAX) return 'body-too-long';
  if (e.title.length > TITLE_MAX) return 'title-too-long';
  const media = parseMediaList(e.media);
  if (!media.ok) return media.reason === 'too-many' ? 'too-many-media' : 'not-saved';
  if (e.place !== undefined && e.place !== null && !normalizePlace(e.place)) return 'not-saved';
  return null;
}

/**
 * The diary over a storage (its pages) and a file system (the files of their photos and videos). Reads and writes take turns (one
 * queue for everything this store does, copying files included), so two quick saves, or a save and the list opening a moment
 * later, never lose or miss each other: each one reads what the one before it wrote, and a sweep never meets a file whose page is
 * still being written. Nothing here throws.
 */
export function createDiaryStore(storage: DiaryStorage, files: MediaFiles = noFiles, options: { newId?: () => string } = {}) {
  const makeId = options.newId ?? newId;
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };

  const readSlot = async (key: string): Promise<SlotRead> => {
    let value: unknown;
    try { value = await storage.getJSON<unknown>(key); } catch { return { kind: 'unreadable' }; }
    if (value == null) return { kind: 'missing' };
    return isSlot(value) ? { kind: 'valid', seq: value.seq, entries: value.entries } : { kind: 'foreign' };
  };

  /** The pages of the first build's single key, or null when there is none or it cannot be read (then it is left alone). */
  const readOld = async (uid: string): Promise<unknown[] | null> => {
    try {
      const value = await storage.getJSON<unknown>(oldKey(uid));
      return isOldDiary(value) ? value.entries : null;
    } catch {
      return null;
    }
  };

  const readState = async (uid: string): Promise<State> => {
    const [a, b] = await Promise.all([readSlot(slotKey(uid, 'a')), readSlot(slotKey(uid, 'b'))]);
    const clean = (a.kind === 'valid' || a.kind === 'missing') && (b.kind === 'valid' || b.kind === 'missing');
    if (a.kind === 'valid' || b.kind === 'valid') {
      const newestIsA = a.kind === 'valid' && (b.kind !== 'valid' || a.seq >= b.seq);
      const newest = (newestIsA ? a : b) as Extract<SlotRead, { kind: 'valid' }>;
      return { kind: 'ok', seq: newest.seq, entries: newest.entries, from: newestIsA ? 'a' : 'b', target: newestIsA ? 'b' : 'a', adopted: false, clean };
    }
    if (a.kind === 'unreadable' && b.kind === 'unreadable') return { kind: 'blocked' };
    const old = await readOld(uid);
    return { kind: 'ok', seq: 0, entries: old ?? [], from: null, target: 'a', adopted: old != null, clean: false };
  };

  /** Writes `raw` as the next state, into the slot that is not the newest one. True when it is on the phone. */
  const commit = async (uid: string, state: Extract<State, { kind: 'ok' }>, raw: unknown[]): Promise<boolean> => {
    const value: Stored = { v: 1, seq: state.seq + 1, entries: raw };
    let written = false;
    try { written = (await storage.setJSON(slotKey(uid, state.target), value)) === true; } catch { written = false; }
    if (written && state.adopted) {
      try { await storage.remove(oldKey(uid)); } catch { /* only a stale copy now; clearDiary removes it as well */ }
    }
    return written;
  };

  /**
   * After a delete the slot that was not written still holds the page, as the state before. "Deleted" has to mean gone, so the
   * same state is written there too (one seq later, so it is still the newest) and no copy of the page is left on the phone. If
   * this write dies half way it only damages the slot that is being scrubbed; the state that was just committed is intact.
   */
  const scrub = async (uid: string, state: Extract<State, { kind: 'ok' }>, raw: unknown[]): Promise<void> => {
    if (!state.from) return;
    const value: Stored = { v: 1, seq: state.seq + 2, entries: raw };
    try { await storage.setJSON(slotKey(uid, state.from), value); } catch { /* the delete itself went through */ }
  };

  /** Deletes files. One that cannot be deleted is left for sweepMedia; this never throws and never stops at the first. */
  const dropFiles = async (uid: string, names: string[]): Promise<void> => {
    for (const name of names) {
      try { await files.remove(uid, name); } catch { /* the sweep will find it */ }
    }
  };

  /**
   * Puts one page into the stored list (a new page, or the one with the same id) and writes the result. The page's own fields are
   * the ones given; fields of a newer app that are on the stored page stay. The limits are checked on the result: a new page is
   * refused at ENTRIES_MAX pages, and a save that makes the diary bigger is refused past TOTAL_MAX characters, past
   * DIARY_MEDIA_COUNT_MAX files or past DIARY_MEDIA_BYTES_MAX bytes of them; a page already there can always be saved when it is
   * not bigger. Answers the files the page no longer refers to, which the caller deletes (only after this has been written).
   */
  const writePage = async (uid: string, s: Extract<State, { kind: 'ok' }>, page: DiaryEntry, media: DiaryMedia[], place: DiaryPlace | null): Promise<{ ok: true; removed: string[] } | { ok: false; reason: SaveProblem }> => {
    const raw = s.entries.slice();
    const before = totalOf(raw);
    const filesBefore = mediaStatsOf(raw);
    const at = raw.findIndex((item) => isEntry(item) && item.id === page.id);
    const oldNames = at >= 0 ? mediaNamesOf(raw[at]) : [];
    const merged: Record<string, unknown> = { ...(at >= 0 ? (raw[at] as object) : {}), id: page.id, createdAt: page.createdAt, updatedAt: page.updatedAt, title: page.title, body: page.body };
    if (media.length > 0) merged.media = media; else delete merged.media;
    if (place) merged.place = place; else delete merged.place;
    // The status is the page's own when it is given: a draft says so, a published page says nothing (the way a page of an earlier build is). A page
    // that does not say (a caller that does not know of drafts) keeps what is stored.
    if (page.status === 'draft') merged.status = 'draft'; else if (page.status === 'published') delete merged.status;
    if (at >= 0) raw[at] = merged;
    else if (raw.length >= ENTRIES_MAX) return { ok: false, reason: 'too-many-pages' };
    else raw.push(merged);
    const after = totalOf(raw);
    if (after > TOTAL_MAX && after > before) return { ok: false, reason: 'diary-full' };
    const filesAfter = mediaStatsOf(raw);
    if ((filesAfter.bytes > DIARY_MEDIA_BYTES_MAX && filesAfter.bytes > filesBefore.bytes) || (filesAfter.count > DIARY_MEDIA_COUNT_MAX && filesAfter.count > filesBefore.count)) return { ok: false, reason: 'media-full' };
    if (!(await commit(uid, s, raw))) return { ok: false, reason: 'not-saved' };
    return { ok: true, removed: unreferenced(raw, oldNames) };
  };

  /** The pages of one person, newest first. An empty list when there is nothing, or nothing that can be read. */
  const loadEntries = (uid: string): Promise<DiaryEntry[]> => {
    if (!uid) return Promise.resolve([]);
    return inTurn(async () => {
      const s = await readState(uid);
      return s.kind === 'ok' ? pagesOf(s.entries) : [];
    }).catch((): DiaryEntry[] => []);
  };

  const fieldsOf = (entry: DiaryEntry): DiaryEntry => ({ id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, title: entry.title, body: entry.body, ...(entry.status === 'draft' || entry.status === 'published' ? { status: entry.status } : {}) });

  /**
   * Adds the page, or replaces the one with the same id (its title, text, files and place are the ones given; files it no longer
   * lists are deleted once the new state is written). The limits are those of writePage.
   */
  const saveEntry = (uid: string, entry: DiaryEntry): Promise<SaveResult> => {
    const refused = refusal(uid, entry);
    if (refused) return Promise.resolve({ ok: false, reason: refused });
    const media = parseMediaList(entry.media);
    const place = normalizePlace(entry.place);
    if (!media.ok) return Promise.resolve({ ok: false, reason: 'not-saved' });
    return inTurn(async (): Promise<SaveResult> => {
      const s = await readState(uid);
      if (s.kind === 'blocked') return { ok: false, reason: 'not-saved' };
      const res = await writePage(uid, s, fieldsOf(entry), media.media, place);
      if (!res.ok) return res;
      await dropFiles(uid, res.removed);
      return { ok: true };
    }).catch((): SaveResult => ({ ok: false, reason: 'not-saved' }));
  };

  /**
   * Adds the chosen files to a page, and writes the page. `entry` is the page as the editor has it (its text, files and place at
   * this moment); a page that is not on the phone yet is created. Each file is copied into the folder of the diary, first those
   * that fit (media.ts planAttach: room on the page, the limits of a file and of the diary, the free space of the phone), and the
   * size is measured again on the copy. A file that cannot be copied is refused with a reason and leaves nothing behind. When the
   * page itself cannot be written, every copy made for it is deleted and nothing changes: words stay, nothing half written.
   */
  const attachMedia = (uid: string, entry: DiaryEntry, picked: PickedAsset[]): Promise<AttachResult> => {
    const refused = refusal(uid, entry);
    if (refused) return Promise.resolve({ ok: false, reason: refused });
    const base = parseMediaList(entry.media);
    if (!base.ok) return Promise.resolve({ ok: false, reason: 'not-saved' });
    const place = normalizePlace(entry.place);
    return inTurn(async (): Promise<AttachResult> => {
      const copied: string[] = [];
      try {
        const s = await readState(uid);
        if (s.kind === 'blocked') return { ok: false, reason: 'not-saved' };
        const others = mediaStatsOf(s.entries, entry.id);
        const here = base.media;
        const baseBytes = here.reduce((sum, m) => sum + m.bytes, 0);
        const plan = planAttach(Array.isArray(picked) ? picked : [], { pageCount: here.length, diaryBytes: others.bytes + baseBytes, diaryCount: others.count + here.length, freeBytes: files.freeSpace() });
        const turnedAway: Refusal[] = plan.refused.slice();
        const added: DiaryMedia[] = [];
        let used = 0;
        for (const asset of plan.accepted) {
          const id = makeId();
          const name = newMediaName(id, asset.kind, asset);
          const why = (reason: Refusal['reason']): Refusal => ({ reason, ...(asset.fileName ? { fileName: asset.fileName } : {}) });
          let bytes = 0;
          try {
            copied.push(name);
            bytes = await files.copyIn(uid, asset.uri, name);
          } catch (e) {
            await dropFiles(uid, [name]);
            copied.pop();
            turnedAway.push(why(looksFull(e) ? 'disk-full' : 'copy-failed'));
            continue;
          }
          const reject = async (reason: Refusal['reason']) => { await dropFiles(uid, [name]); copied.pop(); turnedAway.push(why(reason)); };
          if (!(Number.isSafeInteger(bytes) && bytes > 0)) { await reject('copy-failed'); continue; }
          if (bytes > fileCapFor(asset.kind)) { await reject(asset.kind === 'video' ? 'video-too-big' : 'photo-too-big'); continue; }
          if (others.bytes + baseBytes + used + bytes > DIARY_MEDIA_BYTES_MAX) { await reject('diary-bytes'); continue; }
          used += bytes;
          added.push(descriptorFor(id, name, asset, bytes));
        }
        if (added.length === 0) return { ok: true, added, refused: turnedAway };
        const res = await writePage(uid, s, fieldsOf(entry), [...here, ...added], place);
        if (!res.ok) {
          await dropFiles(uid, copied);
          return { ok: false, reason: res.reason };
        }
        await dropFiles(uid, res.removed);
        return { ok: true, added, refused: turnedAway };
      } catch {
        await dropFiles(uid, copied);
        return { ok: false, reason: 'not-saved' };
      }
    }).catch((): AttachResult => ({ ok: false, reason: 'not-saved' }));
  };

  /** True when the page is gone afterwards (also when it was never there), from both slots; false when it could not be removed. Its files go with it. */
  const deleteEntry = (uid: string, id: string): Promise<boolean> => {
    if (!uid || !id) return Promise.resolve(true);
    return inTurn(async () => {
      const s = await readState(uid);
      if (s.kind === 'blocked') return false;
      const raw = s.entries.filter((item) => !(isEntry(item) && item.id === id));
      if (raw.length === s.entries.length) return true;
      if (!(await commit(uid, s, raw))) return false;
      await scrub(uid, s, raw);
      const doomed = s.entries.filter((item) => isEntry(item) && item.id === id).flatMap((item) => mediaNamesOf(item));
      await dropFiles(uid, unreferenced(raw, doomed));
      return true;
    }).catch(() => false);
  };

  /**
   * Deletes the files in the folder of the diary that no page refers to (what a kill between copying a file and writing its page
   * leaves behind, or a file that could not be deleted). Careful by rule: it only runs when the diary was read from a valid slot
   * and no slot is unreadable or from a newer app, it only touches names this diary makes, and it takes its turn like everything
   * else, so it never meets a file whose page is still being written. Answers how many files it deleted.
   */
  const sweepMedia = (uid: string): Promise<number> => {
    if (!uid) return Promise.resolve(0);
    return inTurn(async () => {
      const s = await readState(uid);
      if (s.kind !== 'ok' || s.from === null || !s.clean) return 0;
      const names = await files.list(uid);
      if (!names) return 0;
      const kept = new Set<string>();
      for (const item of s.entries) for (const n of mediaNamesOf(item)) kept.add(n);
      let gone = 0;
      for (const name of names) {
        if (!isMediaName(name) || kept.has(name)) continue;
        try { if (await files.remove(uid, name)) gone += 1; } catch { /* next time */ }
      }
      return gone;
    }).catch(() => 0);
  };

  /** Removes the whole diary of one person: both slots, the key of the first build, and the folder of its files. For deleting the account; never for signing out. */
  const clearDiary = (uid: string): Promise<void> => {
    if (!uid) return Promise.resolve();
    return inTurn(async () => {
      for (const key of [slotKey(uid, 'a'), slotKey(uid, 'b'), oldKey(uid)]) {
        try { await storage.remove(key); } catch { /* the others are still removed */ }
      }
      try { await files.removeAll(uid); } catch { /* the keys are gone; the folder is only files */ }
    }).catch(() => undefined);
  };

  return { loadEntries, saveEntry, attachMedia, deleteEntry, sweepMedia, clearDiary };
}
