// The diary on this phone: the store of store.ts over the app's own local store (lib/localStore.ts: one small file per
// key on the phone, localStorage on the web). This is the small file that imports React Native modules, so store.ts and the
// tests that cover it never do. Screens and hooks import from here.
import { localStore } from '../../lib/localStore';
import { createDiaryStore } from './store';

export { newId } from './store';
export const { loadEntries, saveEntry, deleteEntry, clearDiary } = createDiaryStore(localStore);
