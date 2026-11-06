// Small building blocks shared by the social hooks: who am I, am I online, is this screen in
// front, and "refetch when something changes" (realtime events, polling fallback, app foreground).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { createDebouncer } from '../logic';
import { startOutbox, stopOutbox } from '../outbox';
import { SocialEvent, subscribeSocial, useRealtimeStatus } from '../realtime';

/** My user id (null when signed out). Also makes sure the chat outbox of this account is loaded and sending. */
export function useMeId(): string | null {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  useEffect(() => {
    if (uid) void startOutbox(uid);
    else stopOutbox();
  }, [uid]);
  return uid;
}

/** true unless the phone says it is offline. Unknown counts as online: sending is always tried. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    try {
      return NetInfo.addEventListener((s) => setOnline(!(s.isConnected === false || s.isInternetReachable === false)));
    } catch {
      return undefined;
    }
  }, []);
  return online;
}

/** true while this screen is the one in front (not covered by a pushed screen). */
export function useIsScreenFocused(): boolean {
  const [focused, setFocused] = useState(true);
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));
  return focused;
}

/** Run `cb` whenever the app comes back to the foreground. */
export function useOnForeground(cb: () => void) {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') ref.current(); });
    return () => sub.remove();
  }, []);
}

/** Date.now(), refreshed every minute, so "2 min ago" and "Today" stay right on a screen left open. */
export function useNow(everyMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

type LiveOptions = {
  match?: (e: SocialEvent) => boolean; // which realtime events matter (default: all)
  pollMs?: number;                     // polling interval while realtime is not live (default 15 s)
  enabled?: boolean;
};

/** Keeps a screen fresh: refetch (debounced) when a matching realtime event arrives, every 15 s while
 *  the screen is in front and realtime is not live, when the app returns to the foreground and when
 *  the screen comes back into view. The first load is the caller's job. */
export function useLiveRefresh(refetch: () => void | Promise<unknown>, opts: LiveOptions = {}) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const focused = useIsScreenFocused();
  const status = useRealtimeStatus();
  const enabled = opts.enabled !== false;
  const run = useRef(refetch);
  run.current = refetch;
  const match = useRef(opts.match);
  match.current = opts.match;
  const focusedRef = useRef(focused);
  focusedRef.current = focused;

  useEffect(() => {
    if (!uid || !enabled) return;
    const soon = createDebouncer(() => { if (focusedRef.current) void run.current(); }, 400);
    const off = subscribeSocial(uid, (e) => { if (e.table === 'resync' || !match.current || match.current(e)) soon(); });
    return () => { soon.cancel(); off(); };
  }, [uid, enabled]);

  useEffect(() => {
    if (!uid || !enabled || !focused || status === 'live') return;
    const t = setInterval(() => { void run.current(); }, opts.pollMs ?? 15_000);
    return () => clearInterval(t);
  }, [uid, enabled, focused, status, opts.pollMs]);

  useOnForeground(() => { if (enabled && focusedRef.current) void run.current(); });

  // Back in front after a pushed screen (focus false -> true): refetch. Not on the first render.
  const wasFocused = useRef(focused);
  useEffect(() => {
    if (focused && !wasFocused.current && enabled) void run.current();
    wasFocused.current = focused;
  }, [focused, enabled]);
}
