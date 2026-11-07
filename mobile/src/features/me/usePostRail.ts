import { useCallback, useEffect, useRef, useState } from 'react';
import { Share } from 'react-native';
import {
  Post, addPostComment, likePost, listMyReactions, listPostComments, recordPostShare, savePost, unlikePost, unsavePost,
} from '@/lib/api';
import { railCounts, railItems, type RailItem, type RailKind } from '@/lib/actionRail';
import { REPORT_PROMPT, REPORT_REASONS, REPORT_THANKS, reportContent, type ReportReason } from '@/features/social';
import { assertOnline } from '@/lib/net';
import { failureMessage, optimistic, optimisticToggle, type Reaction } from '@/lib/optimistic';
import { commentText, toSheetComments, type SheetComment } from '@/lib/postComments';
import { shareAndRecord, shareMessage } from '@/lib/postShare';
import { useAuth } from '@/lib/auth';
import { useLocalReactions } from '@/lib/useLocalReactions';
import { uuid } from '@/lib/uuid';

/** Where the love and bookmark of the sample journey are kept on the phone (per signed-in person, like Discover's). */
export const SAMPLE_JOURNEY_FAVS = 'journey.sample.favs';

type Counts = Partial<Record<RailKind, number>>;
type Thread = { status: 'loading' | 'ready' | 'error'; items: SheetComment[]; message: string | null };

/**
 * What the action rail of the journey viewer does, for every post of the grid. It is the same rail and the same comments
 * sheet as Discover's (components/ActionRail.tsx, components/CommentsSheet.tsx); this hook is what sits behind them.
 *
 * SAMPLE journey (`sample`): love, bookmark and comments are local to the phone (stored per person with localStore, like
 * Discover's) and share sends the invitation to the app, never the sample content. Nothing reaches the database.
 *
 * REAL posts: love and bookmark are written to post_likes and post_saves, comments to post_comments, and a share is counted
 * with the rpc record_post_share after the native share sheet was used (lib/api.ts, under the row level security that is
 * already there). A tap shows its result at once and puts the old state back if the request fails, with one short sentence
 * in `notice`. These need the network: offline nothing changes and it says so. Which posts this pilgrim already liked and
 * bookmarked is read once for the posts of the grid; the counts come from the posts, and change only by what this pilgrim
 * does (or by the answer of the database), never by a guess.
 */
