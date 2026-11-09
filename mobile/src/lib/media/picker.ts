// The options the photo picker gets, by plan. Pure (the picker's enum is handed in), so the plain-node test checks it.
import { MediaTier, PhotoUse, photoRule, videoRule } from './limits';

/**
 * JPEG quality for the picker. When this build can resize photos itself (prepareImage), the picker hands over the photo
 * untouched (1) so it is not compressed twice; without that, the picker's own quality is the only compression there is.
 */
export function pickerQuality(tier: MediaTier, use: PhotoUse, canResize: boolean): number {
  return canResize ? 1 : photoRule(tier, use).quality;
}

/**
 * The picker's own video export preset for the plan (iPhone only: H.264 at 1280x720 for Free, 1920x1080 for Plus). Until a
 * video compressor is in the app this is what keeps a Free clip at 720p on iPhone. Android has no such option: the clip
 * goes up as recorded, within the plan's per-file cap. `presets` is ImagePicker.VideoExportPreset.
 */
export function pickerVideoPreset(presets: Record<string, unknown> | undefined, tier: MediaTier, os: string): number | undefined {
  if (os !== 'ios' || !presets) return undefined;
  const v = presets[videoRule(tier).iosExportPreset];
  return typeof v === 'number' ? v : undefined;
}
