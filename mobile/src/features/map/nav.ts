// Walk view maths: bearings, progress along the route, the next turn, time left, and the sun.
// Pure functions only (no React, no native modules), so `npm run test:map` runs them in plain node.
// Coordinates are [lng, lat]. Distances are metres, bearings are degrees clockwise from north.
import { LngLat, distanceM, nearestOnLine } from './geo';

const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;
const lerp = (a: LngLat, b: LngLat, t: number): LngLat => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* ------------------------------------------------------------------ bearings */

/** Any angle as 0 <= d < 360. */
export const normDeg = (d: number) => ((d % 360) + 360) % 360;

/** Signed shortest turn from `from` to `to`, in (-180, 180]. Positive = clockwise (to the right). */
export function angleDiff(from: number, to: number) {
  const d = normDeg(to - from);
  return d > 180 ? d - 360 : d;
}

/** Initial great-circle bearing from a to b (0 = north, 90 = east). Equal points give 0: guard before use. */
export function bearingDeg(a: LngLat, b: LngLat) {
  const p1 = rad(a[1]);
  const p2 = rad(b[1]);
  const dl = rad(b[0] - a[0]);
  const y = Math.sin(dl) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return normDeg(deg(Math.atan2(y, x)));
}

/** Moves a heading a fraction `alpha` of the way to the new one, the short way round (359 -> 1 goes through 0). */
export function smoothHeading(prev: number | null, next: number, alpha = 0.4) {
  if (prev == null || !Number.isFinite(prev)) return normDeg(next);
  return normDeg(prev + alpha * angleDiff(prev, next));
}

/* ------------------------------------------------------------------ along the route */

const cumCache = new WeakMap<LngLat[], number[]>();
/** Distance from the start of the line to each vertex (cached per array: do not mutate a line after use). */
export function cumulative(line: LngLat[]): number[] {
  let c = cumCache.get(line);
  if (!c) {
    c = [0];
    for (let i = 1; i < line.length; i++) c.push(c[i - 1] + distanceM(line[i - 1], line[i]));
    cumCache.set(line, c);
  }
  return c;
}

export const lineTotalM = (line: LngLat[]) => cumulative(line)[line.length - 1] ?? 0;

/** The point `m` metres along the line (clamped to the ends) and the index of the segment it lies on. */
export function pointAtAlong(line: LngLat[], m: number): { point: LngLat; index: number } {
  if (line.length < 2) return { point: line[0], index: 0 };
  const cum = cumulative(line);
  if (!(m > 0)) return { point: line[0], index: 0 };
  if (m >= cum[cum.length - 1]) return { point: line[line.length - 1], index: line.length - 2 };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= m) lo = mid;
    else hi = mid;
  }
  const seg = cum[lo + 1] - cum[lo];
  return { point: lerp(line[lo], line[lo + 1], seg === 0 ? 0 : (m - cum[lo]) / seg), index: lo };
}

/** The part of the line between two distances along it (always at least two points). */
export function sliceAlong(line: LngLat[], fromM: number, toM: number): LngLat[] {
  if (line.length < 2) return line.length ? [line[0], line[0]] : [];
  const cum = cumulative(line);
  const a = Math.max(0, Math.min(fromM, cum[cum.length - 1]));
  const b = Math.max(a, Math.min(toM, cum[cum.length - 1]));
  const out: LngLat[] = [pointAtAlong(line, a).point];
  for (let i = 1; i < line.length - 1; i++) if (cum[i] > a && cum[i] < b) out.push(line[i]);
  out.push(pointAtAlong(line, b).point);
  return out;
}

export type RoutePos = { point: LngLat; index: number; alongM: number; offM: number };

/** Where a position falls on the route: snapped point, segment, distance from the start and distance off the line. */
export function progressAlong(line: LngLat[], at: LngLat): RoutePos {
  const n = nearestOnLine(line, at);
  const cum = cumulative(line);
  return { point: n.point, index: n.index, alongM: (cum[n.index] ?? 0) + distanceM(line[n.index], n.point), offM: n.distanceM };
}

