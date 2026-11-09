// Plain-node checks for the profile of another pilgrim (no React Native): the address, reading the rows, where two pilgrims stand, who can be messaged, what the
// card may show, the four states of the screen, and the words. Run: npm run test:social
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { friendAction } from '../../social/logic';
import type { FriendStatus } from '../../social/types';
import {
  UNAVAILABLE_WORDS, UNFRIEND_MESSAGE, canMessage, friendCta, friendDone, friendshipPair, isMinimal, isPilgrimId, menuOptions, noJourneys, pilgrimHandle, pilgrimHref,
  pilgrimName, pilgrimStats, pilgrimView, privateWords, readPilgrim, readRelation, sameId, toLoadError, type Pilgrim, type PilgrimRead,
} from '../logic';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const ME = '11111111-1111-4111-8111-111111111111';
const ANA = '22222222-2222-4222-8222-222222222222';
const row = (over: Record<string, unknown> = {}) => ({ id: ANA, username: 'ana_t', display_name: 'Ana Torres', bio: 'Walking for my family', avatar_url: 'https://x.test/a.jpg', is_private: false, km_walked: 112.4, posts_count: 3, stamps_count: 7, ...over });
const ana = (over: Partial<Pilgrim> = {}): Pilgrim => ({ ...readPilgrim(row())!, ...over });
const RELATIONS: FriendStatus[] = ['none', 'pending_out', 'pending_in', 'friends'];

/* ------------------------------------------------------------------ the address */

check('a profile is opened by a uuid, and anything else is a profile that is not there', () => {
  for (const ok of [ME, ANA.toUpperCase(), '00000000-0000-4000-8000-0000000000aa']) assert.equal(isPilgrimId(ok), true, ok);
  for (const bad of ['', 'ana', '123', ' ' + ANA, ANA + ' ', `${ANA}/../me`, `${ANA}'; drop table profiles;--`, '2222222-2222-4222-8222-222222222222', undefined, null, 7, {}, [ANA]]) assert.equal(isPilgrimId(bad), false, String(bad));
  assert.equal(pilgrimHref(ANA), `/pilgrim/${ANA}`);
});

check('ids compare without regard to case, and a friendship is stored with the smaller id first', () => {
  assert.equal(sameId(ANA, ANA.toUpperCase()), true);
  assert.equal(sameId(ANA, ME), false);
  assert.equal(sameId(ANA, undefined), false);
  assert.equal(sameId(null, null), false);
  assert.deepEqual(friendshipPair(ME, ANA), [ME, ANA]);
  assert.deepEqual(friendshipPair(ANA, ME), [ME, ANA], 'the same pair from either side');
  assert.deepEqual(friendshipPair(ANA.toUpperCase(), ME.toUpperCase()), [ME, ANA], 'lower case, like the database');
  // the database compares uuids byte by byte, which for lower case hex text is the order of the text, whatever the digits
  const a = 'abcdef00-0000-4000-8000-000000000000';
  const b = '0bcdef00-0000-4000-8000-000000000000';
  const c = '9bcdef00-0000-4000-8000-000000000000';
  assert.deepEqual(friendshipPair(a, b), [b, a]);
  assert.deepEqual(friendshipPair(a, c), [c, a], 'a letter sorts after a digit, as in the database');
});

/* ------------------------------------------------------------------ the rows */

