// Plain-node checks for the Walk view maths (nav.ts). Run: npm run test:map
import './lineShim'; // first: it lets the compiled sampleRoute find the OSM lines in assets/map/lines
import assert from 'node:assert/strict';
import { distanceM, lineLengthM, pointAlong, type LngLat } from '../geo';
import {
  DEFAULT_WALK_SPEED_MPS, EMPTY_TRACK, angleDiff, arrivalClock, bannerFor, bearingDeg, cardFor, classifyTurn, cumulative, etaMinutes, formatDistance,
  formatDuration, isNight, lineTotalM, nextManeuver, nextOnTheWay, normDeg, pointAtAlong, progressAlong, remainingToStageEnd, roundForTurn, routeAhead, routeBearingAt,
  sliceAlong, smoothHeading, stageEnds, sunElevationDeg, sunTimes, updateTrack, walkingSpeedMps,
} from '../nav';
import { pois, routeLine, samplePosition, stageForPoint, stages, towns } from '../sampleRoute';

let n = 0;
const test = (name: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok ${n} - ${name}`);
};
const near = (a: number, b: number, tol: number, msg?: string) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} is not within ${tol} of ${b}`);

// A flat test world: metres east (x) and north (y) of a point in Navarra.
const BASE: LngLat = [-1.5, 42.9];
const M_LAT = (2 * Math.PI * 6371008.8) / 360;
const off = (x: number, y: number): LngLat => [BASE[0] + x / (M_LAT * Math.cos((BASE[1] * Math.PI) / 180)), BASE[1] + y / M_LAT];
const path = (...pts: [number, number][]) => pts.map(([x, y]) => off(x, y));
const heading = (deg: number, len: number): [number, number] => [Math.sin((deg * Math.PI) / 180) * len, Math.cos((deg * Math.PI) / 180) * len];
/** Straight north for `first` metres, then a bend of `turn` degrees (positive = right) for `second` more metres. */
const bend = (turn: number, first = 300, second = 700) => {
  const [dx, dy] = heading(turn, second);
  return path([0, 0], [0, first], [dx, first + dy]);
};

/* ---------------------------------------------------------------- bearings */

test('normDeg and angleDiff take the short way round', () => {
  assert.equal(normDeg(-10), 350);
  assert.equal(normDeg(725), 5);
  assert.equal(angleDiff(350, 10), 20);
  assert.equal(angleDiff(10, 350), -20);
  assert.equal(angleDiff(0, 90), 90);
  assert.equal(angleDiff(90, 0), -90);
  assert.equal(angleDiff(0, 180), 180);
  assert.equal(angleDiff(200, 200), 0);
});

test('bearingDeg: north, east, south, west and a diagonal', () => {
  const a: LngLat = [-1.5, 42.9];
  near(bearingDeg(a, [-1.5, 43.0]), 0, 0.01);
  near(bearingDeg(a, [-1.4, 42.9]), 90, 0.2);
  near(bearingDeg(a, [-1.5, 42.8]), 180, 0.01);
  near(bearingDeg(a, [-1.6, 42.9]), 270, 0.2);
  const ne = bearingDeg(off(0, 0), off(1000, 1000));
  near(ne, 45, 0.05);
});

test('smoothHeading moves part of the way and wraps through north', () => {
  assert.equal(smoothHeading(null, 123), 123);
  near(smoothHeading(350, 10, 0.5), 0, 1e-9);
  near(smoothHeading(10, 350, 0.5), 0, 1e-9);
  near(smoothHeading(90, 100, 0.4), 94, 1e-9);
  assert.equal(smoothHeading(40, 200, 0), 40);
  near(smoothHeading(40, 200, 1), 200, 1e-9);
  near(smoothHeading(0, 180, 0.5), 90, 1e-9, 'a half turn goes the positive way, not both');
});

/* ---------------------------------------------------------------- along the route */

test('progressAlong, pointAtAlong and sliceAlong agree on a simple line', () => {
  const line = path([0, 0], [0, 1000], [1000, 1000]);
  near(lineTotalM(line), 2000, 2);
  const pos = progressAlong(line, off(30, 400)); // 30 m east of the first leg, 400 m up it
  near(pos.alongM, 400, 2);
  near(pos.offM, 30, 1);
  assert.equal(pos.index, 0);
  const p = pointAtAlong(line, 1500);
  near(distanceM(p.point, off(500, 1000)), 0, 1);
  assert.equal(p.index, 1);
  const s = sliceAlong(line, 400, 1500);
  near(lineLengthM(s), 1100, 2);
  assert.equal(s.length, 3, 'start, the corner, end');
  assert.deepEqual(sliceAlong(line, 5000, 6000).length, 2, 'past the end: two equal points, still a valid line');
  const ahead = routeAhead(line, pos, 300);
  near(lineLengthM(ahead), 300, 1);
  near(lineLengthM(routeAhead(line, pos)), 1600, 2);
  assert.equal(cumulative(line)[0], 0);
});

