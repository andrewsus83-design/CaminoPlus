import { supabase } from './supabase';
import { updateProfile } from './api';
import { NativeName, hasNativeModule } from './optionalNative';

export class PickerUnavailable extends Error {}

/** Let the user pick a photo and upload it as their avatar. Returns the public URL, or null if cancelled.
 *  Needs expo-image-picker, which is a native module: until the dev build includes it we say so. */
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
  const perm = await Picker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to choose a profile picture.');
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
  if (res.canceled || !res.assets[0]) return null;
  const asset = res.assets[0];
  const body = await (await fetch(asset.uri)).arrayBuffer();
  const ext = asset.mimeType === 'image/png' ? 'png' : 'jpg';
  const path = `${userId}/avatar.${ext}`; // fixed name: a new photo replaces the old one instead of piling up in storage
  const up = await supabase.storage.from('avatars').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
  if (up.error) throw new Error(up.error.message);
  const url = `${supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl}?v=${Date.now()}`; // busts the CDN/image cache
  await updateProfile(userId, { avatar_url: url });
  return url;
}
