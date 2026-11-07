// The files of the diary's photos and videos on this phone: media.ts's MediaFiles over expo-file-system, in the folder
// <documents>/diary-media/<userId>/. With storage.ts this is the only file of the diary that touches the phone's storage, and it
// is the one place that builds a path: from the user id and a name that passed isMediaName, every time (the address of the app's
// folder changes when the app is updated or installed again, so no path is ever kept).
//
// The folder is not under kv/ (where localStore keeps its small files), so signing out, which wipes the u.<id>.* keys there, never
// touches it; only deleting the account does (store.ts, which calls removeAll). On the web there are no files: everything here
// answers "nothing", and copying says so.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { isMediaName, mediaDirPieces, type MediaFiles } from './media';

const folder = (uid: string) => new Directory(Paths.document, ...mediaDirPieces(uid));
const fileIn = (uid: string, name: string) => new File(folder(uid), name);

/** The picker puts its own copy in the app's cache folder. Once the diary has its copy, that one is deleted, so a video is not on the phone twice. */
function dropPickerCopy(file: File) {
  try {
    const cache = Paths.cache.uri.endsWith('/') ? Paths.cache.uri : `${Paths.cache.uri}/`;
    if (file.uri.startsWith(cache) && file.exists) file.delete();
  } catch { /* the system empties its cache folder anyway */ }
}

export const diaryFiles: MediaFiles = {
  async copyIn(uid, source, name) {
    if (Platform.OS === 'web') throw new Error('Photos and videos are kept on the phone only');
    if (!uid || !isMediaName(name)) throw new Error('That is not a name the diary can use');
    const from = new File(source);
    if (!from.exists) throw new Error('The chosen file is not there any more');
    const wanted = from.size;
    const dir = folder(uid);
    dir.create({ intermediates: true, idempotent: true });
    const to = new File(dir, name);
    try {
      await from.copy(to);
      const got = to.size;
      if (!(got > 0) || (wanted > 0 && got !== wanted)) throw new Error('The copy is not complete');
      dropPickerCopy(from);
      return got;
    } catch (e) {
      try { if (to.exists) to.delete(); } catch { /* nothing more to clean up */ }
      throw e;
    }
  },

  async remove(uid, name) {
    if (Platform.OS === 'web' || !uid || !isMediaName(name)) return true;
    try {
      const f = fileIn(uid, name);
      if (f.exists) f.delete();
      return !f.exists;
    } catch {
      return false;
    }
  },

  async removeAll(uid) {
    if (Platform.OS === 'web' || !uid) return true;
    try {
      const d = folder(uid);
      if (d.exists) d.delete();
      return !d.exists;
    } catch {
      return false;
    }
  },

  async list(uid) {
    if (Platform.OS === 'web' || !uid) return null;
    try {
      const d = folder(uid);
      if (!d.exists) return [];
      return d.list().filter((entry): entry is File => entry instanceof File).map((f) => f.name);
    } catch {
      return null;
    }
  },

  freeSpace() {
    if (Platform.OS === 'web') return null;
    try {
      const n = Paths.availableDiskSpace;
      return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : null;
    } catch {
      return null;
    }
  },
};

/** The address a picture or clip is shown from, or null when the file is not on this phone (or on the web). Built each time; never stored. */
export function mediaUri(uid: string, name: string): string | null {
  if (Platform.OS === 'web' || !uid || !isMediaName(name)) return null;
  try {
    const f = fileIn(uid, name);
    return f.exists && f.size > 0 ? f.uri : null;
  } catch {
    return null;
  }
}
