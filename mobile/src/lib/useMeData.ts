import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from './auth';
import { JourneyDay, listJourneyDays, listMyPosts, listMyStamps, listStages, Post, Stage, Stamp } from './api';

/** Data for the Me tab: own posts, passport stamps and the current journey's day plan. */
export function useMeData() {
  const { session, journey, refresh } = useAuth();
  const uid = session?.user.id;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [stamps, setStamps] = useState<Stamp[] | null>(null);
  const [days, setDays] = useState<JourneyDay[] | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!uid) return;
    try {
      const [p, s, d, st] = await Promise.all([listMyPosts(uid), listMyStamps(uid), journey ? listJourneyDays(journey.id) : Promise.resolve([]), journey ? listStages(journey.route_id).catch(() => []) : Promise.resolve([])]);
      setPosts(p); setStamps(s); setDays(d); setStages(st); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [uid, journey]);

  // Reload whenever the tab comes back into view (e.g. after writing a post).
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return { posts, stamps, days, stages, error, reload: async () => { await refresh(); await load(); } };
}
