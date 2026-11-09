// The size rules for photos and videos that leave the phone (posts, chat, the profile picture). ONE place: every number
// is named here, nothing is inline anywhere else. Pure, so a plain-node test checks it (src/lib/__tests__/media.test.ts).
// The diary keeps its media on the phone and does not use these rules. See mobile/docs/MEDIA.md.

export type MediaTier = 'free' | 'plus';
/** Where a photo is going: a journey post, a chat message or the profile picture. */
export type PhotoUse = 'post' | 'chat' | 'avatar';

const MB = 1024 * 1024;

/* ------------------------------------------------------------------ the table, one sentence per row */

/** Free: photos keep at most 1280 px on the long side, enough to fill a phone screen sharply. */
export const FREE_PHOTO_EDGE = 1280;
/** Pilgrim Plus: photos keep up to 3840 px on the long side, the "higher resolution" of the plan. */
export const PLUS_PHOTO_EDGE = 3840;
/** Free: JPEG quality 0.8, where a photo still looks clean and is a fraction of the original size. */
export const FREE_JPEG_QUALITY = 0.8;
/** Pilgrim Plus: JPEG quality 0.85, a little more detail to go with the larger picture. */
export const PLUS_JPEG_QUALITY = 0.85;
/** Everybody: a profile picture is shown small, so 512 px is plenty. */
export const AVATAR_EDGE = 512;
/** Everybody: a chat photo is seen on a phone screen, so 1280 px for every plan. */
export const CHAT_PHOTO_EDGE = 1280;
/** Everybody: grids and lists show a 480 px thumbnail, so a feed does not download the full photo. */
export const THUMB_EDGE = 480;
/** Everybody: thumbnails are small and seen small, so quality 0.7 keeps them at about 30 to 60 KB. */
export const THUMB_JPEG_QUALITY = 0.7;
/** Free: video up to 720p (1280 px on the long side). */
export const FREE_VIDEO_EDGE = 1280;
/** Pilgrim Plus: video up to 1080p (1920 px on the long side); 4K video is planned and needs work on the server. */
export const PLUS_VIDEO_EDGE = 1920;
/** Everybody: a clip is at most 60 seconds (the same limit the post composer always had). */
export const MAX_VIDEO_SECONDS = 60;

/* ------------------------------------------------------------------ per-file caps, and why */

/** The Storage file limit of the project: no single upload can be larger, so every cap below stays at or under it. */
export const STORAGE_FILE_LIMIT_BYTES = 50 * MB;
/** The avatars bucket refuses files over 5 MB; a 512 px JPEG is about 50 to 100 KB. */
export const AVATAR_CAP_BYTES = 5 * MB;
/** Free photo cap: a 1280 px JPEG is under 1 MB; 10 MB leaves room for an original photo on a build without resizing. */
export const FREE_PHOTO_CAP_BYTES = 10 * MB;
/** Plus photo cap: a 3840 px JPEG is about 2 to 5 MB; 20 MB leaves room for an original photo on a build without resizing. */
export const PLUS_PHOTO_CAP_BYTES = 20 * MB;
/** Free video cap: 60 s of 720p at about 2.5 Mbit/s is about 19 MB, plus room for sound and the container. */
export const FREE_VIDEO_CAP_BYTES = 25 * MB;
/** Plus video cap: 60 s of 1080p at about 5 Mbit/s is about 38 MB; 45 MB stays under the 50 MB Storage file limit. */
export const PLUS_VIDEO_CAP_BYTES = 45 * MB;

/** Bitrates used for the size estimates and for a video compressor when one is in the app (bits per second). */
export const FREE_VIDEO_BITRATE = 2_500_000;
export const PLUS_VIDEO_BITRATE = 5_000_000;
export const AUDIO_BITRATE = 128_000;
/** About how many bytes one pixel takes in a phone-photo JPEG at quality 0.8 (12 MP is about 3 MB). */
export const JPEG_BYTES_PER_PIXEL = 0.25;

/* ------------------------------------------------------------------ rules */

