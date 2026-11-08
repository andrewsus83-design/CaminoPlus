"""Tests for scripts/merge_extracts.sh, the step of build_stage.sh that joins the OSM extracts of one stage.

Two Geofabrik extracts come from two snapshots of OpenStreetMap. An object near the border can be in both with
two versions (a node edited between the snapshots). `osmium merge` keeps both, and `osmium extract` then stops
with "Node ID twice in input": that is what failed the stages camino-portugues-05 and -06 (Portugal + Galicia).
The extracts below are written at test time as OSM XML and turned into PBF files by osmium itself (no binary
fixture in the repository), and the script is run the way build_stage.sh runs it, followed by the same
`osmium extract --strategy=smart` that build_stage.sh runs next.

Needs the osmium command (osmium-tool); on a machine without it the tests are skipped, but under CI (the CI
variable is set) a missing command is an error.

Run from tools/offline-maps:  python3 -m unittest discover -s test
"""
import os
import shutil
import subprocess
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCRIPT = HERE.parent / "scripts" / "merge_extracts.sh"
HAVE_OSMIUM = shutil.which("osmium") is not None

# The search box of a stage: it holds every made-up object.
BBOX = "-9,41,-7,43"
T1, T2 = "2026-11-01T10:00:00Z", "2026-11-05T10:00:00Z"


def node(id, version, lat, lon, ts=T1, tags=None):
    inner = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in (tags or {}).items())
    return f'<node id="{id}" version="{version}" timestamp="{ts}" uid="1" user="u" changeset="1" lat="{lat}" lon="{lon}">{inner}</node>'


def way(id, version, refs, ts=T1, tags=None):
    nds = "".join(f'<nd ref="{r}"/>' for r in refs)
    inner = "".join(f'<tag k="{k}" v="{v}"/>' for k, v in (tags or {}).items())
    return f'<way id="{id}" version="{version}" timestamp="{ts}" uid="1" user="u" changeset="1">{nds}{inner}</way>'


def relation(id, version, members, ts=T1, tags=None):
    inner = "".join(f'<member type="{t}" ref="{r}" role=""/>' for t, r in members)
    inner += "".join(f'<tag k="{k}" v="{v}"/>' for k, v in (tags or {}).items())
    return f'<relation id="{id}" version="{version}" timestamp="{ts}" uid="1" user="u" changeset="1">{inner}</relation>'


