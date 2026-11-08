// "Grow into a Diary page": a note becomes a page of the Diary, written by the Diary's own store (features/diary/storage.ts saveEntry) under its
// own limits. Nothing about the Diary changes and nothing is sent anywhere: the page is on this phone, like the note. The note stays as it
// is; the page is a copy to keep writing in.
import { newId, saveEntry } from '../diary/storage';
import { problemMessage } from '../diary/present';
import { diaryDraft, type NoteTitles } from './diary';
import type { Note } from './notes';

export type GrowResult = { ok: true; id: string } | { ok: false; message: string };

/** Writes the Diary page for `note` for this person. Answers the new page's id (the route is /diary/<id>), or a gentle sentence. Never throws. */
export async function growIntoDiaryPage(uid: string, note: Note, titles: NoteTitles, now: Date = new Date()): Promise<GrowResult> {
  const { title, body } = diaryDraft(note, titles);
  const stamp = now.toISOString();
  const id = newId();
  const res = await saveEntry(uid, { id, createdAt: stamp, updatedAt: stamp, title, body });
  return res.ok ? { ok: true, id } : { ok: false, message: problemMessage(res.reason) };
}
