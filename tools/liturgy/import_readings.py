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
passages the Church reads on a day, and what a day is called. The table follows the Lectionary for Mass used in the United States, NOT the General Roman Calendar's
readings of every date: the data is the lectionary of one country. Pascua's own writing (the titles, snippets, full texts, reflections, prayers, audio) is not in the
export and is not used: the words of a reading are read from the Bible that is inside the app, never from here.

WHAT THE ASSET HOLDS, for each day: `r` the four references [first reading, psalm, second reading, Gospel] (the second reading is null on most days; any may be
null), `n` the name of the celebration when the source gives one (a saint's memorial, a feast), and `o` = 1 when the source calls the day by that same name (the
celebration IS the day, not a memorial kept beside a weekday). Two more keys are written only where they are true: `u` the places of `r` that the importer reduced
to a psalm alone (below), and `m` the Mass of the day that the readings are of ("morning" on 24 December, "day" on 25 December: MASS_OF). The colour is not kept: the
screen takes the colour of the day from the calendar it computes on the phone (daily/liturgy.ts), and the source's colour is wrong on a few days (tools/liturgy/README.md
lists them).

THE DAYS LEFT OUT (NOT_GENERAL, below). On a few dates the source has the readings of the United States and the General Roman Calendar has others: Thanksgiving,
Our Lady of Guadalupe, and the two days of Corpus Christi (the United States keeps it on the Sunday). Those days are not written as readings: the file lists them in
`differ`, and the app shows the day of the calendar and says that the readings of the day differ from country to country. The list is ONLY what a reviewer found
by reading the data against the calendar; a person with a lectionary has to check every day of the export (tools/liturgy/README.md). Both modes print the list.

WHAT THE IMPORTER DOES TO A REFERENCE. Almost nothing, on purpose: the parser of the app (daily/reference.ts) reads the forms the source uses. It takes away what is
no part of a reference: a footnote marker the source left in ("[^1]"), runs of spaces, and the "Psalm/" that the source put in front of the book of a canticle in the
place of the psalm ("Psalm/Deuteronomy 32" is the reading "Deuteronomy 32"). A psalm with a run of four numbers joined by hyphens ("Psalm 85:9-10-11-12, 13-14"), which
no lectionary writes, is reduced to the psalm alone ("Psalm 85"): its verses cannot be told, its number can; the change is printed and the day is marked `u`, so that the
app says that the list of verses for the day is not clear (it never writes a list of verses that the source does not give). An empty text is no reference. The
output is deterministic (sorted keys, one day to a line, no clock): the same export always makes the same bytes, so --check is a byte comparison. Standard library only.

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

# The days of the export whose readings are NOT those of the General Roman Calendar for that date: the source is the Lectionary for Mass used in the United States,
# which keeps these days differently. They are left out of `days` and listed in `differ`; the app says that the readings of such a day differ from country to country.
# THIS LIST IS ONLY WHAT A REVIEWER FOUND by reading the 2026 data against the calendar of the app. It is not a check of the export: a person with a lectionary has to
# read all 221 days (tools/liturgy/README.md). A new export has its own days to look at: a date in this list that the export does not have is ignored.
NOT_GENERAL = {
    "2026-06-04": "Corpus Christi, Thursday (the General Roman Calendar's day): the source names the day, and has the readings of the weekday (the United States keeps Corpus Christi on the Sunday)",
    "2026-06-07": "the 10th Sunday in Ordinary Time (the General Roman Calendar's day): the source has the readings of Corpus Christi (the United States keeps it on the Sunday)",
    "2026-11-26": "Thursday of the 34th week in Ordinary Time: the source has the readings of Thanksgiving Day in the United States (four readings on a weekday)",
    "2026-12-12": "Our Lady of Guadalupe is an optional memorial in the General Roman Calendar, with the readings of the Advent weekday: the source has the readings of the feast of the United States",
}

