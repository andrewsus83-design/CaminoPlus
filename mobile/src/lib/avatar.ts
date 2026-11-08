import { updateProfile } from './api';
import { NativeName, hasNativeModule } from './optionalNative';
import { canResizePhotos, discardPrepared, pickerQuality, prepareImage } from './media';
import { storeAvatar } from './avatarFlow';
import { MEDIA_BUCKET, deleteMedia, publicUrl, upload } from './mediaStorage';

export class PickerUnavailable extends Error {}

/** Let the user pick a photo and upload it as their avatar (512 px for everybody, src/lib/media/limits.ts). Returns the
 *  public URL, or null if cancelled. Needs expo-image-picker, which is a native module: until the dev build includes it we say so. */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  let Picker: typeof import('expo-image-picker');
  try {
    if (!hasNativeModule(NativeName.imagePicker)) throw new Error('missing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Picker = require('expo-image-picker');
    if (!Picker.launchImageLibraryAsync) throw new Error('missing');
  } catch {
    throw new PickerUnavailable('Choosing a photo needs the next app build.');
  }
  // No permission question first: the system photo picker needs none (on Android 11 and 12 asking would request storage access).
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: pickerQuality('free', 'avatar', canResizePhotos()) });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  // The profile picture is the same size on every plan, so the tier does not matter here.
  const photo = await prepareImage(asset.uri, 'free', { use: 'avatar', width: asset.width, height: asset.height, bytes: asset.fileSize, mimeType: asset.mimeType });
  // Upload, point the profile at it, and only then delete an older picture (src/lib/avatarFlow.ts says why).
  const url = await storeAvatar(userId, photo.uri, {
    upload: (path, uri, type) => upload(MEDIA_BUCKET.avatars, path, uri, type),
    publicUrl: (path) => publicUrl(MEDIA_BUCKET.avatars, path),
    updateProfile: (avatarUrl) => updateProfile(userId, { avatar_url: avatarUrl }),
    deleteOld: (paths) => deleteMedia(MEDIA_BUCKET.avatars, paths),
    now: Date.now,
  });
  if (photo.processed) discardPrepared([photo.uri]);
  return url;
}
