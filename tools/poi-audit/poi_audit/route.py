"""The stage's own route line, and where a place sits along it.

audit.py looks at every route way near the stage: the OSM relations are long (the one that holds
stage 1 runs on to Logroño) and the search box reaches into the next stage and along variants. That is
right for an audit, but an import must decide which places belong to THIS stage and how far along it
each one is. So the ways are joined into one ordered line from the stage's start town to its end town
(the shortest way through the OSM route ways), and places are measured against that line.

Distances use a local flat projection on the same sphere as normalize.distance_m, so a place's distance
to the line and its position along the line are measured the same way.
"""
from __future__ import annotations

import heapq
import json
import math
from pathlib import Path

from .normalize import distance_m

M_PER_DEG = 6371008.8 * math.pi / 180   # metres in one degree of latitude on the sphere distance_m() uses
NODE_KEY = 1e7                          # OSM stores 1e-7 degrees: the same point always gets the same key
GAP_JOIN_M = 50.0                       # ends of two ways closer than this are one junction (mapping gaps)
SNAP_MAX_M = 1500.0                     # a start / end town further than this from every route way: wrong route
MAX_WIND_RATIO = 2.0                    # a line this many times longer than start-end as the crow flies: not the stage


class RouteError(Exception):
    """The OSM route could not be turned into one line for the stage. The message says why."""


class StageLine:
    """An ordered line (lon, lat points, start to end) with distance and position queries."""

    def __init__(self, points, start_snap_m: float = 0.0, end_snap_m: float = 0.0, joined_gaps: int = 0):
        pts: list[tuple[float, float]] = []
        for lon, lat in points:
            if not pts or (lon, lat) != pts[-1]:
                pts.append((lon, lat))
        if len(pts) < 2:
            raise RouteError("a stage line needs at least two different points")
        self.points = pts
        self.start_snap_m = start_snap_m
        self.end_snap_m = end_snap_m
        self.joined_gaps = joined_gaps
        self._segs = []
        along = 0.0
        for (lon_a, lat_a), (lon_b, lat_b) in zip(pts, pts[1:]):
            kx = M_PER_DEG * math.cos(math.radians((lat_a + lat_b) / 2))   # metres per degree of longitude here
            sx, sy = (lon_b - lon_a) * kx, (lat_b - lat_a) * M_PER_DEG
            ll = sx * sx + sy * sy
            length = math.sqrt(ll)
            self._segs.append((lon_a, lat_a, kx, sx, sy, ll, length, along))
            along += length
        self.length_m = along

    @property
    def length_km(self) -> float:
        return self.length_m / 1000

    def locate(self, lat: float, lon: float) -> tuple[float, float]:
        """(metres along the line from its start, metres from the line) for the nearest point of the line.
        When two points are equally near (the line doubles back), the earlier one wins; "equally" means within
        a millionth of a square metre, which is rounding noise, not a real difference."""
        best, along_at_best = math.inf, 0.0
        for lon_a, lat_a, kx, sx, sy, ll, length, along in self._segs:
            px, py = (lon - lon_a) * kx, (lat - lat_a) * M_PER_DEG
            t = 0.0 if ll == 0 else max(0.0, min(1.0, (px * sx + py * sy) / ll))
            dx, dy = px - t * sx, py - t * sy
            d2 = dx * dx + dy * dy
            if d2 < best - 1e-6:
                best, along_at_best = d2, along + t * length
        return along_at_best, math.sqrt(best)

    def locate_km(self, lat: float, lon: float) -> tuple[float, float]:
        """Same as locate(), with the position along the line in kilometres."""
        along_m, distance = self.locate(lat, lon)
        return along_m / 1000, distance


def _key(lon: float, lat: float) -> tuple[int, int]:
    return round(lon * NODE_KEY), round(lat * NODE_KEY)


def _components(nodes: dict, adj: dict) -> dict:
    """Connected component of every route point (the key of the first point found in it)."""
    comp: dict = {}
    for first in nodes:
        if first in comp:
            continue
        comp[first] = first
        stack = [first]
        while stack:
            u = stack.pop()
            for v, _ in adj[u]:
                if v not in comp:
                    comp[v] = first
                    stack.append(v)
    return comp


