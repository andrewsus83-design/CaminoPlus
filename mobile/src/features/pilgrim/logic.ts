// The profile of ANOTHER pilgrim and their journey, as pure logic: who the screen is about, what it can show, and in which words.
// No React Native and no network imports on purpose, so plain node tests cover all of it (npm run test:social).
//
// What is shown is what the pilgrim PUBLISHED: their name, picture and a few numbers, and the posts that the database lets this
// viewer see (the row level security of posts decides, friends-only posts only for friends). Nothing private is read, shown or sent
// from here: not their notes, not their plan or its day stories, not their health. src/features/pilgrim/__tests__/privacy.test.ts
// fails if any of that is imported or asked for.
import { friendAction, friendlyError, personName } from '../social/logic';
import type { FriendStatus } from '../social/types';

/* ------------------------------------------------------------------ the address of a profile */

const ANY_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A profile is opened by the id of the pilgrim. Anything else (a link that was cut, a word) is a profile that is not there, and nothing is asked of the network for it. */
export const isPilgrimId = (v: unknown): v is string => typeof v === 'string' && ANY_UUID.test(v);

/** Where a profile lives (app/pilgrim/[id].tsx). Every entry point (a friend's row, a search result, a comment, a chat header) goes through this one. */
export const pilgrimHref = (id: string) => `/pilgrim/${id}`;

/** The same pilgrim: ids compare without regard to case. */
export const sameId = (a: unknown, b: unknown): boolean => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

/** The two ids of a friendship in the order the database stores them (user_a < user_b, uuid order, which is the order of the lower case hex text). */
export function friendshipPair(a: string, b: string): [string, string] {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? [x, y] : [y, x];
}

/* ------------------------------------------------------------------ the pilgrim */