check('a profile row becomes the pilgrim; what is missing or damaged becomes a plain default, never an error', () => {
  assert.deepEqual(readPilgrim(row()), { id: ANA, username: 'ana_t', display_name: 'Ana Torres', bio: 'Walking for my family', avatar_url: 'https://x.test/a.jpg', is_private: false, km_walked: 112.4, posts_count: 3, stamps_count: 7 });
  assert.deepEqual(readPilgrim({ id: ANA }), { id: ANA, username: null, display_name: null, bio: null, avatar_url: null, is_private: false, km_walked: 0, posts_count: 0, stamps_count: 0 });
  const odd = readPilgrim(row({ km_walked: '41.50', posts_count: '4', stamps_count: -2, bio: '   ', display_name: '  Ana  ', is_private: 'true' }))!;
  assert.equal(odd.km_walked, 41.5, 'numeric columns can arrive as text');
  assert.equal(odd.posts_count, 4);
  assert.equal(odd.stamps_count, 0, 'a negative count is 0');
  assert.equal(odd.bio, null, 'a bio of spaces is none');
  assert.equal(odd.display_name, 'Ana', 'trimmed');
  assert.equal(odd.is_private, false, 'only a real true is private: "true" the word is not');
  assert.equal(readPilgrim(row({ is_private: true }))!.is_private, true);
  assert.equal(readPilgrim(row({ km_walked: Number.NaN, posts_count: Number.POSITIVE_INFINITY }))!.km_walked, 0);
  assert.equal(readPilgrim([row()])!.id, ANA, 'a one-row list');
  for (const none of [null, undefined, '', 'x', 7, [], {}, { id: 'nope' }, { username: 'x' }, [{ id: 5 }]]) assert.equal(readPilgrim(none), null, JSON.stringify(none));
});

check('where two pilgrims stand is read from the one friendship row: friends, a request I sent, a request they sent, or nothing', () => {
  assert.equal(readRelation([{ status: 'accepted', requested_by: ME }], ME), 'friends');
  assert.equal(readRelation([{ status: 'accepted', requested_by: ANA }], ME), 'friends', 'who asked does not matter once it is accepted');
  assert.equal(readRelation([{ status: 'pending', requested_by: ME }], ME), 'pending_out');
  assert.equal(readRelation([{ status: 'pending', requested_by: ANA }], ME), 'pending_in');
  assert.equal(readRelation([{ status: 'pending', requested_by: ME.toUpperCase() }], ME), 'pending_out', 'ids compare without regard to case');
  assert.equal(readRelation({ status: 'accepted' }, ME), 'friends', 'a single row, not a list');
  for (const none of [[], null, undefined, 'x', 7, [{}], [{ status: 'declined' }], [{ status: 7 }], [null]]) assert.equal(readRelation(none, ME), 'none', JSON.stringify(none));
});

/* ------------------------------------------------------------------ what the card says */

check('the name, the handle and the three numbers of the card', () => {
  assert.equal(pilgrimName(ana()), 'Ana Torres');
  assert.equal(pilgrimName(ana({ display_name: null })), 'ana_t');
  assert.equal(pilgrimName(ana({ display_name: null, username: null })), 'Pilgrim');
  assert.equal(pilgrimName(null), 'Pilgrim');
  assert.equal(pilgrimHandle(ana()), '@ana_t');
  assert.equal(pilgrimHandle(ana({ username: null })), null);
  assert.deepEqual(pilgrimStats(ana()), [{ value: '112', label: 'km' }, { value: '3', label: 'posts' }, { value: '7', label: 'stamps' }]);
  assert.deepEqual(pilgrimStats(ana({ km_walked: 0.4, posts_count: 1, stamps_count: 1 })), [{ value: '0', label: 'km' }, { value: '1', label: 'post' }, { value: '1', label: 'stamp' }]);
  assert.equal(pilgrimStats(ana({ km_walked: 112.5 }))[0].value, '113', 'rounded to the whole kilometre, as Me does');
});

check('only a friend can be messaged, and only a friend sees a private profile in full', () => {
  for (const r of RELATIONS) assert.equal(canMessage(r), r === 'friends', r);
  for (const r of RELATIONS) {
    assert.equal(isMinimal(ana({ is_private: true }), r), r !== 'friends', `private, ${r}`);
    assert.equal(isMinimal(ana({ is_private: false }), r), false, `public, ${r}`);
  }
});