class MergeExtracts(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not HAVE_OSMIUM:
            if os.environ.get("CI"):
                raise AssertionError("the osmium command is missing under CI: install osmium-tool (sudo apt-get install osmium-tool)")
            raise unittest.SkipTest("the osmium command (osmium-tool) is not installed")

    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.dir = Path(self._tmp.name)

    # --- helpers -------------------------------------------------------------------------------------------------
    def osmium(self, *args, check=True):
        return subprocess.run(["osmium", *map(str, args)], capture_output=True, text=True, check=check)

    def extract_file(self, name, objects):
        """Write the objects (nodes, then ways, then relations, each by id) as <name>.osm.pbf."""
        xml = self.dir / f"{name}.osm"
        xml.write_text("<?xml version='1.0' encoding='UTF-8'?>\n<osm version=\"0.6\" generator=\"test\">\n" + "\n".join(objects) + "\n</osm>\n", encoding="utf-8")
        pbf = self.dir / f"{name}.osm.pbf"
        self.osmium("cat", "--overwrite", "-o", pbf, xml)
        return pbf

    def merge(self, *inputs, out="merged.osm.pbf", check=True):
        out = self.dir / out
        done = subprocess.run(["bash", str(SCRIPT), str(out), *map(str, inputs)], capture_output=True, text=True)
        if check:
            self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        return out, done

    def objects(self, pbf):
        """Every object of a file, in file order: [(type, id, version)]. A repeated id shows up as a repeated entry."""
        root = ET.fromstring(self.osmium("cat", "-f", "osm", "-o", "-", pbf).stdout)
        return [(el.tag, int(el.get("id")), int(el.get("version"))) for el in root if el.tag in ("node", "way", "relation")]

    def detail(self, pbf):
        """Everything that matters about each object, to compare two files: type, id, version, position, members, tags."""
        root = ET.fromstring(self.osmium("cat", "-f", "osm", "-o", "-", pbf).stdout)
        out = []
        for el in root:
            if el.tag not in ("node", "way", "relation"):
                continue
            out.append((
                el.tag, el.get("id"), el.get("version"), el.get("lat"), el.get("lon"),
                tuple((c.get("ref"), c.get("type")) for c in el if c.tag in ("nd", "member")),
                tuple(sorted((c.get("k"), c.get("v")) for c in el if c.tag == "tag")),
            ))
        return out

    def extract_step(self, pbf):
        """The step build_stage.sh runs next. It stops on an id that appears twice."""
        return self.osmium("extract", "--overwrite", "--strategy=smart", "-b", BBOX, "-o", self.dir / "stage.osm.pbf", pbf, check=False)

    # --- the extracts ----------------------------------------------------------------------------------------------
    def two_snapshots(self):
        """Portugal and Galicia: node 2 and way 10 are in both, the same. Node 3 is at version 2 in the first file and
        at version 3, moved a little, in the second (edited between the two snapshots)."""
        a = self.extract_file("a", [
            node(1, 1, 42.000, -8.000), node(2, 1, 42.001, -8.001), node(3, 2, 42.002, -8.002, ts=T1),
            way(10, 1, [1, 2, 3], tags={"highway": "path"}),
        ])
        b = self.extract_file("b", [
            node(2, 1, 42.001, -8.001), node(3, 3, 42.0021, -8.0021, ts=T2), node(4, 1, 42.003, -8.003),
            way(10, 1, [1, 2, 3], tags={"highway": "path"}),
        ])
        return a, b

    # --- tests -------------------------------------------------------------------------------------------------------
    def test_the_script_can_be_run(self):
        # build_stage.sh runs it directly, so the executable bit must be committed.
        self.assertTrue(os.access(SCRIPT, os.X_OK), f"{SCRIPT} is not executable")

    def test_premise_a_plain_merge_cannot_be_extracted(self):
        # The reason for the script. If a newer osmium handles this itself, the script is no longer needed.
        a, b = self.two_snapshots()
        plain = self.dir / "plain.osm.pbf"
        self.osmium("merge", "--overwrite", "-o", plain, a, b)
        if self.extract_step(plain).returncode == 0:
            self.skipTest("this osmium extracts a plain merge of two versions of one object without complaint")
        self.assertIn(("node", 3, 2), self.objects(plain))
        self.assertIn(("node", 3, 3), self.objects(plain))

    def test_two_snapshots_keep_the_newest_version_and_can_be_extracted(self):
        a, b = self.two_snapshots()
        out, _ = self.merge(a, b)
        self.assertEqual(self.objects(out), [("node", 1, 1), ("node", 2, 1), ("node", 3, 3), ("node", 4, 1), ("way", 10, 1)])
        done = self.extract_step(out)
        self.assertEqual(done.returncode, 0, done.stdout + done.stderr)
        self.assertEqual(self.objects(self.dir / "stage.osm.pbf"), [("node", 1, 1), ("node", 2, 1), ("node", 3, 3), ("node", 4, 1), ("way", 10, 1)])
        # The newest version brings its own position.
        node3 = [d for d in self.detail(out) if d[:2] == ("node", "3")][0]
        self.assertEqual((node3[3], node3[4]), ("42.0021", "-8.0021"))

    def test_the_order_of_the_extracts_does_not_matter(self):
        # camino-portugues-05 lists Portugal first, -06 lists Galicia first.
        a, b = self.two_snapshots()
        first, _ = self.merge(a, b, out="ab.osm.pbf")
        second, _ = self.merge(b, a, out="ba.osm.pbf")
        self.assertEqual(self.detail(first), self.detail(second))

    def test_newest_version_of_a_way_and_a_relation(self):
        a = self.extract_file("a", [
            node(1, 1, 42.0, -8.0), node(2, 1, 42.1, -8.1),
            way(10, 2, [1, 2], tags={"highway": "path"}),
            relation(100, 7, [("way", 10)], ts=T1, tags={"type": "route", "route": "hiking", "name": "Old name"}),
        ])
        b = self.extract_file("b", [
            node(1, 1, 42.0, -8.0), node(2, 1, 42.1, -8.1), node(3, 1, 42.2, -8.2),
            way(10, 3, [1, 2, 3], ts=T2, tags={"highway": "path"}),
            relation(100, 8, [("way", 10)], ts=T2, tags={"type": "route", "route": "hiking", "name": "New name"}),
        ])
        out, _ = self.merge(a, b)
        detail = {d[:2]: d for d in self.detail(out)}
        self.assertEqual(detail[("way", "10")][2], "3")
        self.assertEqual([ref for ref, _ in detail[("way", "10")][5]], ["1", "2", "3"])
        self.assertEqual(detail[("relation", "100")][2], "8")
        self.assertIn(("name", "New name"), detail[("relation", "100")][6])
        self.assertEqual(self.extract_step(out).returncode, 0)

    def test_extracts_of_one_snapshot_come_out_as_a_plain_merge_does(self):
        # The Camino Francés stages that join two Spanish regions: every shared object has the same version in both files.
        a = self.extract_file("a", [
            node(1, 1, 42.0, -8.0), node(2, 4, 42.1, -8.1, tags={"amenity": "drinking_water"}), node(3, 2, 42.2, -8.2),
            way(10, 2, [1, 2, 3], tags={"highway": "path"}),
            relation(100, 7, [("way", 10), ("node", 1)], tags={"type": "route", "route": "hiking"}),
        ])
        b = self.extract_file("b", [
            node(2, 4, 42.1, -8.1, tags={"amenity": "drinking_water"}), node(3, 2, 42.2, -8.2), node(4, 1, 42.3, -8.3),
            way(10, 2, [1, 2, 3], tags={"highway": "path"}), way(11, 1, [3, 4], tags={"highway": "track"}),
            relation(100, 7, [("way", 10), ("node", 1)], tags={"type": "route", "route": "hiking"}),
        ])
        plain = self.dir / "plain.osm.pbf"
        self.osmium("merge", "--overwrite", "-o", plain, a, b)
        out, _ = self.merge(a, b)
        self.assertEqual(self.detail(out), self.detail(plain))
        self.assertEqual(self.extract_step(out).returncode, 0)

    def test_three_extracts(self):
        a, b = self.two_snapshots()
        c = self.extract_file("c", [node(3, 4, 42.0022, -8.0022, ts="2026-11-06T10:00:00Z"), node(5, 1, 42.004, -8.004)])
        out, _ = self.merge(a, b, c)
        self.assertEqual(self.objects(out), [("node", 1, 1), ("node", 2, 1), ("node", 3, 4), ("node", 4, 1), ("node", 5, 1), ("way", 10, 1)])

    def test_one_extract_is_passed_through(self):
        a, _ = self.two_snapshots()
        out, _ = self.merge(a)
        self.assertEqual(self.detail(out), self.detail(a))

    def test_no_temporary_file_is_left_behind(self):
        a, b = self.two_snapshots()
        before = set(os.listdir(self.dir))
        self.merge(a, b)
        self.assertEqual(set(os.listdir(self.dir)) - before, {"merged.osm.pbf"})

    def test_usage(self):
        for args in ([], ["only-the-output.osm.pbf"]):
            done = subprocess.run(["bash", str(SCRIPT), *args], capture_output=True, text=True)
            self.assertEqual(done.returncode, 2)
            self.assertIn("usage", done.stderr)

    def test_a_missing_input_fails_instead_of_writing_a_partial_file(self):
        a, _ = self.two_snapshots()
        out, done = self.merge(a, self.dir / "does-not-exist.osm.pbf", check=False)
        self.assertNotEqual(done.returncode, 0)
        self.assertFalse(out.exists(), "a failed merge must not leave a merged file for the next step to use")
        self.assertEqual([n for n in os.listdir(self.dir) if n.endswith(".history")], [])


if __name__ == "__main__":
    unittest.main()
