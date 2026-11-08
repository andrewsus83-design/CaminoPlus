import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { assertOnline, errorMessage, isOfflineError } from './net';
import { localStore, userKey } from './localStore';

// Plan and cloud storage of the signed-in pilgrim, from the server (rpc get_my_storage). The last answer is
// kept on the phone so Settings still shows something useful without signal.
export type MyStorage = { has_plus: boolean; quota_bytes: number; used_bytes: number; object_count: number; remaining_bytes: number };

export async function getMyStorage(): Promise<MyStorage> {
  await assertOnline();
  const res = await supabase.rpc('get_my_storage');
  if (res.error) throw new Error(res.error.message);
  return res.data as MyStorage;
}

/** The plan and storage now: the server's answer, or the last one saved on this phone, or null when neither is there. */
export async function loadMyStorage(uid: string | null | undefined): Promise<MyStorage | null> {
  if (!uid) return null;
  const key = userKey(uid, 'storage');
  try {
    const fresh = await getMyStorage();
    void localStore.setJSON(key, fresh);
    return fresh;
  } catch {
    return (await localStore.getJSON<MyStorage>(key).catch(() => null)) ?? null;
  }
}

export function useMyStorage() {
  const { session } = useAuth();
  const uid = session?.user.id;
  const [data, setData] = useState<MyStorage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    if (!uid) return;
    const key = userKey(uid, 'storage');
    const cached = await localStore.getJSON<MyStorage>(key);
    if (cached) setData((d) => d ?? cached);
    try {
      const fresh = await getMyStorage();
      setData(fresh); setError(null); setOffline(false);
      void localStore.setJSON(key, fresh);
    } catch (e) {
      setOffline(isOfflineError(e));
      setError(isOfflineError(e) ? null : errorMessage(e));
    }
  }, [uid]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return { data, error, offline, reload: load };
}
