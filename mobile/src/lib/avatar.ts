import { updateProfile } from './api';
import { NativeName, hasNativeModule } from './optionalNative';
import { canResizePhotos, pickerQuality, prepareImage } from './media';
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
  const ext = photo.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`; // fixed name: a new photo replaces the old one instead of piling up in storage
  await upload(MEDIA_BUCKET.avatars, path, photo.uri, photo.mimeType);
  // A picture saved before under the other file type would stay behind and count against the per-user cap.
  void deleteMedia(MEDIA_BUCKET.avatars, [`${userId}/avatar.${ext === 'png' ? 'jpg' : 'png'}`]);
  const url = `${publicUrl(MEDIA_BUCKET.avatars, path)}?v=${Date.now()}`; // busts the CDN/image cache
  await updateProfile(userId, { avatar_url: url });
  return url;
}
