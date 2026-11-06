import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './auth';
import { JourneyDay, listJourneyDays, listMyPosts, listMyStamps, listStages, Post, Stage, Stamp } from './api';
import { localStore, userKey } from './localStore';
import { errorMessage, isOfflineError } from './net';

// What was last loaded, kept on the phone so the plan, stamps and posts still open without signal.
type Saved = { v: 1; journeyId: string | null; posts: Post[]; stamps: Stamp[]; days: JourneyDay[]; stages: Stage[] };

/**
 * Data for the Me tab: own posts, passport stamps and the current journey's day plan.
 * Stale-while-revalidate: the saved copy shows at once, the server refreshes it. `offline` is true when the
 * last refresh could not reach the server (the data on screen is then the saved copy, or still null if
 * nothing was ever saved).
 */
export function useMeData() {
  const { session, journey, refresh } = useAuth();
  const uid = session?.user.id;
  const journeyId = journey?.id ?? null;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stamps, setStamps] = useState<Stamp[] | null>(null);
  const [days, setDays] = useState<JourneyDay[] | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  // Saved copy first.
  useEffect(() => {
    if (!uid) return;
    let alive = true;
    localStore.getJSON<Saved>(userKey(uid, 'me')).then((saved) => {
      if (!alive || !saved || saved.v !== 1 || saved.journeyId !== journeyId) return;
      setPosts((p) => p ?? saved.posts);
      setStamps((s) => s ?? saved.stamps);
      setDays((d) => d ?? saved.days);
      setStages((st) => (st.length ? st : saved.stages));
    });
    return () => { alive = false; };
  }, [uid, journeyId]);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [p, s, d, st] = await Promise.all([
        listMyPosts(uid),
        listMyStamps(uid),
        journey ? listJourneyDays(journey.id) : Promise.resolve([] as JourneyDay[]),
        journey ? listStages(journey.route_id).catch(() => [] as Stage[]) : Promise.resolve([] as Stage[]),
      ]);
      setPosts(p); setStamps(s); setDays(d); setStages(st); setError(null); setOffline(false);
      const saved: Saved = { v: 1, journeyId, posts: p, stamps: s, days: d, stages: st };
      void localStore.setJSON(userKey(uid, 'me'), saved);
    } catch (e) {
      if (isOfflineError(e)) { setOffline(true); setError(null); }
      else setError(errorMessage(e));
    }
  }, [uid, journey, journeyId]);

  // Reload whenever the tab comes back into view (e.g. after writing a post).
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return { posts, stamps, days, stages, error, offline, reload: async () => { await refresh(); await load(); } };
}
