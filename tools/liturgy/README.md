# The readings of the Daily reading

The Daily reading of the Library (the card at the top of the Bible tab and the screen it opens) says what the day is, and which passages the Church reads on it: the first reading, the
responsorial psalm, the second reading on a Sunday or a solemnity, and the Gospel. This folder holds the importer and the data behind that. The words of a passage are not in it: they are read from the
Bible inside the app (the World English Bible, Catholic edition; [`tools/bible/README.md`](../bible/README.md)), nothing is fetched, so it all works without a signal.

**The readings are those of the Lectionary for Mass used in the United States, not those of the General Roman Calendar of every country.** The source is Pascua's table, which follows the lectionary of the
United States (the readings of the USCCB), and the screen says so: "Readings: the Lectionary for Mass used in the United States. Words: World English Bible, Catholic edition, not the lectionary translation."
On the few days where that lectionary keeps a day differently from the General Roman Calendar the readings are left out (below), and the screen says that they differ from country to country.

**A person with a lectionary has to read all 221 days of the export against it.** Nothing here has been checked against a printed lectionary. What was checked is the structure of the data (against the calendar
of the app, and by a reviewer who read the passages), and the list of days left out is only what that found.

- the importer: [import_readings.py](import_readings.py) (Python 3, standard library only), its tests: [test_liturgy_import.py](../tests/test_liturgy_import.py)
- its input: [data/pascua-daily-readings.json](data/pascua-daily-readings.json), a read-only export of 221 days (below)
- the files it writes: `mobile/assets/library/daily/readings-<year>.json` (one for each year, 27 KB for 2026) and
  [`readings.generated.ts`](../../mobile/src/features/library/daily/readings.generated.ts) (one lazy `require` for each file)
- the code that reads them: `mobile/src/features/library/daily/`: `readingsCore.ts` (a strict check of a file), `reference.ts` (how a reference is read, said again, said in words and looked up in the Bible),
  `content.ts` (what a day is called, what it reads and what the screen says when it cannot say), `dayData.ts` (the one file that `require`s the data), and `calendar.ts` / `liturgy.ts` (the days, and the
  General Roman Calendar worked out on the phone)
- the tests: `mobile/src/features/library/__tests__/readings.test.ts` (run by `npm run test:library`)

## Where each reading comes from

| | |
| --- | --- |
| Source | Pascua, the owner's other app: Supabase project `diyimabdmsjykvitomgd`, table `public.pascua_daily_readings` |
| Read | 8 November 2026, with `SELECT` only, through the project's Supabase MCP server (nothing was written, no other table was read) |
| What was read | `select date, liturgical_day, feast, liturgical_color, first_reading_ref, psalm_ref, second_reading_ref, gospel_ref from public.pascua_daily_readings where date is not null order by date` |
| What it holds | 222 rows, 25 May to 31 December 2026; one row has no date (a placeholder, "Today's Mass") and is left out, so 221 days, none missing. 4 of them are left out of the app (below), so 217 days have readings |
| What the app uses | the date, the name of the celebration (`feast`) and the four references. `liturgical_day` only to tell whether the source calls the day by that name. The colour is read and not kept |
| What the app does NOT use | **Pascua's own writing: its titles, snippets, full texts, reflections, family stories, prayers and audio, and its `saint_name`.** They were not read into the repository (the export has eight columns) and they are not shown |

The references are facts of the Lectionary for Mass used in the United States (which passages are read on a day there), and the names and colours are facts of the calendar; the translation and the licence
of Pascua's own texts are unknown, which is why none of them is used. The header of each `readings-<year>.json` says all of this (`about`: the source, when it was read, what it is and that Pascua's writing is not used).

Pascua counts the verses of the psalms the way the Hebrew Bible does (`Psalm 63:2, 3-4, 5-6, 7-8`, the readings of the USCCB) and takes its names from the Church Calendar API (calapi.inadiutorium.cz, the General
Roman Calendar, which has no readings).