test('routeBearingAt follows the line direction', () => {
  const line = path([0, 0], [0, 1000], [1000, 1000]);
  near(routeBearingAt(line, 100) as number, 0, 0.1);
  near(routeBearingAt(line, 1500) as number, 90, 0.2);
  assert.equal(routeBearingAt([off(0, 0)], 0), null);
});

/* ---------------------------------------------------------------- maneuvers */

test('classifyTurn names turns by size', () => {
  assert.equal(classifyTurn(10), 'straight');
  assert.equal(classifyTurn(-34), 'straight');
  assert.equal(classifyTurn(36), 'slight-right');
  assert.equal(classifyTurn(-45), 'slight-left');
  assert.equal(classifyTurn(90), 'right');
  assert.equal(classifyTurn(-90), 'left');
  assert.equal(classifyTurn(140), 'sharp-right');
  assert.equal(classifyTurn(-150), 'sharp-left');
  assert.equal(classifyTurn(175), 'u-turn');
  assert.equal(classifyTurn(-180), 'u-turn');
});

test('nextManeuver: a straight road stays straight for the whole look-ahead', () => {
  const m = nextManeuver(path([0, 0], [0, 2000]), 0);
  assert.equal(m.kind, 'straight');
  assert.equal(m.distanceM, 400);
});

test('nextManeuver: right and left turns 300 m ahead', () => {
  const r = nextManeuver(bend(90), 0);
  assert.equal(r.kind, 'right');
  near(r.distanceM, 300, 8, 'distance to the corner');
  near(r.turnDeg, 90, 3);
  const l = nextManeuver(bend(-90), 0);
  assert.equal(l.kind, 'left');
  near(l.distanceM, 300, 8);
  near(l.turnDeg, -90, 3);
});

test('nextManeuver: slight, sharp and u-turns', () => {
  assert.equal(nextManeuver(bend(45), 0).kind, 'slight-right');
  assert.equal(nextManeuver(bend(-45), 0).kind, 'slight-left');
  assert.equal(nextManeuver(bend(140), 0).kind, 'sharp-right');
  assert.equal(nextManeuver(bend(-140), 0).kind, 'sharp-left');
  assert.equal(nextManeuver(bend(180), 0).kind, 'u-turn');
});

test('nextManeuver: a 36 degree bend is still found, with the corner about where it is', () => {
  const m = nextManeuver(bend(36), 0);
  assert.equal(m.kind, 'slight-right');
  near(m.distanceM, 300, 8);
});

test('nextManeuver: bends under 35 degrees are straight on', () => {
  assert.equal(nextManeuver(bend(20), 0).kind, 'straight');
  assert.equal(nextManeuver(bend(-30), 0).kind, 'straight');
});

test('nextManeuver: the corner counts down as the walker approaches, and is not repeated once passed', () => {
  const line = bend(90, 300, 700);
  near(nextManeuver(line, 100).distanceM, 200, 8);
  near(nextManeuver(line, 250).distanceM, 50, 8);
  const at295 = nextManeuver(line, 295);
  assert.equal(at295.kind, 'right');
  assert.ok(at295.distanceM <= 10);
  assert.equal(nextManeuver(line, 340).kind, 'straight', 'already turned');
  // A corner just behind the walker must not come back as a new turn (this is where a baseline from the last 20 m goes wrong).
  for (const past of [3, 8, 12, 20, 30]) assert.equal(nextManeuver(line, 300 + past).kind, 'straight', `${past} m past the corner`);
  for (const past of [3, 12, 25]) assert.equal(nextManeuver(bend(-90, 300, 700), 300 + past).kind, 'straight', `${past} m past a left corner`);
});