export type PhotoRule = { maxEdge: number; quality: number; capBytes: number };
export type VideoRule = { maxEdge: number; maxSeconds: number; capBytes: number; bitrate: number; iosExportPreset: 'H264_1280x720' | 'H264_1920x1080' };

export function photoRule(tier: MediaTier, use: PhotoUse = 'post'): PhotoRule {
  const plus = tier === 'plus';
  if (use === 'avatar') return { maxEdge: AVATAR_EDGE, quality: FREE_JPEG_QUALITY, capBytes: AVATAR_CAP_BYTES };
  const capBytes = plus ? PLUS_PHOTO_CAP_BYTES : FREE_PHOTO_CAP_BYTES;
  if (use === 'chat') return { maxEdge: CHAT_PHOTO_EDGE, quality: FREE_JPEG_QUALITY, capBytes };
  return { maxEdge: plus ? PLUS_PHOTO_EDGE : FREE_PHOTO_EDGE, quality: plus ? PLUS_JPEG_QUALITY : FREE_JPEG_QUALITY, capBytes };
}

export function videoRule(tier: MediaTier): VideoRule {
  return tier === 'plus'
    ? { maxEdge: PLUS_VIDEO_EDGE, maxSeconds: MAX_VIDEO_SECONDS, capBytes: PLUS_VIDEO_CAP_BYTES, bitrate: PLUS_VIDEO_BITRATE, iosExportPreset: 'H264_1920x1080' }
    : { maxEdge: FREE_VIDEO_EDGE, maxSeconds: MAX_VIDEO_SECONDS, capBytes: FREE_VIDEO_CAP_BYTES, bitrate: FREE_VIDEO_BITRATE, iosExportPreset: 'H264_1280x720' };
}

/** The plan as the app knows it: get_my_storage() says has_plus (Settings reads the same answer). Unknown is Free. */
export function tierFor(plan: { has_plus?: boolean | null } | 'free' | 'plus' | null | undefined): MediaTier {
  if (plan === 'plus') return 'plus';
  if (plan && typeof plan === 'object' && plan.has_plus === true) return 'plus';
  return 'free';
}

/* ------------------------------------------------------------------ pure helpers */

/** The size that fits inside maxEdge on the long side, keeping the shape. Never larger than the original. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number; scaled: boolean } {
  const w = Number.isFinite(width) && width > 0 ? width : 0;
  const h = Number.isFinite(height) && height > 0 ? height : 0;
  const long = Math.max(w, h);
  if (long === 0 || !(maxEdge > 0) || long <= maxEdge) return { width: Math.round(w), height: Math.round(h), scaled: false };
  const k = maxEdge / long;
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)), scaled: true };
}

/** About how big a photo will be after prepareImage (bytes). */
export function estimatePhotoBytes(width: number, height: number, tier: MediaTier, use: PhotoUse = 'post'): number {
  const rule = photoRule(tier, use);
  const fit = fitWithin(width, height, rule.maxEdge);
  return Math.round(fit.width * fit.height * JPEG_BYTES_PER_PIXEL * (rule.quality / FREE_JPEG_QUALITY));
}

/** About how big a clip of this length is at the plan's bitrate (bytes). */
export function estimateVideoBytes(seconds: number, tier: MediaTier): number {
  const s = Math.max(0, seconds);
  return Math.round(((videoRule(tier).bitrate + AUDIO_BITRATE) * s) / 8);
}

/* ------------------------------------------------------------------ honest messages */

export type MediaProblem = 'too_long' | 'too_big' | 'quota' | 'location' | 'video_location' | 'unsupported';

