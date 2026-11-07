"""Helpers for the import tests: the trimmed real fixtures, and the database schema read from the migrations
(so a test fails when the importer would write something the database would refuse).
"""
from __future__ import annotations

import json
import re
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures" / "osm_import"
MIGRATIONS = HERE.parents[2] / "supabase" / "migrations"


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------
def fixture_dir(num: str) -> Path:
    return FIXTURES / f"stage-{num}"


def load_fixture_stage(num: str) -> tuple[dict, Path]:
    path = fixture_dir(num) / "stage.json"
    return json.loads(path.read_text(encoding="utf-8")), path


def replay_cache(tmp: Path, num: str):
    """A sources.Cache (offline) that answers the stage's two Overpass queries with the trimmed real answers."""
    from poi_audit import sources

    stage, _ = load_fixture_stage(num)
    cache_dir = Path(tmp) / f"cache-{num}"
    cache_dir.mkdir(parents=True, exist_ok=True)
    cache = sources.Cache(cache_dir, offline=True)
    shutil.copy(fixture_dir(num) / "overpass-route.json",
                cache.path("route", sources.overpass_route_query(stage["search_bbox"], stage["route_name_regex"])))
    shutil.copy(fixture_dir(num) / "overpass-places.json", cache.path("osm", sources.overpass_poi_query(stage["search_bbox"])))
    return cache_dir


# ---------------------------------------------------------------------------
# the schema, read from the migrations
# ---------------------------------------------------------------------------
def migrations_sql() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in sorted(MIGRATIONS.glob("*.sql")))


def _balanced(text: str, start: int) -> str:
    """The text between the parenthesis at text[start] and its partner."""
    depth, i, quote = 0, start, False
    while i < len(text):
        c = text[i]
        if c == "'":
            quote = not quote
        elif not quote and c == "(":
            depth += 1
        elif not quote and c == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1:i]
        i += 1
    raise ValueError("unbalanced parentheses")


def _top_level_items(body: str) -> list[str]:
    items, depth, quote, cur = [], 0, False, ""
    for c in body:
        if c == "'":
            quote = not quote
        if not quote and c == "(":
            depth += 1
        if not quote and c == ")":
            depth -= 1
        if c == "," and depth == 0 and not quote:
            items.append(cur.strip())
            cur = ""
        else:
            cur += c
    if cur.strip():
        items.append(cur.strip())
    return items


def table_definition(table: str, sql: str | None = None) -> dict:
    """{'columns': [...], 'generated': {...}, 'checks': {column: [allowed values]}} of public.<table>, from the
    create table statement and every later alter table ... add column."""
    sql = re.sub(r"--[^\n]*", "", sql if sql is not None else migrations_sql())    # comments hold commas and quotes
    m = re.search(rf"create\s+table\s+public\.{table}\s*\(", sql, re.I)
    if not m:
        raise ValueError(f"no create table for {table}")
    columns, generated, checks = [], set(), {}

    def column(name: str, rest: str) -> None:
        columns.append(name)
        if re.search(r"generated\s+always", rest, re.I):
            generated.add(name)
        cm = re.search(r"check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)", rest, re.I | re.S)
        if cm:
            checks[cm.group(1)] = re.findall(r"'([^']*)'", cm.group(2))

    for item in _top_level_items(_balanced(sql, m.end() - 1)):
        name, _, rest = item.partition(" ")
        if name.lower() not in ("unique", "primary", "check", "constraint", "foreign", "like", "exclude"):
            column(name.strip('"'), rest)
    for alter in re.finditer(rf"alter\s+table\s+public\.{table}\b(.*?);", sql, re.I | re.S):
        for item in _top_level_items(alter.group(1)):
            am = re.match(r"add\s+column\s+(?:if\s+not\s+exists\s+)?(\w+)(.*)$", item.strip(), re.I | re.S)
            if am:
                column(am.group(1), am.group(2))
    # A later migration can replace a CHECK (the business owners one widens stays.category): the last one wins.
    for c in re.finditer(rf"alter\s+table\s+public\.{table}\s+add\s+constraint\s+\w+\s+check\s*\(\s*(\w+)\s+in\s*\(([^)]*)\)\s*\)", sql, re.I | re.S):
        checks[c.group(1)] = re.findall(r"'([^']*)'", c.group(2))
    return {"columns": list(dict.fromkeys(columns)), "generated": generated, "checks": checks}