/**
 * Distance left to the end of the stage along the route: the walker and the stage end are both snapped onto the line.
 * Nothing left (or the walker past the end) is 0.
 */
export function remainingToStageEnd(line: LngLat[], at: LngLat, stageEnd: LngLat) {
  const pos = progressAlong(line, at);
  const endAlongM = progressAlong(line, stageEnd).alongM;
  return { pos, endAlongM, remainingM: Math.max(0, endAlongM - pos.alongM) };
}

/** The route from the walker onwards, at most `maxM` long. */
export const routeAhead = (line: LngLat[], pos: RoutePos, maxM = Infinity) => sliceAlong(line, pos.alongM, pos.alongM + maxM);

/** Direction of the route at a distance along it, looking `lookM` ahead (null when the line is too short or flat). */
export function routeBearingAt(line: LngLat[], alongM: number, lookM = 30): number | null {
  const total = lineTotalM(line);
  if (line.length < 2 || total < 1) return null;
  const from = Math.min(alongM, Math.max(0, total - 1));
  const a = pointAtAlong(line, from).point;
  const b = pointAtAlong(line, Math.min(total, from + lookM)).point;
  return distanceM(a, b) < 0.5 ? null : bearingDeg(a, b);
}

/* ------------------------------------------------------------------ the next turn */

export type ManeuverKind = 'straight' | 'slight-left' | 'left' | 'sharp-left' | 'slight-right' | 'right' | 'sharp-right' | 'u-turn' | 'arrive';
export type Maneuver = { kind: ManeuverKind; /** metres from the walker to the corner (or to the end for 'arrive') */ distanceM: number; /** signed angle, + = right */ turnDeg: number };

/** Names a turn by its size: under 35 degrees is still straight on. */
export function classifyTurn(turnDeg: number): ManeuverKind {
  const a = Math.abs(turnDeg);
  const left = turnDeg < 0;
  if (a < 35) return 'straight';
  if (a < 70) return left ? 'slight-left' : 'slight-right';
  if (a < 130) return left ? 'left' : 'right';
  if (a < 165) return left ? 'sharp-left' : 'sharp-right';
  return 'u-turn';
}

export type ManeuverOptions = { lookM?: number; thresholdDeg?: number; arriveM?: number };

/**
 * The next turn on the route ahead of the walker. At every point along the next `lookM` (400 m), in 5 m steps, the turn is
 * the change of bearing between the 40 m of route before the point and the 40 m after it, so one noisy vertex does not
 * count as a turn and a corner is measured where it is, not where the walker stands. The first point where that change
 * reaches `thresholdDeg` (35) and is still growing is a corner; the corner is the top of that rise.
 * A corner the walker has already passed (the change is shrinking at the walker) is not announced.
 * `endAlongM` is the end of the stage: the scan never looks past it, and reaching it is 'arrive'.
 */
export function nextManeuver(line: LngLat[], alongM: number, endAlongM = Infinity, o: ManeuverOptions = {}): Maneuver {
  const lookM = o.lookM ?? 400;
  const threshold = o.thresholdDeg ?? 35;
  const arriveM = o.arriveM ?? 30;
  const total = lineTotalM(line);
  const end = Math.min(endAlongM, total);
  const remaining = Math.max(0, end - alongM);
  if (line.length < 2 || remaining <= arriveM) return { kind: 'arrive', distanceM: remaining, turnDeg: 0 };

  const ARM = 40;
  const STEP = 2;
  const at = (m: number) => pointAtAlong(line, Math.max(0, Math.min(m, end))).point;
  /** signed change of bearing at distance m along the route (+ = right), null where the route is too short to tell */
  const turnAt = (m: number): number | null => {
    const p = at(m);
    const a = at(m - ARM);
    const b = at(m + ARM);
    // Both arms must be long enough to give a direction: not at the very start of the line or within the last metres of the stage.
    return distanceM(a, p) < ARM * 0.6 || distanceM(p, b) < ARM * 0.6 ? null : angleDiff(bearingDeg(a, p), bearingDeg(p, b));
  };

  const scan = Math.min(lookM, remaining);
  let prev = Math.abs(turnAt(alongM - STEP) ?? 0);
  for (let s = 0; s <= scan; s += STEP) {
    const t = turnAt(alongM + s);
    const a = Math.abs(t ?? 0);
    if (t != null && a >= threshold && a >= prev) {
      let peak = t;
      let peakS = s;
      for (let u = s + STEP; u <= Math.min(remaining, s + 60); u += STEP) {
        const tu = turnAt(alongM + u);
        if (tu == null || Math.abs(tu) < Math.abs(peak)) break;
        peak = tu;
        peakS = u;
      }
      return { kind: classifyTurn(peak), distanceM: peakS, turnDeg: Math.round(peak) };
    }
    prev = a;
  }
  return remaining <= lookM ? { kind: 'arrive', distanceM: remaining, turnDeg: 0 } : { kind: 'straight', distanceM: lookM, turnDeg: 0 };
}

