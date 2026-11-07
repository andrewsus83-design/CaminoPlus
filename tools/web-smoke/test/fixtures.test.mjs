// The fake Supabase project: the answers it gives, and the state the browser starts from.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAT_ID, JOURNEY, PROFILE, UID, authKey, filterRows, makeSession, realtimeReply, respond, storageSeed, supabaseUrl } from '../fixtures.mjs';
import { SAMPLE_PARAM } from '../routes.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const URL_ = 'https://xgikdabgdqmbdgagowva.supabase.co';
const get = (path, persona = 'in', accept = '') => respond({ method: 'GET', url: `${URL_}${path}`, persona, accept });

test('the Supabase URL comes from the app\'s own config, and the login key from the project host', () => {
  assert.match(supabaseUrl(join(here, '..', '..', '..', 'mobile', 'src', 'lib', 'config.ts')), /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.equal(authKey(URL_), 'sb-xgikdabgdqmbdgagowva-auth-token');
});

test('the account: a profile for the signed-in pilgrim, a journey only for the persona that has one', () => {
  assert.deepEqual(get(`/rest/v1/profiles?select=id&id=eq.${UID}`).body.map((p) => p.id), [UID]);
  assert.equal(get('/rest/v1/journeys?select=id&user_id=eq.' + UID, 'in').body.length, 1);
  assert.equal(get('/rest/v1/journeys?select=id&user_id=eq.' + UID, 'new').body.length, 0);
  assert.deepEqual(get('/rest/v1/stages').body.map((s) => s.stage_number), [1, 2, 3]);
});

test('an empty account has the account and the journey and nothing else: no days, stamps, posts, friends, chats, stays, Caminos', () => {
  const ask = (path, data) => respond({ method: 'GET', url: `${URL_}${path}`, persona: 'in', data }).body;
  const rpc = (fn, data) => respond({ method: 'POST', url: `${URL_}/rest/v1/rpc/${fn}`, persona: 'in', data, body: {} }).body;
  for (const t of ['journey_days', 'user_stamps', 'posts', 'notifications', 'messages', 'routes', 'stages']) {
    assert.ok(ask(`/rest/v1/${t}`, 'full').length > 0, `${t}: full`);
    assert.deepEqual(ask(`/rest/v1/${t}`, 'empty'), [], `${t}: empty`);
  }
  assert.equal(ask('/rest/v1/profiles', 'empty').some((p) => p.id === UID), true);
  assert.equal(ask('/rest/v1/journeys', 'empty').length, 1);
  for (const fn of ['list_conversations', 'list_friends', 'list_friend_requests', 'list_stage_stays', 'list_stage_pois']) {
    assert.ok(rpc(fn, 'full').length > 0, `${fn}: full`);
    assert.deepEqual(rpc(fn, 'empty'), [], `${fn}: empty`);
  }
  assert.equal(rpc('get_unread_totals', 'empty')[0].chats, 0);
});

test('filters of the query string are applied (the plan\'s next open day is day 2, limit 1)', () => {
  const q = `/rest/v1/journey_days?journey_id=eq.${JOURNEY.id}&deleted_at=is.null&status=in.(planned,in_progress)&stage_id=not.is.null&order=day_number&limit=1`;
  const rows = get(q).body;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].day_number, 2);
  assert.equal(filterRows([{ a: 1 }, { a: 2 }, { a: 3 }], new URLSearchParams('a=neq.2')).length, 2);
  assert.equal(filterRows([{ a: 'x' }, { a: 'y' }], new URLSearchParams('a=in.("x","z")')).length, 1);
  assert.equal(filterRows([{ a: 1 }], new URLSearchParams('missing=eq.9')).length, 1, 'a column the fixture does not have is not filtered on');
});

test('rpc: modelled functions answer with data, the others with an empty list that says it is not modelled', () => {
  const stays = respond({ method: 'POST', url: `${URL_}/rest/v1/rpc/list_stage_stays`, body: { p_stage: 'x' } });
  assert.equal(stays.modelled, true);
  assert.ok(stays.body.length >= 3);
  const other = respond({ method: 'POST', url: `${URL_}/rest/v1/rpc/something_new`, body: {} });
  assert.deepEqual([other.body, other.modelled], [[], false]);
});

