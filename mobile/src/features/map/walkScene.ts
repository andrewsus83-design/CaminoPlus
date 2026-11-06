// A schematic Walk view for the SVG preview (web and Expo Go, where MapLibre is not available): the real route
// ahead of the walker drawn as a road, with made-up blocks beside it, seen from a camera tilted 60 degrees and turned
// to the walker's heading. It is a drawing, not map data: the blocks are decoration, only the route and the pins are real.
// Pure maths (no React): the screen asks for polygons and the preview draws them.
import { LngLat } from './geo';
import { lineTotalM, pointAtAlong, sliceAlong } from './nav';

export type P2 = { x: number; y: number }; // metres east / north of the walker
export type Screen = { sx: number; sy: number; depth: number; /** pixels per metre here */ k: number };
export type Block = { poly: P2[]; h: number; id: number };
export type Scene = {
  /** where (0, 0) is: the walker, snapped to the route */
  origin: LngLat;
  /** route from just behind the walker to 1.6 km ahead */
  route: P2[];
  roads: { pts: P2[]; w: number }[];
  blocks: Block[];
};

const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);
export const toLocal = (origin: LngLat, p: LngLat): P2 => ({ x: (p[0] - origin[0]) * mLng(origin[1]), y: (p[1] - origin[1]) * M_LAT });

const rad = (d: number) => (d * Math.PI) / 180;
// A small deterministic random number from an integer (stable between renders and between fixes).
function rnd(seed: number) {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const sub = (a: P2, b: P2): P2 => ({ x: a.x - b.x, y: a.y - b.y });
const len = (a: P2) => Math.hypot(a.x, a.y);
const unit = (a: P2): P2 => {
  const l = len(a) || 1;
  return { x: a.x / l, y: a.y / l };
};
const left = (d: P2): P2 => ({ x: -d.y, y: d.x });

/** A road as a ribbon polygon of width w along a polyline (mitred, so it survives perspective). */
export function ribbon(pts: P2[], w: number): P2[] {
  if (pts.length < 2) return [];
  const L: P2[] = [];
  const R: P2[] = [];
  for (let i = 0; i < pts.length; i++) {
    const dPrev = i > 0 ? unit(sub(pts[i], pts[i - 1])) : null;
    const dNext = i < pts.length - 1 ? unit(sub(pts[i + 1], pts[i])) : null;
    const d = dPrev && dNext ? unit({ x: dPrev.x + dNext.x, y: dPrev.y + dNext.y }) : (dPrev ?? dNext) as P2;
    const n = left(d);
    // Mitre length, capped so a sharp corner does not spike.
    const cos = dPrev && dNext ? Math.max(0.4, d.x * dPrev.x + d.y * dPrev.y) : 1;
    const half = w / 2 / cos;
    L.push({ x: pts[i].x + n.x * half, y: pts[i].y + n.y * half });
    R.push({ x: pts[i].x - n.x * half, y: pts[i].y - n.y * half });
  }
  return [...L, ...R.reverse()];
}

/** Resamples a polyline every `step` metres. */
function resample(pts: P2[], step: number): P2[] {
  const out: P2[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = len(sub(b, a));
    let at = step - carry;
    while (at <= seg) {
      out.push({ x: a.x + ((b.x - a.x) * at) / seg, y: a.y + ((b.y - a.y) * at) / seg });
      at += step;
    }
    carry = seg - (at - step);
  }
  if (len(sub(out[out.length - 1], pts[pts.length - 1])) > 0.5) out.push(pts[pts.length - 1]);
  return out;
}

/**
 * Builds the scene around a walker `alongM` metres along `line`. Blocks sit at fixed distances along the line
 * (every 36 m, both sides, two rows), so they stay put as the walker moves.
 */
export function buildScene(line: LngLat[], alongM: number, headingDeg: number, withBlocks = true): Scene {
  const total = lineTotalM(line);
  const origin = pointAtAlong(line, alongM).point;
  const AHEAD = 1600;
  const BEHIND = 140;
  const from = Math.max(0, alongM - BEHIND);
  const to = Math.min(total, alongM + AHEAD);
  const slice = to - from > 5 ? sliceAlong(line, from, to) : [];
  let route = slice.map((p) => toLocal(origin, p));
  if (route.length < 2) {
    // Nothing to draw along (the very end of the line): a short straight road along the heading.
    const d = { x: Math.sin(rad(headingDeg)), y: Math.cos(rad(headingDeg)) };
    route = [{ x: -d.x * BEHIND, y: -d.y * BEHIND }, { x: d.x * AHEAD, y: d.y * AHEAD }];
  }
  const roads: Scene['roads'] = [{ pts: route, w: 11 }];
  const blocks: Block[] = [];

  if (withBlocks && slice.length >= 2) {
    const STEP = 36;
    const firstK = Math.ceil(from / STEP);
    const lastK = Math.floor(to / STEP);
    for (let k = firstK; k <= lastK; k++) {
      const m = k * STEP;
      const here = pointAtAlong(line, m);
      const ahead = pointAtAlong(line, Math.min(total, m + 8)).point;
      const base = toLocal(origin, here.point);
      const d = unit(sub(toLocal(origin, ahead), base));
      if (!Number.isFinite(d.x)) continue;
      const n = left(d);
      // A side street every 5th station.
      if (k % 5 === 0 && rnd(k * 7 + 1) > 0.15) {
        const reach = 90 + rnd(k) * 80;
        roads.push({ pts: [{ x: base.x - n.x * reach, y: base.y - n.y * reach }, { x: base.x + n.x * reach, y: base.y + n.y * reach }], w: 7 });
        continue;
      }
      for (const side of [-1, 1]) {
        for (const row of [0, 1]) {
          const seed = k * 31 + (side > 0 ? 7 : 3) + row * 101;
          if (rnd(seed) < (row ? 0.45 : 0.12)) continue;
          const w = 13 + rnd(seed + 1) * 12; // along the road
          const dd = 12 + rnd(seed + 2) * 11; // away from it
          const gap = 11 + row * (dd + 16) + rnd(seed + 3) * 5;
          const cx = base.x + n.x * side * (gap + dd / 2);
          const cy = base.y + n.y * side * (gap + dd / 2);
          const h = 7 + rnd(seed + 4) ** 1.6 * 24;
          const poly = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => ({
            x: cx + d.x * (a * w) / 2 + n.x * (b * dd) / 2,
            y: cy + d.y * (a * w) / 2 + n.y * (b * dd) / 2,
          }));
          blocks.push({ poly, h, id: seed });
        }
      }
    }
  }
  return { origin, route, roads, blocks };
}

