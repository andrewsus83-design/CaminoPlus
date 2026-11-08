import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import type { Session } from '@supabase/supabase-js';
import { readStoredSession, supabase } from './supabase';
import { getCurrentJourney, getProfile, Journey, Profile } from './api';
import { clearUserData, localStore, userKey } from './localStore';
import { errorMessage, isOfflineError, withTimeout } from './net';
import { latestGate, reloadCurrent } from './accountLoad';
import { finishPendingAppleName } from './authApple';

// 'loading' = first answer pending, 'ready' = account known (fresh or saved copy), 'error' = signed in but
// the account could not be loaded and there is no saved copy (never treated as "needs onboarding").
export type AccountStatus = 'loading' | 'ready' | 'error';

type AuthState = {
  ready: boolean;          // the app can decide what to show (signed out, onboarding, tabs or error screen)
  status: AccountStatus;
  session: Session | null; // may hold an expired access token while offline: UI state only
  profile: Profile | null;
  journey: Journey | null; // null AFTER a successful load = needs onboarding
  accountError: string | null;
  stale: boolean;          // showing the saved copy because the server could not be reached
  retry: () => Promise<void>;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

type CachedAccount = { v: 1; profile: Profile; journey: Journey | null; savedAt: number };

const Ctx = createContext<AuthState | null>(null);
const accountKey = (uid: string) => userKey(uid, 'account');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Profile (waiting briefly for the sign-up trigger) plus the current journey, from the server. */
async function fetchAccount(uid: string): Promise<{ profile: Profile; journey: Journey | null }> {
  const run = async () => {
    // The profile row is created by the on_auth_user_created trigger; retry briefly in case it has not
    // committed yet right after sign-up.
    let p = await getProfile(uid);
    for (let i = 0; !p && i < 3; i++) { await sleep(600); p = await getProfile(uid); }
    if (!p) throw new Error('Your profile could not be created. Please try again.');
    return { profile: p, journey: await getCurrentJourney(uid) };
  };
  return withTimeout(run(), 12_000, 'The server took too long to answer.');
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [status, setStatus] = useState<AccountStatus>('loading');
  const [loadedFor, setLoadedFor] = useState<string | null>(null); // user id the account state belongs to
  const [accountError, setAccountError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const userId = session?.user.id;
  const currentUid = useRef<string | undefined>(undefined);
  const hasData = useRef(false);
  currentUid.current = userId;

  // Session: start from what is stored on the phone (instant, works offline), then follow supabase-js.
  useEffect(() => {
    let alive = true;
    const reconcile = async (s: Session | null) => {
      if (s) { if (alive) setSession(s); return; }
      // null = signed out OR the token could not be refreshed without a network. supabase-js clears the stored
      // session on a real sign-out / revoked refresh token and keeps it on network errors, so storage decides.
      const stored = await readStoredSession();
      if (alive) setSession(stored);
    };
    readStoredSession().then((s) => { if (alive) { setSession(s); setSessionReady(true); } });
    // Only synchronous work in this callback (supabase-js holds a lock while it runs).
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { void reconcile(s).then(() => { if (alive) setSessionReady(true); }); });
    return () => { alive = false; data.subscription.unsubscribe(); };
  }, []);

  // Only the newest load writes its answer (lib/accountLoad.ts): an older one that finishes last is dropped.
  const [gate] = useState(latestGate);
  const load = useCallback(async (uid: string) => {
    const ticket = gate.begin();
    const mine = () => currentUid.current === uid && gate.isLatest(ticket);
    try {
      const acc = await fetchAccount(uid);
      if (!mine()) return;
      hasData.current = true;
      setProfile(acc.profile); setJourney(acc.journey); setAccountError(null); setStale(false); setStatus('ready');
      const saved: CachedAccount = { v: 1, profile: acc.profile, journey: acc.journey, savedAt: Date.now() };
      void localStore.setJSON(accountKey(uid), saved);
      // A name Sign in with Apple shared that could not be saved yet: save it now, then load again to show it.
      void finishPendingAppleName(uid).then((savedName) => { if (savedName && currentUid.current === uid) void loadRef.current(uid); });
    } catch (e) {
      if (!mine()) return;
      setAccountError(isOfflineError(e) ? 'You are offline.' : errorMessage(e));
      if (hasData.current) { setStale(true); setStatus('ready'); } // keep showing the saved copy
      else setStatus('error');
    } finally {
      if (mine()) setLoadedFor(uid);
    }
  }, [gate]);
  const loadRef = useRef(load);
  loadRef.current = load;

  // Account: saved copy first (so the app opens offline), then the server.
  useEffect(() => {
    if (!userId) {
      hasData.current = false;
      setProfile(null); setJourney(null); setLoadedFor(null); setStatus('loading'); setStale(false); setAccountError(null);
      return;
    }
    let alive = true;
    (async () => {
      const cached = await localStore.getJSON<CachedAccount>(accountKey(userId));
      if (!alive) return;
      if (cached?.v === 1 && cached.profile?.id === userId) {
        hasData.current = true;
        setProfile(cached.profile); setJourney(cached.journey ?? null); setStale(true); setStatus('ready'); setLoadedFor(userId);
      } else {
        hasData.current = false;
        setStatus('loading');
      }
      await load(userId);
    })();
    return () => { alive = false; };
  }, [userId, load]);

  // Back online: refresh the account in the background.
  useEffect(() => {
    if (!userId) return;
    let wasOnline: boolean | null = null;
    const unsub = NetInfo.addEventListener((s) => {
      const online = s.isConnected !== false && s.isInternetReachable !== false;
      if (online && wasOnline === false) void loadRef.current(userId);
      wasOnline = online;
    });
    return unsub;
  }, [userId]);

  const value = useMemo<AuthState>(() => ({
    ready: sessionReady && (!userId || loadedFor === userId),
    status, session, profile, journey, accountError, stale,
    // Both read the signed-in user when they are called (a ref), not the user of this render (lib/accountLoad.ts).
    retry: reloadCurrent(() => currentUid.current, (uid) => loadRef.current(uid), () => { if (!hasData.current) setStatus('loading'); }),
    refresh: reloadCurrent(() => currentUid.current, (uid) => loadRef.current(uid)),
    signOut: async () => {
      const uid = userId;
      // Offline the server-side logout cannot be reached: fall back to signing out on this phone only.
      const { error } = await supabase.auth.signOut();
      if (error) await supabase.auth.signOut({ scope: 'local' });
      if (uid) {
        await localStore.remove(accountKey(uid));
        await clearUserData(uid); // chat outbox, cached lists ... everything saved for this user on this phone
      }
    },
  }), [sessionReady, loadedFor, status, session, profile, journey, accountError, stale, userId]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