/* ------------------------------------------------------------------ speed, time left, formatting */

/** 4.0 km/h, used whenever the walker's own speed is not believable. */
export const DEFAULT_WALK_SPEED_MPS = 4 / 3.6;
export const PLAUSIBLE_SPEED_MPS = { min: 0.6, max: 2.2 } as const;

/** The walker's smoothed speed when it is a believable walking speed (0.6 to 2.2 m/s), else 4.0 km/h. */
export function walkingSpeedMps(smoothed: number | null | undefined) {
  return smoothed != null && Number.isFinite(smoothed) && smoothed >= PLAUSIBLE_SPEED_MPS.min && smoothed <= PLAUSIBLE_SPEED_MPS.max ? smoothed : DEFAULT_WALK_SPEED_MPS;
}

/** Minutes to cover a distance (fractional; formatDuration rounds). */
export const etaMinutes = (distM: number, speedMps: number) => (speedMps > 0 ? Math.max(0, distM) / speedMps / 60 : Infinity);

/** "1 min", "59 min", "1 h", "1 h 20 min", "2 h 5 min". Anything above zero reads at least "1 min". */
export function formatDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '0 min';
  const total = Math.max(1, Math.round(minutes));
  if (total < 60) return `${total} min`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** "0 m", "999 m", "1.0 km", "5.3 km", "12.4 km", and whole kilometres from 100 km on. */
export function formatDistance(m: number) {
  if (!Number.isFinite(m) || m <= 0) return '0 m';
  if (m < 1000) {
    const r = Math.round(m);
    return r >= 1000 ? '1.0 km' : `${r} m`;
  }
  const km = m / 1000;
  return km < 99.95 ? `${km.toFixed(1)} km` : `${Math.round(km)} km`;
}

/** A distance rounded the way a person says it before a turn: 10 m steps up to 300 m, 50 m steps to 1 km. */
export function roundForTurn(m: number) {
  if (m < 15) return 0;
  if (m < 300) return Math.round(m / 10) * 10;
  if (m < 1000) return Math.round(m / 50) * 50;
  return Math.round(m / 100) * 100;
}

/** Local clock time of arrival ("15:42") `minutes` after `now`, on the device's clock. Uses the same whole minutes as formatDuration. */
export function arrivalClock(now: Date, minutes: number) {
  const whole = Number.isFinite(minutes) && minutes > 0 ? Math.max(1, Math.round(minutes)) : 0;
  const t = new Date(now.getTime() + whole * 60_000);
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}

/* ------------------------------------------------------------------ following the walker */

export type Fix = { at: LngLat; /** ms since epoch */ t: number; courseDeg?: number | null; speedMps?: number | null; accuracyM?: number | null };
export type Track = { headingDeg: number | null; speedMps: number | null; last: { at: LngLat; t: number } | null };
export const EMPTY_TRACK: Track = { headingDeg: null, speedMps: null, last: null };

