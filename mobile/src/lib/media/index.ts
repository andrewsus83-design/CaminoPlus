// Photos and videos on their way to the cloud: the app's entry point. The logic is in ./core.ts, the numbers in ./limits.ts,
// the storage calls in ../mediaStorage.ts. See mobile/docs/MEDIA.md.
//
// Native-optional. expo-image-manipulator joins the app with build 1.2.0; a build made before it (the dev build of 1.1.0)
// does not have its native part, and requiring the package there is a FATAL error, not a catchable one
// (src/lib/optionalNative.ts). So the package is required only after hasNativeModule() says yes, and never at the top of a
// file (src/lib/__tests__/media.test.ts pins that). Without it every photo falls back to the original file within the
// plan's cap. No video compressor is in the app yet (MEDIA.md says why): videos use the picker's own export preset.
import { Platform } from 'react-native';
import { File, Paths } from 'expo-file-system';
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { ImageManipulatorLike, MediaDeps, VideoCompressorLike, createMedia } from './core';
import { PickedFile, Stage, prepareBatch } from './batch';
import type { MediaTier } from './limits';

let manipulatorCache: ImageManipulatorLike | null | undefined;
function manipulator(): ImageManipulatorLike | null {
  if (manipulatorCache !== undefined) return manipulatorCache;
  manipulatorCache = null;
  try {
    if (!hasNativeModule(NativeName.imageManipulator)) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const m = require('expo-image-manipulator') as { ImageManipulator?: ImageManipulatorLike };
    if (m?.ImageManipulator && typeof m.ImageManipulator.manipulate === 'function') manipulatorCache = m.ImageManipulator;
  } catch {
    manipulatorCache = null;
  }
  return manipulatorCache;
}

/** No video compressor ships yet. A later build plugs one in here (same shape, VideoCompressorLike). */
function compressor(): VideoCompressorLike | null {
  return null;
}

async function byteSize(uri: string): Promise<number | null> {
  if (Platform.OS !== 'web') {
    try {
      const f = new File(uri);
      if (f.exists && f.size > 0) return f.size;
    } catch { /* not a local file: ask fetch */ }
  }
  try {
    const blob = await (await fetch(uri)).blob();
    return blob.size > 0 ? blob.size : null;
  } catch {
    return null;
  }
}

/** Delete a file this app made in its cache folder (never a file anywhere else). */
function removeFile(uri: string) {
  if (Platform.OS === 'web' || !uri) return;
  try {
    const cache = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
    if (!uri.startsWith(cache)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch { /* the system empties its cache folder anyway */ }
}

const deps: MediaDeps = { manipulator, compressor, byteSize, removeFile };
export const { prepareImage, prepareVideo } = createMedia(deps);

/** Delete the files prepareImage made (Cancel, or slides that were left out). Originals are never touched. */
export function discardPrepared(uris: readonly (string | null | undefined)[]) {
  for (const u of uris) if (u) removeFile(u);
}

/** Can this build resize photos itself? (false on the 1.1.0 dev build) */
export const canResizePhotos = () => manipulator() != null;
/** Can this build make videos smaller itself? (false: no compressor ships yet) */
export const canCompressVideo = () => compressor() != null;

export { MediaCancelled, MediaRejected } from './core';
export type { PickedFile, ReadyFile, Stage } from './batch';

/** Make the files picked for a post ready, one after the other (./batch.ts): Cancel adds nothing and deletes what was made. */
export const preparePicked = (picked: readonly PickedFile[], tier: MediaTier, signal: AbortSignal, onStage: (s: Stage) => void) =>
  prepareBatch(picked, tier, { prepareImage, prepareVideo, discard: discardPrepared }, signal, onStage);
export type { PreparedImage, PreparedThumb, PreparedVideo } from './core';
export * from './limits';
export { pickerQuality, pickerVideoPreset } from './picker';
