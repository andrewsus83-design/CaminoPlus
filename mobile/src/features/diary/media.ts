// Photos and videos of a diary page: what the page keeps about each one, how its file is named and found, and the limits.
//
// Pure logic, no React, no React Native and no file system, so plain node can import it (npm run test:diary). The file system comes
// in as a parameter where it is needed (`MediaFiles`, used by store.ts); files.ts plugs the real one in.
//
// A page keeps only a small descriptor of each file: { id, kind, name, bytes, width?, height?, durationMs? }. The file itself is a
// copy in the app's own folder, <documents>/diary-media/<userId>/<name>, made when the picture or clip was added, so it stays when
// the picker's temporary file goes. The path is never stored: the folder of the app changes when it is updated or reinstalled, so
// it is always built again from the user id and the name (mediaPath). A name is checked before it is ever put in a path.
//
// Limits (the numbers are here, once; present.ts words them for the person):
//   12 photos and videos on one page · a video up to 100 MB · a photo up to 30 MB · 1,000 of them and 2 GB in the whole diary ·
//   and the phone keeps 200 MB free (a copy that would leave less is refused).

export type MediaKind = 'image' | 'video';
export type DiaryMedia = { id: string; kind: MediaKind; name: string; bytes: number; width?: number; height?: number; durationMs?: number };

const MB = 1024 * 1024;
export const MEDIA_PER_PAGE_MAX = 12;
export const VIDEO_BYTES_MAX = 100 * MB;
export const PHOTO_BYTES_MAX = 30 * MB;
export const DIARY_MEDIA_BYTES_MAX = 2048 * MB;
export const DIARY_MEDIA_COUNT_MAX = 1_000;
/** The room the phone keeps for itself: no copy is made that would leave less free than this. */
export const MIN_FREE_BYTES = 200 * MB;

/** The folder of the diary's files, inside the app's documents folder. */
export const MEDIA_FOLDER = 'diary-media';

/** The largest file of a kind. */
export const fileCapFor = (kind: MediaKind) => (kind === 'video' ? VIDEO_BYTES_MAX : PHOTO_BYTES_MAX);

/* ------------------------------------------------------------------------------------------------ what a page keeps */

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif'];
const VIDEO_EXT = ['mp4', 'mov', 'm4v', '3gp', 'webm'];

/** A file name this diary made: letters, digits, - and _, one dot, and the extension of a picture or a video. Nothing that could leave the folder (no slash, no "..", no spaces). */
export const isMediaName = (name: unknown): name is string => {
  if (typeof name !== 'string') return false;
  const m = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}\.([a-z0-9]{2,5})$/.exec(name);
  return m !== null && (IMAGE_EXT.includes(m[1]) || VIDEO_EXT.includes(m[1]));
};

const isWhole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
const isSize = (v: unknown) => v === undefined || (isWhole(v) && v > 0 && v <= 100_000);
const isMs = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 48 * 3_600_000);

/** A stored item that reads as a descriptor. Strict: this is what decides whether a name may be turned into a path. */
export function isMedia(v: unknown): v is DiaryMedia {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return false;
  const m = v as Record<string, unknown>;
  return typeof m.id === 'string' && m.id.length > 0 && m.id.length <= 64 && (m.kind === 'image' || m.kind === 'video') && isMediaName(m.name)
    && isWhole(m.bytes) && m.bytes > 0 && isSize(m.width) && isSize(m.height) && isMs(m.durationMs);
}

const tidy = (m: DiaryMedia): DiaryMedia => ({
  id: m.id, kind: m.kind, name: m.name, bytes: m.bytes,
  ...(m.width !== undefined ? { width: m.width } : {}), ...(m.height !== undefined ? { height: m.height } : {}), ...(m.durationMs !== undefined ? { durationMs: m.durationMs } : {}),
});

/**
 * The descriptors of a stored page that can be used: valid ones, each id and each name once, at most MEDIA_PER_PAGE_MAX, in the
 * order they were kept. Anything else in the list is ignored (reading is lenient, saving is not: see parseMediaList).
 */
export function mediaOf(entry: unknown): DiaryMedia[] {
  const list = entry && typeof entry === 'object' ? (entry as { media?: unknown }).media : undefined;
  if (!Array.isArray(list)) return [];
  const ids = new Set<string>();
  const names = new Set<string>();
  const out: DiaryMedia[] = [];
  for (const m of list) {
    if (out.length >= MEDIA_PER_PAGE_MAX) break;
    if (!isMedia(m) || ids.has(m.id) || names.has(m.name)) continue;
    ids.add(m.id);
    names.add(m.name);
    out.push(tidy(m));
  }
  return out;
}

