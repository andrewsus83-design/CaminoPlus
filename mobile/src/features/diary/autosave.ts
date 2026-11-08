// Writing one page without ever losing a word: the autosave of the editor, as plain logic (no React), so plain node can
// test it with a clock it controls (npm run test:diary). The editor screen (useDiary.ts, app/diary/[id].tsx) only feeds it.
//
//   edit()     the person typed. The text is remembered at once and written AUTOSAVE_MS after the last keystroke.
//   flush()    do it now, if there is anything to do, and answer when everything typed so far is on the phone. Called on
//              Back, when the screen goes away and when the app goes to the background.
//   tryLeave() the person wants to go (Back, the system's back, a swipe): flush first, and say 'leave' or 'stay'.
//   discard()  the person deleted the page: nothing typed is written any more, and the stored page is removed.
//   attach()   the person chose photos or videos: they are copied and written WITH the page, in the same queue as every other write,
//              so adding files while a save of the text is pending cannot race it (and the text typed so far goes along).
//   removeMedia() / setPlace()  a file taken off the page, a place put on it or taken off: written at once (a name typed for the
//              place is written after the usual short wait).
//
// A page begun in this editor exists only while it has something in it besides spaces and line breaks (a photo, a video or a
// place counts as something): it is created with the first character, and if the person erases everything again it is taken back,
// so opening a blank page, or typing and erasing, and leaving leaves no trace. A page that was opened from the list is never taken
// back: emptied, it stays as an empty page, because nothing is deleted unless the person says so.
import { mediaOf, type DiaryMedia, type PickedAsset, type Refusal } from './media';
import { normalizePlace, type DiaryPlace } from './place';
import type { AttachResult, DiaryEntry, SaveProblem, SaveResult } from './store';

/** How long after the last keystroke the page is written. */
export const AUTOSAVE_MS = 600;

export type SaveStatus = 'saved' | 'saving' | 'failed';

/** What the screen shows of the saver. */
export type SaverView = {
  /** "Saved on this phone", "Saving…", or the last write failed. */
  status: SaveStatus;
  /** The page is on the phone (so it can be deleted); false for a blank new page, or one that could not be written yet. */
  stored: boolean;
  /** Why the last write did not happen, until one does. */
  problem: SaveProblem | null;
  /** The photos and videos of the page as it is now, in order (the same array until they change). */
  media: DiaryMedia[];
  /** The place of the page, or null. */
  place: DiaryPlace | null;
  /** Counts the changes of the files and the place, so a screen that compares views sees them. */
  rev: number;
};

/** What adding files came to: how many were added, why the others were not, or why the page could not be written (then none were added). */
export type AttachOutcome = { added: number; refused: Refusal[]; failed: SaveProblem | null };

export type SaverDeps = {
  /** Writes one page. Calls take effect in the order they are made (the store's queue does that) and the answer is never a throw. */
  save: (entry: DiaryEntry) => Promise<SaveResult>;
  /** Removes one page, in the same order, and answers whether it is gone. */
  remove: (id: string) => Promise<boolean>;
  /** Copies the chosen files and writes the page with them (store.ts attachMedia). Without it a page cannot take files. */
  attach?: (entry: DiaryEntry, picked: PickedAsset[]) => Promise<AttachResult>;
  newId: () => string;
  now?: () => Date;
  onChange?: (view: SaverView) => void;
  delayMs?: number;
  /** Timers the test replaces so it does not have to wait. */
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
};

export type PageSaver = {
  edit: (change: { title?: string; body?: string }) => void;
  flush: () => Promise<SaveResult>;
  /**
   * The person wants to leave, by whatever way: everything typed is written first. 'leave' when it is all on the phone. When it
   * could not be written the answer is 'stay' once, so that the reason on screen is seen, and 'leave' on the next try (the person
   * has seen it and chooses to go). Typing again starts the warning over. Asking twice at once is asking once (a double tap).
   */
  tryLeave: () => Promise<'leave' | 'stay'>;
  discard: () => Promise<boolean>;
  view: () => SaverView;
  attach: (picked: PickedAsset[]) => Promise<AttachOutcome>;
  removeMedia: (id: string) => void;
  setPlace: (place: DiaryPlace | null, options?: { soon?: boolean }) => void;
};

