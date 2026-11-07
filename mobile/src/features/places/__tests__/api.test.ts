// The calls for the places of a stage against a scripted stand-in for Supabase: what is asked, and that nothing ever throws
// (offline, a timeout, an error answer, a function the live database does not have yet, an answer that is not a list).
// Run: npm run test:places
import assert from 'node:assert/strict';
import { makePlacesApi, type PlacesClient, type PlacesNet } from '../api';

let n = 0;
// A test that never finishes must fail, not end the process quietly (node exits when nothing is pending, with code 0).
const test = async (name: string, fn: () => Promise<void>) => {
  await Promise.race([fn(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`"${name}" did not finish in 5 s`)), 5000))]);
  n += 1;
  console.log(`ok   ${name}`);
};

const STAGE = '40000000-0000-4000-8000-000000000001';
const STAY = (over: Record<string, unknown> = {}) => ({
  id: '60000000-0000-4000-8000-000000000001', name: 'Albergue de Roncesvalles', category: 'albergue_parochial', kind: 'stay', place_name: 'Roncesvalles',
  lat: 43.0089, lng: -1.3197, phone: null, email: null, website: null, opening_hours: null, address: null, description: null,
  km_from_stage_start: 24.2, detour_m: 0, beds: 183, amenities: [], labels: ['pilgrims_only'], has_stamp: true, data_confidence: null,
  verification_level: 'unverified', verification_at: null, source: 'editorial', osm_type: null, osm_id: null, ...over,
});

type Call = { fn: string; args: Record<string, unknown> } | { table: string; select: string | null; filters: unknown[][] };
type Answer = { data: unknown; error: { message: string } | null };

// The same readings of "offline" as lib/net.ts (it cannot be imported here: it pulls in a native module).
const net = (online = true): PlacesNet => ({
  assertOnline: async () => { if (!online) throw new Error('You are offline.'); },
  isOffline: (e) => /offline|network request failed|failed to fetch|networkerror|retryablefetch|internet/i.test(e instanceof Error ? `${e.name} ${e.message}` : String(e)),
  message: (e) => (e instanceof Error ? e.message : String(e)),
});

function client(script: (call: Call) => Answer | Promise<Answer> | never, log: Call[] = []): PlacesClient {
  return {
    rpc(fn, args) {
      const call = { fn, args };
      log.push(call);
      return { then: (res, rej) => Promise.resolve().then(() => script(call)).then(res, rej) } as PromiseLike<Answer>;
    },
    from(table) {
      const call = { table, select: null as string | null, filters: [] as unknown[][] };
      log.push(call);
      const b = {
        select(cols: string) { call.select = cols; return b; },
        eq(...a: unknown[]) { call.filters.push(['eq', ...a]); return b; },
        is(...a: unknown[]) { call.filters.push(['is', ...a]); return b; },
        in(...a: unknown[]) { call.filters.push(['in', ...a]); return b; },
        not(...a: unknown[]) { call.filters.push(['not', ...a]); return b; },
        order(...a: unknown[]) { call.filters.push(['order', ...a]); return b; },
        limit(...a: unknown[]) { call.filters.push(['limit', ...a]); return { then: (res: (v: Answer) => unknown, rej: (e: unknown) => unknown) => Promise.resolve().then(() => script(call)).then(res, rej) } as PromiseLike<Answer>; },
      };
      return b;
    },
  };
}

