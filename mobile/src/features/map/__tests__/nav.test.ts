// Plain-node checks for the Walk view maths (nav.ts). Run: npm run test:map
import './lineShim'; // first: it lets the compiled sampleRoute find the OSM lines in assets/map/lines
import assert from 'node:assert/strict';
import { distanceM, lineLengthM, pointAlong, type LngLat } from '../geo';
import {
  DEFAULT_WALK_SPEED_MPS, EMPTY_TRACK, type ManeuverKind, angleDiff, arrivalClock, bannerFor, bearingDeg, cardFor, classifyTurn, cumulative, etaMinutes, formatDistance,
  formatDuration, isNight, lineTotalM, nextManeuver, nextOnTheWay, normDeg, pointAtAlong, progressAlong, remainingToStageEnd, roundForTurn, routeAhead, routeBearingAt,
  sliceAlong, smoothHeading, stageEnds, sunElevationDeg, sunTimes, updateTrack, walkingSpeedMps,
} from '../nav';
import { pois, routeLine, samplePosition, stageEndAlongM, stageForPoint, stages, towns } from '../sampleRoute';

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

test('nextManeuver: a 36 degree bend is straight on, a 42 degree one is announced with the corner about where it is (the threshold is 40 degrees, it was 35)', () => {
  assert.equal(nextManeuver(bend(36), 0).kind, 'straight');
  assert.equal(nextManeuver(bend(-38), 0).kind, 'straight');
  const m = nextManeuver(bend(42), 0);
  assert.equal(m.kind, 'slight-right');
  near(m.distanceM, 300, 8);
  assert.equal(nextManeuver(bend(-42), 0).kind, 'slight-left');
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

/** A route from off(0, 0) made of legs [heading in degrees, length in metres]: vertices only at the corners. */
const legsRoute = (...legs: [number, number][]) => {
  const pts: [number, number][] = [[0, 0]];
  let x = 0;
  let y = 0;
  for (const [h, len] of legs) {
    const [dx, dy] = heading(h, len);
    x += dx;
    y += dy;
    pts.push([x, y]);
  }
  return path(...pts);
};
/** The legs of a smooth right-hand curve of the given radius through `turn` degrees, a leg every 10 m or so, starting from heading `from`. */
const curve = (radius: number, turn: number, from = 0): [number, number][] => {
  const arc = (radius * turn * Math.PI) / 180;
  const k = Math.max(2, Math.ceil(arc / 10));
  return Array.from({ length: k }, (_, i) => [from + ((i + 0.5) * turn) / k, arc / k] as [number, number]);
};
/** Every maneuver the walker is told about on the way along `line`: [metres along where it is, kind, turn], one per place. */
const announced = (line: LngLat[], end = Infinity, from = 0, step = 3) => {
  const out: { at: number; kind: string; turnDeg: number }[] = [];
  for (let w = from; w < Math.min(end, lineTotalM(line)) - 40; w += step) {
    const m = nextManeuver(line, w, end);
    if (m.kind === 'straight' || m.kind === 'arrive') continue;
    const at = w + m.distanceM;
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev.at - at) <= 3) assert.deepEqual([prev.kind, prev.turnDeg], [m.kind, m.turnDeg], `the corner at ${at} changed its turn as the walker came up to it`);
    else out.push({ at, kind: m.kind, turnDeg: m.turnDeg });
  }
  return out;
};

test('nextManeuver: a hairpin is one announcement, a sharp turn, wherever the walker stands on the way to it', () => {
  // north 300 m, a link of 15 m (or 40 m) east and straight back south: two corners of 90 degrees
  const short = announced(legsRoute([0, 300], [90, 15], [180, 700]));
  assert.equal(short.length, 1, JSON.stringify(short));
  assert.ok(short[0].kind === 'sharp-right' || short[0].kind === 'u-turn', short[0].kind);
  near(short[0].at, 305, 12);
  const long = announced(legsRoute([0, 300], [90, 40], [180, 700]));
  assert.equal(long.length, 1, JSON.stringify(long));
  assert.equal(long[0].kind, 'u-turn', 'two corners 40 m apart are one turn of 180 degrees');
  near(long[0].at, 300, 12);
});

test('nextManeuver: a long gentle curve is not a turn, however far it bends; a tight smooth bend is not one either, a corner of the same angle is', () => {
  for (const [radius, turn] of [[150, 90], [100, 180], [250, 60]] as const) {
    const line = legsRoute([0, 300], ...curve(radius, turn), [turn, 700]);
    assert.deepEqual(announced(line), [], `radius ${radius} m through ${turn} degrees`);
  }
  assert.deepEqual(announced(legsRoute([0, 300], ...curve(40, 90), [90, 700])), [], 'a smooth bend of radius 40 m has 43 degrees in its 60 m window, spread over a curve');
  const corner = announced(legsRoute([0, 300], [90, 700]));
  assert.equal(corner.length, 1);
  assert.equal(corner[0].kind, 'right');
  near(corner[0].at, 300, 8);
  const smallRadius = announced(legsRoute([0, 300], ...curve(15, 90), [90, 700]));
  assert.equal(smallRadius.length, 1, 'a bend of radius 15 m is a turn');
  assert.equal(smallRadius[0].kind, 'right');
});