/**
 * Folds a new GPS fix into the smoothed heading and speed.
 * Speed: the fix's own speed, else distance over time since the previous fix; smoothed.
 * Heading: while moving, the GPS course, else the bearing from the previous fix once the walker has moved further than
 * the fix is accurate, else the route's direction; when standing still the last heading is kept (the route's direction
 * only seeds the very first one).
 */
export function updateTrack(prev: Track, fix: Fix, routeBearing: number | null = null): Track {
  const last = prev.last;
  const dist = last ? distanceM(last.at, fix.at) : 0;
  const dt = last ? (fix.t - last.t) / 1000 : 0;
  const own = fix.speedMps != null && Number.isFinite(fix.speedMps) && fix.speedMps >= 0 ? fix.speedMps : null;
  const raw = own ?? (last && dt >= 1 && dt <= 120 ? dist / dt : null);
  const speed = raw == null ? prev.speedMps : prev.speedMps == null ? raw : prev.speedMps + 0.3 * (raw - prev.speedMps);
  const moving = (raw ?? 0) >= 0.5;

  let heading = prev.headingDeg;
  const course = fix.courseDeg != null && Number.isFinite(fix.courseDeg) && fix.courseDeg >= 0 ? fix.courseDeg : null;
  if (moving && course != null) heading = smoothHeading(prev.headingDeg, course, 0.5);
  else if (moving && last && dist >= Math.max(15, fix.accuracyM ?? 0)) heading = smoothHeading(prev.headingDeg, bearingDeg(last.at, fix.at), 0.5);
  else if (moving && routeBearing != null) heading = smoothHeading(prev.headingDeg, routeBearing, 0.4);
  else if (heading == null && routeBearing != null) heading = routeBearing;
  return { headingDeg: heading, speedMps: speed, last: { at: fix.at, t: fix.t } };
}

/* ------------------------------------------------------------------ what is ahead */

export type Landmark = { key: string; name: string; kind: string; at: LngLat };
export type AheadItem = Landmark & { distanceM: number };

/**
 * The next `count` places ahead of the walker along the route, nearest first, with the distance along the route.
 * Places that are far from the route are ignored; places closer together than `minGapM` count once (a town wins
 * over the pins inside it).
 */
export function nextOnTheWay(line: LngLat[], alongM: number, items: Landmark[], count = 3, minGapM = 150, maxOffM = 2500): AheadItem[] {
  const ahead = items
    .map((it) => ({ it, pos: progressAlong(line, it.at) }))
    .filter((x) => x.pos.offM <= maxOffM && x.pos.alongM > alongM + 20)
    .sort((a, b) => a.pos.alongM - b.pos.alongM);
  const out: { it: Landmark; along: number }[] = [];
  for (const x of ahead) {
    const prev = out[out.length - 1];
    if (prev && x.pos.alongM - prev.along < minGapM) {
      if (x.it.kind === 'town' && prev.it.kind !== 'town') out[out.length - 1] = { it: x.it, along: x.pos.alongM };
      continue;
    }
    out.push({ it: x.it, along: x.pos.alongM });
  }
  return out.slice(0, count).map((o) => ({ ...o.it, distanceM: Math.max(0, o.along - alongM) }));
}

/** "Saint-Jean-Pied-de-Port → Roncesvalles" into its two ends. */
export function stageEnds(name: string): { from: string; to: string } {
  const parts = name.split(/\s*(?:→|->)\s*/);
  return parts.length >= 2 ? { from: parts[0].trim(), to: parts[parts.length - 1].trim() } : { from: '', to: name.trim() };
}

/* ------------------------------------------------------------------ what the banner and card say */

export type BannerState = 'denied' | 'waiting' | 'away' | 'back' | 'walking';
export type BannerInput = {
  state: BannerState;
  maneuver: Maneuver | null;
  /** next town ahead on the route */
  toward: string;
  /** end of the current stage */
  stageTo: string;
  stageNumber: number;
  remainingM: number | null;
  /** distance of the fix from the route */
  offM: number | null;
};
export type Banner = { state: BannerState; kind: ManeuverKind | 'none'; main: string; sub: string };

