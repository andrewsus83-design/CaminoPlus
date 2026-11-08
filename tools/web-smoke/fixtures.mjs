// Everything the test pretends the outside world says: one Supabase project, and nothing else.
//
// The app talks to exactly one host, its Supabase project (REST, auth, storage, functions, realtime). The test answers
// that host from the data below. Every other host is refused and recorded (smoke.mjs), so a new call to a third party
// cannot slip in unnoticed. The shapes were copied from the ones the earlier hand-run sweeps used (a signed-in pilgrim
// with a journey, the stays and places of stage 1) and widened a little so the screens have rows to draw.
//
// The "database" is deliberately small. Anything a screen asks for that is not modelled here gets an empty list, which is
// what a new account sees; the rows below exist so the screens that draw lists are also exercised with data in them.
import { readFileSync } from 'node:fs';
import { SAMPLE_PARAM } from './routes.mjs';

// ---------------------------------------------------------------- the project

/** The Supabase project the app is built for: EXPO_PUBLIC_SUPABASE_URL if the export was made with it, else the default in src/lib/config.ts. */
export function supabaseUrl(configFile) {
  if (process.env.SMOKE_SUPABASE_URL) return process.env.SMOKE_SUPABASE_URL.replace(/\/$/, '');
  const src = readFileSync(configFile, 'utf8');
  const m = /EU_PROJECT_URL\s*=\s*'(https:\/\/[^']+)'/.exec(src);
  if (!m) throw new Error(`cannot find EU_PROJECT_URL in ${configFile}. Set SMOKE_SUPABASE_URL to the Supabase URL the web export was built with.`);
  return m[1].replace(/\/$/, '');
}

