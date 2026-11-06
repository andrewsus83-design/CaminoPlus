import NetInfo from '@react-native-community/netinfo';

// Fail fast when the phone is offline. supabase-js waits for its token-refresh retry loop (about 30 s)
// before every request when the access token has expired, so a pilgrim without signal would stare at
// spinners. Only an explicit "offline" answer blocks; "unknown" lets the request decide.
export class OfflineError extends Error {
  constructor() {
    super('You are offline.');
    this.name = 'OfflineError';
  }
}

export async function assertOnline(): Promise<void> {
  let state;
  try {
    state = await NetInfo.fetch();
  } catch {
    return; // NetInfo not available: let the request itself fail or succeed
  }
  if (state.isConnected === false || state.isInternetReachable === false) throw new OfflineError();
}

/** Rejects with `message` when `p` has not settled after `ms`. The original promise keeps running. */
export function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(message)), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

/** True for "no connection" style failures (our own check, fetch failures, supabase-js retryable errors). */
export function isOfflineError(e: unknown): boolean {
  if (e instanceof OfflineError) return true;
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /offline|network request failed|failed to fetch|networkerror|retryablefetch|internet/i.test(msg);
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