/** What a page that is being saved says about its files: none, a list that is fine, or a reason it is not. */
export function parseMediaList(v: unknown): { ok: true; media: DiaryMedia[] } | { ok: false; reason: 'invalid' | 'too-many' } {
  if (v === undefined || v === null) return { ok: true, media: [] };
  if (!Array.isArray(v)) return { ok: false, reason: 'invalid' };
  if (v.length > MEDIA_PER_PAGE_MAX) return { ok: false, reason: 'too-many' };
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const m of v) {
    if (!isMedia(m) || ids.has(m.id) || names.has(m.name)) return { ok: false, reason: 'invalid' };
    ids.add(m.id);
    names.add(m.name);
  }
  return { ok: true, media: v.map(tidy) };
}

/** The file names a stored item refers to, whatever else is wrong with it (a name that is a name is kept safe). */
export function mediaNamesOf(item: unknown): string[] {
  const list = item && typeof item === 'object' ? (item as { media?: unknown }).media : undefined;
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const m of list) {
    const name = m && typeof m === 'object' ? (m as { name?: unknown }).name : undefined;
    if (isMediaName(name)) out.push(name);
  }
  return out;
}

/** How many files and bytes the stored items keep, leaving out the item with the id `except` (the page being changed). */
export function mediaStatsOf(items: unknown[], except?: string): { bytes: number; count: number } {
  let bytes = 0;
  let count = 0;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    if (except !== undefined && (item as { id?: unknown }).id === except) continue;
    const list = (item as { media?: unknown }).media;
    if (!Array.isArray(list)) continue;
    const seen = new Set<string>();
    for (const m of list) {
      if (!isMedia(m) || seen.has(m.name)) continue;
      seen.add(m.name);
      bytes += m.bytes;
      count += 1;
    }
  }
  return { bytes, count };
}

/** Of these names, the ones no stored item refers to any more: the files that may be deleted. */
export const unreferenced = (items: unknown[], names: string[]): string[] => {
  if (names.length === 0) return [];
  const kept = new Set<string>();
  for (const item of items) for (const n of mediaNamesOf(item)) kept.add(n);
  return names.filter((n, i) => !kept.has(n) && names.indexOf(n) === i);
};

/* ------------------------------------------------------------------------------------------------ names and paths */

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/x-m4v': 'm4v', 'video/3gpp': '3gp', 'video/webm': 'webm',
};