test('nextManeuver: two corners in a row, the nearer one first, then the next once it is behind', () => {
  // north 200 m, east 150 m, north again 600 m
  const line = path([0, 0], [0, 200], [150, 200], [150, 800]);
  const first = nextManeuver(line, 0);
  assert.equal(first.kind, 'right');
  near(first.distanceM, 200, 8);
  // 20 m past the first corner the second (a left turn, 130 m further) is the next one
  const second = nextManeuver(line, 220);
  assert.equal(second.kind, 'left');
  near(second.distanceM, 130, 10);
  assert.equal(nextManeuver(line, 380).kind, 'straight');
});

test('nextManeuver: only looks 400 m ahead', () => {
  const m = nextManeuver(bend(90, 500, 700), 0);
  assert.equal(m.kind, 'straight');
  assert.equal(nextManeuver(bend(90, 500, 700), 120).kind, 'right', 'now 380 m away');
});

test('nextManeuver: GPS-style zig-zag (+-3 m every 10 m) is not a turn', () => {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 100; i++) pts.push([i % 2 ? 3 : -3, i * 10]);
  assert.equal(nextManeuver(path(...pts), 0).kind, 'straight');
});

test('nextManeuver: arrive at the end of the stage, and no turn is reported past it', () => {
  const line = path([0, 0], [0, 250]);
  const a = nextManeuver(line, 0, 250);
  assert.equal(a.kind, 'arrive');
  near(a.distanceM, 250, 1);
  assert.equal(nextManeuver(line, 235, 250).kind, 'arrive');
  // The route bends right after the stage end: that turn belongs to the next stage.
  const beyond = bend(90, 250, 700);
  assert.equal(nextManeuver(beyond, 0, 250).kind, 'arrive');
  assert.equal(nextManeuver(beyond, 0).kind, 'right', 'without a stage end the bend is a turn');
});

test('nextManeuver on the real route of stage 1: every corner it names is a corner of the line, never past the stage end, then arrive', () => {
  // (The test used to check one bend of 36 degrees on the 10 hand-placed points of the stage; the OSM line has about 300 and winds, so
  // what is checked is what must hold on any line: the turn it names is the turn the line makes where it says, and it is a real one.)
  const stage = stages[0];
  const end = progressAlong(routeLine, stage.line[stage.line.length - 1]).alongM;
  const turnAt = (m: number) => angleDiff(bearingDeg(pointAtAlong(routeLine, m - 40).point, pointAtAlong(routeLine, m).point), bearingDeg(pointAtAlong(routeLine, m).point, pointAtAlong(routeLine, m + 40).point));
  let corners = 0;
  for (let along = 0; along < end - 500; along += 53) {
    const m = nextManeuver(routeLine, along, end);
    // it looks 400 m ahead and names the top of the turn it finds there, up to 60 m further on
    assert.ok(m.distanceM >= 0 && m.distanceM <= 460 && along + m.distanceM <= end, `at ${along}: ${m.kind} in ${m.distanceM} m`);
    if (m.kind === 'straight') {
      assert.equal(m.turnDeg, 0);
      continue;
    }
    corners += 1;
    assert.ok(Math.abs(m.turnDeg) >= 35 && m.kind === classifyTurn(m.turnDeg), `at ${along}: ${m.kind} ${m.turnDeg}`);
    near(turnAt(along + m.distanceM), m.turnDeg, 1, `at ${along}: the turn at the place it names`);
  }
  assert.ok(corners > 100, `a path that winds has corners to name, found ${corners} of ${Math.floor((end - 500) / 53)}`);
  assert.equal(nextManeuver(routeLine, 9000, end).kind, 'straight', 'the sample position: nothing to turn at in the next 400 m');
  const arr = nextManeuver(routeLine, end - 20, end);
  assert.equal(arr.kind, 'arrive');
  near(arr.distanceM, 20, 1);
});

/* ---------------------------------------------------------------- sample route progress */

test('stage end along the route: remaining + walked = the stage end, and the sample position is 9 km in', () => {
  const stage = stageForPoint(samplePosition);
  assert.equal(stage.number, 1);
  const pos = progressAlong(routeLine, samplePosition);
  near(pos.alongM, 9000, 5);
  const end = progressAlong(routeLine, stage.line[stage.line.length - 1]);
  near(end.offM, 0, 0.01);
  near(end.alongM, lineLengthM(stage.line), 2, 'stage 1 ends where its own line ends');
  const remaining = end.alongM - pos.alongM;
  near(remaining, lineLengthM(stage.line) - 9000, 10);
  assert.ok(Math.abs(remaining + pos.alongM - end.alongM) < 1e-6);
});

