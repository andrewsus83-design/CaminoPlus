// The private diary: what is stored on the phone and the few things that can be done to it.
//
// Pure logic, no React and no React Native, so plain node can import it (npm run test:diary). The phone's key-value store
// comes in as a parameter (`DiaryStorage`): lib/localStore.ts has exactly this shape and storage.ts plugs it in, which is
// what the app imports.
//
// One object per person, under the key `diary.<userId>`: { v: 1, entries: [...] }.
//
// The key deliberately does NOT start with `u.`. Signing out wipes every `u.<userId>.…` key (lib/auth.tsx, clearUserData):
// that is a cache of what the server knows. A diary is the person's own writing and exists nowhere else, so it must be
// there when the same person signs in again. Another account on the same phone has another id, so another key, and never
// sees it. Only deleting the account removes it (clearDiary, called by app/delete-account.tsx).
import { uuid } from '../../lib/uuid';

export type DiaryEntry = { id: string; createdAt: string; updatedAt: string; title: string; body: string };

/** Characters in the text of one page. The editor stops typing here and says so; saveEntry refuses more. */
export const BODY_MAX = 20_000;
export const TITLE_MAX = 120;
/** Pages one person can keep. */
export const ENTRIES_MAX = 2_000;

/** Why a page was not written. Never thrown: it is an answer, and the screen words it gently (present.ts). */
export type SaveProblem = 'body-too-long' | 'title-too-long' | 'too-many-pages' | 'not-saved';
export type SaveResult = { ok: true } | { ok: false; reason: SaveProblem };

/** The part of lib/localStore.ts the diary needs. Every call there resolves to null / false instead of throwing. */
export type DiaryStorage = {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<boolean>;
  remove(key: string): Promise<void>;
};

export const diaryKey = (uid: string) => `diary.${uid}`;

/** A new page id: the app's usual client-side id (lib/uuid.ts), so nothing here needs a server or a counter. */
export const newId = (): string => uuid();

const validDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));

/** A stored item that reads as a page. Extra fields (from a newer app) are allowed and are kept when others are saved. */
export function isEntry(v: unknown): v is DiaryEntry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  return typeof e.id === 'string' && e.id.length > 0 && typeof e.title === 'string' && typeof e.body === 'string' && validDate(e.createdAt) && validDate(e.updatedAt);
}

type Stored = { v: 1; entries: unknown[] };
const isStored = (v: unknown): v is Stored => !!v && typeof v === 'object' && !Array.isArray(v) && (v as Stored).v === 1 && Array.isArray((v as Stored).entries);

/** The pages in a stored list, newest first (by the day they were begun), once each. Anything that is not a page is left out. */
export function pagesOf(raw: unknown[]): DiaryEntry[] {
  const seen = new Set<string>();
  const pages: DiaryEntry[] = [];
  for (const item of raw) {
    if (isEntry(item) && !seen.has(item.id)) { seen.add(item.id); pages.push(item); }
  }
  return pages.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
}

// What is read from the key, and what is done with it. This is the whole behaviour, in one place:
//   - A v1 diary is read page by page. Items inside it that do not read as pages are not shown, but they stay in the stored
//     list when other pages are saved, so nothing that a newer app wrote there is lost by an older one.
//   - Anything else (nothing, text, a list, a number, `{ v: 2, … }` from a newer app, `entries` that is not a list) reads as an
//     empty diary. Reading never writes, and neither does a delete: an older app cannot damage what a newer one stored just
//     by opening the screen. The first page the person writes replaces such a value, because there is nothing to merge it
//     with. (lib/localStore.ts answers null for a missing key and for a file it cannot read alike; the first case is an
//     empty diary, the second can only be told apart when a storage throws, and then nothing is written at all.)
//   - A storage that throws is "failed": a read shows nothing, a save or a delete says it did not happen. It never overwrites.
type Read =
  | { kind: 'ok'; raw: unknown[] }
  | { kind: 'none' }
  | { kind: 'unreadable' }
  | { kind: 'failed' };

