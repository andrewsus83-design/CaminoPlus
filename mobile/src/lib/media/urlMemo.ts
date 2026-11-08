// Remembers signed links for a while, so the same photo gets the same link and the phone's image cache (and the CDN) can
// keep it instead of downloading it again on every screen. Pure, checked by src/lib/__tests__/media.test.ts.

/** How long a signed link is valid (seconds), as asked from Storage. */
export const SIGNED_URL_TTL_SECONDS = 3600;
/** How long we reuse a link (ms): 50 minutes, so a reused link still has at least 10 minutes left. */
export const SIGNED_URL_REUSE_MS = 50 * 60 * 1000;
/** A cap on remembered links, so a long session does not grow the memo without end. */
export const SIGNED_URL_MEMO_MAX = 2000;

export function createUrlMemo(now: () => number = Date.now) {
  const memo = new Map<string, { url: string; until: number }>();
  const key = (bucket: string, path: string) => `${bucket}\n${path}`;
  return {
    /** The remembered links that are still fresh, and the paths that need a new one. */
    split(bucket: string, paths: readonly string[]): { have: Record<string, string>; need: string[] } {
      const have: Record<string, string> = {};
      const need: string[] = [];
      const t = now();
      for (const p of new Set(paths)) {
        const hit = memo.get(key(bucket, p));
        if (hit && hit.until > t) have[p] = hit.url;
        else need.push(p);
      }
      return { have, need };
    },
    put(bucket: string, path: string, url: string) {
      if (memo.size >= SIGNED_URL_MEMO_MAX) {
        const t = now();
        for (const [k, v] of memo) if (v.until <= t) memo.delete(k);
        if (memo.size >= SIGNED_URL_MEMO_MAX) memo.delete(memo.keys().next().value as string);
      }
      memo.set(key(bucket, path), { url, until: now() + SIGNED_URL_REUSE_MS });
    },
    forget(bucket: string, paths: readonly string[]) {
      for (const p of paths) memo.delete(key(bucket, p));
    },
    clear() { memo.clear(); },
    get size() { return memo.size; },
  };
}