const extOf = (s: string | null | undefined): string => {
  if (typeof s !== 'string') return '';
  const clean = s.split(/[?#]/)[0];
  const m = /\.([A-Za-z0-9]{2,5})$/.exec(clean);
  return m ? m[1].toLowerCase() : '';
};

/** The extension a copy gets: the one of the file name, of the address, or of the type, when it is a picture or video one; else jpg or mp4. */
export function extensionFor(kind: MediaKind, hint: { fileName?: string | null; uri?: string | null; mimeType?: string | null }): string {
  const allowed = kind === 'video' ? VIDEO_EXT : IMAGE_EXT;
  const byType = typeof hint.mimeType === 'string' ? MIME_EXT[hint.mimeType.toLowerCase()] : undefined;
  for (const ext of [extOf(hint.fileName), extOf(hint.uri), byType ?? '']) if (ext && allowed.includes(ext)) return ext;
  return kind === 'video' ? 'mp4' : 'jpg';
}

/** A new file name for a copy: the id of the attachment and an extension. The id is made safe first, so the name always passes isMediaName. */
export function newMediaName(id: string, kind: MediaKind, hint: { fileName?: string | null; uri?: string | null; mimeType?: string | null } = {}): string {
  const safe = String(id).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64).replace(/^[-_]+/, '');
  return `${safe || 'x'}.${extensionFor(kind, hint)}`;
}

/** One piece of a path, with nothing in it that could climb out of its folder. */
export const pathPiece = (s: string): string => {
  const safe = String(s).replace(/[^A-Za-z0-9._-]/g, '_');
  return safe === '' || /^\.+$/.test(safe) ? '_' : safe;
};

/** The folder of one person's files, as path pieces below the documents folder. */
export const mediaDirPieces = (uid: string): string[] => [MEDIA_FOLDER, pathPiece(uid)];

/** Where a file is, as path pieces below the documents folder. Never stored: built from the user id and the name each time. null for a name that is not one of ours. */
export const mediaPath = (uid: string, name: string): string[] | null => (isMediaName(name) && uid ? [...mediaDirPieces(uid), name] : null);

/* ------------------------------------------------------------------------------------------------ the file system */

/**
 * The part of the file system the diary needs. Nothing here may throw except copyIn, which says so by throwing (and leaves no half
 * written file behind); the others answer. files.ts is the real one (expo-file-system), the tests bring their own.
 */
export type MediaFiles = {
  /** Copies `source` (the picker's temporary file) to the folder of `uid` under `name`. Answers the bytes copied (more than 0); throws when it could not, after removing what it had written. */
  copyIn(uid: string, source: string, name: string): Promise<number>;
  /** Deletes one file. True when it is gone afterwards (also when it was never there). */
  remove(uid: string, name: string): Promise<boolean>;
  /** Deletes the whole folder of `uid`. True when it is gone. */
  removeAll(uid: string): Promise<boolean>;
  /** The names of the files in the folder of `uid`; null when the folder cannot be listed. */
  list(uid: string): Promise<string[] | null>;
  /** The free space of the phone in bytes, or null when it is not known. */
  freeSpace(): number | null;
};

export const noFiles: MediaFiles = {
  copyIn: () => Promise.reject(new Error('no file system')),
  remove: () => Promise.resolve(true),
  removeAll: () => Promise.resolve(true),
  list: () => Promise.resolve(null),
  freeSpace: () => null,
};

/* ------------------------------------------------------------------------------------------------ adding files */

/** One file the person chose, as the picker describes it. */
export type PickedAsset = { uri: string; kind: MediaKind; fileName?: string | null; mimeType?: string | null; width?: number | null; height?: number | null; durationMs?: number | null; bytes?: number | null };

export type RefusalReason = 'page-full' | 'video-too-big' | 'photo-too-big' | 'diary-bytes' | 'diary-count' | 'disk-full' | 'copy-failed' | 'unusable';
export type Refusal = { reason: RefusalReason; fileName?: string };

/** What is already there: the files on this page, in the whole diary (bytes and count), and the free space of the phone (null when not known). */
export type Budget = { pageCount: number; diaryBytes: number; diaryCount: number; freeBytes: number | null };

const sizeOf = (a: PickedAsset) => (typeof a.bytes === 'number' && Number.isFinite(a.bytes) && a.bytes > 0 ? Math.floor(a.bytes) : 0);

/**
 * Which of the chosen files are taken, in the order they were chosen, and why the others are not. A file is taken while the page has
 * room, the file is not over its limit, the diary has room for it (in count and in bytes) and the phone keeps its 200 MB free. A
 * size the picker did not tell is counted as 0 here and checked again on the copy (store.ts), which is the real size.
 */
export function planAttach(picked: PickedAsset[], budget: Budget): { accepted: PickedAsset[]; refused: Refusal[] } {
  const accepted: PickedAsset[] = [];
  const refused: Refusal[] = [];
  let used = 0;
  for (const a of picked) {
    const fileName = a && typeof a.fileName === 'string' ? a.fileName : undefined;
    const no = (reason: RefusalReason) => refused.push({ reason, ...(fileName ? { fileName } : {}) });
    if (!a || typeof a.uri !== 'string' || a.uri === '' || (a.kind !== 'image' && a.kind !== 'video')) { no('unusable'); continue; }
    const bytes = sizeOf(a);
    if (budget.pageCount + accepted.length >= MEDIA_PER_PAGE_MAX) { no('page-full'); continue; }
    if (bytes > fileCapFor(a.kind)) { no(a.kind === 'video' ? 'video-too-big' : 'photo-too-big'); continue; }
    if (budget.diaryCount + accepted.length >= DIARY_MEDIA_COUNT_MAX) { no('diary-count'); continue; }
    if (budget.diaryBytes + used + bytes > DIARY_MEDIA_BYTES_MAX) { no('diary-bytes'); continue; }
    if (budget.freeBytes !== null && budget.freeBytes - used - bytes < MIN_FREE_BYTES) { no('disk-full'); continue; }
    accepted.push(a);
    used += bytes;
  }
  return { accepted, refused };
}

/** True when a copy that failed did so because the phone is full (the words the two systems use). */
export const looksFull = (e: unknown): boolean => /ENOSPC|no space left|not enough (storage|space)|out of (storage|space)|disk (is )?full|storage (is )?full|NSFileWriteOutOfSpace/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e));

/** A new descriptor from a copy that was made: the size is what the copy really measures; the picture's size and the clip's length come from the picker when it told them. */
export function descriptorFor(id: string, name: string, a: PickedAsset, bytes: number): DiaryMedia {
  const whole = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) && Math.round(v) > 0 && Math.round(v) <= 100_000 ? Math.round(v) : undefined);
  const width = whole(a.width);
  const height = whole(a.height);
  const ms = a.kind === 'video' && typeof a.durationMs === 'number' && Number.isFinite(a.durationMs) && a.durationMs > 0 ? Math.round(a.durationMs) : undefined;
  return { id, kind: a.kind, name, bytes, ...(width !== undefined && height !== undefined ? { width, height } : {}), ...(ms !== undefined ? { durationMs: ms } : {}) };
}
