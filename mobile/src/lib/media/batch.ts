// Making several picked files ready, one after the other, as the post composer does. Pure (prepareImage / prepareVideo
// and the clean-up are handed in), checked by src/lib/__tests__/media.test.ts.
// Cancel means cancel: nothing picked in this round is added, and every file made so far is deleted.
import { MediaCancelled, MediaRejected, PreparedImage, PreparedVideo } from './core';
import { MediaTier, isSupportedPick, problemMessage } from './limits';

export type PickedFile = { uri: string; type: 'image' | 'video'; mimeType?: string | null; width?: number; height?: number; durationMs?: number | null; fileSize?: number | null };
export type ReadyFile = {
  prepared: true; uri: string; type: 'image' | 'video'; mimeType: string;
  width: number | null; height: number | null; durationMs: number | null; bytes: number | null; thumbUri: string | null;
  /** files this app made (deleted again on Cancel); the picker's own files are not in here */
  madeFiles: string[];
};
export type BatchDeps = {
  prepareImage: (uri: string, tier: MediaTier, o: { use: 'post'; width?: number | null; height?: number | null; bytes?: number | null; mimeType?: string | null; thumb: boolean; signal: AbortSignal }) => Promise<PreparedImage>;
  prepareVideo: (uri: string, tier: MediaTier, onProgress: (f: number) => void, signal: AbortSignal, meta: { width?: number | null; height?: number | null; bytes?: number | null; durationMs?: number | null; mimeType?: string | null }) => Promise<PreparedVideo>;
  discard: (uris: string[]) => void;
};
export type Stage = { label: string; fraction: number | null };

export const COULD_NOT_READ = 'One photo or video could not be read. Try it again.';

export async function prepareBatch(picked: readonly PickedFile[], tier: MediaTier, d: BatchDeps, signal: AbortSignal, onStage: (s: Stage) => void): Promise<{ ready: ReadyFile[]; problems: string[]; cancelled: boolean }> {
  const ready: ReadyFile[] = [];
  const problems: string[] = [];
  const cancel = () => {
    d.discard(ready.flatMap((r) => r.madeFiles));
    return { ready: [], problems: [], cancelled: true };
  };
  for (const m of picked) {
    if (signal.aborted) return cancel();
    if (!isSupportedPick(m.type, m.mimeType, m.uri)) { problems.push(problemMessage('unsupported')); continue; }
    try {
      if (m.type === 'video') {
        onStage({ label: 'Preparing your video', fraction: 0 });
        const v = await d.prepareVideo(m.uri, tier, (f) => onStage({ label: 'Preparing your video', fraction: f }), signal, { width: m.width, height: m.height, bytes: m.fileSize, durationMs: m.durationMs, mimeType: m.mimeType });
        ready.push({ prepared: true, type: 'video', uri: v.uri, mimeType: v.mimeType, width: v.width, height: v.height, durationMs: v.durationMs, bytes: v.bytes, thumbUri: null, madeFiles: v.processed ? [v.uri] : [] });
      } else {
        onStage({ label: picked.length > 1 ? 'Preparing your photos' : 'Preparing your photo', fraction: null });
        const p = await d.prepareImage(m.uri, tier, { use: 'post', width: m.width, height: m.height, bytes: m.fileSize, mimeType: m.mimeType, thumb: true, signal });
        const made = p.processed ? [p.uri, ...(p.thumb ? [p.thumb.uri] : [])] : [];
        ready.push({ prepared: true, type: 'image', uri: p.uri, mimeType: p.mimeType, width: p.width, height: p.height, durationMs: null, bytes: p.bytes, thumbUri: p.thumb?.uri ?? null, madeFiles: made });
      }
    } catch (e) {
      if (e instanceof MediaCancelled || signal.aborted) return cancel();
      problems.push(e instanceof MediaRejected ? e.message : COULD_NOT_READ);
    }
  }
  if (signal.aborted) return cancel();
  return { ready, problems, cancelled: false };
}

/** The answer of `work`, or `fallback` when it takes longer than `ms` or fails. */
export function withTimeout<T, F>(work: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    work.then((v) => { clearTimeout(timer); resolve(v); }, () => { clearTimeout(timer); resolve(fallback); });
  });
}
