// One shared Supabase realtime channel for everything social (messages, read cursors,
// notifications, friendships). Screens subscribe to events; when the channel is not live
// they fall back to polling (see hooks.ts). Realtime is a nice-to-have: nothing here may
// throw or leave a spinner running when the websocket cannot connect.
import { useSyncExternalStore } from 'react';
import { supabase } from '@/lib/supabase';

export type SocialTable = 'messages' | 'conversation_members' | 'notifications' | 'friendships';
export type SocialEvent =
  | { table: SocialTable; type: 'INSERT' | 'UPDATE' | 'DELETE'; row: Record<string, unknown> | null; old: Record<string, unknown> | null }
  | { table: 'resync'; type: 'RESYNC'; row: null; old: null }; // the channel (re)connected: refetch, events may have been missed

export type RealtimeStatus = 'idle' | 'connecting' | 'live' | 'down';

const TABLES: SocialTable[] = ['messages', 'conversation_members', 'notifications', 'friendships'];

let channel: ReturnType<typeof supabase.channel> | null = null;
let status: RealtimeStatus = 'idle';
let owner: string | null = null;
let serial = 0; // every channel gets its own topic: supabase-js hands back the OLD channel for a topic that is still leaving
let closeTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(e: SocialEvent) => void>();
const statusListeners = new Set<() => void>();

function setStatus(next: RealtimeStatus) {
  if (status === next) return;
  status = next;
  statusListeners.forEach((l) => l());
  // Events may have been missed while connecting or down: ask everyone to refetch once.
  if (next === 'live') emit({ table: 'resync', type: 'RESYNC', row: null, old: null });
}

function emit(e: SocialEvent) {
  listeners.forEach((l) => {
    try { l(e); } catch { /* one broken listener must not stop the others */ }
  });
}

function open(userId: string) {
  owner = userId;
  setStatus('connecting');
  try {
    const ch = supabase.channel(`social:${userId}:${++serial}`);
    for (const table of TABLES) {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, ...(table === 'notifications' ? { filter: `user_id=eq.${userId}` } : {}) },
        (p) => emit({ table, type: p.eventType as 'INSERT' | 'UPDATE' | 'DELETE', row: (p.new ?? null) as Record<string, unknown> | null, old: (p.old ?? null) as Record<string, unknown> | null }),
      );
    }
    ch.subscribe((s) => {
      if (channel !== ch) return; // an old channel reporting after we moved on
      if (s === 'SUBSCRIBED') setStatus('live');
      else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('down');
    });
    channel = ch;
  } catch {
    channel = null;
    setStatus('down');
  }
}

function close() {
  const ch = channel;
  channel = null;
  owner = null;
  if (ch) supabase.removeChannel(ch).catch(() => {});
  setStatus('idle');
}

/** Listen to social events for this user. The channel opens with the first listener and closes
 *  shortly after the last one leaves (moving between two screens must not reconnect). */
export function subscribeSocial(userId: string, listener: (e: SocialEvent) => void): () => void {
  if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  if (owner && owner !== userId) { listeners.clear(); close(); } // account switched
  listeners.add(listener);
  if (!channel) open(userId);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && !closeTimer) closeTimer = setTimeout(() => { closeTimer = null; if (listeners.size === 0) close(); }, 2000);
  };
}

export const getRealtimeStatus = () => status;

/** 'live' while events arrive through the websocket. Anything else means: poll. */
export function useRealtimeStatus(): RealtimeStatus {
  return useSyncExternalStore(
    (cb) => { statusListeners.add(cb); return () => { statusListeners.delete(cb); }; },
    () => status,
    () => 'idle' as RealtimeStatus,
  );
}
