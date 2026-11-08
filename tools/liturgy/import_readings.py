#!/usr/bin/env python3
"""Turn an export of the readings of each day into the data the Daily reading screen reads.

    python3 tools/liturgy/import_readings.py                       read tools/liturgy/data/pascua-daily-readings.json, write the assets
    python3 tools/liturgy/import_readings.py --export PATH         read another export
    python3 tools/liturgy/import_readings.py --check               write nothing; exit 1 if the committed assets are not what the export makes

What it writes (all of it generated: never edit by hand, run this again):
  mobile/assets/library/daily/readings-<year>.json                     one file for each year of the export
  mobile/src/features/library/daily/readings.generated.ts              one lazy `require` for each of those files (Metro needs literal paths)

WHERE THE DATA COMES FROM. Pascua, the owner's other app, keeps a table of the days of the liturgical year (public.pascua_daily_readings in its Supabase
project). The export is a read-only SELECT of eight of its columns (the query is in the export's own header): the date, the name of the day, the name of the
celebration, the liturgical colour and the REFERENCES of the first reading, the psalm, the second reading and the Gospel. What the app uses of it is facts: which
passages the Church reads on a day (the Roman Lectionary), and what a day is called. Pascua's own writing (the titles, snippets, full texts, reflections,
prayers, audio) is not in the export and is not used: the words of a reading are read from the Bible that is inside the app, never from here.

WHAT THE ASSET HOLDS, for each day: `r` the four references [first reading, psalm, second reading, Gospel] (the second reading is null on most days; any may be
null), `n` the name of the celebration when the source gives one (a saint's memorial, a feast), and `o` = 1 when the source calls the day by that same name (the
celebration IS the day, not a memorial kept beside a weekday). The colour is not kept: the screen takes the colour of the day from the calendar it computes on the
phone (daily/liturgy.ts), and the source's colour is wrong on a few days (tools/liturgy/README.md lists them).

WHAT THE IMPORTER DOES TO A REFERENCE. Almost nothing, on purpose: the parser of the app (daily/reference.ts) reads the forms the source uses. It takes away what is
no part of a reference: a footnote marker the source left in ("[^1]"), runs of spaces, and the "Psalm/" that the source put in front of the book of a canticle in the
place of the psalm ("Psalm/Deuteronomy 32" is the reading "Deuteronomy 32"). An empty text is no reference. The output is deterministic (sorted keys, one day to a line,
no clock): the same export always makes the same bytes, so --check is a byte comparison. Standard library only.

Exit codes: 0 all good, 1 --check found a difference (it lists them), 2 the importer refused something (the message names the row).
"""
from __future__ import annotations

import argparse
import collections
import datetime
import json
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent.parent
DEFAULT_EXPORT = ROOT / "tools" / "liturgy" / "data" / "pascua-daily-readings.json"
DEFAULT_OUT = ROOT / "mobile" / "assets" / "library" / "daily"
DEFAULT_TS = ROOT / "mobile" / "src" / "features" / "library" / "daily" / "readings.generated.ts"

FORMAT_VERSION = 1
COLUMNS = ("date", "liturgical_day", "feast", "liturgical_color", "first_reading_ref", "psalm_ref", "second_reading_ref", "gospel_ref")
READING_COLUMNS = ("first_reading_ref", "psalm_ref", "second_reading_ref", "gospel_ref")
MAX_REF = 120
MAX_NAME = 120


class Refused(Exception):
    """The export holds something the importer will not guess at."""


def clean_ref(text, where):
    """One reference as the screen will read it, or None when the row has none."""
    if text is None:
        return None
    if not isinstance(text, str):
        raise Refused(f"{where}: a reference must be text, not {type(text).__name__}")
    out = re.sub(r"\s*\[\^[^\]\s]*\]", "", text)  # a footnote marker of the source: "Jeremiah 14:17-22 [^1]"
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"^Psalm/(?=\S)", "", out)  # the book of a canticle in the place of the psalm
    if not out:
        return None
    if len(out) > MAX_REF or re.search(r"[\x00-\x1f\x7f]", out):
        raise Refused(f"{where}: this is not a reference: {out[:60]!r}")
    return out


def clean_name(text, where):
    if text is None:
        return None
    if not isinstance(text, str):
        raise Refused(f"{where}: a name must be text, not {type(text).__name__}")
    out = re.sub(r"\s+", " ", text).strip()
    if not out:
        return None
    if len(out) > MAX_NAME or re.search(r"[\x00-\x1f\x7f]", out):
        raise Refused(f"{where}: this is not a name: {out[:60]!r}")
    return out


def same_name(a, b):
    """The day and the celebration have the same name (case and spacing aside)."""
    return a is not None and b is not None and a.casefold() == b.casefold()


def read_export(path):
    """(rows, about) of an export: a plain list of rows (the result of the query) or {"about": {...}, "rows": [...]}."""
    try:
        data = json.loads(pathlib.Path(path).read_text(encoding="utf8"))
    except (OSError, ValueError) as e:
        raise Refused(f"cannot read the export {path}: {e}") from e
    if isinstance(data, list):
        return data, {}
    if isinstance(data, dict) and isinstance(data.get("rows"), list):
        about = data.get("about", {})
        if not isinstance(about, dict):
            raise Refused("the 'about' of the export must be an object")
        return data["rows"], about
    raise Refused("the export is neither a list of rows nor an object with 'rows'")