test('remainingToStageEnd: distance along the route to the end of the stage, never negative', () => {
  const stage = stages[0];
  const end = stage.line[stage.line.length - 1];
  const stageLen = lineLengthM(stage.line);
  const here = remainingToStageEnd(routeLine, samplePosition, end);
  near(here.pos.alongM, 9000, 5);
  near(here.remainingM, stageLen - 9000, 10);
  near(here.endAlongM, stageLen, 1);
  // 1 km off the route: measured from the point of the route nearest to the walker
  const off1km: LngLat = [samplePosition[0] + 0.0123, samplePosition[1]];
  const offRoute = remainingToStageEnd(routeLine, off1km, end);
  assert.ok(offRoute.pos.offM > 800 && offRoute.pos.offM < 1100);
  assert.ok(Math.abs(offRoute.remainingM - (stageLen - 9000)) < 900, `snapped remaining ${offRoute.remainingM}`);
  // past the end of the stage (in stage 2): 0 left, not a negative number
  const stage2 = pointAlong(routeLine, stageLen + 1000);
  assert.equal(remainingToStageEnd(routeLine, stage2, end).remainingM, 0);
  // at the very start of the stage the whole stage is left
  near(remainingToStageEnd(routeLine, stage.line[0], end).remainingM, lineLengthM(stage.line), 5);
});

test('nextOnTheWay lists the next places ahead with distances along the route', () => {
  const pos = progressAlong(routeLine, samplePosition);
  const items = [
    ...towns.map((t) => ({ key: `t-${t.name}`, name: t.name, kind: 'town', at: t.at })),
    ...pois.map((p) => ({ key: p.id, name: p.name, kind: p.kind, at: p.at })),
  ];
  const next = nextOnTheWay(routeLine, pos.alongM, items, 3);
  assert.equal(next.length, 3);
  assert.deepEqual(next.map((x) => x.name), ['Fontaine de Roland', 'Col de Lepoeder', 'Roncesvalles'], 'a town wins over the pins inside it');
  assert.ok(next[0].distanceM > 0 && next[0].distanceM < next[1].distanceM && next[1].distanceM < next[2].distanceM);
  near(next[2].distanceM, lineLengthM(stages[0].line) - 9000, 60);
  const all = nextOnTheWay(routeLine, pos.alongM, items, 99, 0);
  assert.ok(all.every((x) => x.distanceM > 0), 'nothing behind the walker');
  assert.ok(!all.some((x) => x.name === 'Refuge Orisson'), 'already passed');
  const none = nextOnTheWay(routeLine, 99_999_999, items, 3);
  assert.deepEqual(none, []);
});

/* ---------------------------------------------------------------- speed, time, formatting */

test('walkingSpeedMps uses the walker only when believable', () => {
  assert.equal(walkingSpeedMps(1.4), 1.4);
  assert.equal(walkingSpeedMps(0.6), 0.6);
  assert.equal(walkingSpeedMps(2.2), 2.2);
  assert.equal(walkingSpeedMps(0.59), DEFAULT_WALK_SPEED_MPS);
  assert.equal(walkingSpeedMps(2.3), DEFAULT_WALK_SPEED_MPS);
  assert.equal(walkingSpeedMps(0), DEFAULT_WALK_SPEED_MPS);
  assert.equal(walkingSpeedMps(null), DEFAULT_WALK_SPEED_MPS);
  assert.equal(walkingSpeedMps(NaN), DEFAULT_WALK_SPEED_MPS);
  near(DEFAULT_WALK_SPEED_MPS * 3.6, 4.0, 1e-9);
});

test('etaMinutes', () => {
  near(etaMinutes(4000, 4 / 3.6), 60, 1e-9);
  near(etaMinutes(0, 1.4), 0, 1e-9);
  assert.equal(etaMinutes(-5, 1.4), 0);
  assert.equal(etaMinutes(100, 0), Infinity);
});

test('formatDuration: 0, under a minute, 59 min, 1 h, 1 h 20 min, 2 h 5 min', () => {
  assert.equal(formatDuration(0), '0 min');
  assert.equal(formatDuration(-3), '0 min');
  assert.equal(formatDuration(NaN), '0 min');
  assert.equal(formatDuration(0.2), '1 min');
  assert.equal(formatDuration(1), '1 min');
  assert.equal(formatDuration(1.4), '1 min');
  assert.equal(formatDuration(1.6), '2 min');
  assert.equal(formatDuration(59), '59 min');
  assert.equal(formatDuration(59.4), '59 min');
  assert.equal(formatDuration(59.6), '1 h');
  assert.equal(formatDuration(60), '1 h');
  assert.equal(formatDuration(80), '1 h 20 min');
  assert.equal(formatDuration(125), '2 h 5 min');
  assert.equal(formatDuration(119.7), '2 h');
  assert.equal(formatDuration(5 * 60 + 10), '5 h 10 min');
});