/** localStorage key of the login: supabase-js derives it from the project host (see authStorageKey in src/lib/supabase.ts). */
export const authKey = (url) => `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;

// ---------------------------------------------------------------- the pilgrim

export const UID = '11111111-1111-4111-8111-111111111111';
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86_400_000;

const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

/** A login as supabase-js stores it. `expired`: the access token ran out an hour ago (the refresh token is still there). */
export function makeSession({ expired = false } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const exp = expired ? now - 3600 : now + 86_400 * 365;
  const access_token = `${b64u({ alg: 'HS256', typ: 'JWT' })}.${b64u({ sub: UID, role: 'authenticated', exp })}.sig`;
  return {
    access_token, refresh_token: 'smoke-refresh-token', token_type: 'bearer', expires_in: expired ? 3600 : 86_400 * 365, expires_at: exp,
    user: { id: UID, aud: 'authenticated', role: 'authenticated', email: 'p@x.test', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-11-01T00:00:00Z' },
  };
}

export const PROFILE = {
  id: UID, username: 'ana_t', display_name: 'Ana Torres', bio: 'Walking for my family', avatar_url: null, xp: 120, level: 2,
  followers_count: 3, following_count: 5, friends_count: 2, posts_count: 2, stamps_count: 2, km_walked: 41.5, is_private: false,
};

const STAGE_1 = '40000000-0000-0000-0000-000000000001';
const STAGE_2 = '40000000-0000-0000-0000-000000000002';
const STAGE_3 = '40000000-0000-0000-0000-000000000003';
const STAGE_1_NAME = 'Saint-Jean-Pied-de-Port to Roncesvalles';

export const ROUTES = [
  { id: '30000000-0000-4000-8000-000000000001', slug: 'camino-frances', name: 'Camino Frances', short_name: 'Frances', start_name: 'Saint-Jean-Pied-de-Port', end_name: 'Santiago de Compostela', distance_km: 780, stage_count: 33, difficulty: 3, color: '#14365D' },
  { id: '30000000-0000-4000-8000-000000000002', slug: 'camino-del-norte', name: 'Camino del Norte', short_name: 'Norte', start_name: 'Irun', end_name: 'Santiago de Compostela', distance_km: 820, stage_count: 34, difficulty: 4, color: '#2F5D50' },
];

export const STAGES = [
  { id: STAGE_1, stage_number: 1, name: STAGE_1_NAME, distance_km: 24.2, elevation_gain_m: 1250, difficulty: 4, start: { name: 'Saint-Jean-Pied-de-Port' }, end: { name: 'Roncesvalles' } },
  { id: STAGE_2, stage_number: 2, name: 'Roncesvalles to Zubiri', distance_km: 21.5, elevation_gain_m: 520, difficulty: 3, start: { name: 'Roncesvalles' }, end: { name: 'Zubiri' } },
  { id: STAGE_3, stage_number: 3, name: 'Zubiri to Pamplona', distance_km: 20.4, elevation_gain_m: 410, difficulty: 2, start: { name: 'Zubiri' }, end: { name: 'Pamplona' } },
];

export const JOURNEY = {
  id: '50000000-0000-4000-8000-000000000001', route_id: ROUTES[0].id, start_stage_id: STAGE_1, status: 'planning', walked_km: 0, planned_start_date: null,
  route: { name: 'Camino Frances', short_name: 'Frances', slug: 'camino-frances' }, start_stage: { stage_number: 1, name: 'Saint-Jean-Pied-de-Port' },
};

// One list serves both questions the app asks of journey_days: the day plan (id, day_number, planned_date, ...) and "the stage of the next
// open day" (stage_id, day_number, status, stage). Day 1 is finished, so the next open day is day 2.
export const JOURNEY_DAYS = [STAGE_1, STAGE_2, STAGE_3].map((stage_id, i) => ({
  id: `60000000-0000-4000-8000-00000000000${i + 1}`, journey_id: JOURNEY.id, stage_id, day_number: i + 1, status: i === 0 ? 'done' : 'planned',
  planned_date: `2026-11-${String(10 + i).padStart(2, '0')}`, from_name: STAGES[i].start.name, to_name: STAGES[i].end.name, planned_distance_km: STAGES[i].distance_km,
  actual_distance_km: i === 0 ? 24.9 : null, started_at: i === 0 ? iso(3 * DAY) : null, finished_at: i === 0 ? iso(3 * DAY - 7 * 3_600_000) : null, notes: null,
  deleted_at: null, stage: { name: STAGES[i].name },
}));

export const STAMPS = [
  { id: '70000000-0000-4000-8000-000000000001', place_name: 'Roncesvalles', stamped_at: iso(2 * DAY), verified: true, method: 'qr', user_id: UID, deleted_at: null },
  { id: '70000000-0000-4000-8000-000000000002', place_name: 'Zubiri', stamped_at: iso(DAY), verified: false, method: 'manual', user_id: UID, deleted_at: null },
];

export const POSTS = [
  { id: '80000000-0000-4000-8000-000000000001', body: 'Sunrise over the meseta. Thirty kilometres and not one cloud.', place_name: 'Hontanas', published_at: iso(DAY), like_count: 12, comment_count: 3, media_count: 0, health_summary: { km: 21.4 }, save_count: 1, share_count: 0, user_id: UID, status: 'published', kind: 'journal', deleted_at: null },
  { id: '80000000-0000-4000-8000-000000000002', body: 'Pilgrim menu in Zubiri: soup, trout, and a stamp for the credencial.', place_name: null, published_at: iso(2 * DAY), like_count: 0, comment_count: 0, media_count: 0, health_summary: null, save_count: 0, share_count: 0, user_id: UID, status: 'published', kind: 'journal', deleted_at: null },
];

// The first post is bookmarked (the bookmark button of the journey viewer writes post_saves). The Bookmarks screen under Library reads this
// list, then the posts it names, so the full account sweeps that screen with a row in it.
export const POST_SAVES = [
  { post_id: POSTS[0].id, user_id: UID, created_at: iso(DAY / 2) },
];

// ---------------------------------------------------------------- other people

const HANNAH = { id: '22222222-2222-4222-8222-222222222222', username: 'hannah', display_name: 'Hannah Meyer', avatar_url: null };
const LUCAS = { id: '33333333-3333-4333-8333-333333333333', username: 'lucas', display_name: 'Lucas Ferreira', avatar_url: null };

export const FRIENDS = [
  { ...HANNAH, km_walked: 112.4, since: iso(9 * DAY) },
  { ...LUCAS, km_walked: 38, since: iso(4 * DAY) },
];

// The profile of another pilgrim (mobile/app/pilgrim/[id].tsx). Hannah is a friend with three posts, Lucas has asked to be a friend (the request the Requests tab
// lists), Marta is a stranger with a public profile and nothing this pilgrim may see, Ines is a stranger with a private profile. Any other id is "not available".
export const HANNAH_CARD = { bio: 'Walking the Camino for my father. Ultreia!', is_private: false, km_walked: 112.4, posts_count: 3, stamps_count: 7 };
export const LUCAS_CARD = { bio: 'Third Camino. Bring good socks.', is_private: false, km_walked: 38, posts_count: 1, stamps_count: 2 };
export const MARTA = { id: '44444444-4444-4444-8444-444444444444', username: 'marta', display_name: 'Marta Vidal', avatar_url: null, bio: 'From Lisbon, on the Camino Portugues.', is_private: false, km_walked: 64, posts_count: 5, stamps_count: 3 };
export const INES = { id: '55555555-5555-4555-8555-555555555555', username: 'ines', display_name: 'Ines Duarte', avatar_url: null, bio: 'Only my friends read this.', is_private: true, km_walked: 220, posts_count: 9, stamps_count: 12 };

const hannahPost = (n, o) => ({ id: `81000000-0000-4000-8000-00000000000${n}`, body: null, place_name: null, published_at: iso(n * DAY), like_count: 0, comment_count: 0, media_count: 0, health_summary: null, save_count: 0, share_count: 0, user_id: HANNAH.id, status: 'published', kind: 'journal', deleted_at: null, ...o });
export const HANNAH_POSTS = [
  hannahPost(1, { body: 'Cruz de Ferro. I left my father\'s stone here.', place_name: 'Cruz de Ferro', like_count: 4, comment_count: 1 }),
  hannahPost(2, { body: 'Stamp number 20, and a very good soup.', place_name: 'Astorga' }),
  hannahPost(3, { body: 'The meseta in the morning: nothing but sky.', place_name: 'Hontanas' }),
];
// A friendship is one row per pair, the smaller id first (user_a < user_b); the app reads its own row with each pilgrim.
export const FRIENDSHIPS = [
  { user_a: UID, user_b: HANNAH.id, requested_by: UID, status: 'accepted' },
  { user_a: UID, user_b: LUCAS.id, requested_by: LUCAS.id, status: 'pending' },
];
// What Lucas wrote under the first post of Hannah, so the comments sheet has a name to open.
export const HANNAH_COMMENTS = [
  { id: 'c1000000-0000-4000-8000-000000000001', post_id: HANNAH_POSTS[0].id, user_id: LUCAS.id, body: 'Golden light! Which stage was this?', created_at: iso(DAY / 2), deleted_at: null, moderation_status: 'ok', author: { username: LUCAS.username, display_name: LUCAS.display_name } },
];

// The chat the "[id]" routes open: its id is the sample value of a route parameter (routes.mjs), so /chat/<sample> is a real chat.
export const CHAT_ID = SAMPLE_PARAM;
const GROUP_ID = '90000000-0000-4000-8000-000000000002';
const conversation = (o) => ({ avatar_url: null, peer_id: null, peer_username: null, peer_display_name: null, peer_avatar_url: null, last_message_id: null, last_message_preview: null, last_message_sender: null, last_message_sender_name: null, last_message_at: null, unread_count: 0, muted_until: null, my_role: 'member', ...o });
export const CONVERSATIONS = [
  conversation({ id: CHAT_ID, kind: 'direct', title: HANNAH.display_name, peer_id: HANNAH.id, peer_username: HANNAH.username, peer_display_name: HANNAH.display_name, member_count: 2, last_message_id: 'a0000000-0000-4000-8000-000000000002', last_message_preview: 'See you in Hontanas!', last_message_sender: HANNAH.id, last_message_sender_name: 'Hannah', last_message_at: iso(3_600_000), unread_count: 2 }),
  conversation({ id: GROUP_ID, kind: 'group', title: 'Frances in November', member_count: 3, last_message_id: 'a0000000-0000-4000-8000-000000000003', last_message_preview: 'Who has the stage 3 plan?', last_message_sender: LUCAS.id, last_message_sender_name: 'Lucas', last_message_at: iso(DAY), my_role: 'owner' }),
];

const member = (u, role) => ({ user_id: u.id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url, role, joined_at: iso(9 * DAY), last_read_at: iso(3_600_000) });
export const MEMBERS = [member(PROFILE, 'owner'), member(HANNAH, 'member')].map((m) => ({ ...m, conversation_id: CHAT_ID }));

export const MESSAGES = [
  { id: 'a0000000-0000-4000-8000-000000000001', conversation_id: CHAT_ID, sender_id: UID, kind: 'text', body: 'Buen Camino! Where do you stop tonight?', media_path: null, reply_to: null, client_created_at: iso(5_400_000), created_at: iso(5_400_000), edited_at: null, deleted_at: null },
  { id: 'a0000000-0000-4000-8000-000000000002', conversation_id: CHAT_ID, sender_id: HANNAH.id, kind: 'text', body: 'See you in Hontanas!', media_path: null, reply_to: null, client_created_at: iso(3_600_000), created_at: iso(3_600_000), edited_at: null, deleted_at: null },
];

export const NOTIFICATIONS = [
  { id: 'b0000000-0000-4000-8000-000000000001', kind: 'friend_request', title: 'New friend request', body: 'Lucas wants to walk with you', data: {}, read_at: null, created_at: iso(3_600_000), actor: LUCAS },
  { id: 'b0000000-0000-4000-8000-000000000002', kind: 'post_like', title: 'Hannah liked your post', body: null, data: { post_id: POSTS[0].id }, read_at: iso(DAY), created_at: iso(DAY), actor: HANNAH, user_id: UID },
];

// ---------------------------------------------------------------- stays and places of stage 1 (as the contrast audit used them)

const stay = (o) => ({ phone: null, email: null, website: null, opening_hours: null, address: null, description: null, place_name: null, km_from_stage_start: null, detour_m: 0, beds: null,
  amenities: [], labels: [], has_stamp: false, data_confidence: null, verification_level: 'unverified', verification_at: null, source: 'osm', osm_type: 'node', osm_id: null, kind: 'stay', ...o });
export const STAYS = [
  stay({ id: '5e0d0000-0000-4000-8000-000000000001', name: 'Albergue Zz Orisson', category: 'albergue_private', lat: 43.0872, lng: -1.2338, phone: '+33 5 59 49 13 03', email: 'contact@zz-orisson.example.com',
    website: 'https://www.zz-orisson.example.com/', opening_hours: 'Mar-Oct: 08:00-22:00', address: 'Chemin de Saint-Jacques, Orisson', description: 'A pilgrim refuge on the way up to the pass.', place_name: 'Orisson',
    km_from_stage_start: 8.0, detour_m: 120, beds: 28, amenities: ['wifi', 'kitchen'], labels: ['pilgrims_only', 'donativo'], has_stamp: true, osm_id: 123456789 }),
  stay({ id: '5e0d0000-0000-4000-8000-000000000002', name: 'Albergue Zz Parroquial', category: 'albergue_parochial', lat: 43.0094, lng: -1.3195, km_from_stage_start: 24.2, detour_m: 40, beds: 183,
    verification_level: 'data_check', verification_at: '2026-10-15T10:00:00+00:00', place_name: 'Roncesvalles', labels: ['pilgrims_only'], has_stamp: true, osm_type: 'way', osm_id: 99887766, website: 'albergue-zz.example.org' }),
  stay({ id: '5e0d0000-0000-4000-8000-000000000003', name: 'Hotel Rural Zz Pyrenees', category: 'hotel', lat: 43.05, lng: -1.25, km_from_stage_start: 15.5, detour_m: 1250, source: 'owner', verification_level: 'owner', verification_at: '2026-09-01T08:30:00+00:00', osm_type: null }),
  stay({ id: '5e0d0000-0000-4000-8000-000000000004', name: 'Bar Zz Fuente', category: 'cafe', kind: 'food', lat: 43.0868, lng: -1.2344, km_from_stage_start: 8.2, detour_m: 60, opening_hours: 'Mo-Su 07:30-20:00', osm_id: 5550001 }),
  stay({ id: '5e0d0000-0000-4000-8000-000000000005', name: 'Tienda Zz Souvenirs', category: 'shop', kind: 'service', lat: 43.0865, lng: -1.2342, km_from_stage_start: 8.3, osm_id: 5550002 }),
  stay({ id: '5e0d0000-0000-4000-8000-000000000006', name: 'Camping Zz Valcarlos', category: 'camping', lat: 43.12, lng: -1.22, km_from_stage_start: 4.0, detour_m: 400, osm_id: 5550003 }),
];
const poi = (o) => ({ phone: null, website: null, opening_hours: null, mass_times: null, place_name: null, km_from_stage_start: null, detour_m: 0, has_stamp: false, data_confidence: null,
  verification_level: 'unverified', verification_at: null, source: 'osm', osm_type: 'node', osm_id: null, ...o });
export const POIS = [
  poi({ id: '5e0b0000-0000-4000-8000-000000000001', name: 'Chapelle Zz du Pilier', category: 'chapel', lat: 43.0871, lng: -1.2345, km_from_stage_start: 8.1, opening_hours: 'Mo-Su 09:00-18:00', mass_times: 'Su 11:00', osm_type: 'way', osm_id: 424242 }),
  poi({ id: '5e0b0000-0000-4000-8000-000000000002', name: 'Fontaine Zz Roland', category: 'fountain', lat: 43.0866, lng: -1.2339, km_from_stage_start: 8.0, detour_m: 80, osm_id: 777 }),
  poi({ id: '5e0b0000-0000-4000-8000-000000000003', name: 'Pharmacie Zz', category: 'pharmacy', lat: 43.0870, lng: -1.2336, km_from_stage_start: 8.1, osm_id: 778 }),
];

// ---------------------------------------------------------------- the "database"

// Two kinds of data, because a screen can break on a list with things in it and on one with nothing in it:
//   full  (the default) a pilgrim who has walked a day, posted, made friends: every list has rows
//   empty a pilgrim with an account and a journey and NOTHING else: no days, stamps, posts, friends, chats, stays, no list of
//         Caminos. This is what the earlier hand-run sweeps used (everything but the profile and the journey was an empty list).
// `new` (signed in, no journey yet) has no journey in either; only its list of Caminos differs.

/** What the account holds. `new` = signed in, onboarding not done: no journey. */
function tables({ persona, data }) {
  const full = persona === 'in' && data !== 'empty';
  return {
    profiles: [PROFILE, { ...HANNAH, ...HANNAH_CARD }, { ...LUCAS, ...LUCAS_CARD }, MARTA, INES].map((p) => ({ ...p })),
    friendships: full ? FRIENDSHIPS : [],
    post_comments: full ? HANNAH_COMMENTS : [],
    journeys: persona === 'in' ? [{ ...JOURNEY, user_id: UID, deleted_at: null }] : [],
    routes: data === 'empty' ? [] : ROUTES.map((r) => ({ ...r, is_published: true, deleted_at: null })),
    stages: data === 'empty' ? [] : STAGES.map((s) => ({ ...s, is_published: true, variant_of: null, deleted_at: null })),
    journey_days: full ? JOURNEY_DAYS : [],
    user_stamps: full ? STAMPS : [],
    posts: full ? [...POSTS, ...HANNAH_POSTS] : [],
    post_saves: full ? POST_SAVES : [],
    notifications: full ? NOTIFICATIONS.map((n) => ({ user_id: UID, ...n })) : [],
    messages: full ? [...MESSAGES].reverse() : [], // the app asks for the newest first
  };
}

// Each function gets (body, state) where state = { persona, data, full }.
const RPC = {
  get_unread_totals: (_b, s) => [s.full ? { notifications: 1, chats: 2, groups: 0, friend_requests: 1 } : { notifications: 0, chats: 0, groups: 0, friend_requests: 0 }],
  // a free pilgrim: 500 MB of cloud storage (decimal bytes, the number of mobile/src/lib/plan.ts; it was 0 before the plan numbers)
  get_my_storage: () => ({ has_plus: false, quota_bytes: 500000000, used_bytes: 0, object_count: 0, remaining_bytes: 500000000 }),
  list_conversations: (_b, s) => (s.full ? CONVERSATIONS : []),
  list_conversation_members: (_b, s) => (s.full ? MEMBERS : []),
  list_friends: (_b, s) => (s.full ? FRIENDS : []),
  start_direct_chat: () => CHAT_ID, // the Message button of a friend's profile: the one chat the "[id]" routes open
  list_friend_requests: (_b, s) => (s.full ? [{ direction: 'incoming', id: LUCAS.id, username: LUCAS.username, display_name: LUCAS.display_name, avatar_url: null, created_at: iso(3_600_000) }] : []),
  list_stage_stays: (_b, s) => (s.full ? STAYS : []),
  list_stage_pois: (_b, s) => (s.full ? POIS : []),
};

/** Applies the filters PostgREST puts in the query string (eq, neq, in, is, not.is) and limit. Anything it does not know is ignored. */
export function filterRows(rows, params) {
  const skip = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
  let out = rows;
  for (const [key, value] of params) {
    if (skip.has(key)) continue;
    const m = /^(not\.)?(eq|neq|in|is)\.(.*)$/.exec(value);
    if (!m) continue;
    const [, negate, op, arg] = m;
    out = out.filter((row) => {
      if (!(key in row)) return true; // an embedded or unmodelled column: do not guess
      const v = row[key];
      let hit;
      if (op === 'eq') hit = String(v) === arg;
      else if (op === 'neq') hit = String(v) !== arg;
      else if (op === 'is') hit = arg === 'null' ? v === null || v === undefined : String(v) === arg;
      else hit = arg.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^"|"$/g, '')).includes(String(v));
      return negate ? !hit : hit;
    });
  }
  const limit = Number(params.get('limit'));
  return Number.isFinite(limit) && limit > 0 ? out.slice(0, limit) : out;
}

/**
 * The answer of the Supabase project to one request. Pure: { method, url, persona, data, accept } in, { status, body, modelled } out.
 * `modelled` is false for an endpoint with no data of its own (answered with an empty list); --verbose lists them.
 */
export function respond({ method, url, persona = 'in', data = 'full', accept = '', body = null }) {
  const u = new URL(url);
  const p = u.pathname;
  const state = { persona, data, full: persona === 'in' && data !== 'empty' };
  if (p.startsWith('/auth/v1/')) {
    if (p.endsWith('/user')) return { status: 200, body: makeSession().user, modelled: true };
    if (p.endsWith('/token')) return { status: 200, body: makeSession(), modelled: true }; // a refresh: a fresh login
    if (p.endsWith('/logout')) return { status: 204, body: null, modelled: true };
    return { status: 200, body: {}, modelled: false };
  }
  const rpc = /^\/rest\/v1\/rpc\/([\w]+)$/.exec(p);
  if (rpc) {
    const fn = RPC[rpc[1]];
    return { status: 200, body: fn ? fn(body, state) : [], modelled: !!fn };
  }
  const table = /^\/rest\/v1\/([\w]+)$/.exec(p);
  if (table) {
    if (method !== 'GET' && method !== 'HEAD') return { status: 201, body: [], modelled: false }; // a write: nothing is stored
    const rows = tables(state)[table[1]];
    const found = rows ? filterRows(rows, u.searchParams) : [];
    if (/pgrst\.object/.test(accept)) { // .single(): exactly one row or an error
      return found.length === 1 ? { status: 200, body: found[0], modelled: !!rows } : { status: 406, body: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${found.length} rows`, hint: null }, modelled: !!rows };
    }
    return { status: 200, body: found, modelled: !!rows };
  }
  if (p.startsWith('/storage/v1/')) return { status: 200, body: [], modelled: false };
  if (p.startsWith('/functions/v1/')) return { status: 200, body: {}, modelled: false };
  return { status: 200, body: [], modelled: false };
}

