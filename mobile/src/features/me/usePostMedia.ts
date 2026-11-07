import { useEffect, useState } from 'react';
import { Post, PostMediaUrl, listPostMediaUrls } from '@/lib/api';

const NONE: Record<string, PostMediaUrl[]> = {};

/**
 * The photos and clips of the pilgrim's own posts, by post id, in slide order (signed links, listPostMediaUrls). It is read ONCE
 * for the list, each time the list changes, and shared by everything on Me that draws a picture of a post: the Journey grid and
 * the highlights. Two readers would mean two sets of signed links for the same photos, so every photo would be downloaded twice.
 * Offline or on an error the links already known stay, and a post without one is drawn without its picture.
 */
export function usePostMedia(posts: readonly Post[] | null): Record<string, PostMediaUrl[]> {
  const [media, setMedia] = useState(NONE);
  useEffect(() => {
    const ids = (posts ?? []).filter((p) => p.media_count > 0).map((p) => p.id);
    if (ids.length === 0) { setMedia(NONE); return; }
    let alive = true;
    listPostMediaUrls(ids).then((m) => { if (alive) setMedia(m); }).catch(() => {});
    return () => { alive = false; };
  }, [posts]);
  return media;
}
