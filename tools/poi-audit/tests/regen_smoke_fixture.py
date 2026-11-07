"""The rows of supabase/dev/osm_import_smoke.sql are the importer's real output, not an imitation.

This builds them (a few real places of the stage 1 fixture, one per category, plus the odd ones) and, run as a
script, writes them into the block between the two marker lines of that SQL file:

    python tools/poi-audit/tests/regen_smoke_fixture.py

tests/test_smoke_fixture.py fails when the block no longer equals what the importer makes, and says to run this.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
sys.path.insert(0, str(HERE))

from poi_audit import export  # noqa: E402

SQL = HERE.parents[2] / "supabase" / "dev" / "osm_import_smoke.sql"
BEGIN = "-- BEGIN importer output"
END = "-- END importer output"
ORDER = ("stays", "pois", "stage_stays", "stage_pois", "categories", "insert_only")


def pick(rows):
    """The first row of every category, plus the first of each odd kind: a way, a relation, a WhatsApp number,
    a Wikidata id, a place with a default name."""
    chosen = {}
    for r in rows:
        chosen.setdefault(("category", r["category"]), r)
    for label, test in (("way", lambda r: r["osm_type"] == "way"), ("relation", lambda r: r["osm_type"] == "relation"),
                        ("whatsapp", lambda r: r.get("whatsapp")), ("wikidata", lambda r: r.get("wikidata_id")),
                        ("default name", lambda r: r.get("tags", {}).get("name_default")), ("beds", lambda r: r.get("beds"))):
        first = next((r for r in rows if test(r)), None)
        if first is not None:
            chosen.setdefault((label, first["osm_type"], first["osm_id"]), first)
    unique = {(r["osm_type"], r["osm_id"]): r for r in chosen.values()}
    return [unique[k] for k in sorted(unique, key=lambda k: (export.OSM_TYPES.index(k[0]), k[1]))]


def documents() -> dict:
    from test_export import fixture_plan
    plan, _ = fixture_plan("01")
    stays, pois = pick(plan.stays), pick(plan.pois)
    keys = {"stage_stays": {(r["osm_type"], r["osm_id"]) for r in stays}, "stage_pois": {(r["osm_type"], r["osm_id"]) for r in pois}}
    return {
        "stays": stays,
        "pois": pois,
        "stage_stays": [l for l in plan.stage_stays if (l["osm_type"], l["osm_id"]) in keys["stage_stays"]],
        "stage_pois": [l for l in plan.stage_pois if (l["osm_type"], l["osm_id"]) in keys["stage_pois"]],
        "categories": {"stays": list(export.STAY_CATEGORIES), "pois": list(export.POI_CATEGORIES)},
        "insert_only": {t: list(export.INSERT_ONLY[t]) for t in ("stays", "pois")},
    }


def render(docs: dict) -> str:
    out = [BEGIN + " (tools/poi-audit/tests/regen_smoke_fixture.py writes this block, tests/test_smoke_fixture.py checks it)",
           "create temp table osm_fixture (name text primary key, doc jsonb not null);", "insert into osm_fixture (name, doc) values"]
    parts = []
    for name in ORDER:
        doc = docs[name]
        body = "[\n" + ",\n".join(export.dumps(r) for r in doc) + "\n]" if isinstance(doc, list) else json.dumps(doc, ensure_ascii=False)
        parts.append(f"  ('{name}', $json${body}$json$)")
    out.append(",\n".join(parts) + ";")
    out.append(END)
    return "\n".join(out)


def read_block(text: str) -> dict:
    """{name: parsed document} of the block in the SQL file."""
    block = text[text.index(BEGIN):text.index(END)]
    return {m.group(1): json.loads(m.group(2)) for m in re.finditer(r"\('(\w+)', \$json\$(.*?)\$json\$\)", block, re.S)}


def main() -> int:
    text = SQL.read_text(encoding="utf-8")
    start, stop = text.index(BEGIN), text.index(END) + len(END)
    SQL.write_text(text[:start] + render(documents()) + text[stop:], encoding="utf-8")
    print(f"rewrote the importer output block of {SQL.relative_to(HERE.parents[2])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
