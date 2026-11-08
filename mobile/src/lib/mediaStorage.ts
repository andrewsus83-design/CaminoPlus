// The ONE module that talks to cloud file storage (today Supabase Storage): upload, signed and public links, delete.
// A later move to another store (for example Cloudflare R2) changes this file only. Every photo or clip reaches upload()
// after src/lib/media prepareImage / prepareVideo; src/lib/__tests__/media.test.ts fails for a storage call anywhere else.
// Only storage keys ("<user id>/posts/...") are kept in the database, never full links.
import { supabase } from './supabase';
import { SIGNED_URL_TTL_SECONDS, createUrlMemo } from './media/urlMemo';
import { stripJpegLocation } from './media/exif';

export const MEDIA_BUCKET = {
  /** Public profile pictures, one per pilgrim. */
  avatars: 'avatars',
  /** Private photos and clips of posts and chat; read through signed links. */
  userMedia: 'user-media',
} as const;
export type MediaBucket = (typeof MEDIA_BUCKET)[keyof typeof MEDIA_BUCKET];

/** An upload that failed. `status` is the HTTP status when the server answered; `network` when it did not; `missing` when the file is gone from the phone. */
export class MediaStorageError extends Error {
  status?: number;
  network: boolean;
  missing: boolean;
  constructor(message: string, o: { status?: number; network?: boolean; missing?: boolean } = {}) {
    super(message);
    this.status = o.status;
    this.network = !!o.network;
    this.missing = !!o.missing;
  }
}

const memo = createUrlMemo();

/** Upload a local file (a uri from prepareImage / prepareVideo). Returns the key and the size that went up. */
export async function upload(bucket: MediaBucket, path: string, uri: string, contentType: string, o: { upsert?: boolean } = {}): Promise<{ path: string; bytes: number }> {
  let body: ArrayBuffer;
  try {
    body = await (await fetch(uri)).arrayBuffer();
  } catch {
    throw new MediaStorageError('The file is no longer on this phone.', { status: 400, missing: true });
  }
  // No photo leaves the phone with its GPS position, also when this build could not save it again (media/exif.ts).
  if (contentType === 'image/jpeg') {
    const clean = stripJpegLocation(new Uint8Array(body));
    if (clean.removed) body = clean.bytes.buffer.slice(clean.bytes.byteOffset, clean.bytes.byteOffset + clean.bytes.byteLength) as ArrayBuffer;
  }
  const up = await supabase.storage.from(bucket).upload(path, body, { contentType, upsert: o.upsert ?? true });
  if (up.error) {
    // StorageApiError carries an HTTP status; a failed fetch (offline) does not.
    const e = up.error as { status?: number; statusCode?: string | number };
    const raw = e.status ?? e.statusCode;
    const status = raw == null ? NaN : Number(raw);
    throw new MediaStorageError(up.error.message, { status: Number.isFinite(status) ? status : undefined, network: !Number.isFinite(status) });
  }
  memo.forget(bucket, [path]); // a replaced file gets a new link
  return { path, bytes: body.byteLength };
}

/** The public link of a file in a public bucket (avatars). */
export function publicUrl(bucket: MediaBucket, path: string): string {
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Signed links (valid one hour) by key. A link is reused for 50 minutes (urlMemo.ts), so a screen that loads again gets
 * the same link and the image cache keeps working. Keys Storage did not sign are missing from the answer.
 */
export async function signedUrls(bucket: MediaBucket, paths: readonly string[]): Promise<Record<string, string>> {
  const { have, need } = memo.split(bucket, paths.filter(Boolean));
  if (need.length === 0) return have;
  const res = await supabase.storage.from(bucket).createSignedUrls(need, SIGNED_URL_TTL_SECONDS);
  if (res.error || !res.data) throw new MediaStorageError(res.error?.message ?? 'Could not load the photo.', { network: true });
  for (const r of res.data) {
    if (r.path && r.signedUrl) {
      have[r.path] = r.signedUrl;
      memo.put(bucket, r.path, r.signedUrl);
    }
  }
  return have;
}

/** Delete files the pilgrim no longer uses, so their storage is free again. Best effort: answers false when it did not work. */
export async function deleteMedia(bucket: MediaBucket, paths: readonly (string | null | undefined)[]): Promise<boolean> {
  const list = [...new Set(paths.filter((p): p is string => typeof p === 'string' && p.length > 0))];
  if (list.length === 0) return true;
  memo.forget(bucket, list);
  try {
    const res = await supabase.storage.from(bucket).remove(list);
    return !res.error;
  } catch {
    return false;
  }
}

/** Forget every remembered link (sign-out). */
export function clearSignedUrlMemo() {
  memo.clear();
}