check('the button under the card: Message for a friend, Add friend, Requested (tap to cancel), Accept with Decline next to it', () => {
  assert.deepEqual(friendCta('friends'), { kind: 'message', label: 'Message', declinable: false });
  assert.deepEqual(friendCta('none'), { kind: 'add', label: 'Add friend', declinable: false });
  assert.deepEqual(friendCta('pending_out'), { kind: 'cancel', label: 'Requested', declinable: false });
  assert.deepEqual(friendCta('pending_in'), { kind: 'accept', label: 'Accept', declinable: true });
  for (const r of RELATIONS) assert.equal(friendCta(r).kind, friendAction(r).kind, `the same words as the friends list for ${r}`);
});

check('the three dots: Unfriend only for a friend, then Report and Block for everybody, each by name', () => {
  assert.deepEqual(menuOptions('friends', 'Ana').map((o) => o.key), ['unfriend', 'report', 'block']);
  for (const r of ['none', 'pending_out', 'pending_in'] as const) assert.deepEqual(menuOptions(r, 'Ana').map((o) => o.key), ['report', 'block'], r);
  assert.deepEqual(menuOptions('friends', 'Ana').map((o) => o.label), ['Unfriend Ana', 'Report Ana', 'Block Ana']);
  assert.ok(menuOptions('friends', 'Ana').every((o) => o.destructive), 'all three are marked as the serious ones');
});

/* ------------------------------------------------------------------ the screen is one of four states (and "self")  */

const read = (over: Partial<PilgrimRead<string>> = {}): PilgrimRead<string> => ({ id: ANA, me: ME, ...over });

check('loading: nothing has been read yet', () => {
  assert.deepEqual(pilgrimView(read()), { status: 'loading' });
  assert.deepEqual(pilgrimView(read({ profile: ana() })), { status: 'loading' }, 'the card without where we stand is not ready yet');
  assert.deepEqual(pilgrimView(read({ relation: 'none' })), { status: 'loading' });
  assert.deepEqual(pilgrimView(read({ error: null })), { status: 'loading' });
});

check('error: it could not be read, with the sentence and whether the cause is "offline"', () => {
  const error = { message: 'You seem to be offline. Check your signal and try again.', offline: true };
  assert.deepEqual(pilgrimView(read({ error })), { status: 'error', error });
  assert.deepEqual(pilgrimView(read({ error: { message: 'x', offline: false } })), { status: 'error', error: { message: 'x', offline: false } });
});

check('unavailable: a link that is not an id, a pilgrim who is not there, deleted or blocked (either way) are one calm card, never an error', () => {
  for (const id of [undefined, '', 'ana', '1', null, 5]) assert.deepEqual(pilgrimView(read({ id })), { status: 'unavailable' }, String(id));
  assert.deepEqual(pilgrimView(read({ id: 'ana', profile: ana(), relation: 'friends' })), { status: 'unavailable' }, 'nothing is shown for an id that is not one');
  assert.deepEqual(pilgrimView(read({ profile: null, relation: 'none' })), { status: 'unavailable' }, 'no row: unknown, deleted, or blocked by either of you');
  assert.deepEqual(pilgrimView(read({ profile: null, relation: 'friends', error: null })), { status: 'unavailable' });
});

check('self: your own id goes to Me, whatever else has been read, and also with another case', () => {
  assert.deepEqual(pilgrimView(read({ id: ME })), { status: 'self' });
  assert.deepEqual(pilgrimView(read({ id: ME.toUpperCase() })), { status: 'self' });
  assert.deepEqual(pilgrimView(read({ id: ME, profile: ana({ id: ME }), relation: 'none' })), { status: 'self' });
  assert.deepEqual(pilgrimView({ id: ME, me: null }), { status: 'loading' }, 'nobody signed in is nobody: the route is closed to them anyway');
});

