#!/usr/bin/env python3
"""Checks that what the mobile app asks of Supabase exists in the schema the migrations build.

It reads the TypeScript sources under mobile/app and mobile/src and verifies, against a live (throwaway)
Postgres that already has the migrations applied:
  - every table in `.from('table')` exists in `public`
  - the columns named in its `.select('a, b, alias:c, rel(d, e)')` string exist (embedded relations are
    followed one level at a time: `route:routes(name)` or `stages!journeys_start_stage_id_fkey(name)`)
  - the keys of an `.insert({...})` / `.update({...})` / `.upsert({...})` object literal are columns
  - every `.rpc('name', {args})` and every `/rest/v1/rpc/name` call exists with those argument names
  - every column the app reads from a function that returns a table is one the function returns: the app lists them in
    a `RPC_COLUMNS = { function_name: ['column', ...] } as const` constant (mobile/src/features/places/api.ts), and
    those lists are compared with the OUT / TABLE columns of the function in `public`
  - every `.storage.from('bucket')` bucket exists, every `functions/v1/<name>` / `functions.invoke('<name>')`
    function has a folder under supabase/functions

It is a static check (regular expressions, not a TypeScript parser), so it only follows the plain
patterns the app uses; it never reports a false "all good" for a table, rpc or column it can see.

Usage: check_client_contract.py --host <socket dir> --port <port> [--user postgres] [--db postgres]
"""
import argparse
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC_DIRS = [ROOT / "mobile" / "app", ROOT / "mobile" / "src"]


def psql(args, sql):
    out = subprocess.run(
        ["psql", "-h", args.host, "-p", str(args.port), "-U", args.user, "-d", args.db, "-At", "-F", "\t", "-c", sql],
        capture_output=True, text=True, check=True,
    ).stdout
    return [line.split("\t") for line in out.splitlines() if line]


def split_top(s):
    """Split a PostgREST select string on top-level commas."""
    parts, depth, cur = [], 0, ""
    for ch in s:
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        if ch == "," and depth == 0:
            parts.append(cur.strip())
            cur = ""
        else:
            cur += ch
    if cur.strip():
        parts.append(cur.strip())
    return parts


def first_string(text, start, source=""):
    """First '...', "..." or `...` literal after index `start` (stops at the closing paren of the call).
    `.select(SOME_CONST)` is resolved through a top-level `const SOME_CONST = '...'` of the same file."""
    m = re.compile(r"""\(\s*(['"`])((?:\\.|(?!\1).)*?)\1""", re.S).match(text, start)
    if m:
        return m.group(2)
    ident = re.compile(r"\(\s*([A-Z][A-Z0-9_]*)\s*[,)]").match(text, start)
    if ident and source:
        c = re.search(r"const\s+%s\s*=\s*(['\"`])((?:\\.|(?!\1).)*?)\1" % ident.group(1), source, re.S)
        if c:
            return c.group(2)
    return None


