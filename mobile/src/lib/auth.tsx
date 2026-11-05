import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { getCurrentJourney, getProfile, Journey, Profile } from './api';

type AuthState = {
  ready: boolean;          // first session + account load finished
  session: Session | null;
  profile: Profile | null;
  journey: Journey | null; // null after sign-in = needs onboarding
  accountError: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [journey, setJourney] = useState<Journey | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null); // user id the account data belongs to
  const [accountError, setAccountError] = useState<string | null>(null);
  const userId = session?.user.id;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setSessionReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); setSessionReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);

  const load = useCallback(async (uid: string) => {
    try {
      // The profile row is created by the on_auth_user_created trigger; retry
      // briefly in case it has not committed yet right after sign-up.
      let p = await getProfile(uid);
      for (let i = 0; !p && i < 3; i++) { await new Promise((r) => setTimeout(r, 600)); p = await getProfile(uid); }
      const j = await getCurrentJourney(uid);
      setProfile(p); setJourney(j); setAccountError(p ? null : 'Your profile could not be created. Please try again.');
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadedFor(uid);
    }
  }, []);

  useEffect(() => {
    if (!userId) { setProfile(null); setJourney(null); setLoadedFor(null); return; }
    load(userId);
  }, [userId, load]);

  const value = useMemo<AuthState>(() => ({
    ready: sessionReady && (!userId || loadedFor === userId),
    session, profile, journey, accountError,
    refresh: async () => { if (userId) await load(userId); },
    signOut: async () => { await supabase.auth.signOut(); },
  }), [sessionReady, loadedFor, session, profile, journey, accountError, userId, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