test('formatDistance: 0 m, 999 m, 1.0 km, 5.3 km, 12.4 km', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(-4), '0 m');
  assert.equal(formatDistance(NaN), '0 m');
  assert.equal(formatDistance(0.4), '0 m');
  assert.equal(formatDistance(1), '1 m');
  assert.equal(formatDistance(60), '60 m');
  assert.equal(formatDistance(999), '999 m');
  assert.equal(formatDistance(999.4), '999 m');
  assert.equal(formatDistance(999.6), '1.0 km');
  assert.equal(formatDistance(1000), '1.0 km');
  assert.equal(formatDistance(1049), '1.0 km');
  assert.equal(formatDistance(5250), '5.3 km');
  assert.equal(formatDistance(9940), '9.9 km');
  assert.equal(formatDistance(9960), '10.0 km');
  assert.equal(formatDistance(12_400), '12.4 km');
  assert.equal(formatDistance(99_940), '99.9 km');
  assert.equal(formatDistance(99_960), '100 km');
  assert.equal(formatDistance(123_456), '123 km');
});

test('roundForTurn: the way a person says it', () => {
  assert.equal(roundForTurn(0), 0);
  assert.equal(roundForTurn(14), 0);
  assert.equal(roundForTurn(18), 20);
  assert.equal(roundForTurn(123), 120);
  assert.equal(roundForTurn(299), 300);
  assert.equal(roundForTurn(310), 300);
  assert.equal(roundForTurn(380), 400);
  assert.equal(roundForTurn(1234), 1200);
});

test('arrivalClock is the device clock plus the same whole minutes the card shows', () => {
  const t = new Date(2026, 10, 6, 14, 30, 45); // local time, whatever the machine's zone
  assert.equal(arrivalClock(t, 72), '15:42');
  assert.equal(arrivalClock(t, 71.6), '15:42');
  assert.equal(arrivalClock(t, 0), '14:30');
  assert.equal(arrivalClock(t, 0.2), '14:31', 'under a minute reads as 1 min');
  assert.equal(arrivalClock(new Date(2026, 10, 6, 23, 50), 30), '00:20');
  assert.equal(arrivalClock(new Date(2026, 10, 6, 6, 5), 5), '06:10');
});

/* ---------------------------------------------------------------- following the walker */

test('updateTrack: GPS course while moving is smoothed, speed is smoothed', () => {
  let t = updateTrack(EMPTY_TRACK, { at: off(0, 0), t: 0, courseDeg: 90, speedMps: 1.4 });
  assert.equal(t.speedMps, 1.4);
  assert.equal(t.headingDeg, 90, 'the first course seeds the heading');
  t = updateTrack(t, { at: off(30, 0), t: 20_000, courseDeg: 90, speedMps: 1.5 });
  assert.equal(t.headingDeg, 90);
  near(t.speedMps as number, 1.43, 1e-9);
  t = updateTrack(t, { at: off(60, 0), t: 40_000, courseDeg: 130, speedMps: 1.5 });
  near(t.headingDeg as number, 110, 1e-9, 'halfway to the new course');
});

test('updateTrack: standing still keeps the last heading, even when the course is garbage', () => {
  let t = updateTrack(EMPTY_TRACK, { at: off(0, 0), t: 0, courseDeg: 40, speedMps: 1.4 }, 40);
  t = updateTrack(t, { at: off(0, 30), t: 20_000, courseDeg: 40, speedMps: 1.4 }, 40);
  const before = t.headingDeg;
  t = updateTrack(t, { at: off(1, 30), t: 40_000, courseDeg: 200, speedMps: 0.1 }, 40);
  assert.equal(t.headingDeg, before);
  t = updateTrack(t, { at: off(0, 31), t: 60_000, courseDeg: 270, speedMps: null }, 40);
  assert.equal(t.headingDeg, before, 'no speed: derived from a 1 m move in 20 s = standing still');
});

