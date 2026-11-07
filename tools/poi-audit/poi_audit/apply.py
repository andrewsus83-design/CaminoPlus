"""Send the rows of a plan to Supabase through PostgREST, and check that they arrived.

The only things that talk to the database are in this file, and they use the service role key, which
bypasses row level security. So:

* The URL and the key come from the environment (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and nowhere
  else. They are never printed, never written to a file and never put into an error: every message that
  leaves this module goes through Client.clean(), and a failed request is reported by its status and the
  database's own error text, not by the exception of the HTTP library (which carries the address).
* Everything is read first (does the stage exist, which of these places are already there) and nothing is
  written when that fails.
* An upsert (Prefer: resolution=merge-duplicates, on_conflict=osm_type,osm_id) overwrites every column in
  the payload and leaves the others alone. So an existing row is sent WITHOUT the columns that are written
  only when a row is created (export.INSERT_ONLY: source, route_id, data_confidence, verification_level),
  and a row that somebody else looks after is not sent at all: verified by an owner, a pilgrim or an editor
  (verification_level or verified_at), claimed by a business (business_id, owner_verified_at: the owner
  edits the phone, the hours and the beds there), owned by another source, or deleted. A re-run therefore
  never lowers a trust level, never overwrites what an owner entered and never brings a deleted place back.
* The link rows need the ids of the places, which the database generates, so they are written after the
  places, with the ids that came back.
"""
from __future__ import annotations

import json
import re
import time
from urllib.parse import urlsplit

import requests

from .export import COLUMNS, INSERT_ONLY, UUID_OK, Plan

BATCH = 500            # rows per request
ID_CHUNK = 100         # ids per read filter: keeps the URL short
KEY_CHUNK = 100
PROTECTED_LEVELS = ("owner", "pilgrim", "editor")
# What is read about an existing place to decide whether it may be refreshed (pois have no business columns).
EXISTING_COLUMNS = {"stays": "id,osm_type,osm_id,source,verification_level,deleted_at,verified_at,business_id,owner_verified_at",
                    "pois": "id,osm_type,osm_id,source,verification_level,deleted_at,verified_at"}
RETRY_STATUS = (429, 500, 502, 503, 504)
LOCAL_HOSTS = ("localhost", "127.0.0.1", "::1")


class ApplyError(Exception):
    """Nothing the person running this needs a traceback for; the message is safe to print."""


class Client:
    """A small PostgREST client for the service role."""

    def __init__(self, url: str, key: str, session=None, timeout: float = 60, tries: int = 3, sleep=time.sleep):
        self.base = url.rstrip("/") + "/rest/v1"
        self._key = key
        self._secrets = [s for s in (key, url.rstrip("/"), urlsplit(url).netloc) if s]
        self.session = session or requests.Session()
        self.timeout, self.tries, self._sleep = timeout, tries, sleep

    @classmethod
    def from_env(cls, env, **kwargs) -> "Client":
        url = (env.get("SUPABASE_URL") or "").strip()
        key = (env.get("SUPABASE_SERVICE_ROLE_KEY") or "").strip()
        missing = [name for name, value in (("SUPABASE_URL", url), ("SUPABASE_SERVICE_ROLE_KEY", key)) if not value]
        if missing:
            raise ApplyError("--apply needs " + " and ".join(missing) + " in the environment")
        parts = urlsplit(url)
        local = parts.hostname in LOCAL_HOSTS
        if parts.scheme not in ("https", "http") or not parts.hostname or (parts.scheme == "http" and not local):
            raise ApplyError("SUPABASE_URL must be an https:// address (http:// is accepted for localhost only)")
        if parts.username or parts.password or parts.query or parts.fragment or parts.path not in ("", "/"):
            raise ApplyError("SUPABASE_URL must be the project address only, without a path, login or query")
        return cls(url, key, **kwargs)

    def clean(self, text) -> str:
        """`text` with the key and the address taken out."""
        out = str(text)
        for secret in self._secrets:
            out = out.replace(secret, "[hidden]")
        return out

    def _send(self, method: str, table: str, what: str, params=None, body=None, prefer: str | None = None):
        headers = {"apikey": self._key, "Authorization": f"Bearer {self._key}", "Accept": "application/json"}
        if prefer:
            headers["Prefer"] = prefer
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        for attempt in range(1, self.tries + 1):
            try:
                r = self.session.request(method, f"{self.base}/{table}", params=params, data=data, headers=headers, timeout=self.timeout)
            except requests.RequestException as e:
                # Not str(e): it names the address.
                if attempt < self.tries:
                    self._sleep(2 * attempt * attempt)
                    continue
                raise ApplyError(f"{what}: could not reach the database ({type(e).__name__})") from None
            if r.status_code in RETRY_STATUS and attempt < self.tries:
                self._sleep(2 * attempt * attempt)
                continue
            if not 200 <= r.status_code < 300:
                raise ApplyError(f"{what}: HTTP {r.status_code}{self._why(r)}")
            return r
        raise AssertionError("unreachable")

    def _why(self, r) -> str:
        try:
            e = r.json()
            text = " ".join(str(e[k]) for k in ("code", "message", "details", "hint") if e.get(k))
        except ValueError:
            text = r.text
        text = self.clean(text).strip()
        return f" {text[:400]}" if text else ""

    def select(self, table: str, params: dict, what: str, count: bool = False):
        """(rows, total) of a read. `total` is the exact count when asked for, else None."""
        r = self._send("GET", table, what, params=params, prefer="count=exact" if count else None)
        try:
            rows = r.json()
        except ValueError:
            raise ApplyError(f"{what}: the answer is not JSON") from None
        if not isinstance(rows, list):
            raise ApplyError(f"{what}: the answer is not a list of rows")
        total = None
        if count:
            m = re.search(r"/(\d+)$", r.headers.get("Content-Range", ""))
            total = int(m.group(1)) if m else len(rows)
        return rows, total

    def upsert(self, table: str, rows: list, conflict: str, columns, select: str, what: str) -> list:
        params = {"on_conflict": conflict, "columns": ",".join(columns), "select": select}
        r = self._send("POST", table, what, params=params, body=rows, prefer="resolution=merge-duplicates,return=representation")
        try:
            back = r.json()
        except ValueError:
            raise ApplyError(f"{what}: the answer is not JSON") from None
        if not isinstance(back, list) or len(back) != len(rows):
            raise ApplyError(f"{what}: sent {len(rows)} rows, the database answered with "
                             f"{len(back) if isinstance(back, list) else 'something else'}")
        return back


