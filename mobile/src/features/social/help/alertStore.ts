// The bell that was rung, kept outside any screen: closing the sheet must not lose "I am OK now", and neither
// should the phone restarting while the pilgrim walks on. One saved alert per account (u.<id>.help.last, wiped
// with the rest of that user's data when signing out). Which messages arrived is learned from the chat outbox.
import { localStore, userKey } from '@/lib/localStore';
import { onMessageSent } from '../outbox';
import { isAlertStale, markArrived, parseAlert, type HelpAlert } from './logic';

const NAME = 'help.last';

let userId: string | null = null;
let alert: HelpAlert | null = null;
let loading: Promise<void> | null = null;
let saving: Promise<unknown> = Promise.resolve();
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export const getAlert = () => alert;
export function subscribeAlert(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

function persist() {
  if (!userId) return;
  const key = userKey(userId, NAME);
  const snapshot = alert ? { v: 1, user_id: userId, alert } : null;
  saving = saving.then(async () => { await (snapshot ? localStore.setJSON(key, snapshot) : localStore.remove(key)); });
}

/** Load this account's saved alert. Safe to call again; another account (or signing out) clears the old one. */
export function loadAlert(uid: string | null): Promise<void> {
  if (!uid) {
    userId = null;
    if (alert) { alert = null; emit(); }
    loading = null;
    return Promise.resolve();
  }
  if (userId === uid && loading) return loading;
  if (userId !== uid) { userId = uid; alert = null; emit(); }
  loading = (async () => {
    const key = userKey(uid, NAME);
    let saved = parseAlert(await localStore.getJSON(key), uid);
    if (saved && isAlertStale(saved, Date.now())) { void localStore.remove(key); saved = null; } // an old position is not kept
    if (userId !== uid) return; // signed out meanwhile
    if (saved && !alert) { alert = saved; emit(); }
  })();
  return loading;
}

export function setAlert(next: HelpAlert | null) {
  alert = next;
  emit();
  persist();
}

/** Learned elsewhere (the server answered): these messages exist. */
export function noteArrived(messageIds: readonly string[], at = Date.now()) {
  if (!alert) return;
  const next = markArrived(alert, messageIds, at);
  if (next !== alert) setAlert(next);
}

// A message of the bell reached the server: remember it, so that "Sent" is never a guess.
onMessageSent((m) => noteArrived([m.id]));