export function createPageSaver(deps: SaverDeps, initial: DiaryEntry | null = null): PageSaver {
  const delay = deps.delayMs ?? AUTOSAVE_MS;
  const now = deps.now ?? (() => new Date());
  const setTimer = deps.setTimer ?? ((fn: () => void, ms: number): unknown => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));

  const born = initial == null; // begun in this editor, as opposed to opened from the list
  let id = initial?.id ?? null;
  let createdAt = initial?.createdAt ?? null;
  let title = initial?.title ?? '';
  let body = initial?.body ?? '';
  let media: DiaryMedia[] = mediaOf(initial);
  let place: DiaryPlace | null = normalizePlace(initial?.place);
  let rev = 0;
  let stored = initial != null;
  // What was handed to the store most recently: the text, and a short signature of the files and the place. After a failed write,
  // or once the page was taken back, it is null: what is on the phone is not what the screen shows, so the next flush writes it
  // again even if nothing has changed.
  const extra = (m: DiaryMedia[] = media, p: DiaryPlace | null = place) => `${m.map((x) => x.id).join(',')}|${p ? `${p.lat},${p.lon},${p.name ?? ''},${p.at}` : ''}`;
  let sent: { title: string; body: string; extra: string } | null = initial ? { title, body, extra: extra() } : null;
  let timer: unknown = null;
  let writing = 0;
  let taking = false;
  let tail: Promise<SaveResult> = Promise.resolve({ ok: true });
  let problem: SaveProblem | null = null;
  let closed = false;
  let warned = false; // the person has been told, by a leave that stayed, that what is typed could not be written
  let asking: Promise<'leave' | 'stay'> | null = null;

  const view = (): SaverView => ({ status: timer != null || writing > 0 ? 'saving' : problem ? 'failed' : 'saved', stored, problem, media, place, rev });
  const sig = (v: SaverView) => `${v.status}|${v.stored}|${v.problem}|${v.rev}`;
  let told = sig(view());
  const notify = () => {
    const v = view();
    if (sig(v) === told) return;
    told = sig(v);
    deps.onChange?.(v);
  };

  const blank = () => !title.trim() && !body.trim() && media.length === 0 && !place;
  // Something to write: not what was just written, and never a blank page begun here (that one is taken back instead).
  const dirty = () => !closed && !(born && blank()) && (sent == null || sent.title !== title || sent.body !== body || sent.extra !== extra());
  // A page begun here that has been emptied again, and is (or may be) on the phone.
  const takeBack = () => !closed && !taking && born && blank() && id != null && (stored || writing > 0 || sent != null);
  const stop = () => { if (timer != null) { clearTimer(timer); timer = null; } };

  // One job handed to the store. It is called at once, not a tick later: a list that is read right after leaving must find
  // the job queued before that read. The store makes jobs take turns in the order they were handed over (store.ts).
  const run = (job: () => Promise<SaveResult>, settle: (res: SaveResult) => void) => {
    writing += 1;
    const done = (async () => job())()
      .catch((): SaveResult => ({ ok: false, reason: 'not-saved' }))
      .then((res) => {
        writing -= 1;
        settle(res);
        notify();
        return res;
      });
    tail = Promise.all([tail, done]).then(([, res]) => res); // everything handed over so far, answered with this one's result
  };

  // The page as it is now. The files and the place are in it only when there are some: the store takes a page without them to have none.
  const entryNow = (stamp: string): DiaryEntry => ({ id: id as string, createdAt: createdAt as string, updatedAt: stamp, title, body, ...(media.length > 0 ? { media } : {}), ...(place ? { place } : {}) });

  const send = () => {
    const snap = { title, body, extra: extra() };
    id ??= deps.newId();
    const stamp = now().toISOString();
    createdAt ??= stamp;
    const entry = entryNow(stamp);
    sent = snap;
    run(() => deps.save(entry), (res) => {
      if (res.ok) { stored = true; problem = null; warned = false; }
      else { problem = res.reason; if (sent === snap) sent = null; }
    });
  };

  const takeBackNow = () => {
    const doomed = id as string;
    let gone = false;
    sent = null;
    taking = true;
    // If it cannot be removed it stays as an empty page: nothing is lost, leaving is not held up, and the next flush tries again.
    run(async () => { gone = await deps.remove(doomed); return { ok: true }; }, () => {
      taking = false;
      if (gone) { stored = false; problem = null; }
    });
  };

  const flush = (): Promise<SaveResult> => {
    stop();
    if (takeBack()) takeBackNow();
    else if (dirty()) send();
    else if (writing === 0) problem = null; // nothing to do and nothing at stake (a blank page): no complaint left
    notify();
    return tail;
  };

  const edit = (change: { title?: string; body?: string }) => {
    if (closed) return;
    if (change.title !== undefined) title = change.title;
    if (change.body !== undefined) body = change.body;
    warned = false;
    stop();
    if (takeBack() || dirty()) timer = setTimer(() => { timer = null; void flush(); }, delay);
    else if (writing === 0) problem = null;
    notify();
  };

  /**
   * The person chose photos or videos. They are copied and written with the page by the store, in the order of everything else this
   * saver hands over, so a write of the text that is pending before it, or typed after it, takes its turn and loses nothing. The
   * text typed so far goes along; the wait of the autosave is cancelled (anything typed during the copy starts a new one). The
   * answer says how many files were added and why the others were not; a page that cannot be written takes none of them (the
   * store deletes its copies) and the answer says why. A page that is not on the phone yet is created by it.
   */
  const attach = (picked: PickedAsset[]): Promise<AttachOutcome> => {
    const nothing = (failed: SaveProblem | null = null): AttachOutcome => ({ added: 0, refused: [], failed });
    if (closed || !deps.attach || !Array.isArray(picked) || picked.length === 0) return Promise.resolve(nothing());
    stop();
    id ??= deps.newId();
    const stamp = now().toISOString();
    createdAt ??= stamp;
    const entry = entryNow(stamp);
    const snap = { title, body, extra: extra() };
    const before = media;
    const placeThen = place;
    let result: AttachResult = { ok: false, reason: 'not-saved' };
    return new Promise<AttachOutcome>((resolve) => {
      run(async () => {
        result = await (deps.attach as NonNullable<SaverDeps['attach']>)(entry, picked);
        return result.ok ? { ok: true } : { ok: false, reason: result.reason };
      }, () => {
        if (!result.ok) {
          problem = result.reason;
          sent = null;
          resolve(nothing(result.reason));
          return;
        }
        if (result.added.length > 0) {
          stored = true; problem = null; warned = false;
          media = [...media, ...result.added];
          rev += 1;
          // what is on the phone now: the text and the files as they were handed over, plus the new ones
          sent = { title: snap.title, body: snap.body, extra: extra([...before, ...result.added], placeThen) };
        }
        resolve({ added: result.added.length, refused: result.refused, failed: null });
      });
      notify();
    });
  };

  /** A file is taken off the page: written at once, and the store deletes the file once the page that no longer lists it is on the phone. */
  const removeMedia = (mediaId: string) => {
    if (closed) return;
    const next = media.filter((m) => m.id !== mediaId);
    if (next.length === media.length) return;
    media = next;
    rev += 1;
    warned = false;
    void flush();
  };

  /** A place is put on the page, or taken off (null): written at once; with `soon` (a name being typed) after the usual short wait. */
  const setPlace = (next: DiaryPlace | null, options: { soon?: boolean } = {}) => {
    if (closed) return;
    const clean = next === null ? null : normalizePlace(next);
    if (next !== null && !clean) return;
    place = clean;
    rev += 1;
    warned = false;
    if (!options.soon) { void flush(); return; }
    stop();
    if (takeBack() || dirty()) timer = setTimer(() => { timer = null; void flush(); }, delay);
    notify();
  };

  const tryLeave = (): Promise<'leave' | 'stay'> => {
    // After the flush has settled, what decides is the state: nothing pending and nothing failed (not the answer of some older write).
    asking ??= flush()
      .then((): 'leave' | 'stay' => {
        if (view().status === 'saved' || warned) return 'leave';
        warned = true;
        return 'stay';
      })
      .finally(() => { asking = null; });
    return asking;
  };

  const discard = async (): Promise<boolean> => {
    closed = true;
    stop();
    notify();
    await tail; // a write on its way finishes first, so the removal comes after it
    if (id == null) return true;
    const ok = await deps.remove(id);
    if (ok) { stored = false; problem = null; }
    else closed = false; // it is still there, and can be edited again
    notify();
    return ok;
  };

  return { edit, flush, tryLeave, discard, view, attach, removeMedia, setPlace };
}
