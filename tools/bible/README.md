# The text of the Bible: World English Bible, Catholic edition

The Library of the app reads the Bible from files that are part of the app: 73 books of the **World English Bible, Catholic edition**
(eBible.org id `eng-web-c`), in plain JSON. Nothing is fetched while someone reads, nothing is stored and nothing is sent anywhere. This
folder holds the importer that turns eBible.org's USFM files into those JSON files, and this page says where the text comes from, how to
make it again, how to check it, what the format is and what was left out.

- the importer: [import_webc.py](import_webc.py) (Python 3, standard library only)
- its tests: [test_bible_import.py](../tests/test_bible_import.py), and for the files themselves `mobile/src/features/library/__tests__/bibletext.test.ts` and
  `searchtext.test.ts` (run by `npm run test:library`)
- the files it writes: `mobile/assets/bible/webc/` and
  [webc.generated.ts](../../mobile/src/features/library/bible/webc.generated.ts)
- the types the screens read them with: [textTypes.ts](../../mobile/src/features/library/bible/textTypes.ts); the code that hands them out:
  [text.ts](../../mobile/src/features/library/bible/text.ts) and [searchText.ts](../../mobile/src/features/library/bible/searchText.ts)

## Where it comes from

| | |
| --- | --- |
| Translation | World English Bible, Catholic edition, `eng-web-c` |
| Page of the translation | https://ebible.org/eng-web-c/ |
| File | https://ebible.org/Scriptures/eng-web-c_usfm.zip, 3,090,996 bytes |
| sha256 of the file | `85a6599ccd65c8d71a62fb0d7e1739e4c776a970e05f25d5f881684550e7620c` |
| Downloaded and read through | 8 November 2026 |
| What is in it | 74 `.usfm` files (a preface, `FRT`, and 73 books), `copr.htm` (the licence page), the signing key and signature of eBible.org, a style sheet |

The importer is pinned to that hash. Another file is refused with both hashes printed; it is never guessed at.

## The licence, and what we do about it

From `copr.htm` in the zip: "The World English Bible is in the Public Domain. That means that it is not copyrighted. However, "World English
Bible" is a Trademark of eBible.org. You may copy, publish, ... sell ... as much as you want ... All we ask is that if you CHANGE the actual text of
the World English Bible in any way, you not call the result the World English Bible any more."

So the words must stay exactly as they are, and they do: every verse was compared with a second, independent reading of the source (see
Tests). The importer only takes markup away. What it leaves out is the apparatus around the words (Strong's numbers, footnotes, cross
references, the preface and the long titles of the files), and it says so: the numbers are in `manifest.json` and in the section
"What is left out" below, and the Licences screen of the app says that Strong's numbers, footnotes and cross references are not included.
The app names the text "World English Bible, Catholic edition" and credits eBible.org (`TRANSLATION.credit`, in `index.json`).

## Make it again, check it

    python3 tools/bible/import_webc.py                    # downloads the zip into a fresh temporary folder, checks its hash, writes the files
    python3 tools/bible/import_webc.py --zip PATH         # the same with a copy of the zip you already have
    python3 tools/bible/import_webc.py --check            # writes nothing; exit 1 if what is committed is not what the zip makes
    python3 tools/bible/import_webc.py --check --zip PATH

Exit codes: 0 all good, 1 `--check` found a difference (it lists them), 2 the importer refused something (the message names the book and the
line, or says that the hash is not the pinned one). Options: `--out DIR` (default `mobile/assets/bible/webc`), `--ts FILE` (default
`mobile/src/features/library/bible/webc.generated.ts`), `--sha256 HEX` (default the pinned hash).

The output is deterministic: the same zip always makes the same bytes (sorted keys, no spaces, one newline at the end), so a second run changes
nothing and `--check` is a byte comparison. `manifest.json` has no clock in it: the date is pinned with the hash (`PINNED` in the importer).

To re-verify a checkout without trusting anybody: download the zip yourself, compare `sha256sum` with the hash above, run `--check --zip` on it.

## What is in `mobile/assets/bible/webc`

- `GEN.json` ... `REV.json`: one file per book, 73 of them, named by the three-letter code of USFM (`1SA`, `SNG`, `ESG`, `DAG` ...). The largest is
  `PSA.json` (288 KB), the smallest `2JN.json` (1.9 KB).
