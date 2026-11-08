// Choosing a photo for a chat message. expo-image-picker is a native module: when the running
// build does not have it we say so instead of crashing (same approach as the journal composer).
// The photo is then made ready by prepareImage (1280 px for everybody, location data removed; src/lib/media).
import { NativeName, hasNativeModule } from '@/lib/optionalNative';
import { MediaTier, canResizePhotos, pickerQuality, prepareImage } from '@/lib/media';

export class PickerUnavailable extends Error {}

export type PickedPhoto = { uri: string; mimeType?: string | null; fileSize?: number | null };

/** Throws MediaRejected (with a message to show) when the photo is too big for the plan. */
export async function pickPhoto(tier: MediaTier): Promise<PickedPhoto | null> {
  let Picker: typeof import('expo-image-picker');
  try {
    if (!hasNativeModule(NativeName.imagePicker)) throw new Error('missing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Picker = require('expo-image-picker');
    if (!Picker.launchImageLibraryAsync) throw new Error('missing');
  } catch {
    throw new PickerUnavailable('Choosing photos needs the next app build.');
  }
  // No permission question first: the system photo picker needs none (on Android 11 and 12 asking would request storage access).
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: pickerQuality(tier, 'chat', canResizePhotos()), allowsEditing: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const photo = await prepareImage(a.uri, tier, { use: 'chat', width: a.width, height: a.height, bytes: a.fileSize, mimeType: a.mimeType });
  return { uri: photo.uri, mimeType: photo.mimeType, fileSize: photo.bytes };
}
