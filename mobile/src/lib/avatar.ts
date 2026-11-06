import { supabase } from './supabase';
import { updateProfile } from './api';

export class PickerUnavailable extends Error {}

/** Let the user pick a photo and upload it as their avatar. Returns the public URL, or null if cancelled.
 *  Needs expo-image-picker, which is a native module: until the dev build includes it we say so. */
export async function pickAndUploadAvatar(userId: string): Promise<string | null> {
  let Picker: typeof import('expo-image-picker');
  try {
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
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const up = await supabase.storage.from('avatars').upload(path, body, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
  if (up.error) throw new Error(up.error.message);
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  await updateProfile(userId, { avatar_url: url });
  return url;
}
