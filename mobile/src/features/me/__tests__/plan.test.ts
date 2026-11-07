// Plain-node checks of the stage line and the plan progress when a stage has no distance. Run: npm run test:me
import assert from 'node:assert/strict';
import { knownKm, planProgress, stageMeta } from '../plan';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

check('knownKm: a real distance is a number; null, zero, nothing and text that is not a number are not known', () => {
  assert.equal(knownKm(24.2), 24.2);
  assert.equal(knownKm('21.40'), 21.4, 'numeric columns can arrive as text');
  for (const v of [null, undefined, '', 0, '0', -3, 'abc', NaN, Infinity]) assert.equal(knownKm(v as never), null, String(v));
});

check('stageMeta: the places and the kilometres, one decimal', () => {
  assert.equal(stageMeta({ name: 'Roncesvalles to Zubiri', distance_km: 21.4, start: { name: 'Roncesvalles' }, end: { name: 'Zubiri' } }), 'Roncesvalles to Zubiri · 21.4 km');
  assert.equal(stageMeta({ name: 'Zubiri to Pamplona', distance_km: '20.4' }), 'Zubiri to Pamplona · 20.4 km', 'the name when the places are not there');
});

check('stageMeta: no distance means no kilometres, never "0.0 km"', () => {
  assert.equal(stageMeta({ name: 'Pamplona to Puente la Reina', distance_km: null, start: null, end: null }), 'Pamplona to Puente la Reina');
  assert.equal(stageMeta({ name: 'Estella to Los Arcos', distance_km: 0 }), 'Estella to Los Arcos');
  assert.doesNotMatch(stageMeta({ name: 'X to Y', distance_km: null }), /km/);
});

check('planProgress: by kilometres when every day has a distance', () => {
  const p = planProgress([
    { status: 'done', planned_distance_km: 20 },
    { status: 'done', planned_distance_km: '10.5' },
    { status: 'planned', planned_distance_km: 30 },
  ]);
  assert.equal(p.byKm, true);
  assert.equal(p.doneKm, 30.5);
  assert.equal(p.totalKm, 60.5);
  assert.ok(Math.abs(p.value - 30.5 / 60.5) < 1e-9);
  assert.equal(p.doneStages, 2);
  assert.equal(p.totalStages, 3);
});

check('planProgress: with no distances at all it is by stages walked', () => {
  const p = planProgress([{ status: 'done' }, { status: 'planned', planned_distance_km: null }, { status: 'planned' }, { status: 'planned' }]);
  assert.equal(p.byKm, false);
  assert.equal(p.value, 0.25);
  assert.equal(p.totalKm, 0);
});

check('planProgress: some days with kilometres and some without is by stages, not by the kilometres that happen to be known', () => {
  // the first three stages of the Camino Francés have kilometres, the rest do not: three walked of five is 60 %, not 100 %
  const p = planProgress([
    { status: 'done', planned_distance_km: 24.2 },
    { status: 'done', planned_distance_km: 21.4 },
    { status: 'done', planned_distance_km: 20.4 },
    { status: 'planned', planned_distance_km: null },
    { status: 'planned', planned_distance_km: null },
  ]);
  assert.equal(p.byKm, false);
  assert.equal(p.value, 0.6);
  assert.equal(p.doneStages, 3);
  assert.ok(Math.abs(p.doneKm - 66) < 1e-9, 'the known kilometres are still added up');
});

check('planProgress: an empty plan is zero, never NaN', () => {
  const p = planProgress([]);
  assert.equal(p.value, 0);
  assert.equal(p.byKm, false);
  assert.ok(Number.isFinite(p.value));
});

check('the screens use these helpers and not a hand-made "N km" of a distance that may be missing', () => {
  const read = (p: string) => require('node:fs').readFileSync(require('node:path').join(process.cwd(), p), 'utf8') as string;
  for (const f of ['app/onboarding.tsx', 'app/change-camino.tsx']) {
    const src = read(f);
    assert.match(src, /stageMeta\(s\)/, f);
    assert.doesNotMatch(src, /Number\(s\.distance_km\)/, `${f} still turns a missing distance into 0.0 km`);
  }
  const me = read('app/(tabs)/me.tsx');
  assert.match(me, /planProgress\(days\)/);
  assert.doesNotMatch(me, /const total = days\.reduce/, 'the plan tracker must not add up kilometres by hand');
});

console.log(`${n} of ${n} passed`);
