import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';

// Tiny JSON key-value store for non-secret data that must survive restarts and work offline
// (cached account, planner tasks, favourites, chat outbox). Secrets and tokens stay in
// secureStorage (Keychain / Keystore). Native: one small file per key in <documents>/kv.
// Web: localStorage. Every call is safe to await without a try/catch: failures resolve to
// null / false instead of throwing (a full disk or a corrupt file must not crash a screen).
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, '_');
const dir = () => new Directory(Paths.document, 'kv');
const fileFor = (k: string) => {
  const d = dir();
  d.create({ intermediates: true, idempotent: true });
  return new File(d, `${safe(k)}.json`);
};
const hasLocalStorage = () => {
  try { return typeof localStorage !== 'undefined'; } catch { return false; }
};

export const localStore = {
  async getJSON<T>(key: string): Promise<T | null> {
    try {
      if (Platform.OS === 'web') {
        const v = hasLocalStorage() ? localStorage.getItem(`kv:${key}`) : null;
        return v ? (JSON.parse(v) as T) : null;
      }
      const f = fileFor(key);
      if (!f.exists) return null;
      return JSON.parse(await f.text()) as T;
    } catch {
      return null;
    }
  },

  async setJSON(key: string, value: unknown): Promise<boolean> {
    try {
      const text = JSON.stringify(value);
      if (Platform.OS === 'web') {
        if (hasLocalStorage()) localStorage.setItem(`kv:${key}`, text);
        return hasLocalStorage();
      }
      fileFor(key).write(text);
      return true;
    } catch {
      return false;
    }
  },

  /** Removes every key that starts with `prefix` (per-user data on sign-out: keys are `u.<userId>.<name>`). */
  async removeByPrefix(prefix: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (!hasLocalStorage()) return;
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(`kv:${prefix}`)) doomed.push(k);
        }
        doomed.forEach((k) => localStorage.removeItem(k));
        return;
      }
      const d = dir();
      if (!d.exists) return;
      const want = safe(prefix);
      for (const entry of d.list()) {
        if (entry instanceof File && entry.name.startsWith(want)) entry.delete();
      }
    } catch {
      /* nothing to clean up */
    }
  },

  async remove(key: string): Promise<void> {
    try {
      if (Platform.OS === 'web') {
        if (hasLocalStorage()) localStorage.removeItem(`kv:${key}`);
        return;
      }
      const f = fileFor(key);
      if (f.exists) f.delete();
    } catch {
      /* nothing to clean up */
    }
  },
};

/** Per-user keys all start with this, so signing out can wipe them together. */
export const userKey = (uid: string, name: string) => `u.${uid}.${name}`;
export const clearUserData = (uid: string) => localStore.removeByPrefix(`u.${uid}.`);