def chunks(items, size):
    items = list(items)
    for i in range(0, len(items), size):
        yield items[i:i + size]


def key_of(row: dict) -> tuple:
    return row["osm_type"], row["osm_id"]


# ---------------------------------------------------------------------------
# reads
# ---------------------------------------------------------------------------
def stage_problem(client: Client, stage: dict) -> str | None:
    """None when the stage row exists for this route and number; else why the link rows must be refused."""
    rows, _ = client.select("stages", {"id": f"eq.{stage['stage_id']}", "select": "id,route_id,stage_number,deleted_at"}, "reading the stage row")
    what = f"stage {stage['slug']} ({stage['stage_id']})"
    if not rows:
        return f"{what} is not in the database"
    row = rows[0]
    if row.get("deleted_at"):
        return f"{what} is in the database but deleted"
    if row.get("route_id") != stage["route_id"]:
        return f"{what} belongs to route {row.get('route_id')} in the database, the stage file says {stage['route_id']}"
    if row.get("stage_number") != stage["stage_number"]:
        return f"{what} is stage number {row.get('stage_number')} in the database, the stage file says {stage['stage_number']}"
    return None


def route_exists(client: Client, route_id: str) -> bool:
    rows, _ = client.select("routes", {"id": f"eq.{route_id}", "select": "id"}, "reading the route row")
    return bool(rows)


def find_existing(client: Client, table: str, rows: list) -> dict:
    """{(osm_type, osm_id): database row} for the places of `rows` that are already in `table`."""
    wanted = {key_of(r) for r in rows}
    found: dict = {}
    for part in chunks(sorted({i for _, i in wanted}), KEY_CHUNK):
        got, _ = client.select(table, {"osm_id": f"in.({','.join(map(str, part))})", "select": EXISTING_COLUMNS[table]},
                               f"reading existing {table}")
        for row in got:
            if isinstance(row, dict) and key_of(row) in wanted:
                found[key_of(row)] = row
    return found


def classify(existing: dict | None) -> str:
    """new | refresh | left_alone | deleted"""
    if existing is None:
        return "new"
    if existing.get("deleted_at"):
        return "deleted"
    if (existing.get("source") != "osm" or existing.get("verification_level") in PROTECTED_LEVELS or existing.get("verified_at")
            or existing.get("business_id") or existing.get("owner_verified_at")):
        return "left_alone"
    return "refresh"


# ---------------------------------------------------------------------------
# writes
# ---------------------------------------------------------------------------
def write_places(client: Client, table: str, rows: list, existing: dict, log) -> tuple[dict, dict]:
    """Upsert the places of one table. Returns ({(osm_type, osm_id): id}, counts)."""
    groups: dict[str, list] = {"new": [], "refresh": []}
    counts = {"new": 0, "refreshed": 0, "left_alone": 0, "deleted": 0}
    ids: dict = {}
    for row in rows:
        kind = classify(existing.get(key_of(row)))
        if kind in ("new", "refresh"):
            groups[kind].append(row)
        else:
            counts["left_alone" if kind == "left_alone" else "deleted"] += 1
            if kind == "left_alone":
                ids[key_of(row)] = existing[key_of(row)]["id"]
    shapes = {"new": COLUMNS[table], "refresh": tuple(c for c in COLUMNS[table] if c not in INSERT_ONLY[table])}
    for kind, label in (("new", "new"), ("refresh", "refreshed")):
        for part in chunks(groups[kind], BATCH):
            cols = shapes[kind]
            back = client.upsert(table, [{c: r[c] for c in cols} for r in part], "osm_type,osm_id", cols,
                                 "id,osm_type,osm_id", f"writing {table}")
            sent = {key_of(r) for r in part}
            for row in back:
                if not isinstance(row, dict) or key_of(row) not in sent or not UUID_OK.match(str(row.get("id"))):
                    raise ApplyError(f"writing {table}: the database answered with a row that was not sent")
                ids[key_of(row)] = row["id"]
            counts[label] += len(part)
    log(f"apply: {table}: {counts['new']} new, {counts['refreshed']} refreshed, {counts['left_alone']} left alone "
        f"(verified, claimed by a business or not from OSM), {counts['deleted']} deleted in the database (left deleted)")
    return ids, counts