/** The reasons a page is refused before anything is read. */
function refusal(uid: string, e: DiaryEntry): SaveProblem | null {
  if (!uid || !isEntry(e)) return 'not-saved';
  if (e.body.length > BODY_MAX) return 'body-too-long';
  if (e.title.length > TITLE_MAX) return 'title-too-long';
  return null;
}

/**
 * The diary over a storage. Reads and writes take turns (one queue for everything this store does), so two quick saves, or a
 * save and the list opening a moment later, never lose or miss each other: each one reads what the one before it wrote.
 * Nothing here throws.
 */
export function createDiaryStore(storage: DiaryStorage) {
  let tail: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(job: () => Promise<T>): Promise<T> => {
    const run = tail.then(job, job);
    tail = run.catch(() => undefined);
    return run;
  };

  const read = async (key: string): Promise<Read> => {
    let value: unknown;
    try { value = await storage.getJSON<unknown>(key); } catch { return { kind: 'failed' }; }
    if (value == null) return { kind: 'none' };
    return isStored(value) ? { kind: 'ok', raw: value.entries } : { kind: 'unreadable' };
  };
  const write = async (key: string, raw: unknown[]): Promise<boolean> => {
    const value: Stored = { v: 1, entries: raw };
    try { return (await storage.setJSON(key, value)) === true; } catch { return false; }
  };

  /** The pages of one person, newest first. An empty list when there is nothing, or nothing that reads. */
  const loadEntries = (uid: string): Promise<DiaryEntry[]> => {
    if (!uid) return Promise.resolve([]);
    return inTurn(async () => {
      const r = await read(diaryKey(uid));
      return r.kind === 'ok' ? pagesOf(r.raw) : [];
    }).catch((): DiaryEntry[] => []);
  };

  /** Adds the page, or replaces the one with the same id. A new page is refused at ENTRIES_MAX; a page already there never is. */
  const saveEntry = (uid: string, entry: DiaryEntry): Promise<SaveResult> => {
    const refused = refusal(uid, entry);
    if (refused) return Promise.resolve({ ok: false, reason: refused });
    const page: DiaryEntry = { id: entry.id, createdAt: entry.createdAt, updatedAt: entry.updatedAt, title: entry.title, body: entry.body };
    return inTurn(async (): Promise<SaveResult> => {
      const key = diaryKey(uid);
      const r = await read(key);
      if (r.kind === 'failed') return { ok: false, reason: 'not-saved' };
      const raw = r.kind === 'ok' ? r.raw.slice() : [];
      const at = raw.findIndex((item) => isEntry(item) && item.id === page.id);
      if (at >= 0) raw[at] = { ...(raw[at] as DiaryEntry), ...page };
      else if (raw.length >= ENTRIES_MAX) return { ok: false, reason: 'too-many-pages' };
      else raw.push(page);
      return (await write(key, raw)) ? { ok: true } : { ok: false, reason: 'not-saved' };
    }).catch((): SaveResult => ({ ok: false, reason: 'not-saved' }));
  };

  /** True when the page is gone afterwards (also when it was never there); false when it could not be removed. */
  const deleteEntry = (uid: string, id: string): Promise<boolean> => {
    if (!uid || !id) return Promise.resolve(true);
    return inTurn(async () => {
      const key = diaryKey(uid);
      const r = await read(key);
      if (r.kind === 'failed') return false;
      if (r.kind !== 'ok') return true;
      const raw = r.raw.filter((item) => !(isEntry(item) && item.id === id));
      return raw.length === r.raw.length ? true : write(key, raw);
    }).catch(() => false);
  };

  /** Removes the whole diary of one person, whatever is stored there. For deleting the account; never for signing out. */
  const clearDiary = (uid: string): Promise<void> => {
    if (!uid) return Promise.resolve();
    return inTurn(async () => {
      try { await storage.remove(diaryKey(uid)); } catch { /* nothing more can be done */ }
    }).catch(() => undefined);
  };

  return { loadEntries, saveEntry, deleteEntry, clearDiary };
}
