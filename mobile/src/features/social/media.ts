// Photos in chat live in the private user-media bucket, so every photo needs a signed URL (1 h).
// This cache hands them out, asks for many at once (one request for a whole screen of photos)
// and reuses them until shortly before they expire.
import { useCallback, useEffect, useState } from 'react';
import { socialApi } from './api';
import { localImageFor } from './outbox';

const TTL_MS = 55 * 60_000; // signed for 60 min, renewed a little early
const cache = new Map<string, { url: string; until: number }>();
let queue = new Map<string, ((url: string | null) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

const cached = (path: string | null) => {
  if (!path) return null;
  const hit = cache.get(path);
  return hit && hit.until > Date.now() ? hit.url : null;
};

async function flushQueue() {
  timer = null;
  const batch = queue;
  queue = new Map();
  let urls: Record<string, string> = {};
  try {
    urls = await socialApi.signedUrls([...batch.keys()]);
  } catch {
    /* every waiter gets null and can offer a retry */
  }
  for (const [path, waiters] of batch) {
    const url = urls[path] ?? null;
    if (url) cache.set(path, { url, until: Date.now() + TTL_MS });
    waiters.forEach((w) => w(url));
  }
}

export function getSignedUrl(path: string): Promise<string | null> {
  const hit = cached(path);
  if (hit) return Promise.resolve(hit);
  return new Promise((resolve) => {
    const waiters = queue.get(path) ?? [];
    waiters.push(resolve);
    queue.set(path, waiters);
    if (!timer) timer = setTimeout(flushQueue, 30);
  });
}

/** URL to show for a chat photo: the signed URL, or the photo still on this phone while it loads. */
export function useChatImage(messageId: string, path: string | null, localUri?: string | null) {
  const [url, setUrl] = useState<string | null>(() => cached(path));
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!path) { setUrl(null); return; }
    let live = true;
    setFailed(false);
    getSignedUrl(path).then((u) => {
      if (!live) return;
      setUrl(u);
      setFailed(!u);
    });
    return () => { live = false; };
  }, [path, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const local = localUri ?? localImageFor(messageId);
  return { uri: url ?? local, loading: !url && !local && !failed, failed: failed && !local, retry };
}
