"""A mock of the part of PostgREST (the REST API in front of Supabase's Postgres) that the importer uses.

It is strict on purpose. It refuses what the real database or PostgREST would refuse (a category outside the
CHECK list, a column that does not exist, a generated column, a location that is not EWKT, a duplicate key
inside one batch, a link row for a stage that is not there, more than 500 rows in a request), so a mistake in
the importer fails a test and not a night's import. The schema comes from the migrations (support_import).
"""
from __future__ import annotations

import json
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from support_import import table_definition


SERVICE_KEY = "test-service-key-4f9c1d2e7a-NOT-A-REAL-KEY"
UUID_RX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
EWKT_RX = re.compile(r"^SRID=4326;POINT\(-?\d+(\.\d+)? -?\d+(\.\d+)?\)$")


class MockSupabase:
    """Serves /rest/v1 for stages, routes, stays, pois, stage_stays and stage_pois from memory.

    stages  {stage_id: {route_id, stage_number, deleted_at}}      routes  set of route ids
    places  {'stays': {(osm_type, osm_id): row}, 'pois': ...}     links   {'stage_stays': {(stage_id, place_id): row}, ...}
    fail    {(method, table): [status or (status, message), ...]}  answer these first, then behave. A message may hold
            {key} and {url}: a server that echoes what it was sent, to prove the importer never prints it
    lose_links  {table: True}                     acknowledge the first link row of every batch but do not store it (a database that lies)
    """

    def __init__(self, stages=None, routes=None, key: str = SERVICE_KEY, fail=None, lose_links=None):
        self.key = key
        self.stages = dict(stages or {})
        self.routes = set(routes or ())
        self.places = {"stays": {}, "pois": {}}
        self.links = {"stage_stays": {}, "stage_pois": {}}
        self.touches: dict = {}
        self.fail = {k: list(v) for k, v in (fail or {}).items()}
        self.lose_links = dict(lose_links or {})
        self.calls: list[dict] = []
        self.defs = {t: table_definition(t) for t in ("stays", "pois")}
        outer = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):    # keep the test output quiet
                pass

            def do_GET(self):
                outer._handle(self, "GET")

            def do_POST(self):
                outer._handle(self, "POST")

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}"
        self.thread = threading.Thread(target=self.server.serve_forever, kwargs={"poll_interval": 0.01}, daemon=True)    # shutdown() waits one poll

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()

    # ---- seeding ----
    def add_place(self, table: str, osm_type: str, osm_id: int, **fields) -> str:
        row = {"id": str(uuid.uuid4()), "osm_type": osm_type, "osm_id": osm_id, "source": "osm", "verification_level": "unverified",
               "deleted_at": None, "verified_at": None, "business_id": None, "owner_verified_at": None,
               "name": f"existing {osm_id}", "data_confidence": None, "route_id": None}
        row.update(fields)
        self.places[table][(osm_type, osm_id)] = row
        return row["id"]

    def place_ids(self, table: str) -> set:
        return {r["id"] for r in self.places[table].values()}

    # ---- plumbing ----
    def _handle(self, h: BaseHTTPRequestHandler, method: str) -> None:
        parts = urlsplit(h.path)
        qs = parse_qs(parts.query, keep_blank_values=True)
        raw = h.rfile.read(int(h.headers.get("Content-Length") or 0)) if method == "POST" else b""
        headers = {k.lower(): v for k, v in h.headers.items()}
        call = {"method": method, "path": parts.path, "query": {k: v[0] for k, v in qs.items()}, "headers": headers, "raw": raw}
        self.calls.append(call)

        def send(status: int, body, extra=None):
            data = json.dumps(body).encode("utf-8")
            h.send_response(status)
            h.send_header("Content-Type", "application/json")
            h.send_header("Content-Length", str(len(data)))
            for k, v in (extra or {}).items():
                h.send_header(k, v)
            h.end_headers()
            h.wfile.write(data)

        def error(status: int, code: str, message: str):
            send(status, {"code": code, "details": None, "hint": None, "message": message})

        m = re.fullmatch(r"/rest/v1/([a-z_]+)", parts.path)
        if not m:
            return error(404, "PGRST125", "Invalid path specified in request URL")
        table = m.group(1)
        if headers.get("apikey") != self.key or headers.get("authorization") != f"Bearer {self.key}":
            return error(401, "PGRST301", "JWSError JWSInvalidSignature")
        queued = self.fail.get((method, table))
        if queued:
            item = queued.pop(0)
            status, message = item if isinstance(item, tuple) else (item, "the mock was told to fail")
            return error(status, "XX000", message.format(key=self.key, url=self.url))
        try:
            if method == "GET":
                return self._get(table, call, send, error)
            call["json"] = json.loads(raw.decode("utf-8")) if raw else None
            return self._post(table, call, send, error)
        except Exception as e:     # a bug in the mock must not look like a pass
            return error(500, "XX000", f"mock server error: {type(e).__name__}: {e}")

    @staticmethod
    def _cols(call, row: dict) -> dict:
        wanted = call["query"].get("select")
        return {c: row.get(c) for c in wanted.split(",")} if wanted else row

    def _get(self, table, call, send, error):
        q = call["query"]
        if table == "stages":
            sid = q.get("id", "")[3:]
            row = self.stages.get(sid)
            return send(200, [self._cols(call, {"id": sid, **row})] if row else [])
        if table == "routes":
            rid = q.get("id", "")[3:]
            return send(200, [{"id": rid}] if rid in self.routes else [])
        if table in ("stays", "pois"):
            ids = {int(x) for x in q["osm_id"][4:-1].split(",") if x}
            rows = [self._cols(call, r) for (t, i), r in sorted(self.places[table].items()) if i in ids]
            return send(200, rows)
        if table in ("stage_stays", "stage_pois"):
            column = "stay_id" if table == "stage_stays" else "poi_id"
            stage_id = q["stage_id"][3:]
            ids = set(q[column][4:-1].split(","))
            rows = [{column: pid} for (sid, pid) in sorted(self.links[table]) if sid == stage_id and pid in ids]
            extra = {"Content-Range": f"0-{len(rows) - 1}/{len(rows)}" if rows else "*/0"} if "count=exact" in call["headers"].get("prefer", "") else {}
            return send(200, rows, extra)
        return error(404, "42P01", f'relation "public.{table}" does not exist')

    def _post(self, table, call, send, error):
        prefer = call["headers"].get("prefer", "")
        rows, q = call["json"], call["query"]
        if "resolution=merge-duplicates" not in prefer or "return=representation" not in prefer:
            return error(400, "MOCK", f"the importer must send Prefer: resolution=merge-duplicates,return=representation, got {prefer!r}")
        if not isinstance(rows, list) or not rows or not all(isinstance(r, dict) for r in rows):
            return error(400, "22023", "a non-empty JSON array of objects is expected")
        if len(rows) > 500:
            return error(400, "MOCK", f"batches are at most 500 rows, got {len(rows)}")
        keys = list(rows[0])
        if any(list(r) != keys for r in rows):
            return error(400, "MOCK", "every row of a batch must have the same keys, in the same order")
        if q.get("columns") != ",".join(keys):
            return error(400, "MOCK", f"columns={q.get('columns')!r} must list the keys of the payload")
        if table in ("stays", "pois"):
            return self._post_places(table, rows, keys, q, send, error)
        if table in ("stage_stays", "stage_pois"):
            return self._post_links(table, rows, keys, q, send, error)
        return error(404, "42P01", f'relation "public.{table}" does not exist')

    def _post_places(self, table, rows, keys, q, send, error):
        d = self.defs[table]
        if q.get("on_conflict") != "osm_type,osm_id":
            return error(400, "42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification")
        for k in keys:
            if k in d["generated"]:
                return error(400, "428C9", f'cannot insert a non-DEFAULT value into column "{k}"')
            if k not in d["columns"]:
                return error(400, "PGRST204", f"Could not find the '{k}' column of '{table}' in the schema cache")
        seen = set()
        for r in rows:
            key = (r.get("osm_type"), r.get("osm_id"))
            if key in seen:
                return error(400, "21000", "ON CONFLICT DO UPDATE command cannot affect row a second time")
            seen.add(key)
            exists = key in self.places[table]
            for col in ("osm_type", "osm_id"):
                if r.get(col) is None:
                    return error(400, "23502", f'null value in column "{col}"')
            if r["osm_type"] not in ("node", "way", "relation"):
                return error(400, "23514", f'new row for relation "{table}" violates check constraint "{table}_osm_type_check"')
            if not exists:
                for col in ("name", "category", "location"):
                    if r.get(col) is None:
                        return error(400, "23502", f'null value in column "{col}" of relation "{table}" violates not-null constraint')
            for col, allowed in d["checks"].items():
                if col in r and r[col] is not None and r[col] not in allowed:
                    return error(400, "23514", f'new row for relation "{table}" violates check constraint "{table}_{col}_check"')
            if r.get("location") is not None and not EWKT_RX.match(str(r["location"])):
                return error(400, "XX000", "parse error - invalid geometry")
            if r.get("country_code") is not None and len(r["country_code"]) > 2:
                return error(400, "22001", "value too long for type character(2)")
            if r.get("data_confidence") is not None and not 0 <= r["data_confidence"] <= 100:
                return error(400, "23514", f'new row for relation "{table}" violates check constraint "{table}_data_confidence_check"')
            if r.get("route_id") is not None and r["route_id"] not in self.routes:
                return error(400, "23503", f'insert or update on table "{table}" violates foreign key constraint "{table}_route_id_fkey"')
        back = []
        for r in rows:
            key = (r["osm_type"], r["osm_id"])
            cur = self.places[table].get(key)
            if cur is None:
                cur = {"id": str(uuid.uuid4()), "source": "osm", "verification_level": "unverified", "deleted_at": None,
                       "data_confidence": None, "route_id": None}
                self.touches[(table, key)] = 0
            else:
                self.touches[(table, key)] = self.touches.get((table, key), 0) + 1    # the updated_at trigger
            cur.update(r)
            self.places[table][key] = cur
            back.append(self._cols({"query": q}, cur))
        return send(201, back)

    def _post_links(self, table, rows, keys, q, send, error):
        parent, column = ("stays", "stay_id") if table == "stage_stays" else ("pois", "poi_id")
        if q.get("on_conflict") != f"stage_id,{column}":
            return error(400, "42P10", "there is no unique or exclusion constraint matching the ON CONFLICT specification")
        for k in keys:
            if k not in ("stage_id", column, "km_from_stage_start", "detour_m"):
                return error(400, "PGRST204", f"Could not find the '{k}' column of '{table}' in the schema cache")
        ids = self.place_ids(parent)
        seen = set()
        for r in rows:
            if (r["stage_id"], r[column]) in seen:
                return error(400, "21000", "ON CONFLICT DO UPDATE command cannot affect row a second time")
            seen.add((r["stage_id"], r[column]))
            if r["stage_id"] not in self.stages:
                return error(409, "23503", f'insert or update on table "{table}" violates foreign key constraint "{table}_stage_id_fkey"')
            if r[column] not in ids:
                return error(409, "23503", f'insert or update on table "{table}" violates foreign key constraint "{table}_{column}_fkey"')
            if not UUID_RX.match(r["stage_id"]) or not isinstance(r.get("detour_m"), int):
                return error(400, "22P02", "invalid input")
        for i, r in enumerate(rows):
            if not (i == 0 and self.lose_links.get(table)):
                self.links[table][(r["stage_id"], r[column])] = dict(r)
        return send(201, [{k: r[k] for k in q["select"].split(",")} for r in rows])