test('nextManeuver: two turns 80 m apart are one announcement (the net turn, at the first corner), a bend and its counter-bend cancel, 130 m apart they are two', () => {
  const same = legsRoute([0, 300], [45, 80], [90, 700]);
  const m = nextManeuver(same, 0);
  assert.equal(m.kind, 'right');
  near(m.turnDeg, 90, 3);
  near(m.distanceM, 300, 8);
  assert.equal(announced(same).length, 1);
  assert.equal(nextManeuver(same, 340).kind, 'straight', 'between the two corners: the second belongs to the turn the walker is making');
  assert.deepEqual(announced(legsRoute([0, 300], [60, 80], [0, 700])), [], 'a jog: right 60 degrees, left 60 degrees, 80 m later');
  const apart = announced(legsRoute([0, 300], [45, 130], [90, 700]));
  assert.equal(apart.length, 2);
  near(apart[0].at, 300, 8);
  near(apart[1].at, 430, 8);
  assert.deepEqual(apart.map((a) => a.kind), ['slight-right', 'slight-right']);
});

test('nextManeuver: a T junction is announced once, counting down, and not again once passed', () => {
  const line = legsRoute([0, 380], [-90, 700]);
  assert.deepEqual(announced(line).map((a) => a.kind), ['left']);
  near(nextManeuver(line, 0).distanceM, 380, 8);
  near(nextManeuver(line, 200).distanceM, 180, 8);
  assert.equal(nextManeuver(line, 379).kind, 'left');
  for (const past of [1, 3, 10, 30, 45, 59]) assert.equal(nextManeuver(line, 380 + past).kind, 'straight', `${past} m past the corner`);
});

test('nextManeuver: a winding path does not add up (30 degree zig-zags, twelve gentle bends of 12 degrees) and a turn 40 m ahead is still announced', () => {
  const zigzag = legsRoute([0, 300], ...Array.from({ length: 12 }, (_, i) => [i % 2 ? -15 : 15, 40] as [number, number]), [0, 700]);
  assert.deepEqual(announced(zigzag), []);
  const gentle = legsRoute([0, 300], ...Array.from({ length: 8 }, (_, i) => [12 * (i + 1), 30] as [number, number]), [96, 700]);
  assert.deepEqual(announced(gentle), []);
  near(nextManeuver(bend(90, 300, 700), 260).distanceM, 40, 8);
});

test('nextManeuver: a corner the path goes back from within 80 m is not a decision, the same corner with the new heading kept is', () => {
  // right 60 degrees, then three gentle bends of 20 degrees back to the old heading, all within 75 m
  const wiggle = legsRoute([0, 300], [60, 25], [40, 25], [20, 25], [0, 700]);
  assert.deepEqual(announced(wiggle), []);
  const kept = announced(legsRoute([0, 300], [60, 700]));
  assert.equal(kept.length, 1);
  assert.equal(kept[0].kind, 'slight-right');
});

test('nextManeuver on the OSM stages: one announcement every 1 to 2 km, each a real turn, none closer than 100 m, and each stays where it is as the walker comes up to it', () => {
  let from = 0;
  stages.forEach((stage, i) => {
    const end = stageEndAlongM[i];
    const list = announced(routeLine, end, from, 7);
    const km = (end - from) / 1000;
    for (const a of list) {
      // (the kind is named from the turn before it is rounded to whole degrees: -69.6 is slight-left, and shows as -70)
      assert.ok(Math.abs(a.turnDeg) >= 40 && [classifyTurn(a.turnDeg - 0.5), classifyTurn(a.turnDeg + 0.5)].includes(a.kind as ManeuverKind), `stage ${stage.number}: ${a.kind} ${a.turnDeg}`);
      assert.ok(a.at > from && a.at < end - 18, `stage ${stage.number}: a turn at ${a.at} is outside the stage`);
    }
    list.slice(1).forEach((a, j) => assert.ok(a.at - list[j].at >= 100, `stage ${stage.number}: turns ${a.at - list[j].at} m apart`));
    const perKm = list.length / km;
    console.log(`   stage ${stage.number}: ${list.length} announcements in ${km.toFixed(1)} km, one per ${Math.round(1000 / perKm)} m`);
    if (stage.number <= 2) assert.ok(1000 / perKm >= 1000 && 1000 / perKm <= 2000, `stage ${stage.number}: one per ${1000 / perKm} m`);
    else assert.ok(1000 / perKm >= 750 && 1000 / perKm <= 2000, `stage ${stage.number}: one per ${1000 / perKm} m`);
    from = end;
  });
  const stage = stages[0];
  const end = progressAlong(routeLine, stage.line[stage.line.length - 1]).alongM;
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
