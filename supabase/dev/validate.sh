#!/usr/bin/env bash
# Applies the stub, every migration and the seed to a throwaway local Postgres (with PostGIS),
# then runs every dev/*smoke*.sql test.
#
# Usage:  supabase/dev/validate.sh        (needs initdb/pg_ctl/psql + postgis, e.g. postgresql-16-postgis-3)
#
# Environment (all optional):
#   PG_BIN              Postgres bin dir (default: newest /usr/lib/postgresql/*/bin)
#   PG_PORT             port for the throwaway server (default 54329)
#   VALIDATE_SKIP       comma separated substrings: migrations whose file name contains one are NOT applied
#                       (lets a developer test one migration in isolation)
#   VALIDATE_SMOKE      space separated smoke file names to run (default: every dev/*smoke*.sql)
#   VALIDATE_NO_SEED=1  skip seed.sql (smoke tests that need seed data will fail)
#
# initdb refuses to run as root, so when started as root the script re-runs itself as the
# `postgres` OS user (the usual case in containers).
set -euo pipefail
self="$(cd "$(dirname "$0")" && pwd)/$(basename "$0")"
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/.."

if [ "$(id -u)" = "0" ]; then
  if ! id postgres >/dev/null 2>&1; then
    echo "validate.sh: refusing to run as root and there is no 'postgres' OS user" >&2
    exit 2
  fi
  exec su postgres -c "PG_BIN='${PG_BIN:-}' PG_PORT='${PG_PORT:-}' VALIDATE_SKIP='${VALIDATE_SKIP:-}' VALIDATE_SMOKE='${VALIDATE_SMOKE:-}' VALIDATE_NO_SEED='${VALIDATE_NO_SEED:-}' bash '$self'"
fi

bin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin | tail -1)}"
data="$(mktemp -d)"
port="${PG_PORT:-54329}"
sock="$(mktemp -d)"
cleanup() { "$bin/pg_ctl" -D "$data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$data" "$sock"; }
trap cleanup EXIT
"$bin/initdb" -D "$data" -U postgres -A trust >/dev/null
"$bin/pg_ctl" -D "$data" -o "-p $port -k $sock" -l "$data/log" start >/dev/null
psql_() { psql -h "$sock" -p "$port" -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

skipped() {
  local f="$1" s
  IFS=',' read -ra parts <<< "${VALIDATE_SKIP:-}"
  for s in "${parts[@]}"; do [ -n "$s" ] && [[ "$f" == *"$s"* ]] && return 0; done
  return 1
}

psql_ -f "$here/local_stub.sql"
for f in "$root"/migrations/*.sql; do
  if skipped "$(basename "$f")"; then echo "skip:    $(basename "$f")"; continue; fi
  echo "migrate: $(basename "$f")"
  psql_ -f "$f"
done
if [ -z "${VALIDATE_NO_SEED:-}" ]; then
  echo "seed:    seed.sql"
  psql_ -f "$root/seed.sql"
fi

if [ -n "${VALIDATE_SMOKE:-}" ]; then
  smokes=($VALIDATE_SMOKE)
else
  # rls_smoke creates the users that business_smoke reuses, so those two keep their order.
  # Every other smoke file must be self-contained (create its own users, no dependence on
  # state left by other files).
  smokes=(rls_smoke.sql business_smoke.sql)
  for f in $(cd "$here" && ls *smoke*.sql); do
    case "$f" in rls_smoke.sql|business_smoke.sql) ;; *) smokes+=("$f") ;; esac
  done
fi
for t in "${smokes[@]}"; do
  echo "test:    $t"
  psql_ -o /dev/null -f "$here/$t"
done
# The mobile app and the schema are developed side by side: fail when the app asks for something the
# schema does not have. Skipped on partial runs (VALIDATE_SKIP / VALIDATE_SMOKE / VALIDATE_NO_SEED) because
# those intentionally leave objects out.
if [ -z "${VALIDATE_SKIP:-}" ] && [ -z "${VALIDATE_SMOKE:-}" ] && [ -z "${VALIDATE_NO_SEED:-}" ] && command -v python3 >/dev/null 2>&1; then
  echo "check:   client contract (mobile app vs schema)"
  python3 "$here/check_client_contract.py" --host "$sock" --port "$port"
fi
echo "OK"