(async () => {
  await test('stays: asks list_stage_stays with p_stage and answers parsed rows', async () => {
    const log: Call[] = [];
    const api = makePlacesApi(client(() => ({ data: [STAY()], error: null }), log), net());
    const res = await api.listStageStays(STAGE);
    assert.deepEqual(log, [{ fn: 'list_stage_stays', args: { p_stage: STAGE } }]);
    assert.equal(res.ok, true);
    assert.ok(res.ok && res.rows.length === 1 && res.rows[0].name === 'Albergue de Roncesvalles' && res.rows[0].beds === 183);
  });

  await test('points of interest: asks list_stage_pois with p_stage', async () => {
    const log: Call[] = [];
    const poi = { id: '50000000-0000-4000-8000-000000000001', name: 'Royal Collegiate Church', category: 'church', place_name: null, lat: 43.0092, lng: -1.3193, phone: null, website: null, opening_hours: null, mass_times: null, km_from_stage_start: 24, detour_m: 0, has_stamp: true, data_confidence: null, verification_level: 'unverified', verification_at: null, source: 'editorial', osm_type: null, osm_id: null };
    const api = makePlacesApi(client(() => ({ data: [poi], error: null }), log), net());
    const res = await api.listStagePois(STAGE);
    assert.deepEqual(log, [{ fn: 'list_stage_pois', args: { p_stage: STAGE } }]);
    assert.ok(res.ok && res.rows[0].category === 'church' && res.rows[0].has_stamp === true);
  });

  await test('an empty list is a successful answer (the stage has no places), not a failure', async () => {
    const res = await makePlacesApi(client(() => ({ data: [], error: null })), net()).listStageStays(STAGE);
    assert.deepEqual(res, { ok: true, rows: [] });
  });

  await test('rows that are not usable are skipped, the rest come through', async () => {
    const res = await makePlacesApi(client(() => ({ data: [STAY({ id: 'nope' }), STAY(), STAY({ lat: 'x' })], error: null })), net()).listStageStays(STAGE);
    assert.ok(res.ok && res.rows.length === 1);
  });

  await test('the function is not in the database yet (PGRST202): a failure that is not "offline", never a throw', async () => {
    const message = 'Could not find the function public.list_stage_stays(p_stage) in the schema cache';
    const res = await makePlacesApi(client(() => ({ data: null, error: { message } })), net()).listStageStays(STAGE);
    assert.deepEqual(res, { ok: false, offline: false, message });
  });

  await test('a permission error or a server error is a failure with its message', async () => {
    for (const message of ['permission denied for function list_stage_stays', 'canceling statement due to statement timeout', 'JWT expired']) {
      const res = await makePlacesApi(client(() => ({ data: null, error: { message } })), net()).listStagePois(STAGE);
      assert.deepEqual(res, { ok: false, offline: false, message });
    }
  });

  await test('a dropped connection reported as an error answer counts as offline', async () => {
    for (const message of ['TypeError: Failed to fetch', 'TypeError: Network request failed', 'FetchError: NetworkError when attempting to fetch resource.']) {
      const res = await makePlacesApi(client(() => ({ data: null, error: { message } })), net()).listStageStays(STAGE);
      assert.ok(!res.ok && res.offline === true, message);
    }
  });

  await test('offline: answers at once and never calls the server', async () => {
    const log: Call[] = [];
    const api = makePlacesApi(client(() => ({ data: [STAY()], error: null }), log), net(false));
    const res = await api.listStageStays(STAGE);
    assert.ok(!res.ok && res.offline === true);
    assert.deepEqual(log, []);
    assert.equal(await api.getPlanStage('j1'), 'failed');
    assert.deepEqual(log, []);
  });

  await test('a call that throws is a failure, not an exception', async () => {
    const boom = makePlacesApi(client(() => { throw new Error('boom'); }), net());
    assert.deepEqual(await boom.listStageStays(STAGE), { ok: false, offline: false, message: 'boom' });
    const fetchFail = makePlacesApi(client(() => { throw new TypeError('Failed to fetch'); }), net());
    const res = await fetchFail.listStagePois(STAGE);
    assert.ok(!res.ok && res.offline === true);
    const weird = makePlacesApi(client(() => { throw 'a string'; }), net()); // eslint-disable-line no-throw-literal
    assert.ok(!(await weird.listStageStays(STAGE)).ok);
  });

  await test('an answer that is not a list (the function is not what the app expects) is a failure', async () => {
    for (const data of [null, undefined, {}, 'ok', 42, { rows: [] }]) {
      const res = await makePlacesApi(client(() => ({ data, error: null })), net()).listStageStays(STAGE);
      assert.ok(!res.ok && res.offline === false && /list of places/.test(res.message), JSON.stringify(data));
    }
    // and a script that answers nothing at all
    const none = await makePlacesApi(client(() => undefined as unknown as Answer), net()).listStageStays(STAGE);
    assert.ok(!none.ok);
  });

  await test('a server that never answers is given up on after the timeout', async () => {
    const api = makePlacesApi(client(() => new Promise<Answer>(() => {})), net(), { timeoutMs: 25 });
    const t0 = Date.now();
    const res = await api.listStageStays(STAGE);
    assert.ok(!res.ok && /too long/.test(res.message) && res.offline === false);
    assert.ok(Date.now() - t0 < 1500, 'it came back soon');
    const slow = makePlacesApi(client(() => new Promise<Answer>((r) => setTimeout(() => r({ data: [STAY()], error: null }), 5))), net(), { timeoutMs: 500 });
    assert.ok((await slow.listStageStays(STAGE)).ok, 'an answer inside the limit is used');
  });

  await test('the plan stage: the next planned or running day with a stage, read with one small query', async () => {
    const log: Call[] = [];
    const api = makePlacesApi(client(() => ({ data: [{ stage_id: STAGE.toUpperCase(), day_number: 3, status: 'planned', stage: { name: '  Roncesvalles\nto Zubiri ' } }], error: null }), log), net());
    assert.deepEqual(await api.getPlanStage('j1'), { journeyId: 'j1', stageId: STAGE, stageName: 'Roncesvalles to Zubiri' });
    assert.deepEqual(log, [{
      table: 'journey_days',
      select: 'stage_id, day_number, status, stage:stages(name)',
      filters: [['eq', 'journey_id', 'j1'], ['is', 'deleted_at', null], ['in', 'status', ['planned', 'in_progress']], ['not', 'stage_id', 'is', null], ['order', 'day_number'], ['limit', 1]],
    }]);
  });

  await test('the plan stage: no day left is null (the walk is over), a stage without a name keeps the id', async () => {
    assert.equal(await makePlacesApi(client(() => ({ data: [], error: null })), net()).getPlanStage('j1'), null);
    const nameless = await makePlacesApi(client(() => ({ data: [{ stage_id: STAGE, day_number: 1, status: 'planned', stage: null }], error: null })), net()).getPlanStage('j1');
    assert.deepEqual(nameless, { journeyId: 'j1', stageId: STAGE, stageName: null });
  });

  await test('the plan stage: an error, a throw, a timeout or an odd row is "failed", never an exception', async () => {
    const failed = async (script: () => Answer | Promise<Answer>, opts = {}) => makePlacesApi(client(script), net(), opts).getPlanStage('j1');
    assert.equal(await failed(() => ({ data: null, error: { message: 'x' } })), 'failed');
    assert.equal(await failed(() => ({ data: {}, error: null })), 'failed');
    assert.equal(await failed(() => ({ data: [{ stage_id: 'nope' }], error: null })), 'failed');
    assert.equal(await failed(() => ({ data: [{ stage_id: 7 }], error: null })), 'failed');
    assert.equal(await failed(() => ({ data: [null], error: null })), 'failed');
    assert.equal(await failed(() => { throw new Error('boom'); }), 'failed');
    assert.equal(await failed(() => new Promise<Answer>(() => {}), { timeoutMs: 20 }), 'failed');
  });

  console.log(`${n} of ${n} passed`);
})().catch((e) => { console.error(e); process.exit(1); });
