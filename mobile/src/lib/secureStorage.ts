import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Supabase session storage backed by the iOS Keychain / Android Keystore.
// SecureStore values should stay under ~2 KB, and a Supabase session (access +
// refresh token + user JSON) is often larger, so values are split in chunks:
//   key        -> number of chunks
//   key.0..n   -> the chunks
// On web (expo start --web) it falls back to localStorage.
const CHUNK = 1800;
const safeKey = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');

const web = {
  getItem: async (k: string) => (typeof localStorage === 'undefined' ? null : localStorage.getItem(k)),
  setItem: async (k: string, v: string) => { if (typeof localStorage !== 'undefined') localStorage.setItem(k, v); },
  removeItem: async (k: string) => { if (typeof localStorage !== 'undefined') localStorage.removeItem(k); },
};

async function removeChunks(key: string) {
  const count = Number(await SecureStore.getItemAsync(key)) || 0;
  await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.deleteItemAsync(`${key}.${i}`)));
  await SecureStore.deleteItemAsync(key);
}

const native = {
  async getItem(k: string) {
    const key = safeKey(k);
    const count = Number(await SecureStore.getItemAsync(key));
    if (!count) return null;
    const parts = await Promise.all(Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}.${i}`)));
    return parts.some((p) => p == null) ? null : parts.join('');
  },
  async setItem(k: string, value: string) {
    const key = safeKey(k);
    await removeChunks(key);
    const parts = value.match(new RegExp(`[\\s\\S]{1,${CHUNK}}`, 'g')) ?? [''];
    await Promise.all(parts.map((p, i) => SecureStore.setItemAsync(`${key}.${i}`, p, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK })));
    await SecureStore.setItemAsync(key, String(parts.length));
  },
  async removeItem(k: string) {
    await removeChunks(safeKey(k));
  },
};

export const secureStorage = Platform.OS === 'web' ? web : native;
