// Uploading the photos and clips of a journey post and registering each in post_media, without ever leaving a row that
// points at a deleted file. Pure (storage and database calls are handed in), checked by src/lib/__tests__/media.test.ts;
// api.ts uploadPostMedia hands in the real calls.
//
// When the insert of a row fails, its files are deleted only when the database DEFINITELY did not store the row:
// - a clear refusal (a 4xx answer other than 408 / 429, or a Postgres error code) means no row: delete;
// - 23505 (the row is already there, an earlier try landed) means stored: keep, and count it as uploaded;
// - anything else (no answer, a time-out, a 5xx) is unknown: ask the database whether the row is there. No row: delete.
//   A row: keep, uploaded. The question fails too: keep the files (only a later server job, not built yet, can remove them).

export type PreparedUpload = {
  uri: string; type: 'image' | 'video'; mimeType: string;
  width: number | null; height: number | null; durationMs: number | null; bytes: number | null;
  thumbUri: string | null;
};

export type InsertAnswer = { ok: true } | { ok: false; status?: number | null; code?: string | null };

export type PostMediaDeps = {
  upload: (path: string, uri: string, contentType: string) => Promise<{ bytes: number }>;
  insertRow: (row: Record<string, unknown>) => Promise<InsertAnswer>;
  /** Is there a row for this post and slide? Throws when the database cannot be asked. */
  rowExists: (postId: string, sortOrder: number) => Promise<boolean>;
  deleteFiles: (paths: string[]) => Promise<unknown> | unknown;
};

/** What a failed insert means: stored, rejected (no row), or unknown (ask). */
export function insertOutcome(a: { status?: number | null; code?: string | null }): 'stored' | 'rejected' | 'unknown' {
  if (a.code === '23505') return 'stored';
  const s = a.status ?? 0;
  if (s >= 400 && s < 500 && s !== 408 && s !== 429) return 'rejected';
  if (a.code && /^[0-9A-Z]{5}$/.test(a.code) && !/^(08|53|57|58)/.test(a.code)) return 'rejected'; // a Postgres error, not a connection one
  return 'unknown';
}

/** How many items could not be uploaded, and the plain reasons this phone gave for refusing some of them (the upload's own
 *  refusal, for example a clip whose recording place could not be removed). */
export type PostMediaResult = { failed: number; reasons: string[] };

export async function uploadPostMediaWith(d: PostMediaDeps, userId: string, postId: string, items: readonly PreparedUpload[]): Promise<PostMediaResult> {
  let failed = 0;
  const reasons: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const m = items[i];
    const uploaded: string[] = [];
    try {
      const ext = m.type === 'video' ? (m.mimeType === 'video/quicktime' ? 'mov' : 'mp4') : 'jpg';
      const path = `${userId}/posts/${postId}-${i}.${ext}`;
      const main = await d.upload(path, m.uri, m.mimeType);
      uploaded.push(path);
      let thumbPath: string | null = null;
      if (m.thumbUri) {
        try {
          const t = `${userId}/posts/${postId}-${i}-thumb.jpg`;
          await d.upload(t, m.thumbUri, 'image/jpeg');
          thumbPath = t;
          uploaded.push(t);
        } catch {
          thumbPath = null; // lists then show the photo itself
        }
      }
      let answer: InsertAnswer;
      try {
        answer = await d.insertRow({
          post_id: postId, user_id: userId, sort_order: i, media_type: m.type, storage_path: path, thumb_path: thumbPath,
          width: m.width ?? null, height: m.height ?? null, duration_ms: m.durationMs ? Math.round(m.durationMs) : null,
          size_bytes: main.bytes, upload_status: 'uploaded', // the size that is stored (after the location was removed)
        });
      } catch {
        answer = { ok: false, status: null, code: null }; // no answer at all
      }
      if (answer.ok) continue;
      let outcome = insertOutcome(answer);
      if (outcome === 'unknown') {
        try {
          outcome = (await d.rowExists(postId, i)) ? 'stored' : 'rejected';
        } catch {
          outcome = 'unknown';
        }
      }
      if (outcome === 'stored') continue;
      failed++;
      if (outcome === 'rejected') await Promise.resolve(d.deleteFiles(uploaded)).catch(() => {});
    } catch (e) {
      failed++; // an upload failed: a file that went up before it has no row and never will
      if (e && typeof e === 'object' && (e as { refused?: boolean }).refused === true && e instanceof Error) reasons.push(e.message);
      if (uploaded.length) await Promise.resolve(d.deleteFiles(uploaded)).catch(() => {});
    }
  }
  return { failed, reasons };
}

const CHECK_CONNECTION = 'Check your connection and your cloud storage in Settings.';

/** What the composer says when some files did not go up: each reason this phone gave, with how many files it covers, and the
 *  connection / storage sentence only for the others. */
export function mediaFailureText(failed: number, total: number, reasons: readonly string[]): string {
  const head = `${failed} of ${total} photos or videos could not be uploaded.`;
  const byReason = new Map<string, number>();
  for (const r of reasons) byReason.set(r, (byReason.get(r) ?? 0) + 1);
  const parts = [...byReason].map(([r, n]) => (n === failed ? r : `${n === 1 ? '1 file' : `${n} files`}: ${r}`));
  const others = failed - reasons.length;
  if (others > 0) parts.push(reasons.length ? `Others: ${CHECK_CONNECTION.charAt(0).toLowerCase()}${CHECK_CONNECTION.slice(1)}` : CHECK_CONNECTION);
  return [head, ...parts].join(' ');
}