# The rows of the export that are the readings of ONE of the Masses of a day that has more than one: the app says which Mass they are of (the file marks the day with `m`).
# A date here is a claim about that row of THIS export, so the importer refuses the export when the Gospel of the row is not the one named here (Pascua may correct the row,
# and the claim would then be false). A date that the export does not have is ignored: another export has its own rows to look at. {date: (mass, Gospel of the row, why)}
MASS_OF = {
    "2026-12-24": ("morning", "Luke 1:67-79", "the Mass of the morning of 24 December: its Gospel is the Benedictus. The Mass of the evening, the Vigil of Christmas, has other readings"),
    "2026-12-25": ("day", "John 1:1-18", "the Mass during the Day of Christmas: its Gospel is the Prologue of John. The other Masses of Christmas have other readings"),
}

# a run of four numbers joined by hyphens ("9-10-11-12"): no lectionary writes it
RUN_OF_FOUR = re.compile(r"\d+-\d+-\d+-\d+")


class Refused(Exception):
    """The export holds something the importer will not guess at."""


class Converted(dict):
    """{year: {date: day}}: what convert makes of an export, with what it left out, what it changed and what it marked. `differ` is {year: [date, ...]} (the days of
    NOT_GENERAL that the export has, in order), `notes` one line for each reference the importer changed, `masses` {date: mass} for the days of MASS_OF."""

    def __init__(self):
        super().__init__()
        self.differ = {}
        self.notes = []
        self.masses = {}


def clean_ref_marked(text, where, notes=None):
    """(reference, reduced): the reference as the screen will read it, or None when the row has none, and whether the importer reduced it to its psalm because the verses
    were written in a form nobody reads (the day is then marked `u`: the app says that the list of verses is not clear). `notes`, a list, gets a line for each such change."""
    if text is None:
        return None, False
    if not isinstance(text, str):
        raise Refused(f"{where}: a reference must be text, not {type(text).__name__}")
    out = re.sub(r"\s*\[\^[^\]\s]*\]", "", text)  # a footnote marker of the source: "Jeremiah 14:17-22 [^1]"
    out = re.sub(r"\s+", " ", out).strip()
    out = re.sub(r"^Psalm/(?=\S)", "", out)  # the book of a canticle in the place of the psalm
    if not out:
        return None, False
    if len(out) > MAX_REF or re.search(r"[\x00-\x1f\x7f]", out):
        raise Refused(f"{where}: this is not a reference: {out[:60]!r}")
    psalm = re.match(r"Psalm (\d{1,3}):", out)
    if psalm and RUN_OF_FOUR.search(out):
        # its verses cannot be told (9-10, 11-12 or 9-12?), the psalm can: the reference is the psalm alone
        reduced = f"Psalm {psalm.group(1)}"
        if notes is not None:
            notes.append(f"{where}: {out!r} has a run of four numbers joined by hyphens, which no lectionary writes: it is now {reduced!r}, and the day is marked (the app says that the list of verses is not clear)")
        return reduced, True
    return out, False


def clean_ref(text, where, notes=None):
    """One reference as the screen will read it, or None when the row has none (clean_ref_marked without the mark)."""
    return clean_ref_marked(text, where, notes)[0]


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
    """A Converted ({year: {date: day}}) from the rows, with every row checked. A row that is not a day, a day twice, or a day with no reading at all is refused.
    A day of NOT_GENERAL is not a day with readings: it goes to `.differ` of its year."""
    years = Converted()
    seen = set()
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
        if key in seen:
            raise Refused(f"{where}: the day is twice in the export")
        seen.add(key)
        marked = [clean_ref_marked(row.get(c), f"{where} {c}", years.notes) for c in READING_COLUMNS]
        refs = [m[0] for m in marked]
        if all(r is None for r in refs):
            raise Refused(f"{where}: the day has no reading at all")
        if key in NOT_GENERAL:
            years.differ.setdefault(day.year, []).append(key)
            continue
        name = clean_name(row.get("feast"), f"{where} feast")
        entry = {"r": refs}
        if name is not None:
            entry["n"] = name
            if same_name(name, clean_name(row.get("liturgical_day"), f"{where} liturgical_day")):
                entry["o"] = 1
        unclear = [place for place, m in enumerate(marked) if m[1]]
        if unclear:
            entry["u"] = unclear
        if key in MASS_OF:
            mass, gospel, _why = MASS_OF[key]
            if refs[3] != gospel:
                raise Refused(f"{where}: MASS_OF says these are the readings of the Mass '{mass}' (the Gospel is {gospel}), and the Gospel of the row is {refs[3]!r}: look at the row, then at MASS_OF")
            entry["m"] = mass
            years.masses[key] = mass
        years.setdefault(day.year, {})[key] = entry
    for listed in years.differ.values():
        listed.sort()
    return years