test('.single() gets one object, or the error PostgREST sends for zero or many rows', () => {
  const one = get(`/rest/v1/profiles?id=eq.${UID}`, 'in', 'application/vnd.pgrst.object+json');
  assert.equal(one.status, 200);
  assert.equal(one.body.id, UID);
  const none = get('/rest/v1/profiles?id=eq.nobody', 'in', 'application/vnd.pgrst.object+json');
  assert.equal(none.status, 406);
  assert.equal(none.body.code, 'PGRST116');
});

test('the chat that /chat/[id] opens is the one the sample parameter points at', () => {
  assert.equal(CHAT_ID, SAMPLE_PARAM);
  const convs = respond({ method: 'POST', url: `${URL_}/rest/v1/rpc/list_conversations`, persona: 'in' }).body;
  assert.ok(convs.some((c) => c.id === SAMPLE_PARAM));
  const msgs = get(`/rest/v1/messages?conversation_id=eq.${SAMPLE_PARAM}`).body;
  assert.ok(msgs.length >= 2 && msgs.every((m) => m.conversation_id === SAMPLE_PARAM));
});

test('what the browser starts with: scheme always; the login when signed in; the saved account when offline', () => {
  const keys = (o) => storageSeed({ url: URL_, ...o }).map(([k]) => k);
  assert.deepEqual(keys({ persona: 'out', scheme: 'dark' }), ['kv:theme-scheme']);
  assert.deepEqual(keys({ persona: 'new', scheme: 'light' }), ['kv:theme-scheme', 'sb-xgikdabgdqmbdgagowva-auth-token']);
  const offlineIn = storageSeed({ persona: 'in', scheme: 'light', offline: true, url: URL_ });
  assert.deepEqual(offlineIn.map(([k]) => k), ['kv:theme-scheme', 'sb-xgikdabgdqmbdgagowva-auth-token', `kv:u.${UID}.account`, `kv:u.${UID}.me`]);
  assert.equal(JSON.parse(offlineIn[0][1]), 'light');
  assert.equal(JSON.parse(offlineIn[2][1]).profile.id, PROFILE.id);
  const offlineNew = storageSeed({ persona: 'new', scheme: 'light', offline: true, url: URL_ });
  assert.equal(JSON.parse(offlineNew[2][1]).journey, null, 'signed in without a journey is still without one offline');
  assert.equal(keys({ persona: 'in', scheme: 'light', offline: true, savedAccount: false }).includes(`kv:u.${UID}.account`), false);
  assert.deepEqual(keys({ persona: 'in', scheme: 'light', offline: true, data: 'empty' }), ['kv:theme-scheme', 'sb-xgikdabgdqmbdgagowva-auth-token', `kv:u.${UID}.account`], 'empty: the account is saved, the Me tab never was');
});

test('a login: valid for a year, or expired an hour ago with the refresh token still there', () => {
  const now = Math.floor(Date.now() / 1000);
  const fresh = makeSession();
  assert.ok(fresh.expires_at > now + 86_400 * 300);
  const old = makeSession({ expired: true });
  assert.ok(old.expires_at < now);
  assert.equal(old.refresh_token, fresh.refresh_token);
  assert.equal(JSON.parse(Buffer.from(old.access_token.split('.')[1], 'base64url')).sub, UID);
});

test('realtime: a join is accepted with its postgres_changes echoed (ids added), a heartbeat is answered, noise is not', () => {
  const join_ = JSON.stringify(['1', '1', 'realtime:social:x', 'phx_join', { config: { postgres_changes: [{ event: '*', schema: 'public', table: 'messages' }, { event: 'INSERT', schema: 'public', table: 'notifications' }] } }]);
  const reply = JSON.parse(realtimeReply(join_));
  assert.deepEqual(reply.slice(0, 4), ['1', '1', 'realtime:social:x', 'phx_reply']);
  assert.equal(reply[4].status, 'ok');
  assert.deepEqual(reply[4].response.postgres_changes.map((c) => c.id), [1, 2]);
  assert.equal(JSON.parse(realtimeReply(JSON.stringify([null, '7', 'phoenix', 'heartbeat', {}])))[4].status, 'ok');
  assert.equal(realtimeReply(JSON.stringify(['1', '2', 't', 'access_token', {}])), null);
  assert.equal(realtimeReply('not json'), null);
});