/** Distance from the start to each vertex of a local polyline. */
export function localCumulative(pts: P2[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) out.push(out[i - 1] + len(sub(pts[i], pts[i - 1])));
  return out;
}

/** Points every `step` metres along a local polyline (for the route's dots). */
export const dotsAlong = (pts: P2[], step: number) => (pts.length >= 2 ? resample(pts, step) : pts);

/* ------------------------------------------------------------------ camera */

export type Camera = {
  /** x east / y north / z up (metres, walker at 0,0,0) to the screen, or null when behind the camera */
  project: (x: number, y: number, z?: number) => Screen | null;
  /** the camera-space depth axis, for face culling: where the camera is, in the turned frame */
  eye: { x: number; y: number; z: number };
  /** rotate a world vector into the turned frame (heading up) */
  turn: (x: number, y: number) => P2;
  scale: number;
};

/**
 * A camera `pitchDeg` from straight down, turned to `headingDeg` (the direction of travel points up the screen),
 * looking at the walker, who is drawn at (width / 2, puckY). `scale` is pixels per metre at the walker.
 */
export function makeCamera(width: number, puckY: number, headingDeg: number, scale: number, pitchDeg = 60): Camera {
  const phi = rad(90 - pitchDeg); // how far below the horizon the camera looks
  const dist = 300;
  const f = scale * dist;
  const ch = Math.cos(rad(headingDeg));
  const sh = Math.sin(rad(headingDeg));
  const turn = (x: number, y: number): P2 => ({ x: x * ch - y * sh, y: x * sh + y * ch });
  return {
    scale,
    turn,
    eye: { x: 0, y: -dist * Math.cos(phi), z: dist * Math.sin(phi) },
    project: (x, y, z = 0) => {
      const t = turn(x, y);
      const depth = t.y * Math.cos(phi) - z * Math.sin(phi) + dist;
      if (depth < 25) return null;
      const k = f / depth;
      return { sx: width / 2 + t.x * k, sy: puckY - (t.y * Math.sin(phi) + z * Math.cos(phi)) * k, depth, k };
    },
  };
}
