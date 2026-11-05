// Small geo helpers (no turf, keeps the bundle small). Coordinates are [lng, lat].
export type LngLat = [number, number];
export type Bounds = [west: number, south: number, east: number, north: number];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LngLat, b: LngLat) {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function lineLengthM(line: LngLat[]) {
  let m = 0;
  for (let i = 1; i < line.length; i++) m += distanceM(line[i - 1], line[i]);
  return m;
}

export function boundsOf(points: LngLat[]): Bounds {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of points) {
    if (x < w) w = x;
    if (x > e) e = x;
    if (y < s) s = y;
    if (y > n) n = y;
  }
  return [w, s, e, n];
}

// Nearest point on the line to p, using a local equirectangular projection (fine at
// walking scale). Returns the snapped point, the segment index and the distance.
export function nearestOnLine(line: LngLat[], p: LngLat) {
  const k = Math.cos(rad(p[1]));
  let best = { point: line[0], index: 0, distanceM: Infinity };
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1];
    const b = line[i];
    const ax = (a[0] - p[0]) * k, ay = a[1] - p[1];
    const bx = (b[0] - p[0]) * k, by = b[1] - p[1];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const q: LngLat = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const d = distanceM(q, p);
    if (d < best.distanceM) best = { point: q, index: i - 1, distanceM: d };
  }
  return best;
}

// Split the route at the walker's position: [done, remaining].
export function splitLine(line: LngLat[], p: LngLat): [LngLat[], LngLat[]] {
  const { point, index } = nearestOnLine(line, p);
  return [[...line.slice(0, index + 1), point], [point, ...line.slice(index + 1)]];
}

// Point at a given distance along the line (for sample progress).
export function pointAlong(line: LngLat[], meters: number): LngLat {
  let left = meters;
  for (let i = 1; i < line.length; i++) {
    const d = distanceM(line[i - 1], line[i]);
    if (left <= d) {
      const t = d === 0 ? 0 : left / d;
      return [line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t, line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t];
    }
    left -= d;
  }
  return line[line.length - 1];
}
