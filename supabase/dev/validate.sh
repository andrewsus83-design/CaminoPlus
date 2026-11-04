#!/usr/bin/env bash
# Applies all migrations + seed to a throwaway local Postgres (with PostGIS)
# on top of local_stub.sql, then runs the RLS smoke test.
# Usage: supabase/dev/validate.sh   (needs initdb/pg_ctl/psql + postgis)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/.."
bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
data="$(mktemp -d)"
port="${PG_PORT:-54329}"
cleanup() { "$bin/pg_ctl" -D "$data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$data"; }
trap cleanup EXIT
"$bin/initdb" -D "$data" -U postgres -A trust >/dev/null
"$bin/pg_ctl" -D "$data" -o "-p $port -k /tmp" -l "$data/log" start >/dev/null
psql_() { psql -h /tmp -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
psql_ -f "$here/local_stub.sql"
for f in "$root"/migrations/*.sql; do
  echo "migrate: $(basename "$f")"
  psql_ -f "$f"
done
echo "seed: seed.sql"
psql_ -f "$root/seed.sql"
echo "test: rls_smoke.sql"
psql_ -o /dev/null -f "$here/rls_smoke.sql"
echo "OK"
