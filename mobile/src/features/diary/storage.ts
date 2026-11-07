// The diary on this phone: the store of store.ts over the app's own local store (lib/localStore.ts: one small file per key on
// the phone, localStorage on the web). This is the small file that imports React Native modules, so store.ts and the tests
// that cover it never do. Screens and hooks import from here.
//
// Writes and removals are localStore's. Reads are not: localStore.getJSON answers null for a key that is not there AND for a
// file it could not read or parse, so a read error would look like an empty diary, and the next save would write over what
// is there. The diary has to tell the two apart, so it reads the same places strictly: nothing there -> null, anything else
// that goes wrong -> a throw, which store.ts treats as "cannot be read" and never writes over. The places are localStore's
// (the same folder, file name and web key); a test keeps the two files saying the same thing.
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { localStore } from '../../lib/localStore';
import { diaryFiles } from './files';
import { createDiaryStore, type DiaryStorage } from './store';

const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

const strictStorage: DiaryStorage = {
  async getJSON<T>(key: string): Promise<T | null> {
    if (Platform.OS === 'web') {
      const text = typeof localStorage === 'undefined' ? null : localStorage.getItem(`kv:${key}`);
      return text === null ? null : (JSON.parse(text) as T);
    }
    const file = new File(new Directory(Paths.document, 'kv'), `${safe(key)}.json`);
    return file.exists ? (JSON.parse(await file.text()) as T) : null;
  },
  setJSON: (key, value) => localStore.setJSON(key, value),
  remove: (key) => localStore.remove(key),
};

// The photos and videos of the pages are files in their own folder (files.ts), outside kv/: signing out never touches them.
export { newId } from './store';
export const { loadEntries, saveEntry, attachMedia, deleteEntry, sweepMedia, clearDiary } = createDiaryStore(strictStorage, diaryFiles);
