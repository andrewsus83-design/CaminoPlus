# The readings of the Daily reading

The Daily reading of the Library (the card at the top of the Bible tab and the screen it opens) says what the day is, and which passages the Church reads on it: the first reading, the
responsorial psalm, the second reading on a Sunday or a solemnity, and the Gospel. This folder holds the importer and the data behind that. The words of a passage are not in it: they are read from the
Bible inside the app (the World English Bible, Catholic edition; [`tools/bible/README.md`](../bible/README.md)), nothing is fetched, so it all works without a signal.

- the importer: [import_readings.py](import_readings.py) (Python 3, standard library only), its tests: [test_liturgy_import.py](../tests/test_liturgy_import.py)
- its input: [data/pascua-daily-readings.json](data/pascua-daily-readings.json), a read-only export of 221 days (below)
- the files it writes: `mobile/assets/library/daily/readings-<year>.json` (one for each year, 27 KB for 2026) and
  [`readings.generated.ts`](../../mobile/src/features/library/daily/readings.generated.ts) (one lazy `require` for each file)
- the code that reads them: `mobile/src/features/library/daily/`: `readingsCore.ts` (a strict check of a file), `reference.ts` (how a reference is read, said again and looked up in the Bible),
  `content.ts` (what a day is called and what it reads), `dayData.ts` (the one file that `require`s the data), and `calendar.ts` / `liturgy.ts` (the days, and the General Roman Calendar worked out on the phone)
- the tests: `mobile/src/features/library/__tests__/readings.test.ts` (run by `npm run test:library`)

## Where each reading comes from

| | |
| --- | --- |
| Source | Pascua, the owner's other app: Supabase project `diyimabdmsjykvitomgd`, table `public.pascua_daily_readings` |
| Read | 8 November 2026, with `SELECT` only, through the project's Supabase MCP server (nothing was written, no other table was read) |
| What was read | `select date, liturgical_day, feast, liturgical_color, first_reading_ref, psalm_ref, second_reading_ref, gospel_ref from public.pascua_daily_readings where date is not null order by date` |
| What it holds | 222 rows, 25 May to 31 December 2026; one row has no date (a placeholder, "Today's Mass") and is left out, so 221 days, none missing |
| What the app uses | the date, the name of the celebration (`feast`) and the four references. `liturgical_day` only to tell whether the source calls the day by that name. The colour is read and not kept |
| What the app does NOT use | **Pascua's own writing: its titles, snippets, full texts, reflections, family stories, prayers and audio, and its `saint_name`.** They were not read into the repository (the export has eight columns) and they are not shown |