/** A photo that could not be saved again and is not a JPEG (HEIC above all) would go up with its position: refused. */
export const LOCATION_REFUSED_MESSAGE = 'We could not remove the place where this photo was taken, so it cannot be shared. Try another photo.';
/** A clip that cannot be read to the end (cut short, sizes that do not add up) may keep its place: refused. */
export const VIDEO_LOCATION_REFUSED_MESSAGE = 'We could not remove the place where this video was recorded, so it cannot be shared. Try another video.';
/** The cloud takes JPEG photos (every photo is turned into one) and MP4 or MOV videos. */
export const UNSUPPORTED_TYPE_MESSAGE = 'This file type is not supported. Use a photo or an MP4 or MOV video.';
/** How long the composer waits for the plan before it opens the picker (ms); then it uses the saved answer or the Free sizes. */
export const PLAN_WAIT_MS = 4000;
/** The plan could not be checked (offline, not loaded yet): the smaller sizes are used, and the composer says so. */
export const PLAN_UNKNOWN_NOTE = 'Sizes for the Free plan. Your plan could not be checked.';

/** The video types the cloud takes. */
export const UPLOAD_VIDEO_TYPES = ['video/mp4', 'video/quicktime'] as const;

/** Is this a JPEG by its type, or (no type) by its name? */
export function looksLikeJpeg(mimeType: string | null | undefined, uri: string): boolean {
  const t = (mimeType ?? '').toLowerCase();
  if (t) return t === 'image/jpeg' || t === 'image/jpg' || t === 'image/pjpeg';
  return /\.jpe?g($|\?)/i.test(uri);
}

/** Can a picked file go up at all? Photos of any kind (they are turned into JPEG), videos only as MP4 or MOV. */
export function isSupportedPick(kind: 'image' | 'video', mimeType: string | null | undefined, uri: string): boolean {
  if (kind === 'image') return true;
  const t = (mimeType ?? '').toLowerCase();
  if (t) return (UPLOAD_VIDEO_TYPES as readonly string[]).includes(t);
  return /\.(mp4|mov|m4v)($|\?)/i.test(uri);
}

export function formatMB(bytes: number): string {
  const mb = bytes / MB;
  return mb >= 10 ? `${Math.round(mb)} MB` : `${Math.max(0.1, Math.round(mb * 10) / 10)} MB`;
}

export function problemMessage(kind: MediaProblem, o: { capBytes?: number; neededBytes?: number; remainingBytes?: number } = {}): string {
  if (kind === 'location') return LOCATION_REFUSED_MESSAGE;
  if (kind === 'video_location') return VIDEO_LOCATION_REFUSED_MESSAGE;
  if (kind === 'unsupported') return UNSUPPORTED_TYPE_MESSAGE;
  if (kind === 'too_long') return `This video is longer than ${MAX_VIDEO_SECONDS} seconds. Trim it in your Photos app, then add it again.`;
  if (kind === 'too_big') return `This file is too big to upload, even after making it smaller. The limit is ${formatMB(o.capBytes ?? 0)}. Try a shorter clip or another photo.`;
  const left = Math.max(0, o.remainingBytes ?? 0);
  return left > 0
    ? `Not enough cloud storage. This needs ${formatMB(o.neededBytes ?? 0)} and you have ${formatMB(left)} left. Free up space in Settings.`
    : 'Your cloud storage is full. Free up space in Settings, then try again.';
}

/** When the account has no cloud storage at all. Neutral on purpose: Pilgrim Plus cannot be bought yet (the plan branch
 *  replaces this with its own text). */
export const NO_CLOUD_STORAGE_MESSAGE = 'Cloud storage is switched off for now. Photos and videos cannot be saved yet.';

/** Is there room in the plan's storage for these bytes? Unknown storage (offline, not loaded) lets the server decide. */
export function quotaCheck(neededBytes: number, storage: { quota_bytes?: number | null; remaining_bytes?: number | null } | null | undefined): { ok: true } | { ok: false; message: string } {
  if (storage && storage.quota_bytes === 0) return { ok: false, message: NO_CLOUD_STORAGE_MESSAGE };
  const left = storage?.remaining_bytes;
  if (left == null || !Number.isFinite(Number(left))) return { ok: true };
  if (neededBytes <= Number(left)) return { ok: true };
  return { ok: false, message: problemMessage('quota', { neededBytes, remainingBytes: Number(left) }) };
}
