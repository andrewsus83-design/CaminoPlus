#!/usr/bin/env python3
"""Read the header and metadata of a PMTiles v3 archive (standard library only).

build_stage.sh uses this to put the real tile count, zoom range and vector layer
names into the pack manifest, so the quality gates (scripts/check_pack.mjs) can
judge a build without opening it in a browser.

Usage: pmtiles_info.py <file.pmtiles>      prints one JSON object
Spec:  https://github.com/protomaps/PMTiles/blob/main/spec/v3/spec.md
"""
import gzip
import json
import struct
import sys

HEADER_BYTES = 127
INTERNAL_COMPRESSION = {0: "unknown", 1: "none", 2: "gzip", 3: "brotli", 4: "zstd"}
TILE_TYPE = {0: "unknown", 1: "mvt", 2: "png", 3: "jpeg", 4: "webp", 5: "avif"}


def parse_header(raw: bytes) -> dict:
    if len(raw) < HEADER_BYTES or raw[:7] != b"PMTiles":
        raise ValueError("not a PMTiles archive")
    if raw[7] != 3:
        raise ValueError(f"unsupported PMTiles version {raw[7]} (need 3)")
    (_root_off, _root_len, meta_off, meta_len, _leaf_off, _leaf_len, _data_off, data_len,
     addressed, entries, contents) = struct.unpack_from("<11Q", raw, 8)
    _clustered, internal, _tile_comp, tile_type, min_zoom, max_zoom = struct.unpack_from("<6B", raw, 96)
    min_lon, min_lat, max_lon, max_lat = struct.unpack_from("<4i", raw, 102)
    return {
        "metadata_offset": meta_off,
        "metadata_length": meta_len,
        "tile_data_length": data_len,
        "addressed_tiles": addressed,
        "tile_entries": entries,
        "tile_contents": contents,
        "internal_compression": INTERNAL_COMPRESSION.get(internal, str(internal)),
        "tile_type": TILE_TYPE.get(tile_type, str(tile_type)),
        "min_zoom": min_zoom,
        "max_zoom": max_zoom,
        "bounds": [min_lon / 1e7, min_lat / 1e7, max_lon / 1e7, max_lat / 1e7],
    }


def decode_metadata(blob: bytes, compression: str) -> dict:
    if compression == "gzip":
        blob = gzip.decompress(blob)
    elif compression != "none":
        return {}  # brotli / zstd: layer names stay unknown and the quality gates say so
    return json.loads(blob.decode("utf-8")) if blob else {}


def info(path: str) -> dict:
    with open(path, "rb") as f:
        header = parse_header(f.read(HEADER_BYTES))
        f.seek(header["metadata_offset"])
        blob = f.read(header["metadata_length"])
    meta = decode_metadata(blob, header["internal_compression"])
    layers = sorted(layer["id"] for layer in meta.get("vector_layers", []) if layer.get("id"))
    return {
        "tiles": header["addressed_tiles"],
        "tile_contents": header["tile_contents"],
        "pack_min_zoom": header["min_zoom"],
        "pack_max_zoom": header["max_zoom"],
        "pack_bounds": [round(v, 5) for v in header["bounds"]],
        "tile_type": header["tile_type"],
        "layers": layers,
    }


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    print(json.dumps(info(sys.argv[1])))