The references are facts of the Roman Lectionary (which passages the Church reads on a day), and the names and colours are facts of the calendar; the translation and the licence of Pascua's own texts are unknown,
which is why none of them is used. The header of each `readings-<year>.json` says all of this (`about`: the source, when it was read, what it is and that Pascua's writing is not used).

Pascua follows the lectionary of the United States (the readings of the USCCB: `Psalm 63:2, 3-4, 5-6, 7-8` counts the verses the way the Hebrew Bible does), and takes its names from the
Church Calendar API (calapi.inadiutorium.cz, the General Roman Calendar, which has no readings). The screen says so: "Readings: the Roman Lectionary (general calendar; your country may differ)."

## Make it again, check it

    python3 tools/liturgy/import_readings.py            # reads the export, writes the files of every year in it
    python3 tools/liturgy/import_readings.py --check    # writes nothing; exit 1 if what is committed is not what the export makes

Options: `--export PATH`, `--out DIR`, `--ts FILE`. The output is deterministic (sorted keys, one day to a line, no clock), so `--check` is a byte comparison and `test_liturgy_import.py` runs it. Exit codes: 0 good,
1 `--check` found a difference, 2 the importer refused something (a row that is not a day, a day twice, a day with no reading at all; the message names the row).

To make a new export (the owner's machine, or a session that has the project's Supabase MCP server): run the query above, with `select` only, and save the rows as the `rows` of a file like
[data/pascua-daily-readings.json](data/pascua-daily-readings.json) (`about` says where it came from, when it was read and how many rows the table had). A plain list of rows is accepted too.
Do not add the columns of Pascua's writing: `test_liturgy_import.py` fails if one is there.

## What a file holds, and what the importer does to a reference

`readings-<year>.json` is `{ about, v: 1, year, days: { "2026-11-08": { r: [first reading, psalm, second reading, Gospel], n?: the name of the celebration, o?: 1 } } }`. `r` always has four places, a text or `null` (the second reading is
`null` on most days); `n` is the name when the source gives one; `o` is 1 when the source calls the day by that name (the celebration IS the day: a Sunday, a solemnity, a feast, a memorial it keeps).
The app refuses a file that is not exactly that (`readingsCore.ts`), so a damaged file means "no readings for those days", never half of them.

The importer touches a reference as little as it can. It takes away a footnote marker the source left in (`Jeremiah 14:17-22 [^1]`), runs of spaces, and the `Psalm/` the source puts in front of the book of a canticle
in the place of the psalm (`Psalm/Deuteronomy 32` is the reading `Deuteronomy 32`). The forms the source writes (`1 Peter 1:10-1:16`, `Genesis 3:9-15, 3:20`, `Exodus 34:4b-6,8-9`, `Acts 11:21b-26; 13:1-3`,
`Sirach 27:30—28:7`, `Philemon 7-20`, `Psalm 90:3-4, 14 and 17`) are read by the app (`reference.ts`, with its tests) and said again in one plain way (`1 Peter 1:10-16`).

## How the words are found, and when there are none

A passage is read from the bundled Bible when its reference can be shown **with confidence**. Otherwise the reference stands alone, and the screen shows no words under it. The lectionaries number the
verses of the Hebrew Bible, the World English Bible numbers them the English way, and the two differ in a known set of places, where a verse number of the lectionary names another verse of the English Bible.
A shifted verse would put the wrong words under the right name, so:

- a **psalm with a title** in the Bible (the Hebrew counts the title as one or two verses, so `Psalm 63:2` is the first verse of the English psalm) is shown **whole**, with the line "This is the whole psalm. Mass uses only the verses named
  above." A psalm with no title (1, 2, 10, 33, 43, 71, 91, 93 to 97, 99, 104 to 107, 111 to 119, 135 to 137, 146 to 150) has the same numbers in both and keeps its verses;
- in the other books, `NUMBERING_DIFFERS` (`reference.ts`) lists the chapters where the numbers are known to differ (Genesis 31 and 32, Exodus 7, 8, 21 and 22, the prophets from Isaiah 8 and 9 to Malachi 3 and 4, 2 Corinthians 13 ...);
  a reference that touches one has no words. The list is the usual table of these differences kept on the side of caution (a chapter on it only loses its words), written from my knowledge of them and **not from a source I could cite**;
- a verse the Bible does not have (`Malachi 3:23`), a whole chapter of a book that is not the Psalms, a reference in a form we do not read: no words.

`readings.test.ts` reads every reading of the 2026 data against all of this: 703 references, 688 with words (66 of them a psalm shown whole), 15 shown alone (Hosea 2, 11 and 14, 2 Kings 11, Nahum 2, Micah 5, Job 40, Exodus 22, Isaiah 63 and 64,
Zechariah 2, Romans 16, Malachi 3, and the three psalm slots that give a chapter and no verses). Every other reading starts where a sentence starts and ends where one ends, except thirteen that the lectionary starts or
ends inside a sentence (listed by date in the test): a verse shifted by one would show up there, and none did. That is evidence, not a proof; the line of small print on the screen says the words are "not the lectionary translation".

## What the 2026 data gets wrong, or says differently from the calendar of the app

`readings.test.ts` pins each of these by date. The calendar of the app (`liturgy.ts`) was checked against romcal for 1990 to 2100; the data was compared with it on all 221 days (title, colour, week, Sunday, cycles).

- **Titles and weeks: no contradiction.** 169 days have the same title, week and Sunday in both once the words are made alike ("Thirty-second Sunday" and "32nd Sunday"). 13 are the same day in other words (the Advent days of 17 to 24 December
  are called by their date in the data; the octave of Christmas is "within the Octave of the Nativity of the Lord"; Corpus Christi, All Souls and Christmas differ by a parenthesis). 39 are days on which the data names a saint or
  a feast that `liturgy.ts` leaves out on purpose (its WHAT IS NOT): the screen then makes the saint the title and puts the day of the calendar under it.
- **Colours: the data is wrong on four days.** On 21 and 23 December (Advent) and 29 and 31 December (Christmas time) the data says Green where the days are violet and white. On the 105 other days where the colour differs (109 in all) it is the colour
  of a memorial or a feast of a saint (white, red) on a weekday that the calendar of the app has as green or violet: not an error. **The app shows the colour of its own calendar and never the data's.**
- **Cycles: they agree.** The Gospel of each of the 27 Sundays of Ordinary Time and Advent is that of the Sunday cycle of the app (Year A, then Year B from 29 November), except 7 June (the readings of Corpus Christi: the United States keeps
  it on the Sunday), 13 December (John 1, the third Sunday of Advent of Year B) and 20 December (Luke 1, the fourth). The first readings of weeks 10 to 16 are those of Year II (1 and 2 Kings, Amos, Hosea, Isaiah, Micah).
- **Corpus Christi is the day the app and the data disagree about what is read.** The app keeps it on Thursday 4 June (the universal date) and the data has the readings of the weekday that day (2 Timothy 2:8-15 ...) and the readings of Corpus
  Christi on Sunday 7 June (Deuteronomy 8:2-3, 14b-16a ... John 6:51-58), under the title of the 10th Sunday. In a country that moves the feast to the Sunday the title of the app is wrong on both days. This needs the country of the pilgrim, which the app does not have.
- **Gaps and rows to look at (not verified against a source; my reading of the structure of the lectionary).** Trinity Sunday (31 May) and the Transfiguration (6 August) have no second reading in the data, and the Gospel of 6 August
  (Luke 9:28b-36) is the text of Year C on a Year A day. The psalm of the Assumption (15 August) is Psalm 132. **I did not type the references I believe are right: nothing here is a correction.** `Psalm 85:9-10-11-12, 13-14`
  (6 December) is a form no lectionary writes: it is shown as it is, named "Psalm 85", with the whole psalm. Three psalm slots have a chapter and no verses (`Jeremiah 31`, `Deuteronomy 32` twice).
- **`liturgical_day` is not reliable as the name of the day.** It names 39 saints as the day itself and keeps the weekday on 13 days where `feast` names a memorial that I know to be obligatory (14 August, 27 to 29 August, 3, 15, 16 and 30 September,
  1, 2, 7, 15 and 17 October). The app takes the name from `feast`, and does not say whether a memorial is optional: **the data has no rank**. `saint_name` is Pascua's own saint of the day (it follows the United States: Kateri Tekakwitha on 14 July where `feast` has
  Camillus de Lellis, and it names saints that are in no calendar), so it is not used.