test('updateTrack: no GPS course, so the bearing between fixes, else the route direction', () => {
  let t = updateTrack(EMPTY_TRACK, { at: off(0, 0), t: 0, courseDeg: -1, speedMps: null }, 100);
  assert.equal(t.headingDeg, 100, 'the route seeds the first heading');
  t = updateTrack(t, { at: off(0, 30), t: 20_000, courseDeg: -1, speedMps: null, accuracyM: 20 }, 100);
  near(t.headingDeg as number, 50, 1e-6, 'moved 30 m north in 20 s: halfway from 100 to 0 through 50');
  // Moved, but less than the accuracy: the route direction nudges instead.
  let u = updateTrack(EMPTY_TRACK, { at: off(0, 0), t: 0, speedMps: 1.2 }, 100);
  u = updateTrack(u, { at: off(0, 20), t: 20_000, speedMps: 1.2, accuracyM: 80 }, 100);
  assert.ok((u.headingDeg as number) > 60 && (u.headingDeg as number) <= 100);
});

test('updateTrack: speed from distance over time when the fix has none, ignoring stale gaps', () => {
  let t = updateTrack(EMPTY_TRACK, { at: off(0, 0), t: 0 });
  t = updateTrack(t, { at: off(0, 28), t: 20_000 });
  near(t.speedMps as number, 1.4, 0.01);
  const u = updateTrack(t, { at: off(0, 5000), t: 20_000 + 600_000 });
  assert.equal(u.speedMps, t.speedMps, 'ten minutes between fixes says nothing about walking speed');
});

/* ---------------------------------------------------------------- banner and card text */

test('stageEnds splits a stage name', () => {
  assert.deepEqual(stageEnds('Zubiri → Pamplona'), { from: 'Zubiri', to: 'Pamplona' });
  assert.deepEqual(stageEnds('Saint-Jean-Pied-de-Port → Roncesvalles'), { from: 'Saint-Jean-Pied-de-Port', to: 'Roncesvalles' });
  assert.deepEqual(stageEnds('Only one name'), { from: '', to: 'Only one name' });
});

const base = { maneuver: null, toward: 'Roncesvalles', stageTo: 'Roncesvalles', stageNumber: 1, remainingM: 5300, offM: null } as const;

test('banner: straight on says toward the next town, a turn says how far', () => {
  const s = bannerFor({ ...base, state: 'walking', maneuver: { kind: 'straight', distanceM: 400, turnDeg: 0 } });
  assert.equal(s.main, 'Toward Roncesvalles');
  assert.equal(s.sub, '5.3 km to go · stage 1');
  assert.equal(s.kind, 'straight');
  const t = bannerFor({ ...base, state: 'walking', maneuver: { kind: 'left', distanceM: 123, turnDeg: -90 } });
  assert.equal(t.main, 'Turn left in 120 m');
  assert.equal(t.sub, '5.3 km to Roncesvalles · stage 1');
  assert.equal(t.kind, 'left');
  assert.equal(bannerFor({ ...base, state: 'walking', maneuver: { kind: 'slight-right', distanceM: 380, turnDeg: 40 } }).main, 'Bear right in 400 m');
  assert.equal(bannerFor({ ...base, state: 'walking', maneuver: { kind: 'sharp-left', distanceM: 10, turnDeg: -140 } }).main, 'Turn sharp left now');
  assert.equal(bannerFor({ ...base, state: 'walking', maneuver: { kind: 'u-turn', distanceM: 60, turnDeg: 180 } }).main, 'Turn around in 60 m');
});

test('banner: next town different from the end of the stage', () => {
  const b = bannerFor({ ...base, state: 'walking', toward: 'Orisson', maneuver: { kind: 'straight', distanceM: 400, turnDeg: 0 } });
  assert.equal(b.main, 'Toward Orisson');
  assert.equal(b.sub, '5.3 km to Roncesvalles · stage 1');
});

test('banner: arriving', () => {
  const far = bannerFor({ ...base, state: 'walking', remainingM: 300, maneuver: { kind: 'arrive', distanceM: 300, turnDeg: 0 } });
  assert.equal(far.main, 'Arrive at Roncesvalles');
  assert.equal(far.sub, '300 m to go · stage 1');
  assert.equal(far.kind, 'arrive');
  const here = bannerFor({ ...base, state: 'walking', remainingM: 12, maneuver: { kind: 'arrive', distanceM: 12, turnDeg: 0 } });
  assert.equal(here.main, 'Arrive at Roncesvalles');
  assert.equal(here.sub, 'End of stage 1');
});

