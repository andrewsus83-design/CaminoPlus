import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { savePost, unsavePost } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { localStore, userKey } from '@/lib/localStore';
import { assertOnline } from '@/lib/net';
import { optimisticToggle } from '@/lib/optimistic';
import { savedPostsApi } from './client';
import { SAVED_COPY_NAME, changeFailure, packSavedPosts, parseSavedCopy, savedView, type SavedPost } from './savedPosts';

type State = {
  uid: string | null;
  /** What is known: the saved copy of the last visit first, then the answer of the server. null while nothing is known. */
  posts: SavedPost[] | null;
  loading: boolean;
  /** The last refresh could not reach the server. */
  offline: boolean;
  /** The last refresh got an answer that was an error. */
  failed: boolean;
  /** The list stopped at the newest bookmarks. */
  capped: boolean;
  /** Posts whose bookmark was taken off here: they stay in the list (with an empty bookmark) until the screen is left, so one tap puts it back. */
  removed: ReadonlySet<string>;
};

const NOTHING: State = { uid: null, posts: null, loading: false, offline: false, failed: false, capped: false, removed: new Set() };

/**
 * The posts this person bookmarked, for the Bookmarks screen. Stale while revalidate, like the Me tab: the copy kept on the phone
 * from the last visit shows at once (under `u.<userId>.library.savedPosts`, wiped at log out with the rest of that person's saved
 * data), the server refreshes it every time the screen comes into view, and with no signal the copy stays with a line that says so.
 *
 * Taking a bookmark off (or putting it back) is the same call the journey viewer's bookmark button makes (lib/api.ts savePost and
 * unsavePost, "on conflict do nothing" and "delete your own row"), shown at once and undone with one short sentence when it fails.
 * It needs the network: offline nothing changes and it says so. Nothing here throws.
 */
export function useSavedPosts() {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const [state, setState] = useState<State>(NOTHING);
  const [notice, setNotice] = useState<string | null>(null);
  const latest = useRef(state);
  latest.current = state;
  const inFlight = useRef(new Set<string>());

  useFocusEffect(
    useCallback(() => {
      if (!uid) { setState(NOTHING); return; }
      let alive = true;
      void (async () => {
        setNotice(null);
        const known = latest.current.uid === uid && latest.current.posts !== null;
        // Coming back to the screen keeps what it shows. A first visit starts from the copy of the last one.
        const copy = known ? null : parseSavedCopy(await localStore.getJSON<unknown>(userKey(uid, SAVED_COPY_NAME)));
        if (!alive) return;
        setState((s) => (s.uid === uid && s.posts ? { ...s, loading: true } : { ...NOTHING, uid, posts: copy, loading: true }));
        const res = await savedPostsApi.listMySavedPosts(uid);
        if (!alive) return;
        if (res.ok) {
          setState({ uid, posts: res.posts, loading: false, offline: false, failed: false, capped: res.capped, removed: new Set() });
          void localStore.setJSON(userKey(uid, SAVED_COPY_NAME), packSavedPosts(res.posts, Date.now()));
        } else {
          setState((s) => ({ ...s, uid, loading: false, offline: res.offline, failed: !res.offline }));
        }
      })();
      return () => { alive = false; };
    }, [uid]),
  );

  const toggle = useCallback(async (post: SavedPost) => {
    if (!uid) return;
    const was = !latest.current.removed.has(post.id);
    const res = await optimisticToggle({
      key: `${post.id}:save`,
      inFlight: inFlight.current,
      from: { on: was },
      before: assertOnline,
      show: (r) => setState((s) => {
        const removed = new Set(s.removed);
        if (r.on) removed.delete(post.id);
        else removed.add(post.id);
        return { ...s, removed };
      }),
      commit: (on) => (on ? savePost : unsavePost)(uid, post.id),
    });
    if (res.ok) {
      setNotice(null);
      // The copy on the phone follows what the server now says, so a post taken off does not come back when there is no signal.
      const now = latest.current;
      const kept = (now.posts ?? []).filter((p) => (p.id === post.id ? !was : !now.removed.has(p.id)));
      void localStore.setJSON(userKey(uid, SAVED_COPY_NAME), packSavedPosts(kept, Date.now()));
    } else if (res.reason !== 'busy') {
      setNotice(changeFailure(res.error));
    }
  }, [uid]);

  const known = state.posts !== null;
  return {
    uid,
    view: savedView({ posts: state.posts, loading: state.loading, offline: state.offline, failed: state.failed }),
    posts: state.posts ?? [],
    isOn: (id: string) => !state.removed.has(id),
    toggle,
    notice,
    /** The list on screen is the copy kept on the phone, because the last refresh could not reach the server. */
    offlineNote: state.offline && known,
    failedNote: state.failed && known,
    capped: state.capped,
  };
}