check('ready: the card, where we stand, and the journey as it is read (loading until it arrives)', () => {
  const posts = ['p1', 'p2'];
  const v = pilgrimView(read({ profile: ana(), relation: 'friends', journeys: { status: 'ready', posts } }));
  assert.deepEqual(v, { status: 'ready', pilgrim: ana(), relation: 'friends', minimal: false, journeys: { status: 'ready', posts } });
  assert.deepEqual((pilgrimView(read({ profile: ana(), relation: 'none' })) as { journeys: unknown }).journeys, { status: 'loading' });
  const failed = { status: 'error' as const, error: { message: 'x', offline: false } };
  assert.deepEqual((pilgrimView(read({ profile: ana(), relation: 'none', journeys: failed })) as { journeys: unknown }).journeys, failed);
  // a reload that fails after the card was shown does not take the card away
  assert.equal(pilgrimView(read({ profile: ana(), relation: 'friends', error: { message: 'x', offline: true } })).status, 'ready');
});

check('a private profile that is not a friend\'s is the minimal card, and no journey is shown even if one was read', () => {
  const secret = { status: 'ready' as const, posts: ['their post'] };
  for (const relation of ['none', 'pending_out', 'pending_in'] as const) {
    const v = pilgrimView(read({ profile: ana({ is_private: true }), relation, journeys: secret })) as { status: string; minimal: boolean; journeys: { posts: string[] } };
    assert.equal(v.status, 'ready', relation);
    assert.equal(v.minimal, true, relation);
    assert.deepEqual(v.journeys.posts, [], `${relation}: nothing of the journey`);
  }
  const friend = pilgrimView(read({ profile: ana({ is_private: true }), relation: 'friends', journeys: secret })) as { minimal: boolean; journeys: { posts: string[] } };
  assert.equal(friend.minimal, false, 'a friend sees it all');
  assert.deepEqual(friend.journeys.posts, ['their post']);
});

/* ------------------------------------------------------------------ errors and words */

check('an error becomes one sentence for the screen, and "offline" is told apart because the pilgrim can fix it', () => {
  const offline = [new Error('You are offline.'), Object.assign(new Error('x'), { network: true }), new TypeError('Network request failed'), new Error('Failed to fetch')];
  for (const e of offline) {
    const r = toLoadError(e, 'Could not load this profile.');
    assert.equal(r.offline, true, String(e));
    assert.equal(r.message, 'You seem to be offline. Check your signal and try again.');
  }
  const server = toLoadError(new Error('boom'), 'Could not load this profile.');
  assert.deepEqual(server, { message: 'Could not load this profile.', offline: false });
  assert.equal(toLoadError(undefined, 'fallback').message, 'fallback');
  assert.equal(toLoadError(Object.assign(new Error('x'), { code: '42501' }), 'f').message, 'You are not allowed to do that.');
});

check('the words: a friend with no journey yet, a stranger (journeys shared with friends are not shown here), a private profile, a profile that is not available', () => {
  const friend = noJourneys('friends', 'Ana');
  assert.equal(friend.title, 'No journeys to show yet');
  assert.match(friend.text, /Ana shares a journey post with friends/);
  for (const r of ['none', 'pending_out', 'pending_in'] as const) {
    const w = noJourneys(r, 'Ana');
    assert.equal(w.title, 'No journeys to show yet', r);
    assert.match(w.text, /Journeys shared with friends are not shown here/, r);
    assert.match(w.text, /Add Ana as a friend/, r);
  }
  assert.match(privateWords('Ana').title, /private/);
  assert.match(privateWords('Ana').text, /Ana shares journeys with friends only/);
  // the card of a profile that is not there must never say who blocked whom, or that anybody did
  assert.equal(UNAVAILABLE_WORDS.title, 'This profile is not available');
  assert.doesNotMatch(`${UNAVAILABLE_WORDS.title} ${UNAVAILABLE_WORDS.text}`, /block|ban|report|error|wrong|failed/i);
  assert.match(UNFRIEND_MESSAGE, /friends-only posts/);
});

check('what is said after a friend action', () => {
  assert.equal(friendDone('add', 'Ana'), 'Request sent to Ana.');
  assert.equal(friendDone('cancel', 'Ana'), 'Request cancelled.');
  assert.equal(friendDone('accept', 'Ana'), 'You and Ana are now friends.');
  assert.equal(friendDone('decline', 'Ana'), 'Request declined.');
  assert.equal(friendDone('unfriend', 'Ana'), 'Ana is no longer your friend.');
});