test('banner: no position is said honestly and never invents a direction', () => {
  const w = bannerFor({ ...base, state: 'waiting', remainingM: null });
  assert.equal(w.main, 'Waiting for your position');
  assert.equal(w.kind, 'none');
  assert.match(w.sub, /sample position/);
  const d = bannerFor({ ...base, state: 'denied', remainingM: null });
  assert.equal(d.main, 'Location is off');
  const away = bannerFor({ ...base, state: 'away', remainingM: null, offM: 3200 });
  assert.equal(away.main, 'You are not on the Camino yet');
  assert.equal(away.sub, '3.2 km from the route');
  const back = bannerFor({ ...base, state: 'back', offM: 240 });
  assert.equal(back.main, 'Head back to the Camino');
  assert.equal(back.sub, '240 m to the route');
});

test('card: time left at the walker speed (or 4 km/h), distance and arrival', () => {
  const now = new Date(2026, 10, 6, 14, 30, 0);
  const slow = cardFor({ live: true, remainingM: 5300, speedMps: null, stageDistanceKm: 24.2, stageNumber: 3, stageName: 'Zubiri → Pamplona', now });
  assert.equal(slow.time, '1 h 20 min', '5.3 km at 4 km/h is 79.5 minutes');
  assert.equal(slow.detail, '5.3 km · arrives 15:50');
  assert.equal(slow.stage, 'Stage 3 · Zubiri to Pamplona');
  const quick = cardFor({ live: true, remainingM: 5300, speedMps: 1.5, stageDistanceKm: 24.2, stageNumber: 3, stageName: 'Zubiri → Pamplona', now });
  assert.equal(quick.time, '59 min');
  assert.equal(quick.arrival, '15:29');
  const resting = cardFor({ live: true, remainingM: 5300, speedMps: 0.1, stageDistanceKm: 24.2, stageNumber: 3, stageName: 'Zubiri → Pamplona', now });
  assert.equal(resting.time, '1 h 20 min', 'a resting walker is not a 3 day ETA');
  const done = cardFor({ live: true, remainingM: 0, speedMps: null, stageDistanceKm: 24.2, stageNumber: 3, stageName: 'Zubiri → Pamplona', now });
  assert.equal(done.time, '0 min');
  assert.equal(done.detail, '0 m · arrives 14:30');
});

test('card: a sample position gets "--" and the length of the stage, never an ETA', () => {
  const now = new Date(2026, 10, 6, 14, 30, 0);
  const c = cardFor({ live: false, remainingM: 11275, speedMps: 1.4, stageDistanceKm: 24.2, stageNumber: 1, stageName: 'Saint-Jean-Pied-de-Port → Roncesvalles', now });
  assert.equal(c.time, '--');
  assert.equal(c.detail, '24.2 km stage');
  assert.equal(c.etaMin, null);
  assert.equal(c.arrival, null);
  assert.doesNotMatch(c.detail, /arrives/);
  assert.equal(c.stage, 'Stage 1 · Saint-Jean-Pied-de-Port to Roncesvalles');
});

/* ---------------------------------------------------------------- the sun */

const PAMPLONA: LngLat = [-1.6432, 42.8169];
const at = (iso: string) => new Date(iso);
const secOf = (iso: string) => Date.parse(iso);

test('sunTimes matches an independent almanac (astral 3.2) within 90 s', () => {
  // [place, lat, lng, date, sunrise UTC, sunset UTC]
  const refs: [string, number, number, string, string, string][] = [
    ['Pamplona', 42.8169, -1.6432, '2026-11-06', '06:47:08', '16:52:38'],
    ['Pamplona', 42.8169, -1.6432, '2026-06-21', '04:28:26', '19:48:20'],
    ['Pamplona', 42.8169, -1.6432, '2026-12-21', '07:34:11', '16:35:06'],
    ['Pamplona', 42.8169, -1.6432, '2026-03-20', '06:10:17', '18:18:27'],
    ['Santiago', 42.8806, -8.5446, '2026-11-06', '07:14:54', '17:20:05'],
    ['Santiago', 42.8806, -8.5446, '2026-06-21', '04:55:49', '20:16:11'],
    ['Madrid', 40.4168, -3.7038, '2026-03-20', '06:18:38', '18:26:31'],
    ['Madrid', 40.4168, -3.7038, '2026-12-21', '07:34:36', '16:51:10'],
  ];
  for (const [name, lat, lng, d, rise, set] of refs) {
    const t = sunTimes(at(`${d}T12:00:00Z`), lat, lng);
    assert.equal(t.polar, null);
    near((t.sunrise as number) / 1000, secOf(`${d}T${rise}Z`) / 1000, 90, `${name} ${d} sunrise`);
    near((t.sunset as number) / 1000, secOf(`${d}T${set}Z`) / 1000, 90, `${name} ${d} sunset`);
  }
});

