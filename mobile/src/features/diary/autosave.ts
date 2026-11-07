// Writing one page without ever losing a word: the autosave of the editor, as plain logic (no React), so plain node can
// test it with a clock it controls (npm run test:diary). The editor screen (useDiary.ts, app/diary/[id].tsx) only feeds it.
//
//   edit()     the person typed. The text is remembered at once and written AUTOSAVE_MS after the last keystroke.
//   flush()    do it now, if there is anything to do, and answer when everything typed so far is on the phone. Called on
//              Back, when the screen goes away and when the app goes to the background.
//   discard()  the person deleted the page: nothing typed is written any more, and the stored page is removed.
//
// A page begun in this editor exists only while it has something in it besides spaces and line breaks: it is created with
// the first character, and if the person erases everything again it is taken back, so opening a blank page, or typing and
// erasing, and leaving leaves no trace. A page that was opened from the list is never taken back: emptied, it stays as an
// empty page, because nothing is deleted unless the person says so.
import type { DiaryEntry, SaveProblem, SaveResult } from './store';

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
};

export type SaverDeps = {
  /** Writes one page. Calls take effect in the order they are made (the store's queue does that) and the answer is never a throw. */
  save: (entry: DiaryEntry) => Promise<SaveResult>;
  /** Removes one page, in the same order, and answers whether it is gone. */
  remove: (id: string) => Promise<boolean>;
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
  discard: () => Promise<boolean>;
  view: () => SaverView;
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
  let stored = initial != null;
  // The text handed to the store most recently. After a failed write, or once the page was taken back, it is null: what is on
  // the phone is not what the screen shows, so the next flush writes the text again even if it has not changed.
  let sent: { title: string; body: string } | null = initial ? { title, body } : null;
  let timer: unknown = null;
  let writing = 0;
  let taking = false;
  let tail: Promise<SaveResult> = Promise.resolve({ ok: true });
  let problem: SaveProblem | null = null;
  let closed = false;

  const view = (): SaverView => ({ status: timer != null || writing > 0 ? 'saving' : problem ? 'failed' : 'saved', stored, problem });
  const sig = (v: SaverView) => `${v.status}|${v.stored}|${v.problem}`;
  let told = sig(view());
  const notify = () => {
    const v = view();
    if (sig(v) === told) return;
    told = sig(v);
    deps.onChange?.(v);
  };

  const blank = () => !title.trim() && !body.trim();
  // Text to write: not what was just written, and never a blank text for a page begun here (that one is taken back instead).
  const dirty = () => !closed && !(born && blank()) && (sent == null || sent.title !== title || sent.body !== body);
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

  const send = () => {
    const snap = { title, body };
    id ??= deps.newId();
    const stamp = now().toISOString();
    createdAt ??= stamp;
    const entry: DiaryEntry = { id, createdAt, updatedAt: stamp, title, body };
    sent = snap;
    run(() => deps.save(entry), (res) => {
      if (res.ok) { stored = true; problem = null; }
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
    stop();
    if (takeBack() || dirty()) timer = setTimer(() => { timer = null; void flush(); }, delay);
    else if (writing === 0) problem = null;
    notify();
  };

  const discard = async (): Promise<boolean> => {
    closed = true;
    stop();
    notify();
    await tail; // a write on its way finishes first, so the removal comes after it
    if (id == null) return true;
    const ok = await deps.remove(id);
    if (ok) stored = false;
    else closed = false; // it is still there, and can be edited again
    notify();
    return ok;
  };

  return { edit, flush, discard, view };
}