/** What the profile card needs: columns of `profiles` that every signed-in pilgrim may read (the basic card), and the counters the server keeps. */
export type Pilgrim = {
  id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  is_private: boolean;
  km_walked: number;
  posts_count: number;
  stamps_count: number;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const whole = (v: unknown): number => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** A row of profiles -> the pilgrim. null when there is no row or it has no id: that is "not available", never a crash. Numbers that are not numbers become 0. */
export function readPilgrim(row: unknown): Pilgrim | null {
  const r = (Array.isArray(row) ? row[0] : row) as Record<string, unknown> | null | undefined;
  if (!r || typeof r !== 'object' || !isPilgrimId(r.id)) return null;
  const km = Number(r.km_walked);
  return {
    id: r.id,
    username: text(r.username),
    display_name: text(r.display_name),
    bio: text(r.bio),
    avatar_url: text(r.avatar_url),
    is_private: r.is_private === true,
    km_walked: Number.isFinite(km) && km > 0 ? km : 0,
    posts_count: whole(r.posts_count),
    stamps_count: whole(r.stamps_count),
  };
}

/** Rows of `select status, requested_by` of the one friendship between me and them (none = no row) -> where we stand. */
export function readRelation(rows: unknown, me: string): FriendStatus {
  const row = (Array.isArray(rows) ? rows[0] : rows) as { status?: unknown; requested_by?: unknown } | null | undefined;
  if (!row || typeof row !== 'object') return 'none';
  if (row.status === 'accepted') return 'friends';
  if (row.status === 'pending') return sameId(row.requested_by, me) ? 'pending_out' : 'pending_in';
  return 'none';
}

/** The name of the pilgrim: the display name, else @username, else "Pilgrim". */
export const pilgrimName = (p: Pick<Pilgrim, 'display_name' | 'username'> | null | undefined): string => personName(p);

export const pilgrimHandle = (p: Pick<Pilgrim, 'username'>): string | null => (p.username ? `@${p.username}` : null);

/** The three numbers of the card, as Me shows its own: kilometres walked, posts, stamps. */
export function pilgrimStats(p: Pick<Pilgrim, 'km_walked' | 'posts_count' | 'stamps_count'>): { value: string; label: string }[] {
  return [
    { value: String(Math.round(p.km_walked)), label: 'km' },
    { value: String(p.posts_count), label: p.posts_count === 1 ? 'post' : 'posts' },
    { value: String(p.stamps_count), label: p.stamps_count === 1 ? 'stamp' : 'stamps' },
  ];
}

/* ------------------------------------------------------------------ what the viewer may see and do */

/** Friends can message each other and nobody else can (the database refuses a direct chat between people who are not friends). */
export const canMessage = (relation: FriendStatus): boolean => relation === 'friends';

/**
 * The minimal card: a private profile seen by somebody who is not a friend shows the picture, the name and the way to ask for friendship, and nothing
 * else. (Me says it: "Private: only your friends see your profile and posts. Other pilgrims can still find you to send a friend request.")
 */
export const isMinimal = (p: Pick<Pilgrim, 'is_private'>, relation: FriendStatus): boolean => p.is_private && relation !== 'friends';

/** The button under the name: Message for a friend, Add friend, Requested (tap to cancel) and Accept (with Decline next to it) for the rest. */
export function friendCta(relation: FriendStatus): { kind: 'add' | 'cancel' | 'accept' | 'message'; label: string; declinable: boolean } {
  const a = friendAction(relation);
  return { kind: a.kind, label: a.label, declinable: relation === 'pending_in' };
}

export type MenuKey = 'unfriend' | 'report' | 'block';
export type MenuOption = { key: MenuKey; label: string; icon: 'close' | 'flag' | 'block'; destructive: true };

/** The three dots at the top right: Unfriend for a friend, then Report and Block for everybody (the same words as the friends list). */
export function menuOptions(relation: FriendStatus, name: string): MenuOption[] {
  return [
    ...(relation === 'friends' ? [{ key: 'unfriend' as const, label: `Unfriend ${name}`, icon: 'close' as const, destructive: true as const }] : []),
    { key: 'report', label: `Report ${name}`, icon: 'flag', destructive: true },
    { key: 'block', label: `Block ${name}`, icon: 'block', destructive: true },
  ];
}

/* ------------------------------------------------------------------ the screen as one of four states */

export type LoadError = { message: string; offline: boolean };

/** The journey (the posts this viewer may see) while it loads, once it did, or when it did not. */
export type JourneysRead<P> = { status: 'loading' } | { status: 'ready'; posts: P[] } | { status: 'error'; error: LoadError };

export type PilgrimView<P> =
  | { status: 'loading' }
  | { status: 'self' }
  | { status: 'unavailable' }
  | { status: 'error'; error: LoadError }
  | { status: 'ready'; pilgrim: Pilgrim; relation: FriendStatus; minimal: boolean; journeys: JourneysRead<P> };

/** What has been read so far. `profile`: undefined = not read yet, null = no such pilgrim (or one this viewer cannot see). */
export type PilgrimRead<P> = {
  id: unknown;
  me: string | null;
  profile?: Pilgrim | null;
  relation?: FriendStatus;
  error?: LoadError | null;
  journeys?: JourneysRead<P>;
};

/**
 * The screen is exactly one of these. A link that is not an id, a pilgrim who is not there, who was deleted, or who is blocked (either way: the
 * database answers the same for all of them, so nobody learns who blocked whom) is "unavailable", a calm card and never an error. Your own id is
 * "self": the screen takes you to Me. An answer that could not be had (offline, a server error) is "error", with a way to try again.
 */
export function pilgrimView<P>(r: PilgrimRead<P>): PilgrimView<P> {
  if (!isPilgrimId(r.id)) return { status: 'unavailable' };
  if (r.me && sameId(r.id, r.me)) return { status: 'self' };
  if (r.profile === undefined || r.relation === undefined) return r.error ? { status: 'error', error: r.error } : { status: 'loading' };
  if (r.profile === null) return { status: 'unavailable' };
  const minimal = isMinimal(r.profile, r.relation);
  // A minimal card has no journey: nothing is asked for it, so none is shown.
  return { status: 'ready', pilgrim: r.profile, relation: r.relation, minimal, journeys: minimal ? { status: 'ready', posts: [] } : r.journeys ?? { status: 'loading' } };
}

/** An error of the data layer -> the sentence for the screen, and whether it is "you are offline" (which the pilgrim can fix by finding a signal). */
export function toLoadError(e: unknown, fallback: string): LoadError {
  const err = (e ?? {}) as { message?: unknown; network?: unknown };
  const offline = !!err.network || /network request failed|failed to fetch|networkerror|load failed|you are offline|retryablefetch/i.test(String(err.message ?? ''));
  return { message: friendlyError(e, fallback), offline };
}

/* ------------------------------------------------------------------ the words */

export const UNAVAILABLE_WORDS = {
  title: 'This profile is not available',
  text: 'The pilgrim may have left the app, or this profile cannot be shown to you.',
} as const;

export const privateWords = (name: string) => ({
  title: 'This profile is private',
  text: `${name} shares journeys with friends only. Send a friend request to see them.`,
});

/** What the Journey section says when there is nothing to draw: a friend simply has nothing yet; for anybody else, the posts for friends are not shown here. */
export function noJourneys(relation: FriendStatus, name: string): { title: string; text: string } {
  if (relation === 'friends') return { title: 'No journeys to show yet', text: `When ${name} shares a journey post with friends, it will be here.` };
  return { title: 'No journeys to show yet', text: `Journeys shared with friends are not shown here. Add ${name} as a friend to see them.` };
}

/** Under "Unfriend": the same sentence as the friends list. */
export const UNFRIEND_MESSAGE = 'You will stop seeing each other\'s friends-only posts and cannot chat until you are friends again.';

/** The sentence after a friend action worked. */
export function friendDone(kind: 'add' | 'cancel' | 'accept' | 'decline' | 'unfriend', name: string): string {
  switch (kind) {
    case 'add': return `Request sent to ${name}.`;
    case 'cancel': return 'Request cancelled.';
    case 'accept': return `You and ${name} are now friends.`;
    case 'decline': return 'Request declined.';
    default: return `${name} is no longer your friend.`;
  }
}