def convert(rows, about):
    """{year: {date: day}} from the rows, with every row checked. A row that is not a day, a day twice, or a day with no reading at all is refused."""
    years = collections.defaultdict(dict)
    for i, row in enumerate(rows):
        where = f"row {i + 1}"
        if not isinstance(row, dict):
            raise Refused(f"{where}: not an object")
        key = row.get("date")
        if not isinstance(key, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", key):
            raise Refused(f"{where}: the date must be YYYY-MM-DD, not {key!r}")
        try:
            day = datetime.date.fromisoformat(key)
        except ValueError as e:
            raise Refused(f"{where}: {key} is not a day: {e}") from e
        where = f"{key}"
        if key in years[day.year]:
            raise Refused(f"{where}: the day is twice in the export")
        refs = [clean_ref(row.get(c), f"{where} {c}") for c in READING_COLUMNS]
        if all(r is None for r in refs):
            raise Refused(f"{where}: the day has no reading at all")
        name = clean_name(row.get("feast"), f"{where} feast")
        entry = {"r": refs}
        if name is not None:
            entry["n"] = name
            if same_name(name, clean_name(row.get("liturgical_day"), f"{where} liturgical_day")):
                entry["o"] = 1
        years[day.year][key] = entry
    return years


def header(year, about):
    return {
        "what": f"The readings of the days of {year} as REFERENCES only (book, chapter, verses), and the name of the celebration when the source gives one.",
        "source": about.get("source", "an export of Pascua's table public.pascua_daily_readings"),
        "read": about.get("read", ""),
        "nature": "The references are facts of the Roman Lectionary (which passages the Church reads on a day), the names are facts of the calendar. Pascua's own writing (titles, snippets, full texts, reflections, prayers, audio) is not used. The words of a reading are read from the Bible inside the app, never from this file.",
        "made": "tools/liturgy/import_readings.py from tools/liturgy/data/pascua-daily-readings.json; do not edit by hand",
    }


def render_year(year, days, about):
    """The text of readings-<year>.json: one day to a line, keys sorted, nothing that changes between two runs."""
    head = {"about": header(year, about), "v": FORMAT_VERSION, "year": year}
    start = json.dumps(head, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    lines = [f'{json.dumps(k)}:{json.dumps(days[k], ensure_ascii=False, separators=(",", ":"), sort_keys=True)}' for k in sorted(days)]
    return start[:-1] + ',"days":{\n' + ",\n".join(lines) + "\n}}\n"


def render_ts(years):
    entries = "\n".join(f"  () => require('../../../../assets/library/daily/readings-{y}.json'),  // {y}" for y in sorted(years))
    return (
        "// GENERATED by tools/liturgy/import_readings.py: do not edit by hand, run the importer again.\n"
        "// One lazy `require` for the file of each year of readings (Metro needs a literal path in each); readings.ts reads them.\n"
        "export const READINGS_FILES: readonly (() => unknown)[] = [\n"
        f"{entries}\n"
        "];\n"
    )


def outputs(export, out_dir, ts_path):
    """{path: text} of everything the importer writes."""
    rows, about = read_export(export)
    years = convert(rows, about)
    if not years:
        raise Refused("the export has no day")
    out = {pathlib.Path(out_dir) / f"readings-{y}.json": render_year(y, years[y], about) for y in years}
    out[pathlib.Path(ts_path)] = render_ts(years)
    return out, years


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--export", default=str(DEFAULT_EXPORT), help="the export to read")
    ap.add_argument("--out", default=str(DEFAULT_OUT), help="where readings-<year>.json go")
    ap.add_argument("--ts", default=str(DEFAULT_TS), help="the generated index of the files")
    ap.add_argument("--check", action="store_true", help="write nothing; exit 1 when the committed files differ")
    args = ap.parse_args(argv)
    try:
        files, years = outputs(args.export, args.out, args.ts)
    except Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 2
    summary = ", ".join(f"{y}: {len(d)} days" for y, d in sorted(years.items()))
    if args.check:
        bad = []
        for path, text in sorted(files.items()):
            have = path.read_text(encoding="utf8") if path.exists() else None
            if have != text:
                bad.append(f"{path} is {'missing' if have is None else 'not what the export makes'}")
        out_dir = pathlib.Path(args.out)
        if out_dir.is_dir():
            for extra in sorted(out_dir.glob("readings-*.json")):
                if extra not in files:
                    bad.append(f"{extra} is not made by this export")
        if bad:
            print("\n".join(bad))
            print("run: python3 tools/liturgy/import_readings.py")
            return 1
        print(f"ok: the committed files are what the export makes ({summary})")
        return 0
    for path, text in sorted(files.items()):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf8")
        print(f"wrote {path}")
    print(summary)
    return 0


if __name__ == "__main__":
    sys.exit(main())