## The days left out

On a few dates the source has the readings of the United States and the General Roman Calendar has others. The importer leaves those days out (`NOT_GENERAL` in [import_readings.py](import_readings.py), each with its
reason), lists them in the `differ` of the file, and the app shows the day of the calendar with the line "The readings for this day differ from country to country and are not in the app yet." Both modes of the
importer print the list, and `readings.test.ts` pins it.

| Day | The calendar of the app | What the source has |
| --- | --- | --- |
| 4 June 2026 | Corpus Christi (the Thursday) | the readings of the weekday (2 Timothy 2:8-15 ...); the United States keeps Corpus Christi on the Sunday |
| 7 June 2026 | the 10th Sunday in Ordinary Time | the readings of Corpus Christi (John 6:51-58) |
| 26 November 2026 | Thursday of the 34th week in Ordinary Time | the Mass of Thanksgiving Day of the United States: Sirach 50:22-24, Psalm 145, 1 Corinthians 1:3-9, Luke 17:11-19, four readings on a weekday |
| 12 December 2026 | Saturday of the 2nd week of Advent (Our Lady of Guadalupe is an optional memorial) | the readings of the feast of the United States (Zechariah 2:14-17, Judith 13, Luke 1:26-38) |

**This list is only what a reviewer found.** It is not a check of the export. Every other day may have readings of the United States that the general calendar does not have (a proper memorial, a day of prayer),
and the importer cannot tell. `readings.test.ts` makes two checks that found these days and that would find another like them: on every day with readings a Sunday or a solemnity has the title the source gives it,
and no weekday has four readings. A person with a lectionary must still read all 221 days, and in particular the days the reviewer named: 12, 26 and 29 November; 6, 12, 20 and 23 December; 29 and 30 December
(below), and the 14 references that have no words (below).

## Make it again, check it

    python3 tools/liturgy/import_readings.py            # reads the export, writes the files of every year in it
    python3 tools/liturgy/import_readings.py --check    # writes nothing; exit 1 if what is committed is not what the export makes

Options: `--export PATH`, `--out DIR`, `--ts FILE`. The output is deterministic (sorted keys, one day to a line, no clock), so `--check` is a byte comparison and `test_liturgy_import.py` runs it. Both modes print the
days they leave out and the references they change. Exit codes: 0 good, 1 `--check` found a difference, 2 the importer refused something (a row that is not a day, a day twice, a day with no reading at all; the message names
the row).

To make a new export (the owner's machine, or a session that has the project's Supabase MCP server): run the query above, with `select` only, and save the rows as the `rows` of a file like
[data/pascua-daily-readings.json](data/pascua-daily-readings.json) (`about` says where it came from, when it was read and how many rows the table had). A plain list of rows is accepted too.
Do not add the columns of Pascua's writing: `test_liturgy_import.py` fails if one is there.

## What a file holds, and what the importer does to a reference

`readings-<year>.json` is `{ about, differ?, v: 1, year, days: { "2026-11-08": { r: [first reading, psalm, second reading, Gospel], n?: the name of the celebration, o?: 1, u?: [places], m?: "morning" or "day" } } }`.
`r` always has four places, a text or `null` (the second reading is `null` on most days); `n` is the name when the source gives one; `o` is 1 when the source calls the day by that name (the celebration IS the day: a Sunday,
a solemnity, a feast, a memorial it keeps); `u` lists the places of `r` where the importer reduced a psalm to its number because the source wrote its verses in a form nobody reads (one day of 2026: 6 December, place 1);
`m` is the Mass of the day that the readings are of (24 December: "morning", 25 December: "day", below); `differ` lists the days of the year that the source has readings for and that are not the general calendar's
(no readings are kept for them, and a year with none has no `differ`). A key that is not true of a day is not written on it.
The app refuses a file that is not exactly that (`readingsCore.ts`), so a damaged file means "no readings for those days", never half of them.