// ---------------------------------------------------------------- what the browser starts with

/**
 * localStorage at the first launch, as [key, value] pairs (smoke.mjs writes them before the app runs, only where a key is absent).
 *  - the colour scheme, always
 *  - signed in (persona new or in): the login
 *  - offline: the pilgrim has opened the app before, so the account is saved on the phone, and (with full data) the Me tab too. With
 *    empty data only the account is saved: the app was opened once and never got further. Online starts from nothing (a first
 *    launch after signing in), which is the other way into the same screens.
 */
export function storageSeed({ persona, scheme, offline = false, url, expiredLogin = false, savedAccount = offline, data = 'full' }) {
  const seed = [['kv:theme-scheme', JSON.stringify(scheme)]];
  if (persona === 'out') return seed;
  seed.push([authKey(url), JSON.stringify(makeSession({ expired: expiredLogin }))]);
  if (savedAccount) {
    const journey = persona === 'in' ? JOURNEY : null;
    seed.push([`kv:u.${UID}.account`, JSON.stringify({ v: 1, profile: PROFILE, journey, savedAt: Date.now() })]);
    if (journey && data !== 'empty') seed.push([`kv:u.${UID}.me`, JSON.stringify({ v: 1, journeyId: JOURNEY.id, posts: POSTS, stamps: STAMPS, days: JOURNEY_DAYS, stages: STAGES })]);
  }
  return seed;
}

// ---------------------------------------------------------------- realtime

/**
 * What the realtime server answers to one frame (Phoenix, serializer 2.0.0: [join_ref, ref, topic, event, payload]),
 * or null when it stays quiet. A join is accepted and its postgres_changes are echoed back with ids, as the real server does;
 * a heartbeat gets its ok. That keeps supabase-js in "subscribed" instead of retrying in the background.
 */
export function realtimeReply(raw) {
  let frame;
  try { frame = JSON.parse(raw); } catch { return null; }
  if (!Array.isArray(frame) || frame.length < 5) return null;
  const [joinRef, ref, topic, event, payload] = frame;
  const ok = (response) => JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response }]);
  if (event === 'phx_join') {
    const changes = (payload && payload.config && payload.config.postgres_changes) || [];
    return ok({ postgres_changes: changes.map((c, i) => ({ ...c, id: i + 1 })) });
  }
  if (event === 'heartbeat') return ok({});
  if (event === 'phx_leave') return ok({});
  return null;
}
