// What prepareImage and prepareVideo do, with the native parts handed in (so a plain-node test can give fakes, and a
// phone without the native parts gets the fallback). The app uses ./index.ts, which hands in the real modules.
// Rules and numbers: ./limits.ts. What happens on a build without the modules: mobile/docs/MEDIA.md.
import { MediaProblem, MediaTier, PhotoUse, THUMB_EDGE, THUMB_JPEG_QUALITY, fitWithin, photoRule, problemMessage, videoRule } from './limits';

/* ------------------------------------------------------------------ the shapes of the native parts we use */

export type SavedImage = { uri: string; width: number; height: number };
export type ImageRefLike = { width: number; height: number; saveAsync(o: { compress: number; format: 'jpeg' }): Promise<SavedImage>; release?: () => void };
export type ManipulatorContextLike = { resize(s: { width?: number | null; height?: number | null }): ManipulatorContextLike; renderAsync(): Promise<ImageRefLike>; release?: () => void };
export type ImageManipulatorLike = { manipulate(uri: string): ManipulatorContextLike };
/** A video compressor (none is in the app yet: see MEDIA.md). Resolves to the new file. */
export type VideoCompressorLike = {
  compress(uri: string, o: { maxEdge: number; bitrate: number }, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<string>;
};

export type MediaDeps = {
  manipulator: () => ImageManipulatorLike | null;
  compressor: () => VideoCompressorLike | null;
  /** The size of a local file in bytes, or null when it cannot be read. */
  byteSize: (uri: string) => Promise<number | null>;
};

/* ------------------------------------------------------------------ results and errors */

export type PreparedThumb = { uri: string; width: number; height: number; bytes: number | null };
export type PreparedImage = {
  uri: string; width: number | null; height: number | null; bytes: number | null; mimeType: string;
  /** true when the photo was resized and re-encoded here (EXIF and location dropped, orientation baked in, HEIC to JPEG) */
  processed: boolean;
  thumb: PreparedThumb | null;
};
export type PreparedVideo = { uri: string; width: number | null; height: number | null; bytes: number | null; durationMs: number | null; mimeType: string; processed: boolean };

/** The file cannot go up as it is: too long, too big. `message` is ready to show. */
export class MediaRejected extends Error {
  constructor(public kind: MediaProblem, message: string, public capBytes?: number) { super(message); }
}
/** The person pressed Cancel. */
export class MediaCancelled extends Error {
  constructor() { super('Cancelled'); }
}

export type ImageOptions = { use?: PhotoUse; width?: number | null; height?: number | null; bytes?: number | null; mimeType?: string | null; thumb?: boolean };
export type VideoMeta = { width?: number | null; height?: number | null; bytes?: number | null; durationMs?: number | null; mimeType?: string | null };

const tooBig = (capBytes: number) => new MediaRejected('too_big', problemMessage('too_big', { capBytes }), capBytes);
const release = (o: { release?: () => void } | null | undefined) => { try { o?.release?.(); } catch { /* already released */ } };

export function createMedia(deps: MediaDeps) {
  async function measure(uri: string, known?: number | null): Promise<number | null> {
    if (known != null && Number.isFinite(known) && known > 0) return known;
    try { return await deps.byteSize(uri); } catch { return null; }
  }

  /** The original file, as long as it is within the plan's cap. */
  async function original(uri: string, o: ImageOptions, capBytes: number): Promise<PreparedImage> {
    const bytes = await measure(uri, o.bytes);
    if (bytes != null && bytes > capBytes) throw tooBig(capBytes);
    return { uri, width: o.width ?? null, height: o.height ?? null, bytes, mimeType: o.mimeType ?? 'image/jpeg', processed: false, thumb: null };
  }

  /**
   * Make a photo ready to upload: shrink it to the plan's long side (never larger), save it again as JPEG. Saving again
   * drops all EXIF data including the GPS position, bakes in the orientation and turns HEIC into JPEG. With `thumb`, also
   * a THUMB_EDGE thumbnail from the same image. Without the native module, or when it fails, the original file is used
   * as long as it is within the plan's cap. Throws MediaRejected (with a message to show) when the file is too big.
   */
  async function prepareImage(uri: string, tier: MediaTier, o: ImageOptions = {}): Promise<PreparedImage> {
    const rule = photoRule(tier, o.use ?? 'post');
    const M = deps.manipulator();
    if (!M) return original(uri, o, rule.capBytes);
    let main: SavedImage;
    let thumb: PreparedThumb | null = null;
    let ctx: ManipulatorContextLike | null = null;
    try {
      ctx = M.manipulate(uri);
      const first = await ctx.renderAsync();
      const fit = fitWithin(first.width, first.height, rule.maxEdge);
      let ref = first;
      if (fit.scaled) {
        release(first);
        ref = await ctx.resize({ width: fit.width, height: fit.height }).renderAsync();
      }
      main = await ref.saveAsync({ compress: rule.quality, format: 'jpeg' });
      release(ref);
      if (o.thumb) {
        try {
          const t = fitWithin(main.width, main.height, THUMB_EDGE);
          const tref = t.scaled ? await ctx.resize({ width: t.width, height: t.height }).renderAsync() : await ctx.renderAsync();
          const saved = await tref.saveAsync({ compress: THUMB_JPEG_QUALITY, format: 'jpeg' });
          release(tref);
          thumb = { ...saved, bytes: await measure(saved.uri) };
        } catch {
          thumb = null; // a missing thumbnail is fine: lists then show the photo itself
        }
      }
    } catch {
      release(ctx);
      return original(uri, o, rule.capBytes);
    }
    release(ctx);
    const bytes = await measure(main.uri);
    if (bytes != null && bytes > rule.capBytes) throw tooBig(rule.capBytes);
    return { uri: main.uri, width: main.width, height: main.height, bytes, mimeType: 'image/jpeg', processed: true, thumb };
  }

  /**
   * Make a clip ready to upload. A clip over MAX_VIDEO_SECONDS is refused. With a compressor in the app it is brought to
   * the plan's size (progress 0 to 1 through onProgress; `signal` cancels). Without one (today), the clip stays as the
   * picker gave it (on iPhone the picker already exports it at the plan's size) and must be within the plan's cap.
   */
  async function prepareVideo(uri: string, tier: MediaTier, onProgress?: (fraction: number) => void, signal?: AbortSignal, meta: VideoMeta = {}): Promise<PreparedVideo> {
    const rule = videoRule(tier);
    const check = () => { if (signal?.aborted) throw new MediaCancelled(); };
    check();
    if (meta.durationMs != null && meta.durationMs > rule.maxSeconds * 1000 + 500) {
      throw new MediaRejected('too_long', problemMessage('too_long'));
    }
    onProgress?.(0);
    let out = uri;
    let processed = false;
    const C = deps.compressor();
    if (C) {
      try {
        out = await C.compress(uri, { maxEdge: rule.maxEdge, bitrate: rule.bitrate }, (f) => onProgress?.(Math.max(0, Math.min(1, f))), signal);
        processed = true;
      } catch (e) {
        if (signal?.aborted) throw new MediaCancelled();
        out = uri; // the compressor failed: fall back to the clip as it is, within the cap
        void e;
      }
    }
    check();
    const bytes = await measure(out, processed ? null : meta.bytes);
    check();
    if (bytes != null && bytes > rule.capBytes) throw tooBig(rule.capBytes);
    onProgress?.(1);
    const fit = processed && meta.width && meta.height ? fitWithin(meta.width, meta.height, rule.maxEdge) : null;
    return {
      uri: out, bytes, durationMs: meta.durationMs ?? null, processed,
      width: fit ? fit.width : meta.width ?? null, height: fit ? fit.height : meta.height ?? null,
      mimeType: processed ? 'video/mp4' : meta.mimeType ?? 'video/mp4',
    };
  }

  return { prepareImage, prepareVideo };
}