test('isNight at Pamplona on 6 Nov 2026 (sunrise 06:47 UTC, sunset 16:52 UTC, twilight counts as day)', () => {
  const night = (iso: string) => isNight(at(iso), PAMPLONA[1], PAMPLONA[0]);
  assert.equal(night('2026-11-06T02:00:00Z'), true);
  assert.equal(night('2026-11-06T06:10:00Z'), true, '37 min before sunrise');
  assert.equal(night('2026-11-06T06:25:00Z'), false, '22 min before sunrise: first light');
  assert.equal(night('2026-11-06T06:50:00Z'), false);
  assert.equal(night('2026-11-06T12:00:00Z'), false);
  assert.equal(night('2026-11-06T16:50:00Z'), false);
  assert.equal(night('2026-11-06T17:15:00Z'), false, '22 min after sunset: still twilight');
  assert.equal(night('2026-11-06T17:30:00Z'), true, '37 min after sunset');
  assert.equal(night('2026-11-06T23:59:00Z'), true);
  assert.equal(night('2026-11-07T00:30:00Z'), true);
});

test('isNight in midsummer: long days (sunrise 04:28 UTC, sunset 19:48 UTC)', () => {
  const night = (iso: string) => isNight(at(iso), PAMPLONA[1], PAMPLONA[0]);
  assert.equal(night('2026-06-21T03:50:00Z'), true);
  assert.equal(night('2026-06-21T04:05:00Z'), false);
  assert.equal(night('2026-06-21T20:10:00Z'), false);
  assert.equal(night('2026-06-21T20:30:00Z'), true);
});

test('isNight uses the place, not the device: same instant, opposite sides of the world', () => {
  const t = at('2026-11-06T22:00:00Z'); // 23:00 in Spain, 09:00 next morning in Sydney
  assert.equal(isNight(t, 42.8169, -1.6432), true);
  assert.equal(isNight(t, -33.87, 151.21), false);
  const u = at('2026-11-06T11:00:00Z'); // 12:00 in Spain, 22:00 in Sydney
  assert.equal(isNight(u, 42.8169, -1.6432), false);
  assert.equal(isNight(u, -33.87, 151.21), true);
});

test('isNight across the solar day boundary (Santiago, 8.5 degrees west)', () => {
  const night = (iso: string) => isNight(at(iso), 42.8806, -8.5446);
  assert.equal(night('2026-11-06T23:30:00Z'), true);
  assert.equal(night('2026-11-07T00:30:00Z'), true);
  assert.equal(night('2026-11-07T07:00:00Z'), false, '07:00 UTC is after the sunrise of 07:15 minus 30 min');
  assert.equal(night('2026-11-07T06:30:00Z'), true);
});

test('isNight near the poles: midnight sun and polar night', () => {
  assert.equal(isNight(at('2026-06-21T23:00:00Z'), 69.65, 18.96), false);
  assert.equal(isNight(at('2026-06-21T12:00:00Z'), 69.65, 18.96), false);
  assert.equal(isNight(at('2026-12-21T12:00:00Z'), 69.65, 18.96), true);
  assert.equal(sunTimes(at('2026-12-21T12:00:00Z'), 69.65, 18.96).polar, 'night');
  assert.equal(sunTimes(at('2026-06-21T12:00:00Z'), 69.65, 18.96).polar, 'day');
});

test('sunElevationDeg: noon in summer is high, midnight is below the horizon', () => {
  const noon = sunElevationDeg(at('2026-06-21T12:08:00Z'), 42.8169, -1.6432);
  near(noon, 90 - 42.8169 + 23.44, 1.0, 'solar noon elevation');
  assert.ok(sunElevationDeg(at('2026-06-21T00:50:00Z'), 42.8169, -1.6432) < -20);
  near(sunElevationDeg(at('2026-03-20T12:00:00Z'), 0, 0), 90, 3, 'equinox, on the equator');
});

console.log(`\n${n} passed`);