The importer touches a reference as little as it can. It takes away a footnote marker the source left in (`Jeremiah 14:17-22 [^1]`), runs of spaces, and the `Psalm/` the source puts in front of the book of a canticle
in the place of the psalm (`Psalm/Deuteronomy 32` is the reading `Deuteronomy 32`). The forms the source writes (`1 Peter 1:10-1:16`, `Genesis 3:9-15, 3:20`, `Exodus 34:4b-6,8-9`, `Acts 11:21b-26; 13:1-3`,
`Sirach 27:30—28:7`, `Philemon 7-20`, `Psalm 90:3-4, 14 and 17`) are read by the app (`reference.ts`, with its tests) and said again in one plain way (`1 Peter 1:10-16`).

One change is more than tidying: **a psalm with a run of four numbers joined by hyphens is reduced to the psalm alone.** The source writes `Psalm 85:9-10-11-12, 13-14` on 6 December: no lectionary writes
that, the verses cannot be told (is it 9-10, 11-12 or 9-12?), the psalm can. The importer makes it `Psalm 85`, prints the change, and **marks the day** (`u`), so that the app shows the whole psalm with the note "The source's list of
verses for this day is not clear, so the whole psalm is shown." (and not "The source names the psalm only", which would be untrue: the source gave verses, in a form nobody reads). The app never writes a list of verses
that the source does not give: the importer does not guess whether 9-10-11-12 means 9-10, 11-12 or 9-12. The importer's tests pin the pattern for any psalm; for any other book a run of four numbers is left as it is (the app shows it as
written, with no words).

**Christmas.** The source has one row for 24 December and one for 25 December, and each of those days has more than one Mass with readings of its own. The row of 24 December has the Gospel of the Mass of the morning
(Luke 1:67-79, the Benedictus; the evening Mass is the Vigil of Christmas); the row of 25 December has the Gospel of the Mass during the Day (John 1:1-18, the Prologue of John). The rows do not say which Mass they are of, so the
importer says it for them, in a list written in the importer itself (`MASS_OF`: the date, the Mass, and the Gospel that the row must have), and **refuses the export when the Gospel of either row is not the one named there**: if
Pascua corrects a row, the claim cannot silently become false. The file marks the two days (`m`), and the screen says over the readings: "These are the readings of the Mass of the morning. The evening Mass has other readings."
and "These are the readings of the Mass during the Day. The other Masses of Christmas have other readings." Another export has its own rows to look at: a date of the list that it does not have is ignored.

## How the words are found, and when there are none

A passage is read from the bundled Bible when its reference can be shown **with confidence**. Otherwise the reference stands alone, and the screen shows no words under it, and says why. The lectionaries number the
verses of the Hebrew Bible, the World English Bible numbers them the English way, and the two differ in a known set of places, where a verse number of the lectionary names another verse of the English Bible.
A shifted verse would put the wrong words under the right name, so:

- a **psalm with a title** in the Bible (the Hebrew counts the title as one or two verses, so `Psalm 63:2` is the first verse of the English psalm) is shown **whole**, with the note "This is the whole psalm. Mass uses
  only the verses named above." A psalm with no title (1, 2, 10, 33, 43, 71, 91, 93 to 97, 99, 104 to 107, 111 to 119, 135 to 137, 146 to 150) has the same numbers in both and keeps its verses;
- a psalm the source names **with no verses** (`Psalm 147`) is shown whole, with the Bible's own verse numbers and the note "The source names the psalm only, not the verses Mass uses: this is the whole psalm."
  (108 days of 2026);
- a psalm for which the source wrote verses in a form nobody reads (one day of 2026, 6 December) is shown whole as well, and its note says that the list of verses is not clear (above);
- in the other books, `NUMBERING_DIFFERS` (`reference.ts`) lists the chapters where the numbers are known to differ (Genesis 31 and 32, Exodus 7, 8, 21 and 22, the prophets from Isaiah 8 and 9 to Malachi 3 and 4, 2 Corinthians 13 ...);
  a reference that touches one has no words. The list is the usual table of these differences kept on the side of caution (a chapter on it only loses its words), written from my knowledge of them and **not from a source I could cite**;