def header(year, about):
    return {
        "what": f"The readings of the days of {year} as REFERENCES only (book, chapter, verses), and the name of the celebration when the source gives one.",
        "source": about.get("source", "an export of Pascua's table public.pascua_daily_readings"),
        "read": about.get("read", ""),
        "nature": "The references are facts of the Lectionary for Mass used in the United States (which passages the Church reads on a day there), the names are facts of the calendar. Days on which that lectionary has other readings than the General Roman Calendar are left out and listed in 'differ'. Pascua's own writing (titles, snippets, full texts, reflections, prayers, audio) is not used. The words of a reading are read from the Bible inside the app, never from this file.",
        "made": "tools/liturgy/import_readings.py from tools/liturgy/data/pascua-daily-readings.json; do not edit by hand",
    }


def render_year(year, days, about, differ=()):
    """The text of readings-<year>.json: one day to a line, keys sorted, nothing that changes between two runs. `differ`: the days left out (NOT_GENERAL), if any."""
    head = {"about": header(year, about), "v": FORMAT_VERSION, "year": year}
    if differ:
        head["differ"] = sorted(differ)
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
    out = {pathlib.Path(out_dir) / f"readings-{y}.json": render_year(y, years[y], about, years.differ.get(y, ())) for y in years}
    out[pathlib.Path(ts_path)] = render_ts(years)
    return out, years


def describe(years):
    """The lines both modes print about what the importer left out and what it changed (nothing when it did neither)."""
    lines = []
    left = sorted(key for listed in years.differ.values() for key in listed)
    if left:
        lines.append(f"left out ({len(left)} days): the source has the readings of the United States there, and the General Roman Calendar has others; the app says they differ from country to country")
        lines += [f"  {key}  {NOT_GENERAL[key]}" for key in left]
        lines.append("  (this list is only what a reviewer found: a person with a lectionary has to check every day of the export)")
    if years.notes:
        lines.append(f"changed in a reference ({len(years.notes)}):")
        lines += [f"  {note}" for note in years.notes]
    if years.masses:
        lines.append(f"marked with the Mass that the readings are of ({len(years.masses)} days): the app says which Mass it is")
        lines += [f"  {key}  {mass}: {MASS_OF[key][2]}" for key, mass in sorted(years.masses.items())]
    return lines


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
    said = describe(years)  # what was left out and what was changed: printed by both modes
    if args.check:
        bad = []
        for path, text in sorted(files.items()):
            have = path.read_text(encoding="utf8") if path.exists() else None
            if have != text:
                bad.append(f"{path} is {'missing' if have is None else 'not what the export makes'}")
        out_dir = pathlib.Path(args.out)
        if out_dir.is_dir():
            for stray in sorted(out_dir.glob("readings-*.json")):
                if stray not in files:
                    bad.append(f"{stray} is not made by this export")
        if bad:
            print("\n".join(bad + said))
            print("run: python3 tools/liturgy/import_readings.py")
            return 1
        print("\n".join([f"ok: the committed files are what the export makes ({summary})"] + said))
        return 0
    for path, text in sorted(files.items()):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf8")
        print(f"wrote {path}")
    print("\n".join([summary] + said))
    return 0


if __name__ == "__main__":
    sys.exit(main())