export function usePostRail({ posts, sample }: { posts: Post[]; sample: boolean }) {
  const { session } = useAuth();
  const uid = session?.user.id ?? null;
  const local = useLocalReactions(SAMPLE_JOURNEY_FAVS);

  // Real posts: what is known about this pilgrim's reactions, and the counts that changed because of them. Kept in a ref
  // (so a slow answer never works on an old copy) and shown through `tick`.
  const store = useRef({ loved: {} as Record<string, boolean>, saved: {} as Record<string, boolean>, over: {} as Record<string, Counts> });
  const inFlight = useRef(new Set<string>());
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // One short sentence for the person, for a few seconds.
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((text: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(text);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);
  useEffect(() => () => { if (noticeTimer.current) clearTimeout(noticeTimer.current); }, []);

  // New posts from the database: their counts are the database's again, and this pilgrim's likes and bookmarks are read.
  // A button the pilgrim already pressed is never overwritten by an answer that arrives later.
  useEffect(() => {
    if (sample || !uid || posts.length === 0) return;
    let alive = true;
    const ids = posts.map((p) => p.id);
    store.current.over = {};
    bump();
    void listMyReactions(uid, ids).then((r) => {
      if (!alive) return;
      const s = store.current;
      for (const id of ids) {
        if (r.liked && s.loved[id] === undefined) s.loved[id] = r.liked.has(id);
        if (r.saved && s.saved[id] === undefined) s.saved[id] = r.saved.has(id);
      }
      bump();
    });
    return () => { alive = false; };
  }, [posts, sample, uid, bump]);

  /** The four buttons of a post, with its state and counts. Its identity changes whenever any of them could have, which is what FlatList's extraData needs. */
  const itemsFor = useCallback((post: Post): RailItem[] => {
    if (sample) {
      return railItems({
        loved: local.favs.loved.includes(post.id),
        saved: local.favs.saved.includes(post.id),
        counts: { comments: (local.comments[post.id] ?? []).length }, // the only count a sample has: the comments on this phone
      });
    }
    const s = store.current;
    const base = railCounts(post);
    const o = s.over[post.id] ?? {};
    return railItems({
      loved: !!s.loved[post.id],
      saved: !!s.saved[post.id],
      counts: { love: o.love ?? base.love, save: o.save ?? base.save, comments: o.comments ?? base.comments, share: o.share ?? base.share },
    });
  }, [sample, local.favs, local.comments, tick]); // tick: how a change of the ref (real posts) reaches the screen

  const toggleReal = async (post: Post, kind: 'love' | 'save') => {
    if (!uid) return;
    const s = store.current;
    const flags = kind === 'love' ? s.loved : s.saved;
    const from: Reaction = { on: !!flags[post.id], count: s.over[post.id]?.[kind] ?? railCounts(post)[kind] };
    const res = await optimisticToggle({
      key: `${post.id}:${kind}`,
      inFlight: inFlight.current,
      from,
      before: assertOnline,
      show: (r) => {
        flags[post.id] = r.on;
        const o = (s.over[post.id] ??= {});
        if (r.count === undefined) delete o[kind];
        else o[kind] = r.count;
        bump();
      },
      commit: (on) => (kind === 'love' ? (on ? likePost : unlikePost) : on ? savePost : unsavePost)(uid, post.id),
    });
    if (!res.ok && res.reason !== 'busy') say(failureMessage(kind, res.error));
  };

  const share = async (post: Post) => {
    const res = await shareAndRecord({
      share: () => Share.share({ message: shareMessage(post, sample) }),
      record: sample || !uid ? undefined : () => recordPostShare(post.id),
    });
    if (res.outcome === 'failed') say(failureMessage('share', res.error));
    else if (res.count !== undefined) {
      const s = store.current;
      s.over[post.id] = { ...s.over[post.id], share: res.count };
      bump();
    }
  };

  // The comments sheet: one post at a time. A sample reads and writes the comments on this phone; a real post reads them
  // from the database when the sheet opens.
  const [sheetPost, setSheetPost] = useState<Post | null>(null);
  const sheetId = useRef<string | null>(null);
  const [thread, setThread] = useState<Thread>({ status: 'ready', items: [], message: null });

  const openSheet = (post: Post) => {
    sheetId.current = post.id;
    setSheetPost(post);
    if (sample) return;
    setThread({ status: 'loading', items: [], message: null });
    listPostComments(post.id).then(
      (rows) => setThread((t) => {
        if (sheetId.current !== post.id) return t;
        const sent = t.items.filter((c) => c.pending && !rows.some((r) => r.id === c.id)); // typed while it was loading
        return { status: 'ready', items: [...toSheetComments(rows, uid), ...sent], message: null };
      }),
      (e) => setThread((t) => (sheetId.current === post.id ? { status: 'error', items: [], message: failureMessage('comments', e) } : t)),
    );
  };
  const closeSheet = () => { sheetId.current = null; setSheetPost(null); };

  const sendReal = async (post: Post, text: string): Promise<boolean> => {
    const body = commentText(text);
    if (!body || !uid) return false;
    const id = uuid();
    const s = store.current;
    const mine: SheetComment = { id, user: 'you', text: body, pending: true, mine: true };
    // One more comment, or one less when it fails: counted up and down (not set to a value) so two comments sent close together stay right.
    const step = (by: 1 | -1) => {
      const now = s.over[post.id]?.comments ?? railCounts(post).comments;
      if (now !== undefined) (s.over[post.id] ??= {}).comments = Math.max(0, now + by);
    };
    setThread((t) => ({ ...t, message: null }));
    const res = await optimistic({
      before: assertOnline,
      apply: () => {
        setThread((t) => ({ ...t, items: [...t.items, mine] }));
        step(1);
        bump();
      },
      commit: () => addPostComment({ id, userId: uid, postId: post.id, body }),
      revert: () => {
        setThread((t) => ({ ...t, items: t.items.filter((c) => c.id !== id) }));
        step(-1);
        bump();
      },
    });
    if (res.ok) {
      setThread((t) => ({ ...t, items: t.items.map((c) => (c.id === id ? { ...c, pending: false } : c)) }));
      return true;
    }
    setThread((t) => ({ ...t, message: failureMessage('comments', res.error) }));
    return false;
  };

  const press = (post: Post, kind: RailKind) => {
    if (kind === 'comments') openSheet(post);
    else if (kind === 'share') void share(post);
    else if (sample) local.toggle(kind === 'love' ? 'loved' : 'saved', post.id);
    else void toggleReal(post, kind);
  };

  const sheet = {
    visible: !!sheetPost,
    comments: sample ? (sheetPost ? local.comments[sheetPost.id] ?? [] : []) : thread.items,
    status: sample ? ('ready' as const) : thread.status,
    message: sample ? null : thread.message,
    // Other pilgrims' words are on this sheet only for real posts, so only there can a comment be reported (the chat's reasons and report).
    report: sample ? undefined : {
      reasons: REPORT_REASONS,
      prompt: REPORT_PROMPT,
      thanks: REPORT_THANKS,
      send: (comment: SheetComment, reason: string) => reportContent('comment', comment.id, reason as ReportReason),
    },
    onSend: (text: string): boolean | Promise<boolean> => {
      if (!sheetPost) return false;
      if (!sample) return sendReal(sheetPost, text);
      const body = commentText(text);
      if (!body) return false;
      local.addComment(sheetPost.id, body);
      return true;
    },
    onClose: closeSheet,
  };

  return { itemsFor, press, sheet, notice };
}

export type PostRail = ReturnType<typeof usePostRail>;
