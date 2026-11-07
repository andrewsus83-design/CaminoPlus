// Plain-node checks for what the rail's share and comment buttons do, and for the local love / bookmark of sample content
// (no React Native). Run: npm run test:lib
import assert from 'node:assert/strict';
import { APP_LINK, SHARE_APP, shareAndRecord, shareMessage, shareOutcome } from '../postShare';
import { COMMENT_INPUT_MAX, COMMENT_MAX, commentAuthor, commentText, parseComments, toSheetComments } from '../postComments';
import { NO_FAVS, parseFavs, toggleFav } from '../localReactions';

let n = 0;
const test = async (name: string, fn: () => Promise<void> | void) => { await fn(); n += 1; console.log(`ok   ${name}`); };

(async () => {
  /* ---------------- share: what is sent ---------------- */

  await test('sample content shares the invitation to the app and nothing else, even when the post has words', () => {
    assert.match(SHARE_APP, /CaminoPlus/);
    assert.ok(SHARE_APP.endsWith(APP_LINK));
    assert.equal(shareMessage({ body: 'Stamp number one in the credencial!', place_name: 'Albergue' }, true), SHARE_APP);
    assert.equal(shareMessage(null, true), SHARE_APP);
    assert.ok(!shareMessage({ body: 'Café con leche', place_name: 'Morning coffee' }, true).includes('Café'));
  });

  await test('a real post shares the pilgrim\'s own words, the place and the link to the app', () => {
    assert.equal(shareMessage({ body: 'Day one, boots on.', place_name: 'Roncesvalles' }, false), `Day one, boots on.\n\nRoncesvalles · CaminoPlus: ${APP_LINK}`);
    assert.equal(shareMessage({ body: '  Rain all morning.  ', place_name: null }, false), `Rain all morning.\n\nCaminoPlus: ${APP_LINK}`);
    assert.equal(shareMessage({ body: null, place_name: 'Zubiri' }, false), `Zubiri\n\nCaminoPlus: ${APP_LINK}`);
  });

  await test('a real post with no words at all falls back to the invitation, not an empty message', () => {
    assert.equal(shareMessage({ body: '   ', place_name: '' }, false), SHARE_APP);
    assert.equal(shareMessage({}, false), SHARE_APP);
    assert.equal(shareMessage(undefined, false), SHARE_APP);
  });

  /* ---------------- share: when it counts ---------------- */

  await test('shareOutcome: the closed sheet is dismissed, anything else (including the web, which answers nothing) is shared', () => {
    assert.equal(shareOutcome({ action: 'dismissedAction' }), 'dismissed');
    assert.equal(shareOutcome({ action: 'sharedAction', activityType: 'net.whatsapp.WhatsApp.ShareExtension' }), 'shared');
    assert.equal(shareOutcome({ action: 'sharedAction' }), 'shared');
    assert.equal(shareOutcome(undefined), 'shared');
    assert.equal(shareOutcome(null), 'shared');
  });

  await test('a real post is counted only after the share sheet was used, and the count is the database\'s own answer', async () => {
    const calls: string[] = [];
    const r = await shareAndRecord({
      share: async () => { calls.push('share'); return { action: 'sharedAction' }; },
      record: async () => { calls.push('record'); return 3; },
    });
    assert.deepEqual(calls, ['share', 'record'], 'the sheet first, the count after');
    assert.deepEqual(r, { outcome: 'shared', count: 3 });
  });

  await test('sample content is never counted: without a record function nothing is sent anywhere', async () => {
    const calls: string[] = [];
    const r = await shareAndRecord({ share: async () => { calls.push('share'); return { action: 'sharedAction' }; } });
    assert.deepEqual(calls, ['share']);
    assert.deepEqual(r, { outcome: 'shared' });
  });

  await test('closing the sheet without sharing counts nothing', async () => {
    let recorded = 0;
    const r = await shareAndRecord({ share: async () => ({ action: 'dismissedAction' }), record: async () => { recorded += 1; return 1; } });
    assert.equal(recorded, 0);
    assert.deepEqual(r, { outcome: 'dismissed' });
    // the web sheet rejects with an AbortError when it is closed
    const web = await shareAndRecord({ share: async () => { throw Object.assign(new Error('Share canceled'), { name: 'AbortError' }); }, record: async () => { recorded += 1; return 1; } });
    assert.deepEqual(web, { outcome: 'dismissed' });
    assert.equal(recorded, 0);
  });

  await test('a sheet that cannot open is a failure, with the error, and counts nothing', async () => {
    let recorded = 0;
    const boom = new Error('Share is not supported in this browser');
    const r = await shareAndRecord({ share: async () => { throw boom; }, record: async () => { recorded += 1; return 1; } });
    assert.equal(recorded, 0);
    assert.deepEqual(r, { outcome: 'failed', error: boom });
  });

  await test('a share that could not be counted (offline, the function is not there yet) is still a share, with no count made up', async () => {
    const rejected = await shareAndRecord({ share: async () => ({ action: 'sharedAction' }), record: async () => { throw new Error('You are offline.'); } });
    assert.deepEqual(rejected, { outcome: 'shared' });
    for (const answer of [null, NaN, -1, undefined] as unknown as (number | null)[]) {
      const r = await shareAndRecord({ share: async () => ({}), record: async () => answer });
      assert.deepEqual(r, { outcome: 'shared' }, String(answer));
    }
    const zero = await shareAndRecord({ share: async () => ({}), record: async () => 0 });
    assert.deepEqual(zero, { outcome: 'shared', count: 0 }, 'a real 0 is a real answer');
  });

  /* ---------------- comments ---------------- */

  await test('commentText: trimmed, and nothing when there is nothing to send or it is too long for the database', () => {
    assert.equal(commentText('  Buen Camino!  '), 'Buen Camino!');
    assert.equal(commentText(''), null);
    assert.equal(commentText('   \n '), null);
    assert.equal(commentText('x'.repeat(COMMENT_MAX)), 'x'.repeat(COMMENT_MAX));
    assert.equal(commentText('x'.repeat(COMMENT_MAX + 1)), null);
    assert.ok(COMMENT_INPUT_MAX <= COMMENT_MAX, 'the sheet never lets more through than the database takes');
    assert.equal(COMMENT_INPUT_MAX, 200, 'the limit Discover has always had');
  });

  const row = (over: Record<string, unknown> = {}) => ({ id: 'c1', user_id: 'u1', body: 'Golden light!', created_at: '2026-11-05T12:00:00Z', author: { username: 'lucas', display_name: 'Lucas' }, ...over });

  await test('parseComments: rows become comments with their author; a result that is not a list is "could not read" (null)', () => {
    const list = parseComments([row(), row({ id: 'c2', author: [{ username: null, display_name: 'Hannah' }] }), row({ id: 'c3', author: null })]);
    assert.ok(list);
    assert.deepEqual(list.map((c) => c.id), ['c1', 'c2', 'c3']);
    assert.deepEqual(list[0].author, { username: 'lucas', display_name: 'Lucas' });
    assert.deepEqual(list[1].author, { username: null, display_name: 'Hannah' }, 'a one-item list of authors is read too');
    assert.equal(list[2].author, null);
    for (const bad of [null, undefined, 'x', 7, {}, { data: [] }]) assert.equal(parseComments(bad), null);
    assert.deepEqual(parseComments([]), []);
  });

  await test('parseComments skips a row that is not complete, so one odd row cannot show up as a comment', () => {
    const list = parseComments([row(), row({ id: '' }), row({ body: '' }), row({ body: 7 }), row({ user_id: null }), row({ created_at: undefined }), null, 'row', 3]);
    assert.ok(list);
    assert.deepEqual(list.map((c) => c.id), ['c1']);
  });

  await test('commentAuthor: @username, else the display name, else "pilgrim"', () => {
    assert.equal(commentAuthor({ author: { username: 'lucas', display_name: 'Lucas' } }), 'lucas');
    assert.equal(commentAuthor({ author: { username: null, display_name: 'Hannah' } }), 'Hannah');
    assert.equal(commentAuthor({ author: { username: null, display_name: null } }), 'pilgrim');
    assert.equal(commentAuthor({ author: null }), 'pilgrim');
  });

  await test('toSheetComments: oldest first (the query returns the newest first), and the person\'s own comments are marked', () => {
    const rows = parseComments([
      row({ id: 'new', created_at: '2026-11-05T14:00:00Z', user_id: 'me', body: 'Thank you both.' }),
      row({ id: 'mid', created_at: '2026-11-05T13:00:00Z', user_id: 'u2', body: 'Buen Camino!' }),
      row({ id: 'old', created_at: '2026-11-05T12:00:00Z' }),
    ])!;
    const sheet = toSheetComments(rows, 'me');
    assert.deepEqual(sheet.map((c) => c.id), ['old', 'mid', 'new']);
    assert.deepEqual(sheet.map((c) => c.mine), [false, false, true]);
    assert.deepEqual(sheet.map((c) => c.text), ['Golden light!', 'Buen Camino!', 'Thank you both.']);
    assert.deepEqual(toSheetComments(rows, null).map((c) => c.mine), [false, false, false], 'nobody is "mine" when nobody is signed in');
    assert.deepEqual(rows.map((c) => c.id), ['new', 'mid', 'old'], 'the rows it was given are not reordered');
  });

  /* ---------------- local love and bookmark of sample content ---------------- */

  await test('parseFavs: the shape Discover has always stored, and nothing for anything else', () => {
    assert.deepEqual(parseFavs({ loved: ['e1'], saved: ['e2', 'e3'] }), { loved: ['e1'], saved: ['e2', 'e3'] });
    assert.deepEqual(parseFavs({ loved: [], saved: [] }), NO_FAVS);
    for (const bad of [null, undefined, 'x', 7, [], {}, { loved: ['a'] }, { saved: ['a'] }, { loved: 'a', saved: [] }]) assert.equal(parseFavs(bad), null, JSON.stringify(bad));
    assert.deepEqual(parseFavs({ loved: ['a', 7, null, 'b'], saved: [{}] }), { loved: ['a', 'b'], saved: [] }, 'only ids stay');
  });

  await test('toggleFav: adds an id that was not there, takes out one that was, and does not change what it is given', () => {
    const start = Object.freeze({ loved: Object.freeze(['e1']) as unknown as string[], saved: Object.freeze([]) as unknown as string[] });
    const loved2 = toggleFav(start, 'loved', 'e2');
    assert.deepEqual(loved2, { loved: ['e1', 'e2'], saved: [] });
    assert.deepEqual(toggleFav(loved2, 'loved', 'e1'), { loved: ['e2'], saved: [] });
    assert.deepEqual(toggleFav(start, 'saved', 'e1'), { loved: ['e1'], saved: ['e1'] }, 'love and bookmark are separate lists');
    assert.deepEqual(toggleFav(toggleFav(NO_FAVS, 'saved', 'x'), 'saved', 'x'), NO_FAVS, 'twice is back to the start');
    assert.deepEqual(NO_FAVS, { loved: [], saved: [] }, 'the shared empty value is never changed');
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