## Dates after 31 December 2026

The data stops there, so a day after it shows what the calendar of the app knows (a Sunday, a solemnity, a weekday) and the line "The readings for this day are not in the app yet." A pilgrim never sees a guess.

I looked for an open, citable source of references by date for 2027 and later (20 minutes of searching, 8 November 2026) and **did not find one** that I could use:

- the **Catholic Readings API** (github.com/cpbjr/catholic-readings-api, MIT licence on the code and data it ships): the four references and the celebrations by date, but only 2025 and 2026, "extracted from USCCB" with no statement from the USCCB about reuse;
  a 2027 file would have to be made the same way. It is the closest thing, and it is the same source family as the data above (the United States);
- the **Ordo Lectionum Missae** (1981, the Latin book that lists every reading of the Roman Lectionary by its reading-set number): the complete source and exactly what is wanted (Sunday cycles A, B and C, weekday years I and II, proper of the saints),
  scanned on archive.org, but under the copyright of the Libreria Editrice Vaticana, in Vulgate numbering (which needs the same versification care as above), and not machine readable. Making a table from it would be a project, and a permission question;
- the French **AELF API** (api.aelf.org): no licence found, and the texts are copyrighted; the **Parish Companion Ordo** (MIT) and the **Liturgical Calendar API** and **romcal** are calendars with no readings;
  the **Revised Common Lectionary** is not the Roman Lectionary; USCCB's own pages give the NABRE text under its terms and are not a source to scrape.

So: **2027 and later needs a decision of the owner** (the question is in the report of the session that wrote this): extend Pascua's table, or ask for permission to use the Ordo, or accept "not in the app yet" past 2026.

## What to do in Pascua to extend its table

1. Add the rows of 2027 to `public.pascua_daily_readings` (one row for each day, `date` filled in, never null), from the same source Pascua used for 2026; keep the eight columns above, in the same forms.
2. Fill `second_reading_ref` on every Sunday and solemnity (the 2026 rows lack it on Trinity Sunday and the Transfiguration), and write a psalm with its verses (`Psalm 63:2, 3-4, 5-6, 7-8`, not `Psalm 63`; `Jeremiah 31:10, 11-12ab, 13`, not `Jeremiah 31`).
3. Write each reference as `Book chapter:verses` in one form (no `[^1]` markers, no `Psalm/Book`, no `9-10-11-12`), and give the colour of the day from the calendar, not from a saint's memorial.
4. If the owner wants the rank of a memorial shown, add a `rank` column (solemnity, feast, memorial, optional memorial); it is not there today.
5. Make a new export with the query above, save it next to the old one, run the importer, run `npm run test:library` and `python3 -m unittest discover -s tools/tests`, and commit the files it wrote.

A reading that is not one passage of one book (the Easter Vigil has seven readings, Christmas has four Masses, Palm Sunday has a Gospel at the procession) does not fit the four places of a day: those days need a richer format
(a list of readings) before they can be added. Lent, Easter time and the Triduum are not in the 2026 data at all.