- `index.json`: `{ translation, books }`, the translation as the screens print it and the 73 books in the order of the app with the name the translation
  gives each, its number of chapters and of verses.
- `manifest.json`: where it came from (address, size and sha256 of the zip, the sha256 of its licence page), the size and sha256 of every file here, chapters
  and verses of every book, the totals (73 books, 1,328 chapters, 35,408 verses), and counts of what was left out. Meant for people: one value to a line.
- `../../src/features/library/bible/webc.generated.ts`: 73 lazy `require`s, because Metro needs a literal path in each. A book is read from its file when it
  is first asked for.

The order of the books is the order of the app: the Old Testament (Esther where the Hebrew Bible has it and Daniel after Ezekiel, both from the Greek:
`ESG` and `DAG`), the Deuterocanon (`TOB JDT WIS SIR BAR 1MA 2MA`), the New Testament.

## The format

`<CODE>.json` is a `BookText` (see [textTypes.ts](../../mobile/src/features/library/bible/textTypes.ts)): `{ code, name, chapters: [{ c, title?, verses: [{ n, t, p?, b?, h? }] }] }`.

- `n`, the label of the verse, as printed: `"1"`, `"2"` ... In Sirach a few are joined (`"15-16"`, see below).
- `t`, the words. There is no markup in it. A `"\n"` starts a new line: a line of poetry, or a paragraph that begins inside a verse. The tabs at the start of
  a line say how far it is indented: one tab for a first level line of poetry (and for an item of a list), two for the second, three for the third; a line of
  prose has none. A blank line inside a verse is an empty line (two `"\n"` in a row). The words are as they are in the edition, curly quotes and dashes
  included, with runs of spaces made one. The only characters are printable ASCII, the curly quotes, the en and em dash, and the no-break space (three
  times, between a closing single and a closing double quote: John 5:11, Acts 20:35 and 22:21; in the files it is written with the six characters `\u00a0`, so that it shows in a diff).
- `p: true`, a new paragraph of prose starts with this verse. A verse without it goes on in the paragraph before it.
- `b: true`, a blank line (a break between stanzas) comes before this verse. Never on the first verse of a chapter.
- `h`, a heading that stands before this verse: "BOOK 1" over the first psalm, the letters of Psalm 119, the speakers of the Song of Songs
  ("Beloved", "Lover", "Friends", "Brothers"), the sections of Daniel and the Letter of Jeremiah.
- `title`, the line over a chapter: the title of a psalm ("A Song of Ascents."), and the prayer over Sirach 51.

### How a reader draws it

Draw the verses in order, each with its number in front of its first line.

- A verse that has `p` starts a new paragraph. A verse that has neither `p` nor a tab at the start of its text **goes on in the line or the paragraph before it**: its
  first line is drawn right after the last words of the verse before it, on the same line. In prose that is the usual case (the verses of a paragraph).
  In poetry it happens when a line of the poem is shared by two verses: Psalm 55:2 ends with "and moan" and Psalm 55:3 starts with "because of the voice of
  the enemy," on the same line; so do Psalm 66:13 and 14.
- A line that starts with tabs is a line of poetry on a line of its own, indented by its tabs. A first line with tabs starts a new line.
- A `"\n"` in `t` ends the line. A line with no tabs after a `"\n"` is a new paragraph of prose inside the verse (John 8:11; the four paragraphs of the addition
  at the start of Esther 1:1 in `ESG`).
- `b` is a vertical space before the verse. `h` is a line of its own before the verse (and before its blank line, if it has one).

### Verses with no words

29 verses have a number and no words: the edition prints only a note under them, because the verse is left out of the best manuscripts. The verse is kept, with
`t` empty, so that every number of the edition is there and the labels are exactly the edition's; a screen can show the number alone, or leave it out.
`manifest.json` lists them (`emptyVerses`) with the words of the note, for example Sirach 11:15-16, "Verses 15 and 16 are omitted by the best authorities.",
and Acts 8:37, "TR adds Philip said, “If you believe with all your heart, you may.” ...". They are 24 verses of Sirach and Luke 17:36, Acts 8:37, 15:34 and
24:7, Romans 16:25. The five joined labels of Sirach (11:15-16, 16:15-16, 19:18-19, 22:9-10, 26:19-27) are among them: there are no other labels that are
not a plain number. A verse with no words is never found by the search. (Acts 8:37 starts a paragraph in the source, so it has `p`.)