def write_links(client: Client, table: str, parent: str, links: list, ids: dict, stage_id: str, log) -> int:
    column = "stay_id" if parent == "stays" else "poi_id"
    rows = [{"stage_id": stage_id, column: ids[key_of(r)], "km_from_stage_start": r["km_from_stage_start"], "detour_m": r["detour_m"]}
            for r in links if key_of(r) in ids]
    cols = ("stage_id", column, "km_from_stage_start", "detour_m")
    for part in chunks(rows, BATCH):
        client.upsert(table, part, f"stage_id,{column}", cols, f"stage_id,{column}", f"writing {table}")
    log(f"apply: {table}: {len(rows)} written" + (f", {len(links) - len(rows)} skipped (place deleted in the database)" if len(rows) < len(links) else ""))
    return len(rows)


# ---------------------------------------------------------------------------
# the whole thing
# ---------------------------------------------------------------------------
def apply_plan(client: Client, plan: Plan, log=print) -> dict:
    """Write one stage. Returns a report (counts and problems, no secrets). `report["ok"]` is False when
    something was refused or did not read back."""
    stage = plan.stage
    report: dict = {"stage": stage["slug"], "places": {}, "links": {}, "problems": [], "ok": True}

    # 1. read everything first
    problem = stage_problem(client, stage)
    if plan.stays and not route_exists(client, stage["route_id"]):
        raise ApplyError(f"route {stage['route_id']} is not in the database, so stays cannot point at it (stays.route_id): nothing was written")
    existing = {"stays": find_existing(client, "stays", plan.stays), "pois": find_existing(client, "pois", plan.pois)}

    # 2. the places
    ids: dict = {}
    for table, rows in (("stays", plan.stays), ("pois", plan.pois)):
        ids[table], report["places"][table] = write_places(client, table, rows, existing[table], log)

    # 3. the links, only when the stage row is there
    if problem:
        refused = len(plan.stage_stays) + len(plan.stage_pois)
        report["links"] = {"refused": problem, "stage_stays": 0, "stage_pois": 0}
        report["problems"].append(f"{problem}: the {len(plan.stage_stays)} stage_stays and {len(plan.stage_pois)} stage_pois rows of this stage "
                                  f"were NOT written ({refused} rows). Add the stage row, then run this again.")
        report["ok"] = False
        log("apply: REFUSED the link rows: " + report["problems"][-1])
    else:
        report["links"] = {"stage_stays": write_links(client, "stage_stays", "stays", plan.stage_stays, ids["stays"], stage["stage_id"], log),
                           "stage_pois": write_links(client, "stage_pois", "pois", plan.stage_pois, ids["pois"], stage["stage_id"], log)}

    # 4. read it back
    bad = verify(client, plan, ids, report["links"], problem is None)
    report["verified"] = not bad
    report["problems"].extend(bad)
    report["ok"] = report["ok"] and not bad
    if bad:
        log("apply: READ-BACK MISMATCH: " + "; ".join(bad))
    else:
        log("apply: counts read back match what was sent" + ("" if problem is None else " (the places only: no link rows were written)"))
    return report


def verify(client: Client, plan: Plan, ids: dict, links: dict, links_written: bool) -> list[str]:
    bad: list[str] = []
    for table, rows in (("stays", plan.stays), ("pois", plan.pois)):
        found = find_existing(client, table, rows)
        missing = sorted({key_of(r) for r in rows} - set(found))
        if missing:
            bad.append(f"{len(missing)} of {len(rows)} {table} are not in the database after writing, for example "
                       + ", ".join(f"{t}/{i}" for t, i in missing[:3]))
    if links_written:
        for table, parent, column in (("stage_stays", "stays", "stay_id"), ("stage_pois", "pois", "poi_id")):
            wanted = sorted(ids[parent][key_of(r)] for r in getattr(plan, table) if key_of(r) in ids[parent])
            total = 0
            for part in chunks(wanted, ID_CHUNK // 2):
                _, n = client.select(table, {"stage_id": f"eq.{plan.stage['stage_id']}", column: f"in.({','.join(part)})", "select": column},
                                     f"counting {table}", count=True)
                total += n
            if total != links[table]:
                bad.append(f"{table}: wrote {links[table]} rows, the database has {total} of them for this stage")
    return bad