- a verse the Bible does not have (`Malachi 3:23`), a whole chapter of a book that is not the Psalms, a reference in a form we do not read: no words.

Under a reference with no words the screen says why: "Words not shown: this Bible may number these verses differently." (the numbers may differ, or the Bible has no such verse), "Words not shown: the source names the chapter and no
verses." (a canticle in the place of the psalm that the source gives as a chapter), or "Words not shown: this reference could not be read." (a form we do not read; none in the data). The first line says "may" because
a chapter on the list of `NUMBERING_DIFFERS` is blocked as a whole: for three references (2 Kings 11:1-4, 9-18, 20 on 19 June; Hosea 11:1-4, 8e-9 on 9 July; Job 38:1, 12-21; 40:3-5 on 2 October) the verses named have the same
numbers in both Bibles and only later verses of the chapter move, so "numbers these verses differently" would be too strong. The list is kept as it is (on the side of caution); the sentence is the soft one for every reference of its kind.

A verse that the reference cuts in parts (`Exodus 34:4b-6`: the lectionary starts in the second half of verse 4) is shown **whole**, and a note over the words says so: "A verse with a letter after its number is shown whole;
the reading uses only part of it." A verse that two runs share (`Psalm 146:7, 8-9a, 9bc-10`: the first half of verse 9, then the second) is shown once, and the two runs join with no gap between them.

`readings.test.ts` reads every reading of the 2026 data against all of this: 689 references, 675 with words (63 psalms shown whole, 108 psalms named with no verses, 1 psalm whose verses are not clear, 60 with a verse cut in parts, 443 exactly as named), and 14 shown
alone (2 Kings 11, Hosea 2, 11 and 14, Nahum 2, Micah 5, Job 40, Exodus 22, Isaiah 63 and 64, Romans 16, Malachi 3, and the three psalm slots that give a chapter and no verses). No chapter and verse is in the words of a
reading twice, and no gap sits between two verses that follow each other. Every reading without a letter starts where a sentence starts and ends where one ends, except thirteen that the lectionary starts or ends
inside a sentence (listed by date in the test): a verse shifted by one would show up there, and none did. That is evidence, not a proof; the line of small print on the screen says the words are "not the lectionary translation".

## What the screen says when it does not know

| The day | The screen |
| --- | --- |
| a day with no file (before 25 May 2026, after 31 December 2026) | the day of the calendar, and "The readings for this day are not in the app yet." No small print |
| a day the source gives the readings of one country for (the four above) | the day of the calendar, and "The readings for this day differ from country to country and are not in the app yet." No small print |
| a Sunday or a solemnity that has no second reading in the source (Trinity Sunday, 31 May) | the readings it has, and between the psalm and the Gospel: "The source lists no second reading for this day." Only for Sundays and solemnities (the weekdays of the octave of Easter, which the calendar ranks as solemnities, read as weekdays and are not included); the feasts of the Lord are not (the Transfiguration, 6 August, also has no second reading in the data, and the app does not say so: it cannot tell that a feast has one) |
| a reference with no words | the reference, as a line (not a button), and why there are no words |
| words that are not exactly what the reference names | a note over the words (a psalm shown whole, a psalm named with no verses, a psalm whose list of verses is not clear, a verse shown whole) |
| 24 and 25 December | the four readings (three on 24 December) of the row of the source, with a line over them that says which Mass they are of (above) |
| the banner (the card at the top of the Bible tab) | the same line instead of the references; each reference said in words ("Wisdom, chapter 6, verses 12 to 16") to a screen reader, a psalm by its number |

## What the 2026 data gets wrong, or says differently from the calendar of the app