const TURN_PHRASE: Partial<Record<ManeuverKind, string>> = {
  'slight-left': 'Bear left',
  left: 'Turn left',
  'sharp-left': 'Turn sharp left',
  'slight-right': 'Bear right',
  right: 'Turn right',
  'sharp-right': 'Turn sharp right',
  'u-turn': 'Turn around',
};

/** The two lines of the instruction banner. Honest about not having a position: it never invents a direction. */
export function bannerFor(i: BannerInput): Banner {
  if (i.state === 'denied') return { state: i.state, kind: 'none', main: 'Location is off', sub: 'Allow location in Settings to see where you are' };
  if (i.state === 'waiting') return { state: i.state, kind: 'none', main: 'Waiting for your position', sub: `Showing a sample position on stage ${i.stageNumber}` };
  if (i.state === 'away') return { state: i.state, kind: 'none', main: 'You are not on the Camino yet', sub: i.offM != null ? `${formatDistance(i.offM)} from the route` : 'Showing a sample position' };
  if (i.state === 'back') return { state: i.state, kind: 'none', main: 'Head back to the Camino', sub: i.offM != null ? `${formatDistance(i.offM)} to the route` : 'You are off the route' };

  const left = i.remainingM != null ? formatDistance(i.remainingM) : '';
  const stage = `stage ${i.stageNumber}`;
  const m = i.maneuver;
  if (m && m.kind === 'arrive') {
    // The distance is in the second line, so the first stays short.
    return { state: 'walking', kind: 'arrive', main: `Arrive at ${i.stageTo}`, sub: m.distanceM <= 30 ? `End of ${stage}` : `${left} to go · ${stage}` };
  }
  if (m && m.kind !== 'straight') {
    const d = roundForTurn(m.distanceM);
    const phrase = TURN_PHRASE[m.kind] ?? 'Turn';
    return { state: 'walking', kind: m.kind, main: d === 0 ? `${phrase} now` : `${phrase} in ${formatDistance(d)}`, sub: `${left} to ${i.stageTo} · ${stage}` };
  }
  const same = i.toward.trim().toLowerCase() === i.stageTo.trim().toLowerCase();
  return { state: 'walking', kind: 'straight', main: `Toward ${i.toward || i.stageTo}`, sub: same || !i.toward ? `${left} to go · ${stage}` : `${left} to ${i.stageTo} · ${stage}` };
}

export type CardInput = {
  /** a real GPS fix on the route (never a sample position) */
  live: boolean;
  remainingM: number | null;
  speedMps: number | null;
  stageDistanceKm: number;
  stageNumber: number;
  stageName: string;
  now: Date;
};
export type Card = { time: string; detail: string; stage: string; etaMin: number | null; arrival: string | null };

/**
 * The bottom card. With a live fix: time left at the walker's own speed (or 4 km/h), distance and arrival clock.
 * Without one it shows "--" and the length of the stage: an ETA from a sample position would be made up.
 */
export function cardFor(i: CardInput): Card {
  const { from, to } = stageEnds(i.stageName);
  const stage = from ? `Stage ${i.stageNumber} · ${from} to ${to}` : `Stage ${i.stageNumber} · ${to}`;
  if (!i.live || i.remainingM == null) return { time: '--', detail: `${formatDistance(i.stageDistanceKm * 1000)} stage`, stage, etaMin: null, arrival: null };
  const etaMin = etaMinutes(i.remainingM, walkingSpeedMps(i.speedMps));
  const arrival = arrivalClock(i.now, etaMin);
  return { time: formatDuration(etaMin), detail: `${formatDistance(i.remainingM)} · arrives ${arrival}`, stage, etaMin, arrival };
}

/* ------------------------------------------------------------------ day and night */

export const CIVIL_TWILIGHT_MIN = 30;
const DAY_MS = 86_400_000;