## What each marker of the source becomes

The source is USFM. The importer knows exactly these markers and stops at any other one.

- `\id`, `\ide`, `\h`, `\toc1`, `\toc2`, `\toc3`: the head of a book. `\toc2` is the name of the book ("Psalms", "Song of Solomon", "Esther (Greek)"); the others are read
  and checked, not kept. `\ide` must say UTF-8.
- `\mt1`, `\mt2`, `\mt3`: the long title of the book ("The First Book of Moses, Commonly Called Genesis"). Left out.
- `\ip`, `\is1`: an introduction written by the translators; in Sirach it also holds the Prologue of the translator, the grandson of the author. Left out and counted
  (12 lines, 658 words, in `ESG TOB JDT WIS SIR BAR 1MA 2MA`; the Prologue of Sirach is 310 of those words).
- `\cl`: "Psalm", the word that goes with a chapter number. Left out.
- `\c N`: a chapter. They must be 1, 2, 3 ... without a gap.
- `\v N` and `\v N-M`: a verse. The numbers must grow inside a chapter.
- `\d`: the title of a psalm: `title` of the chapter. In a chapter with more than one `\d` they are all headings (Psalm 119, where the 22 letters of the Hebrew
  alphabet are `\d` lines and `ALEPH` is not a title): `h` of the verse each stands before.
- A paragraph of words over the first verse of a chapter (`\p A Prayer of Jesus the son of Sirach.` before Sirach 51:1): `title`.
- `\ms1`, `\s1`, `\sp`: a heading: `h` of the verse it stands before. See "Headings inside a verse" below.
- `\mr`, `\r`: a line of references. Left out (there are none in this edition).
- `\p`, `\m`, `\mi`, `\pi1`: a paragraph of prose: `p` on the verse that starts it, and a `"\n"` when it starts inside a verse. (Indented paragraphs are not indented: the
  format has one kind of prose.)
- `\nb`: no break. Nothing: the verse goes on in the paragraph before it (John 8:1, Genesis 50:1).
- `\q1`, `\q2`, `\q3`, `\li1`: a line of poetry or a list item, with 1, 2, 3 and 1 tabs in front.
- `\b`: a blank line: `b` on the verse after it; an empty line when it is inside a verse (22 verses, for example Ezra 4:11); nothing at the top or the end of a chapter
  (12 and 104 of those, counted).
- `\pc`: a centred line. The only one is a rule of dashes between two verses of 2 Maccabees 2. Left out; anything else in a `\pc` stops the importer.
- A word with its Strong's number: the word. The number is left out (669,389 of them).
- `\wj` (words of Jesus), `\qs` (Selah), `\bk` (the name of a book), `\nd`, `\add`: their words, without the markers. All the words of the edition stay.
- `\f ... \f*`, `\x ... \x*`: a footnote, a cross reference. Left out (1,678 and 343 in the books).

## What is left out

All of it is counted in `manifest.json` (`dropped`). The words of the translation are not on the list.

| What | How much | Why |
| --- | --- | --- |
| Strong's numbers | 669,389 tags | apparatus: they number the words of the original languages, and are not read |
| footnotes | 1,678 | apparatus, decided by the owner |
| cross references | 343 | apparatus, decided by the owner |
| the preface (`FRT`), 37 lines | 1 file, 9,459 bytes | front matter of the edition |
| introductions of the translators, with the Prologue of Sirach | 12 lines, 658 words, in 8 books | not the text of the books, and the format has no place for them |
| long titles (`\mt`), head lines (`\h`, `\toc1`, `\toc3`, `\ide`), the chapter label (`\cl`) | 117, 284, 1 | names of the files, not words of the books |
| a rule of dashes (`\pc`) | 1 | decoration |
| blank lines at the top and at the end of a chapter | 12 and 104 | a chapter break is a break |
| two speaker headings in the middle of a verse | 2 | see below |

The footnotes of this edition are not only notes: they also hold readings that other manuscripts have, and the words of the verses in the list above.
What the app does not show is in the zip, which is in the public domain too.

