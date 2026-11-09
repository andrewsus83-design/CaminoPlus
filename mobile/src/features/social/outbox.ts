// Outbox for chat messages. Sending never blocks the screen: a message goes into the outbox
// (persisted with the local JSON store), shows up at once as "sending", and a flusher sends it.
// The client id is the message id, so sending the same message twice is harmless. Network
// trouble keeps the message queued and retries (backoff, when the connection returns, when the
// app comes back to the foreground). Only an answer from the server marks it "failed".
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { localStore, userKey } from '@/lib/localStore';
import { socialApi } from './api';
import { classifySendError, discardMediaPlan, friendlyError, outboxToMessage, parseOutbox, patchOutbox, removeOutbox, retryDelayMs, upsertOutbox } from './logic';
import type { ChatMessage, OutboxItem } from './types';

// One saved outbox per account (u.<userId>.social.outbox.v1): signing out wipes it with the rest of that
// user's data, and another account signing in on the same phone never sees or overwrites it.
const NAME = 'social.outbox.v1';

let userId: string | null = null;
let items: OutboxItem[] = [];
let loading: Promise<void> | null = null;
let flushing = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let saving: Promise<unknown> = Promise.resolve();
let wired = false;
const subs = new Set<() => void>();
const sentSubs = new Set<(m: ChatMessage) => void>();
// Photos I just sent stay on the phone: show them while the server copy loads.
const localImages = new Map<string, string>();

const emit = () => subs.forEach((f) => f());

function persist() {
  if (!userId) return;
  const key = userKey(userId, NAME);
  const snapshot = { user_id: userId, items };
  saving = saving.then(() => localStore.setJSON(key, snapshot));
}

export const getOutbox = () => items;
export const localImageFor = (id: string) => localImages.get(id) ?? null;

export function subscribeOutbox(fn: () => void): () => void {
  subs.add(fn);
  return () => { subs.delete(fn); };
}

/** Called with the message (as the server will have it) right after it was sent. */
export function onMessageSent(fn: (m: ChatMessage) => void): () => void {
  sentSubs.add(fn);
  return () => { sentSubs.delete(fn); };
}

function wire() {
  if (wired) return;
  wired = true;
  try {
    NetInfo.addEventListener((s) => { if (s.isConnected && s.isInternetReachable !== false) void flush(); });
    AppState.addEventListener('change', (st) => { if (st === 'active') void flush(); });
  } catch {
    /* no connectivity events: the retry timer still works */
  }
}

/** Load this user's saved outbox and start sending. Safe to call from every screen. */
export function startOutbox(uid: string): Promise<void> {
  wire();
  if (userId === uid && loading) return loading;
  if (userId !== uid) { userId = uid; items = []; emit(); }
  loading = (async () => {
    const stored = parseOutbox(await localStore.getJSON(userKey(uid, NAME)), uid);
    if (userId !== uid) return; // signed out meanwhile
    const have = new Set(items.map((i) => i.id));
    items = [...stored.filter((i) => !have.has(i.id)), ...items];
    for (const i of items) if (i.kind === 'image' && i.local_uri) localImages.set(i.id, i.local_uri);
    emit();
    void flush();
  })();
  return loading;
}

/** Signed out: forget the in-memory list (the saved copy is wiped by lib/auth signOut > clearUserData). */
export function stopOutbox() {
  userId = null;
  items = [];
  loading = null;
  if (timer) { clearTimeout(timer); timer = null; }
  emit();
}

export function enqueue(item: Omit<OutboxItem, 'status' | 'attempts' | 'error'>) {
  items = upsertOutbox(items, { ...item, status: 'queued', attempts: 0, error: null });
  if (item.kind === 'image' && item.local_uri) localImages.set(item.id, item.local_uri);
  emit();
  persist();
  void flush();
}

export function retryItem(id: string) {
  items = patchOutbox(items, id, { status: 'queued', attempts: 0, error: null });
  emit();
  persist();
  void flush();
}

export function discardItem(id: string) {
  // A photo that went up but whose message was never sent would stay in storage and count against the quota. It is
  // deleted only when no message can use it (logic.ts discardMediaPlan).
  const gone = items.find((i) => i.id === id);
  if (gone?.media_path) {
    const path = gone.media_path;
    const plan = discardMediaPlan(gone);
    if (plan === 'check') {
      void socialApi.getMessages([gone.id]).then((found) => { if (found.length === 0) void socialApi.deleteChatImage(path); }).catch(() => {});
    }
  }
  items = removeOutbox(items, id);
  emit();
  persist();
}

function scheduleRetry() {
  if (timer) return;
  const attempts = Math.max(1, ...items.filter((i) => i.status === 'queued').map((i) => i.attempts));
  timer = setTimeout(() => { timer = null; void flush(); }, retryDelayMs(attempts - 1));
}

function finish(item: OutboxItem) {
  items = removeOutbox(items, item.id);
  emit();
  persist();
  const { local: _local, local_uri: _uri, ...message } = outboxToMessage(item);
  sentSubs.forEach((f) => {
    try { f(message); } catch { /* a screen that is gone must not break sending */ }
  });
}

/** Send everything that is queued, oldest first. Stops at the first network failure. */
export async function flush(): Promise<void> {
  if (flushing || !userId) return;
  flushing = true;
  if (timer) { clearTimeout(timer); timer = null; }
  try {
    let offline = false;
    // Another pass picks up messages queued while this one was running.
    while (!offline && items.some((i) => i.status === 'queued')) {
      for (const queued of [...items]) {
        let item = items.find((i) => i.id === queued.id);
        if (!item || item.status !== 'queued') continue;
        items = patchOutbox(items, item.id, { status: 'sending' });
        emit();
        try {
          if (item.kind === 'image' && !item.media_path) {
            const path = await socialApi.uploadChatImage(item);
            items = patchOutbox(items, item.id, { media_path: path });
            item = { ...item, media_path: path };
            persist();
          }
          await socialApi.sendMessage(item);
          finish(item);
        } catch (e) {
          const how = classifySendError(e as { status?: number; code?: string; network?: boolean });
          if (how === 'duplicate') {
            finish(item); // an earlier try already landed
          } else if (how === 'network') {
            items = patchOutbox(items, item.id, { status: 'queued', attempts: item.attempts + 1 });
            emit();
            persist();
            scheduleRetry();
            offline = true;
            break; // keep the order: do not send later messages before this one
          } else {
            const code = (e as { code?: string }).code;
            const why = item.kind === 'image'
              ? 'This photo could not be sent. Photos in chat need Pilgrim Plus and free cloud storage.'
              : code === '42501'
                ? 'You can only message friends who are in this chat and have not blocked you.'
                : friendlyError(e, 'This message could not be sent.');
            items = patchOutbox(items, item.id, { status: 'failed', error: why });
            emit();
            persist();
          }
        }
      }
    }
  } finally {
    flushing = false;
  }
}