// NOAA Solar Calculator equations (https://gml.noaa.gov/grad/solcalc/calcdetails.html).
function solar(ms: number) {
  const jd = ms / DAY_MS + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = normDeg(280.46646 + T * (36000.76983 + T * 0.0003032));
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T) +
    Math.sin(rad(3 * M)) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const obliq = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60 + 0.00256 * Math.cos(rad(omega));
  const declination = deg(Math.asin(Math.sin(rad(obliq)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(obliq / 2)) ** 2;
  const eqTimeMin =
    4 *
    deg(
      y * Math.sin(2 * rad(L0)) -
        2 * e * Math.sin(rad(M)) +
        4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0)) -
        0.5 * y * y * Math.sin(4 * rad(L0)) -
        1.25 * e * e * Math.sin(2 * rad(M)),
    );
  return { declination, eqTimeMin };
}

/** Height of the sun above the horizon in degrees (no refraction), for a place and an instant. */
export function sunElevationDeg(date: Date, lat: number, lng: number) {
  const ms = date.getTime();
  const { declination, eqTimeMin } = solar(ms);
  const minutesUtc = (((ms % DAY_MS) + DAY_MS) % DAY_MS) / 60_000;
  const trueSolarMin = (((minutesUtc + eqTimeMin + 4 * lng) % 1440) + 1440) % 1440;
  const hourAngle = trueSolarMin / 4 - 180;
  const cosZ = Math.sin(rad(lat)) * Math.sin(rad(declination)) + Math.cos(rad(lat)) * Math.cos(rad(declination)) * Math.cos(rad(hourAngle));
  return 90 - deg(Math.acos(Math.max(-1, Math.min(1, cosZ))));
}

export type SunTimes = { sunrise: number | null; sunset: number | null; /** set when the sun does not rise or set that day */ polar: 'day' | 'night' | null };

/** Sunrise and sunset (ms since epoch) for the solar day of `date` at a place; the sun's disc touching the horizon (zenith 90.833). */
export function sunTimes(date: Date, lat: number, lng: number): SunTimes {
  // The solar day at this longitude: local mean midnight to local mean midnight.
  const day = Math.floor((date.getTime() + (lng / 15) * 3_600_000) / DAY_MS);
  const noonMean = day * DAY_MS - (lng / 15) * 3_600_000 + DAY_MS / 2;
  const edge = (rising: boolean, guess: number) => {
    const { declination, eqTimeMin } = solar(guess);
    const cosH = Math.cos(rad(90.833)) / (Math.cos(rad(lat)) * Math.cos(rad(declination))) - Math.tan(rad(lat)) * Math.tan(rad(declination));
    if (cosH > 1) return 'night' as const;
    if (cosH < -1) return 'day' as const;
    const h = deg(Math.acos(cosH));
    const noon = noonMean - eqTimeMin * 60_000;
    return noon + (rising ? -1 : 1) * h * 4 * 60_000;
  };
  // Two passes: the second evaluates the sun at the first estimate, as NOAA's own calculator does.
  let rise = edge(true, noonMean);
  let set = edge(false, noonMean);
  if (typeof rise === 'string') return { sunrise: null, sunset: null, polar: rise };
  if (typeof set === 'string') return { sunrise: null, sunset: null, polar: set };
  const rise2 = edge(true, rise);
  const set2 = edge(false, set);
  if (typeof rise2 === 'number') rise = rise2;
  if (typeof set2 === 'number') set = set2;
  return { sunrise: rise as number, sunset: set as number, polar: null };
}

/**
 * True when the sun is down, with civil twilight counted as day: the day runs from 30 minutes before sunrise
 * to 30 minutes after sunset at that place (so the dark map is not used while the sky is still bright).
 * Where the sun does not rise or set at all, the height of the sun decides (below -6 degrees = night).
 */
export function isNight(date: Date, lat: number, lng: number) {
  const t = sunTimes(date, lat, lng);
  if (t.polar === 'night') return true;
  if (t.polar === 'day') return sunElevationDeg(date, lat, lng) < -6;
  const ms = date.getTime();
  const tw = CIVIL_TWILIGHT_MIN * 60_000;
  return ms < (t.sunrise as number) - tw || ms > (t.sunset as number) + tw;
}
