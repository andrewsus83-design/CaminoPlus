#!/usr/bin/env python3
"""Build a tiny synthetic OpenMapTiles-schema PMTiles pack (a made-up village) for testing the
offline render harness (test/render_offline.mjs) without Planetiler. Not real map data: names and
shapes are invented. The committed result is test/fixtures/mini.pmtiles (about 8 KB, 21 tiles).

Usage: make_mini_pack.py <out.pmtiles>
Needs: pip install pmtiles==3.8.1 mapbox-vector-tile==2.2.0 shapely==2.2.0   (only to regenerate)
"""
import gzip
import math
import sys

import mapbox_vector_tile as mvt
from pmtiles.tile import Compression, TileType, zxy_to_tileid
from pmtiles.writer import write
from shapely.geometry import LineString, Point, Polygon, box

EXTENT = 4096
R = 6378137.0
CENTER = (-1.2376, 43.1636)  # lon, lat (used only as a place to draw the made-up village)
MIN_Z, MAX_Z = 8, 15


def merc(lon, lat):
    return (R * math.radians(lon), R * math.log(math.tan(math.pi / 4 + math.radians(lat) / 2)))


def tile_of(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180) / 360 * n)
    y = int((1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * n)
    return x, y


def off(dx_m, dy_m):
    """lon/lat of a point dx/dy metres east/north of CENTER."""
    lat = CENTER[1] + dy_m / 111320.0
    lon = CENTER[0] + dx_m / (111320.0 * math.cos(math.radians(CENTER[1])))
    return (lon, lat)


def line(*pts):
    return LineString([off(*p) for p in pts])


def poly(*pts):
    return Polygon([off(*p) for p in pts])


FEATURES = {
    "place": [
        (Point(*off(0, 0)), {"class": "town", "name": "Mini Village", "name:en": "Mini Village", "rank": 1}),
        (Point(*off(900, 600)), {"class": "hamlet", "name": "Casa Alta", "rank": 5}),
    ],
    "poi": [
        (Point(*off(-120, 80)), {"class": "place_of_worship", "subclass": "christian", "name": "Iglesia Mini", "rank": 1}),
        (Point(*off(60, -40)), {"class": "lodging", "subclass": "hostel", "name": "Albergue Mini", "rank": 1}),
        (Point(*off(150, 120)), {"class": "drinking_water", "subclass": "drinking_water", "name": "Fuente", "rank": 2}),
        (Point(*off(-300, -200)), {"class": "cafe", "subclass": "cafe", "name": "Cafe Mini", "rank": 3}),
    ],
    "transportation": [
        (line((-900, 0), (-300, 40), (0, 0), (500, -60), (1100, 200)), {"class": "minor"}),
        (line((0, 0), (0, 700)), {"class": "service"}),
        (line((-300, 40), (-250, -500)), {"class": "path"}),
        (line((500, -60), (900, -500)), {"class": "track"}),
    ],
    "transportation_name": [
        (line((-900, 0), (-300, 40), (0, 0), (500, -60), (1100, 200)), {"class": "minor", "name": "Calle Mayor"}),
    ],
    "building": [
        (poly((-140, 60), (-100, 60), (-100, 100), (-140, 100)), {"render_height": 8}),
        (poly((40, -60), (80, -60), (80, -20), (40, -20)), {"render_height": 6}),
        (poly((100, 40), (140, 40), (140, 80), (100, 80)), {"render_height": 6}),
        (poly((-60, -110), (-20, -110), (-20, -70), (-60, -70)), {"render_height": 6}),
    ],
    "water": [
        (poly((-700, -600), (-300, -650), (-100, -520), (-500, -440)), {"class": "lake"}),
    ],
    "waterway": [
        (line((-1000, -500), (-500, -450), (0, -300), (700, -350)), {"class": "river", "name": "Rio Mini"}),
    ],
    "landcover": [
        (poly((-1100, 300), (-200, 350), (-100, 900), (-1100, 900)), {"class": "wood"}),
        (poly((200, 200), (1100, 250), (1100, 800), (300, 800)), {"class": "grass"}),
    ],
    "landuse": [
        (poly((-250, -150), (250, -150), (250, 250), (-250, 250)), {"class": "residential"}),
    ],
    "park": [],
    "boundary": [],
    "water_name": [
        (Point(*off(-450, -540)), {"class": "lake", "name": "Lago Mini"}),
    ],
    "mountain_peak": [
        (Point(*off(700, 900)), {"class": "peak", "name": "Pico Mini", "name:en": "Mini Peak", "ele": 1234}),
    ],
}
MIN_ZOOM_OF = {"building": 13, "poi": 13, "transportation_name": 13, "mountain_peak": 11}


def tile_geometry(geom, z, x, y):
    """Project a lon/lat shapely geometry into tile pixel space (y down)."""
    n = 2 ** z
    size = 2 * math.pi * R / n
    x0 = -math.pi * R + x * size
    y0 = math.pi * R - y * size

    def proj(c):
        mx, my = merc(c[0], c[1])
        return ((mx - x0) / size * EXTENT, (y0 - my) / size * EXTENT)

    if geom.geom_type == "Point":
        return Point(proj(geom.coords[0]))
    if geom.geom_type == "LineString":
        return LineString([proj(c) for c in geom.coords])
    return Polygon([proj(c) for c in geom.exterior.coords])


def build_tile(z, x, y):
    clip = box(-80, -80, EXTENT + 80, EXTENT + 80)
    layers = []
    for name, feats in FEATURES.items():
        if z < MIN_ZOOM_OF.get(name, 0):
            continue
        out = []
        for geom, props in feats:
            g = tile_geometry(geom, z, x, y).intersection(clip)
            if g.is_empty:
                continue
            out.append({"geometry": g, "properties": props})
        if out:
            layers.append({"name": name, "features": out})
    if not layers:
        return None
    return gzip.compress(mvt.encode(layers, default_options={"y_coord_down": True, "extents": EXTENT}), mtime=0)


def main(out):
    lons = [off(dx, dy)[0] for dx, dy in ((-1100, 0), (1100, 0))]
    lats = [off(0, dy)[1] for dy in (-650, 900)]
    bounds = (min(lons), min(lats), max(lons), max(lats))
    tiles = {}
    for z in range(MIN_Z, MAX_Z + 1):
        x0, y1 = tile_of(bounds[0], bounds[1], z)
        x1, y0 = tile_of(bounds[2], bounds[3], z)
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                data = build_tile(z, x, y)
                if data:
                    tiles[zxy_to_tileid(z, x, y)] = data
    e7 = lambda v: int(round(v * 1e7))
    with write(out) as w:
        for tid in sorted(tiles):
            w.write_tile(tid, tiles[tid])
        layer_defs = [{"id": n, "fields": {}, "minzoom": MIN_ZOOM_OF.get(n, 0), "maxzoom": MAX_Z} for n in FEATURES if FEATURES[n]]
        w.finalize(
            {
                "tile_type": TileType.MVT, "tile_compression": Compression.GZIP,
                "min_zoom": MIN_Z, "max_zoom": MAX_Z,
                "min_lon_e7": e7(bounds[0]), "min_lat_e7": e7(bounds[1]),
                "max_lon_e7": e7(bounds[2]), "max_lat_e7": e7(bounds[3]),
                "center_zoom": 14, "center_lon_e7": e7(CENTER[0]), "center_lat_e7": e7(CENTER[1]),
            },
            {"name": "mini-test-pack", "format": "pbf", "version": "3.15", "type": "baselayer",
             "attribution": "Synthetic test data, not real", "vector_layers": layer_defs},
        )
    print(f"{out}: {len(tiles)} tiles, bounds {[round(b, 4) for b in bounds]}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