`readings.test.ts` pins each of these by date. The calendar of the app (`liturgy.ts`) was checked against romcal for 1990 to 2100; the data was compared with it on the 217 days that have readings (title, colour,
week, Sunday, cycles).

- **Titles and weeks: no contradiction.** 166 days have the same title, week and Sunday in both once the words are made alike ("Thirty-second Sunday" and "32nd Sunday"). 12 are the same day in other words (the Advent
  days of 17 to 24 December are called by their date in the data; the octave of Christmas is "within the Octave of the Nativity of the Lord"; All Souls and Christmas differ by a parenthesis). 39 are days on which the data
  names a saint or a feast that `liturgy.ts` leaves out on purpose (its WHAT IS NOT): the screen then makes the saint the title and puts the day of the calendar under it. On every day with readings a Sunday or a
  solemnity has the title the source gives it, and no weekday has four readings.
- **Colours: the data is wrong on four days.** On 21 and 23 December (Advent) and 29 and 31 December (Christmas time) the data says Green where the days are violet and white. On the 104 other days where the colour differs (108 in all) it is the colour
  of a memorial or a feast of a saint (white, red) on a weekday that the calendar of the app has as green or violet: not an error. **The app shows the colour of its own calendar and never the data's.**
- **Cycles: they agree.** The Gospel of each of the 26 Sundays of Ordinary Time and Advent that have readings is that of the Sunday cycle of the app (Year A, then Year B from 29 November), except 13 December (John 1, the
  third Sunday of Advent of Year B) and 20 December (Luke 1, the fourth). The first readings of weeks 10 to 16 are those of Year II (1 and 2 Kings, Amos, Hosea, Isaiah, Micah).
- **Rows that look wrong, which a person with a lectionary has to look at (not verified against a source; my reading of the structure of the lectionary).** Trinity Sunday (31 May) and the Transfiguration (6 August)
  have no second reading in the data, and the Gospel of 6 August (Luke 9:28b-36) is the text of Year C on a Year A day. The psalm of the Assumption (15 August) is Psalm 132. The reviewer also asked for 29 November
  (Isaiah 63:16b-17, 19b; 64:2-7 and Psalm 80), 6 December (Psalm 85), 20 December (Romans 16:25-27), 23 December (Malachi 3), and 29 and 30 December (Psalm 96 with its half verses) to be read against a lectionary.
  **I did not type the references I believe are right: nothing here is a correction.** `Psalm 85:9-10-11-12, 13-14` (6 December) is a form no lectionary writes: the importer reduces it to `Psalm 85` (above).
  Three psalm slots have a chapter and no verses (`Jeremiah 31`, `Deuteronomy 32` twice), and 108 give the psalm and no verses (6 December gives verses in a form nobody reads).
- **`liturgical_day` is not reliable as the name of the day.** It names 39 saints as the day itself and keeps the weekday on 13 days where `feast` names a memorial that I know to be obligatory (14 August, 27 to 29 August, 3, 15, 16 and 30 September,
  1, 2, 7, 15 and 17 October). The app takes the name from `feast`, and does not say whether a memorial is optional: **the data has no rank**. `saint_name` is Pascua's own saint of the day (it follows the United States: Kateri Tekakwitha on 14 July where `feast` has
  Camillus de Lellis, and it names saints that are in no calendar), so it is not used.
- **Which name takes a day.** On a weekday the name of the celebration in the data is the title and the day of the calendar goes under it. On a privileged weekday (17 to 24 December, the octave of Christmas, Lent) only a
  feast of the General Calendar takes the day, on its own date, and only when the source says the day IS that celebration: Saint Stephen, Saint John and the Holy Innocents (26, 27, 28 December) and the Chair of
  Saint Peter (22 February). An obligatory memorial that the source calls by its name does not take a weekday of Lent. Ash Wednesday and Holy Week are taken by nothing. (The 2026 data has no day of Lent: the rule is tested on made-up rows
  for 2027.)