def object_keys(text, start):
    """Keys of an object literal that directly follows `(` at `start` (single level)."""
    m = re.compile(r"\(\s*\{").match(text, start)
    if not m:
        return None
    i, depth, buf = m.end(), 1, ""
    while i < len(text) and depth:
        ch = text[i]
        depth += ch in "{[(" and 1 or (ch in "}])" and -1 or 0)
        if depth:
            buf += ch
        i += 1
    keys, level, tok = [], 0, ""
    for ch in buf + ",":
        if ch in "{[(":
            level += 1
        elif ch in "}])":
            level -= 1
        if ch == "," and level == 0:
            t = tok.strip()
            km = re.match(r"^(?:\.\.\.)|^['\"]?([A-Za-z_][A-Za-z0-9_]*)['\"]?\s*(?::|$)", t)
            if km and km.group(1):
                keys.append(km.group(1))
            tok = ""
        else:
            tok += ch
    return keys


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--port", required=True)
    ap.add_argument("--user", default="postgres")
    ap.add_argument("--db", default="postgres")
    args = ap.parse_args()

    cols = {}
    for t, c in psql(args, "select table_name, column_name from information_schema.columns where table_schema='public'"):
        cols.setdefault(t, set()).add(c)
    fks = {}  # (table, constraint name) -> referenced table ; and column hints
    for t, name, ref in psql(args, "select conrelid::regclass::text, conname, confrelid::regclass::text from pg_constraint where contype='f' and connamespace='public'::regnamespace"):
        fks[(t.replace("public.", ""), name)] = ref.replace("public.", "")
    fk_cols = {}
    for t, c, ref in psql(args, "select cl.relname, a.attname, rf.relname from pg_constraint k join pg_class cl on cl.oid=k.conrelid join pg_class rf on rf.oid=k.confrelid join pg_attribute a on a.attrelid=k.conrelid and a.attnum = any(k.conkey) where k.contype='f' and cl.relnamespace='public'::regnamespace"):
        fk_cols[(t, c)] = ref
    funcs = {}
    # only the arguments a caller can pass: not the OUT / TABLE columns of a function that returns a table (proargnames lists those too)
    for name, argnames in psql(args, "select p.proname, coalesce((select string_agg(t.n, ',') from unnest(p.proargnames, p.proargmodes) as t(n, m) where t.m is null or t.m in ('i', 'b', 'v')), '') from pg_proc p where p.pronamespace='public'::regnamespace"):
        funcs.setdefault(name, []).append(set(a for a in argnames.split(",") if a))
    # what a function returns, per overload: the columns of `returns table (...)` and the OUT parameters
    rpc_out = {}
    for name, outs in psql(args, "select p.proname, coalesce((select string_agg(t.n, ',') from unnest(p.proargnames, p.proargmodes) as t(n, m) where t.m in ('t', 'o')), '') from pg_proc p where p.pronamespace='public'::regnamespace"):
        rpc_out.setdefault(name, []).append(set(c for c in outs.split(",") if c))
    buckets = {r[0] for r in psql(args, "select id from storage.buckets")}
    fn_dirs = {p.name for p in (ROOT / "supabase" / "functions").iterdir() if p.is_dir()}

    problems, checked = [], {"tables": 0, "columns": 0, "rpcs": 0, "rpc columns": 0, "buckets": 0, "functions": 0}

    def check_select(table, sel, where, depth=0):
        if table not in cols:
            problems.append(f"{where}: table '{table}' does not exist")
            return
        for part in split_top(sel):
            if not part or part == "*":
                continue
            m = re.match(r"^(?:[A-Za-z_][A-Za-z0-9_]*:)?([A-Za-z_][A-Za-z0-9_]*)(!([A-Za-z_][A-Za-z0-9_]*))?(!inner)?\((.*)\)$", part, re.S)
            if m:  # embedded relation
                rel, hint, inner = m.group(1), m.group(3), m.group(5)
                target = rel if rel in cols else None
                if hint:
                    target = fks.get((table, hint)) or fks.get((rel, hint)) or fk_cols.get((table, hint)) or target
                if target is None:
                    # forward fk column named like the relation alias (e.g. friend:profiles!followee_id)
                    problems.append(f"{where}: cannot resolve embedded relation '{part.split('(')[0]}' from '{table}'")
                    continue
                checked["tables"] += 1
                check_select(target, inner, where, depth + 1)
                continue
            col = re.sub(r"^[A-Za-z_][A-Za-z0-9_]*:", "", part)
            col = re.sub(r"::[a-z]+$", "", col).strip()
            checked["columns"] += 1
            if col not in cols[table]:
                problems.append(f"{where}: column '{table}.{col}' does not exist")

    files = [f for d in SRC_DIRS for f in d.rglob("*") if f.suffix in (".ts", ".tsx") and "__tests__" not in f.parts and "node_modules" not in f.parts]
    for f in sorted(files):
        text = f.read_text()
        rel = f.relative_to(ROOT).as_posix()
        line_of = lambda i: text.count("\n", 0, i) + 1
        for m in re.finditer(r"\.from\(\s*'([a-z_]+)'\s*\)", text):
            table, window = m.group(1), text[m.end(): m.end() + 900]
            where = f"{rel}:{line_of(m.start())}"
            if re.match(r"^\s*\.\s*(upload|createSignedUrls?|getPublicUrl|remove|list|download)", window) or re.search(r"storage\s*$", text[max(0, m.start() - 12): m.start()]):
                continue  # storage bucket call: handled below
            checked["tables"] += 1
            if table not in cols:
                problems.append(f"{where}: table '{table}' does not exist")
                continue
            sm = re.search(r"\.select\s*", window)
            if sm and sm.start() < 400:
                sel = first_string(window, sm.end(), text)
                if sel:
                    check_select(table, sel, where)
            for verb in ("insert", "update", "upsert"):
                vm = re.search(r"\.%s\s*" % verb, window)
                if vm and vm.start() < 200:
                    keys = object_keys(window, vm.end())
                    for k in keys or []:
                        checked["columns"] += 1
                        if k not in cols[table]:
                            problems.append(f"{where}: {verb} sets '{table}.{k}' but the column does not exist")
        for m in re.finditer(r"\.rpc\(\s*'([a-z_]+)'\s*(?:,\s*\{([^}]*)\})?", text):
            name, body = m.group(1), m.group(2) or ""
            check_rpc(problems, checked, funcs, f"{rel}:{line_of(m.start())}", name, [k for k in re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:", body)])
        for m in re.finditer(r"""(?:rpc/)([a-z_]+)['"`]\s*,\s*\{([^}]*)\}""", text):
            check_rpc(problems, checked, funcs, f"{rel}:{line_of(m.start())}", m.group(1), re.findall(r"([A-Za-z_][A-Za-z0-9_]*)\s*:", m.group(2)))
        for m in re.finditer(r"RPC_COLUMNS\s*=\s*\{(.*?)\}\s*as const", text, re.S):
            for fn, body in re.findall(r"([a-z_]+)\s*:\s*\[(.*?)\]", m.group(1), re.S):
                check_rpc_columns(problems, checked, rpc_out, f"{rel}:{line_of(m.start())}", fn, re.findall(r"'([a-z_]+)'", body))
        for m in re.finditer(r"storage\s*\.from\(\s*'([a-z-]+)'\s*\)", text):
            checked["buckets"] += 1
            if m.group(1) not in buckets:
                problems.append(f"{rel}:{line_of(m.start())}: storage bucket '{m.group(1)}' does not exist")
        for m in re.finditer(r"functions/v1/([a-z-]+)|functions\.invoke\(\s*'([a-z-]+)'", text):
            name = m.group(1) or m.group(2)
            checked["functions"] += 1
            if name not in fn_dirs:
                problems.append(f"{rel}:{line_of(m.start())}: edge function '{name}' has no folder in supabase/functions")

    print("checked:", ", ".join(f"{v} {k}" for k, v in checked.items()))
    if problems:
        print(f"{len(problems)} problem(s):")
        for p in problems:
            print("  -", p)
        sys.exit(1)
    print("client contract OK")


def check_rpc(problems, checked, funcs, where, name, keys):
    checked["rpcs"] += 1
    if name not in funcs:
        problems.append(f"{where}: rpc '{name}' does not exist in schema public")
        return
    if keys and not any(set(keys) <= sig for sig in funcs[name]):
        problems.append(f"{where}: rpc '{name}' has no signature with arguments {sorted(keys)} (has {[sorted(s) for s in funcs[name]]})")


def check_rpc_columns(problems, checked, rpc_out, where, name, columns):
    if name not in rpc_out:
        problems.append(f"{where}: RPC_COLUMNS names function '{name}' but it does not exist in schema public")
        return
    if not columns:
        problems.append(f"{where}: RPC_COLUMNS lists no columns for '{name}'")
        return
    checked["rpc columns"] += len(columns)
    if not any(set(columns) <= out for out in rpc_out[name]):
        have = sorted(set().union(*rpc_out[name]))
        missing = sorted(set(columns) - set().union(*rpc_out[name]))
        problems.append(f"{where}: the app reads column(s) {missing} from rpc '{name}' but it returns only {have}")


if __name__ == "__main__":
    main()