def _join_gaps(nodes: dict, adj: dict, ends: set) -> int:
    """Join the ends of ways that stop a little short of the rest of the route (a mapping gap). Only way
    ends are joined, only when they belong to different pieces of the route, and only within GAP_JOIN_M,
    so the geometry of a way is never cut across."""
    if not ends:
        return 0
    comp = _components(nodes, adj)
    lat0 = sum(nodes[k][1] for k in ends) / len(ends)
    cell_lat = GAP_JOIN_M / M_PER_DEG
    cell_lon = cell_lat / max(0.2, math.cos(math.radians(lat0)))
    grid: dict[tuple[int, int], list] = {}
    for k in sorted(ends):
        lon, lat = nodes[k]
        grid.setdefault((int(lon // cell_lon), int(lat // cell_lat)), []).append(k)
    joined = 0
    for k in sorted(ends):
        lon, lat = nodes[k]
        cx, cy = int(lon // cell_lon), int(lat // cell_lat)
        for gx in (cx - 1, cx, cx + 1):
            for gy in (cy - 1, cy, cy + 1):
                for other in grid.get((gx, gy), ()):
                    if other <= k or comp[other] == comp[k]:
                        continue
                    d = distance_m(lat, lon, nodes[other][1], nodes[other][0])
                    if d <= GAP_JOIN_M:
                        adj[k].append((other, d))
                        adj[other].append((k, d))
                        joined += 1
    return joined


def _nearest(nodes: dict, point: tuple[float, float]) -> tuple[tuple[int, int], float]:
    plon, plat = point
    kx = M_PER_DEG * math.cos(math.radians(plat))
    best_key, best = None, math.inf
    for k, (lon, lat) in nodes.items():
        d2 = ((lon - plon) * kx) ** 2 + ((lat - plat) * M_PER_DEG) ** 2
        if d2 < best:
            best_key, best = k, d2
    return best_key, distance_m(plat, plon, nodes[best_key][1], nodes[best_key][0])


def build_stage_line(lines, start: tuple[float, float], end: tuple[float, float]) -> StageLine:
    """The shortest way from `start` to `end` (lon, lat each) through the route ways `lines` (lists of
    (lon, lat)), as one ordered StageLine. Raises RouteError when there is no sensible line."""
    nodes: dict[tuple[int, int], tuple[float, float]] = {}
    adj: dict[tuple[int, int], list] = {}
    ends: set = set()
    for line in lines:
        if len(line) < 2:
            continue
        keys = []
        for lon, lat in line:
            k = _key(lon, lat)
            if k not in nodes:
                nodes[k] = (lon, lat)
                adj[k] = []
            keys.append(k)
        ends.update((keys[0], keys[-1]))
        for ka, kb in zip(keys, keys[1:]):
            if ka != kb:
                w = distance_m(nodes[ka][1], nodes[ka][0], nodes[kb][1], nodes[kb][0])
                adj[ka].append((kb, w))
                adj[kb].append((ka, w))
    if not nodes:
        raise RouteError("the OSM route has no ways with geometry")
    joined = _join_gaps(nodes, adj, ends)

    src, src_snap = _nearest(nodes, start)
    dst, dst_snap = _nearest(nodes, end)
    for what, snap in (("start", src_snap), ("end", dst_snap)):
        if snap > SNAP_MAX_M:
            raise RouteError(f"the stage {what} is {snap:.0f} m from the nearest OSM route way (limit {SNAP_MAX_M:.0f} m): "
                             "this is not the route of this stage")
    if src == dst:
        raise RouteError("the start and the end of the stage snap to the same point of the OSM route")

    dist = {src: 0.0}
    prev: dict = {}
    heap = [(0.0, src)]
    while heap:
        d, u = heapq.heappop(heap)
        if u == dst:
            break
        if d > dist.get(u, math.inf):
            continue
        for v, w in adj[u]:
            nd = d + w
            if nd < dist.get(v, math.inf):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))
    if dst not in dist:
        raise RouteError(f"the OSM route ways do not connect the start and the end of the stage "
                         f"({len(nodes)} route points, gaps up to {GAP_JOIN_M:.0f} m are joined)")
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    line = StageLine([nodes[k] for k in reversed(path)], src_snap, dst_snap, joined)

    straight = distance_m(start[1], start[0], end[1], end[0])
    if straight > 500 and line.length_m > MAX_WIND_RATIO * straight:
        raise RouteError(f"the line found is {line.length_km:.1f} km for stage ends {straight / 1000:.1f} km apart as the crow flies "
                         f"(limit {MAX_WIND_RATIO:g}x): this is not the route of this stage")
    return line


def stage_ends(stage: dict, stage_path: Path) -> tuple[tuple[float, float], tuple[float, float]]:
    """(lon, lat) of the start town and of the end town of a stage: the first and the last point of the main
    hand-placed line next to the stage file (the catalog's own coordinates of the two towns)."""
    try:
        fb = json.loads((Path(stage_path).parent / stage["fallback_route"]).read_text(encoding="utf-8"))
        coords = fb["features"][0]["geometry"]["coordinates"]
        return (float(coords[0][0]), float(coords[0][1])), (float(coords[-1][0]), float(coords[-1][1]))
    except (OSError, ValueError, KeyError, IndexError, TypeError) as e:
        raise RouteError(f"cannot read the start and end of the stage from {stage.get('fallback_route')}: {e}") from None
