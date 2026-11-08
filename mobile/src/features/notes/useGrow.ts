import { useCallback } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { growIntoDiaryPage } from './growIntoDiary';
import type { NoteTitles } from './diary';
import type { Note } from './notes';

/**
 * "Grow into a Diary page" for a screen: writes the page through the Diary's own store and, when it is written, opens it (/diary/<id>). Answers
 * null when it worked, or the gentle sentence to show. Nothing leaves the phone.
 */
export function useGrow(): (note: Note, titles: NoteTitles) => Promise<string | null> {
  const { session } = useAuth();
  const router = useRouter();
  const uid = session?.user.id ?? null;
  return useCallback(async (note, titles) => {
    if (!uid) return 'This note could not be grown into a Diary page. Please try again.';
    const res = await growIntoDiaryPage(uid, note, titles);
    if (!res.ok) return res.message;
    router.push(`/diary/${res.id}`);
    return null;
  }, [uid, router]);
}
