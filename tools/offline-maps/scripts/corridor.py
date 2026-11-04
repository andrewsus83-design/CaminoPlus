#!/usr/bin/env python3
"""Buffer a stage route into the corridor that the offline pack covers.

Writes three files next to <out_prefix>:
  <out_prefix>.poly     Osmosis polygon, passed to Planetiler --polygon
  <out_prefix>.geojson  same polygon, for previews and the viewer
  <out_prefix>.bbox     "minlon,minlat,maxlon,maxlat" for Planetiler --bounds and osmium

Usage: corridor.py <route.geojson> <buffer_km> <out_prefix>
"""
import json
import sys

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import mapping, shape
from shapely.ops import unary_union

# ETRS89 / UTM 30N: metres, good for the whole Pyrenees and northern Spain.
# Other routes (Portugal, Italy, Japan, ...) should pick their own UTM zone.
METRIC_CRS = 25830


def transform(fn, geom):
    """Reproject a shapely geometry with a pyproj transform function."""
    return shapely.transform(geom, lambda c: np.column_stack(fn(c[:, 0], c[:, 1])))


def main(route_path, buffer_km, out_prefix):
    fc = json.load(open(route_path))
    feats = fc["features"] if fc.get("type") == "FeatureCollection" else [fc]
    route = unary_union([shape(f["geometry"]) for f in feats])

    to_m = Transformer.from_crs(4326, METRIC_CRS, always_xy=True).transform
    to_deg = Transformer.from_crs(METRIC_CRS, 4326, always_xy=True).transform

    route_m = transform(to_m, route)
    # Round ends, simplify to keep the .poly small (Planetiler only uses it to pick tiles).
    area_m = route_m.buffer(float(buffer_km) * 1000, quad_segs=8).simplify(50)
    area = transform(to_deg, area_m)

    polys = list(getattr(area, "geoms", [area]))
    with open(out_prefix + ".poly", "w") as f:
        f.write("corridor\n")
        for i, p in enumerate(polys, 1):
            f.write(f"{i}\n")
            for x, y in p.exterior.coords:
                f.write(f"   {x:.6f}   {y:.6f}\n")
            f.write("END\n")
            for j, ring in enumerate(p.interiors, 1):
                f.write(f"!{i}_{j}\n")
                for x, y in ring.coords:
                    f.write(f"   {x:.6f}   {y:.6f}\n")
                f.write("END\n")
        f.write("END\n")

    json.dump({"type": "Feature", "properties": {"buffer_km": float(buffer_km)},
               "geometry": mapping(area)}, open(out_prefix + ".geojson", "w"))

    minx, miny, maxx, maxy = area.bounds
    with open(out_prefix + ".bbox", "w") as f:
        f.write(f"{minx:.5f},{miny:.5f},{maxx:.5f},{maxy:.5f}")

    print(f"corridor: route {route_m.length / 1000:.1f} km, buffer {buffer_km} km, "
          f"area {area_m.area / 1e6:.0f} km2, bbox {minx:.4f},{miny:.4f},{maxx:.4f},{maxy:.4f}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    main(*sys.argv[1:])
