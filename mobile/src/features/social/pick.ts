// Choosing a photo for a chat message. expo-image-picker is a native module: when the running
// build does not have it we say so instead of crashing (same approach as the journal composer).
import { NativeName, hasNativeModule } from '@/lib/optionalNative';

export class PickerUnavailable extends Error {}

export type PickedPhoto = { uri: string; mimeType?: string | null; fileSize?: number | null };

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;

export async function pickPhoto(): Promise<PickedPhoto | null> {
  let Picker: typeof import('expo-image-picker');
  try {
    if (!hasNativeModule(NativeName.imagePicker)) throw new Error('missing');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Picker = require('expo-image-picker');
    if (!Picker.launchImageLibraryAsync) throw new Error('missing');
  } catch {
    throw new PickerUnavailable('Choosing photos needs the next app build.');
  }
  const perm = await Picker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) throw new Error('Allow photo access in Settings to share a picture.');
  const res = await Picker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, allowsEditing: false });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  return { uri: a.uri, mimeType: a.mimeType, fileSize: a.fileSize };
}