- **Christmas, the Triduum, Lent and Easter time.** Christmas has four Masses and the data has one set (the Mass during the day); the Easter Vigil has seven readings and Palm Sunday has a Gospel at the procession; they do not
  fit the four places of a day. Lent, Easter time and the Triduum are not in the 2026 data at all (it starts on 25 May).

## Dates after 31 December 2026

The data stops there, so a day after it shows what the calendar of the app knows (a Sunday, a solemnity, a weekday) and the line "The readings for this day are not in the app yet." A pilgrim never sees a guess.
The test run prints a **notice** (never a failure: a test that failed on a date would turn every pull request red) when today plus 30 days is past the last day of the data: from 2 December 2026 it says so.

I looked for an open, citable source of references by date for 2027 and later (20 minutes of searching, 8 November 2026) and **did not find one** that I could use:

- the **Catholic Readings API** (github.com/cpbjr/catholic-readings-api, MIT licence on the code and data it ships): the four references and the celebrations by date, but only 2025 and 2026, "extracted from USCCB" with no statement from the USCCB about reuse;
  a 2027 file would have to be made the same way. It is the closest thing, and it is the same source family as the data above (the United States);
- the **Ordo Lectionum Missae** (1981, the Latin book that lists every reading of the Roman Lectionary by its reading-set number): the complete source and exactly what is wanted (Sunday cycles A, B and C, weekday years I and II, proper of the saints),
  scanned on archive.org, but under the copyright of the Libreria Editrice Vaticana, in Vulgate numbering (which needs the same versification care as above), and not machine readable. Making a table from it would be a project, and a permission question;
- the French **AELF API** (api.aelf.org): no licence found, and the texts are copyrighted; the **Parish Companion Ordo** (MIT) and the **Liturgical Calendar API** and **romcal** are calendars with no readings;
  the **Revised Common Lectionary** is not the Roman Lectionary; USCCB's own pages give the NABRE text under its terms and are not a source to scrape.

So: **2027 and later needs a decision of the owner** (the question is in the report of the session that wrote this): extend Pascua's table, or ask for permission to use the Ordo, or accept "not in the app yet" past 2026.
Whichever source it is, its readings are those of one country unless it is the Ordo: the list of days left out has to be made again for it, by someone with a lectionary.

## What to do in Pascua to extend its table

1. Add the rows of 2027 to `public.pascua_daily_readings` (one row for each day, `date` filled in, never null), from the same source Pascua used for 2026; keep the eight columns above, in the same forms.
2. Fill `second_reading_ref` on every Sunday and solemnity (the 2026 rows lack it on Trinity Sunday and the Transfiguration), and write a psalm with its verses (`Psalm 63:2, 3-4, 5-6, 7-8`, not `Psalm 63`;
   `Jeremiah 31:10, 11-12ab, 13`, not `Jeremiah 31`).
3. Write each reference as `Book chapter:verses` in one form (no `[^1]` markers, no `Psalm/Book`, no `9-10-11-12`), and give the colour of the day from the calendar, not from a saint's memorial.
4. If the owner wants the rank of a memorial shown, add a `rank` column (solemnity, feast, memorial, optional memorial); it is not there today.
5. Mark the days that are the readings of the United States only (Thanksgiving, the feast of Our Lady of Guadalupe, Corpus Christi on the Sunday ...), or give the general calendar's readings for them, so that nobody has to find them again by reading.
6. Make a new export with the query above, save it next to the old one, run the importer, run `npm run test:library` and `python3 -m unittest discover -s tools/tests`, and commit the files it wrote. Look at
   what the importer prints (the days it leaves out, the references it changes) and at what the two checks of `readings.test.ts` (titles, second readings) say about the new days.

A reading that is not one passage of one book (the Easter Vigil has seven readings, Christmas has four Masses, Palm Sunday has a Gospel at the procession) does not fit the four places of a day: those days need a richer format
(a list of readings) before they can be added. Lent, Easter time and the Triduum are not in the 2026 data at all.