The counts are of notes: one for each footnote or cross reference (a note has an opening and a closing marker, so a count of markers is twice as high). The one footnote
of the preface is not counted, because the preface is left out whole.

### Headings inside a verse

The Song of Songs has `\sp` speaker lines that stand in the middle of a verse (1:4, 5:1, 6:13, 8:5). The format has a heading before a verse and no place inside one.
The rule: a heading belongs to the next verse that starts after it, and when there is more than one the last one wins, because it names the speaker where the next
verse starts. Three of the five (Beloved before 1:5, Lover before 7:1, Beloved before 8:6) are kept that way. Two (Friends, in 1:4 and in 5:1) are left out, because the
speaker changes again before the next verse starts; their words stay in the verse. Both lists are in `manifest.json`
(`dropped.headingsInTheMiddleOfAVerse`).

## What the importer refuses

Every one of these is an error that names the book and the line, and nothing is written:

- a marker it does not know, in a book or inside a footnote; a backslash that starts no marker; a note or a style that is not closed on its line
- a word tag that is not the one shape this edition has; a tab or a carriage return in the source
- a character outside the set above in the words, or `\`, `|` or a straight double quote left in them
- chapters or verses out of order; a verse with no words and no note; two paragraph or line markers in a row; words outside a verse; a heading
  with no verse after it, or two headings before one verse (apart from the case above)
- a file that is not `\id` of the code it is named for; a book missing, or one more; totals that are not 73 / 1,328 / 35,408
- a zip that is not the pinned file, that is too big, or that has a file with an unsafe name (the zip is read in memory, with limits, and never unpacked)

## Sizes and speed

Measured in plain node on a laptop (a phone is slower, and nothing was run on one):

- The 73 books are 5,389,017 bytes of JSON, with `index.json` and `manifest.json` 5,424,200 bytes (5.4 MB); gzip makes that 1.59 MB. The Android Hermes bundle and the
  web export are measured in the pull request.
- `JSON.parse` of the largest book, Psalms: 1.6 ms. Of all 73 books: 17 ms.
- The first search reads the 73 books and folds the words of 35,408 verses: about 100 to 135 ms. Every search after it scans folded words: 0.1 to 15 ms for 100 hits,
  70 ms to build 30,000 hits ("the"). `prepareSearch()` does the first part ahead of time.

## Bumping the pin

When eBible.org publishes a new edition of the zip:

1. Download it and read it (`unzip -l`, `copr.htm`): a new licence page is a reason to stop and ask.
2. Run `python3 tools/bible/import_webc.py --zip NEW.zip --sha256 $(sha256sum NEW.zip | cut -d' ' -f1)`. Whatever it refuses is a change in the source that somebody has to read
   and decide on; teach the importer, and add a test for it.
3. Put the new hash and today's date in `PINNED` in the importer, and the new totals if they changed.
4. Run it without `--sha256`, then `--check`, then the tests. The tests pin the numbers (`bibletext.test.ts` and `test_bible_import.py`): a change in the text shows up as a
   failing test, which is on purpose; read the diff of the assets, then change the numbers that moved.
5. Say what changed in the pull request, and look at the licences entry of the app.

## Tests

- `python3 -m unittest discover -s tools/tests -v` runs [test_bible_import.py](../tests/test_bible_import.py): a small USFM text that has every marker above and every edge, the
  refusals, the pinned hash, deterministic output, `--check` against a changed file, and that the committed files agree with the importer and with each other. No network.
- `npm run test:library` (in `mobile/`) runs `bibletext.test.ts` (totals, a table of the chapters and verses of every book typed in again and read against a second
  source, the hash of every file, the format, Psalm 121:1-4 equal to the sample of the Daily reading, Esther and Daniel from the Greek, the wiring of
  `text.ts` and `webc.generated.ts`, run for real) and `searchtext.test.ts`.
- With `WEBC_ZIP=PATH` (a copy of the zip) set, the same Python tests also run the importer on the real zip: the files it makes are exactly the committed ones, and the words
  of every one of the 35,408 verses are the words of an independent reading of the zip (regular expressions, no state), whitespace aside. That is how it is checked that the
  importer takes only markup away. CI has no copy of the zip, so it skips them; run `WEBC_ZIP=PATH python3 -m unittest tools.tests.test_bible_import -v` after a bump of the pin.
