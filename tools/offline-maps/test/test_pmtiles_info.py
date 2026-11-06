"""Tests for scripts/pmtiles_info.py (standard library only).
Run from tools/offline-maps:  python3 -m unittest discover -s test
"""
import gzip
import json
import struct
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "scripts"))

import pmtiles_info  # noqa: E402


def make_archive(metadata: dict, tiles=21, min_zoom=8, max_zoom=15, compression=2, version=3) -> bytes:
    """A minimal PMTiles v3 file: 127-byte header + metadata block (no real tile data)."""
    meta = gzip.compress(json.dumps(metadata).encode()) if compression == 2 else json.dumps(metadata).encode()
    header = bytearray(127)
    header[0:7] = b"PMTiles"
    header[7] = version
    # root dir (offset, length), metadata (offset, length), leaf dirs, tile data, then the three counts
    struct.pack_into("<11Q", header, 8, 127, 0, 127, len(meta), 127 + len(meta), 0, 127 + len(meta), 0, tiles, tiles, tiles)
    struct.pack_into("<6B", header, 96, 1, compression, 2, 1, min_zoom, max_zoom)
    struct.pack_into("<4i", header, 102, int(-1.25 * 1e7), int(43.15 * 1e7), int(-1.22 * 1e7), int(43.17 * 1e7))
    return bytes(header) + meta


class PmtilesInfo(unittest.TestCase):
    def read(self, raw: bytes) -> dict:
        with tempfile.NamedTemporaryFile(suffix=".pmtiles") as f:
            f.write(raw)
            f.flush()
            return pmtiles_info.info(f.name)

    def test_header_and_layers(self):
        meta = {"vector_layers": [{"id": "poi"}, {"id": "building"}, {"id": "place"}]}
        out = self.read(make_archive(meta, tiles=1536, min_zoom=0, max_zoom=15))
        self.assertEqual(out["tiles"], 1536)
        self.assertEqual((out["pack_min_zoom"], out["pack_max_zoom"]), (0, 15))
        self.assertEqual(out["layers"], ["building", "place", "poi"])
        self.assertEqual(out["tile_type"], "mvt")
        self.assertEqual(out["pack_bounds"], [-1.25, 43.15, -1.22, 43.17])

    def test_uncompressed_metadata_and_missing_layers(self):
        self.assertEqual(self.read(make_archive({"name": "x"}, compression=1))["layers"], [])

    def test_unreadable_metadata_compression_gives_no_layers(self):
        # brotli (3) cannot be read with the standard library: layers stay unknown, no crash
        raw = bytearray(make_archive({"vector_layers": [{"id": "poi"}]}, compression=1))
        raw[97] = 3
        self.assertEqual(self.read(bytes(raw))["layers"], [])

    def test_rejects_other_files(self):
        with self.assertRaises(ValueError):
            pmtiles_info.parse_header(b"not a pmtiles file" * 10)
        with self.assertRaises(ValueError):
            pmtiles_info.parse_header(make_archive({}, version=2))

    def test_committed_fixture(self):
        out = pmtiles_info.info(str(HERE / "fixtures" / "mini.pmtiles"))
        self.assertEqual(out["tiles"], 21)
        self.assertEqual(out["pack_max_zoom"], 15)
        for layer in ("building", "place", "poi", "transportation", "transportation_name"):
            self.assertIn(layer, out["layers"])


if __name__ == "__main__":
    unittest.main()