/* ------------------------------------------------------------------ fetchRelation against a stand-in for Supabase */

// api.ts is read from its source and compiled in memory (plain node cannot import it: it pulls in React Native); only its imports
// are replaced. The stand-in answers the friendships read and the rpc list_friend_requests from the script below.
type Answer = { data: unknown; error: { message: string; code?: string } | null };
function loadApi(friendships: Answer, requests: Answer, log: string[]) {
  const query = (answer: Answer) => {
    const q = { select: () => q, eq: () => q, limit: () => q, then: (res: (v: Answer) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(answer).then(res, rej) };
    return q;
  };
  const supabase = {
    from(table: string) { log.push(`from ${table}`); return query(friendships); },
    rpc(name: string) { log.push(`rpc ${name}`); return query(requests); },
  };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ts = require('typescript') as typeof import('typescript');
  const source = fs.readFileSync(path.join(process.cwd(), 'src/features/pilgrim/api.ts'), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mods: Record<string, unknown> = {
    '@/lib/supabase': { supabase },
    '@/lib/net': { assertOnline: async () => {} },
    '@/lib/api': { listPostEngagement: async () => null },
    '@/lib/postEngagement': { withEngagement: (p: unknown) => p },
    '../social/api': { SocialError: class extends Error {} },
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    './logic': require('../logic'),
  };
  const m = { exports: {} as Record<string, unknown> };
  new Function('exports', 'require', 'module', code)(m.exports, (id: string) => { if (id in mods) return mods[id]; throw new Error(`api.ts imports ${id}: add it to this test`); }, m);
  return m.exports as { fetchRelation(me: string, other: string): Promise<FriendStatus> };
}

const asyncChecks: [string, () => Promise<void>][] = [
  ['fetchRelation: a request of mine that they declined (cooling down on the server) reads "Requested" on their profile, like the Friends list', async () => {
    const log: string[] = [];
    const api = loadApi({ data: [], error: null }, { data: [{ direction: 'outgoing', id: ANA.toUpperCase(), username: 'ana_t' }], error: null }, log);
    assert.equal(await api.fetchRelation(ME, ANA), 'pending_out');
    assert.deepEqual(log, ['from friendships', 'rpc list_friend_requests']);
  }],
  ['fetchRelation: no row and no request of mine to them is none (an incoming request or one to somebody else does not count)', async () => {
    const api = loadApi({ data: [], error: null }, { data: [{ direction: 'incoming', id: ANA }, { direction: 'outgoing', id: ME }], error: null }, []);
    assert.equal(await api.fetchRelation(ME, ANA), 'none');
    assert.equal(await loadApi({ data: [], error: null }, { data: [], error: null }, []).fetchRelation(ME, ANA), 'none');
    // the list cannot be read: none, as before (the profile still opens)
    assert.equal(await loadApi({ data: [], error: null }, { data: null, error: { message: 'boom' } }, []).fetchRelation(ME, ANA), 'none');
  }],
  ['fetchRelation: a friendship row answers at once (friends, incoming), without asking the list', async () => {
    const log: string[] = [];
    assert.equal(await loadApi({ data: [{ status: 'accepted', requested_by: ANA }], error: null }, { data: [], error: null }, log).fetchRelation(ME, ANA), 'friends');
    assert.equal(await loadApi({ data: [{ status: 'pending', requested_by: ANA }], error: null }, { data: [], error: null }, log).fetchRelation(ME, ANA), 'pending_in');
    assert.equal(await loadApi({ data: [{ status: 'pending', requested_by: ME }], error: null }, { data: [], error: null }, log).fetchRelation(ME, ANA), 'pending_out');
    assert.ok(!log.includes('rpc list_friend_requests'), 'the list is only read when there is no row');
  }],
];

(async () => {
  for (const [name, fn] of asyncChecks) { await fn(); n += 1; console.log(`ok   ${name}`); }
  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
