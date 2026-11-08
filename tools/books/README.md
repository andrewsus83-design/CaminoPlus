# Books: the text of the twelve free books of the Library

The Books tab of the app lists twelve classics (`mobile/src/features/library/books/catalog.ts`). This folder turns public domain editions into
the text the reader shows offline: `mobile/assets/books/<id>.json` (one `BookText` per book), `index.json`, `manifest.json` and the generated
`mobile/src/features/library/books/books.generated.ts`. Standard library only (Python 3), no network at runtime, and none in the tests.

```bash
python3 tools/books/import_books.py                    # download, check the sha256, clean, write the assets of every book that may go in
python3 tools/books/import_books.py --book confessions # rebuild one book; the others keep their entries in the manifest
python3 tools/books/import_books.py --raw-dir DIR      # keep the downloads in DIR (a cache and a record); --offline never downloads
python3 tools/books/import_books.py --check            # write nothing; exit 1 if an asset is not what the recipes make
python3 tools/books/import_books.py --list             # the twelve books, their verdicts and editions
python3 -m unittest discover -s tools/tests -v         # the tests (test_books_import.py), no network
```

Files: `import_books.py` (the command), `books_recipes.py` (one recipe per book: source, sha256, how it is cut and structured, the facts the
app shows), `books_build.py` (what a recipe fills, with the checks that make a bad text a hard error), `books_clean.py` (the cleaning rules).
Mobile side: `mobile/src/features/library/books/bookTextTypes.ts` (the contract), `bookTextApi.ts` (the logic, tested in plain node),
`bookText.ts` (thin glue: `BOOK_TEXT_INDEX`, `hasBookText`, `loadBookText`), `books.generated.ts` (one lazy `require` per book, written by the
importer), tests in `mobile/src/features/library/__tests__/bookText.test.ts`, the Licences screen `mobile/app/licences.tsx`.

## What may go into the app

Only a text that is public domain **everywhere the app is used**:

- (a) the translation was first published in 1930 or earlier (public domain in the US in 2026), and
- (b) the translator, and the author of any introduction or notes that are kept, died in 1955 or earlier (public domain where the term is life
  plus 70 years), or the translator is anonymous and the edition is older than 1900.

Each recipe states its `verdict`: `public domain everywhere`, `US only` or `unclear`. The importer writes a text only when the verdict is
`public domain everywhere`. A book that is not written is listed in `manifest.json` under `leftOut` with the reason. To let a book in after the
owner decides (for example when a translator's death year is found), fix the facts in its recipe and run the importer: nothing else changes.

**Spain.** Authors who died before 7 December 1987 keep life plus 80 years there (disposición transitoria cuarta of the Ley de Propiedad
Intelectual; the Supreme Court applies it to foreign authors, for example Chesterton; commentary:
[LegalToday](https://www.legaltoday.com/practica-juridica/derecho-civil/nuevas-tecnologias-civil/la-proteccion-en-espana-de-las-obras-de-autores-europeos-fallecidos-antes-de-1987-2015-07-13/),
[civil-mercantil.com](https://www.civil-mercantil.com/node/1471); I read these summaries, not the statute). A translator who died between 1946 and 1955
passes the rule above and is still protected in Spain until 2026 to 2035. **No text in the app is in that range** (every translator in the
table died in 1937 or earlier, or is not named in an edition of 1876), and the table gives every death year so that the owner can see it.

**The library's name.** Gutenberg's licence text, headers, footers, trademark lines and "produced by" credits are removed. The name "Project
Gutenberg" appears nowhere in the app data; the source is credited in `credit` by its address (`gutenberg.org/ebooks/1653`,
`ccel.org/ccel/ignatius/exercises`).

**CCEL.** Three texts come from CCEL's plain-text files (Spiritual Exercises, Devout Life, the Dialogue). CCEL's
[copyright policy](https://ccel.org/about/copyright.html) says most of its editions are based on books that are public domain in the United
States, that an edition may have copyrighted introductions, cover art and other special contents (none of that is kept: no summary, no
description, no introduction of CCEL's), and that books under another publisher's copyright are marked on their page (none of these is). The
Dialogue file states "This etext is in the public domain" (Harry Plantinga, 1994). The importer keeps only the text of the old translation.
Open question for the owner: whether to ask CCEL in writing about commercial use of its transcriptions (see the report).

## The twelve books

`Raw sha256` is the hash of the download the recipe cleans; the importer refuses any other file. Ages are as given by the catalogue records named
under each book. "Words" counts what the reader shows (paragraphs, headings, quotations, points).

| # | Book (id) | Edition used or best candidate | Translator (died) | First published | Source and raw sha256 | Verdict | In the app | Chapters | Words |
|---|---|---|---|---|---|---|---|---|---|
| 1 | The Way of a Pilgrim (`way-of-a-pilgrim`) | R. M. French's translation, Philip Allan, first impression September 1930 | Reginald Michael French (**1969**; CCEL says 1884 to 1969, LibraryThing 1883 to 1961: after 1955 either way) | 1930 (the first English translation) | [CCEL](https://ccel.org/ccel/philip_allan/pilgrim), `pilgrim.txt` `213c44ee1b3d2cb77db1ea3cc16408fb1f2f4be9dfe5ce43b3e7ffca80aa4434`; dates: [CCEL author page](https://ccel.org/ccel/french) | **US only** | no | n/a | n/a |
| 2 | The Life of St. Teresa of Jesus (`life-of-st-teresa`) | David Lewis, third edition with additional notes by Benedict Zimmerman (Thomas Baker, 1904) | David Lewis (1895); the editor whose notes and introduction are dropped, Benedict Zimmerman (1937) | 1870 | [Gutenberg 8120](https://www.gutenberg.org/ebooks/8120) `3420485ba9b861cc44ac80833e3d9864683784e93e0f68f6ba5fc44c407a33bc`; dates: that page's catalogue record | public domain everywhere | **yes** | 41 (Prologue, I to XL) | 138,690 |
| 3 | The Little Flowers of Saint Francis (`little-flowers`) | best candidate: Arnold (Chatto and Windus, 1908) or Okey (Dent, 1910) | Thomas Walker Arnold (1930) or Thomas Okey (1935), per the Internet Archive catalogue records | 1904 to 1910 | none used; scans only: [Heywood 1906](https://archive.org/details/TheLittleFlowers) `fc7dab76bd2ca6ffc6382af8e7509baa76d79116c275ba5196d5a56347360a52`, [Arnold 1908](https://archive.org/details/littleflowersofs00arno) `a51271a21ca4f7c2f393e5e33b1e9a5e006cea9965772fc386a7a00584a01bf7` (OCR text files) | the translations are public domain everywhere; **no clean text** | no | n/a | n/a |
| 4 | Dark Night of the Soul (`dark-night`) | best candidate: David Lewis (1864), with corrections and introductory essay by Benedict Zimmerman (Thomas Baker, 1908; the 1916 edition compares it with the Spanish) | David Lewis (1895), Benedict Zimmerman (1937) | 1864 | none used; scans only: [1908](https://archive.org/details/TheDarkNightOfTheSoul1908) `2f52b079bdc5d0956d990a86b7ed5aaf9d368a4dbb76765662dd68ef2ee577a0`, [1916](https://archive.org/details/darknightofsoulc00john) `63e9c46702d344efb33c8b260d64bb57565cca268b32664fc28f66432a786033`; CCEL's file is E. Allison Peers (1935), `c76fca7a241fb60a7ae731e45e78140f203b23fdb5b1c9f3d4a1b84c7616cc98`, which fails rule (a) | the translation is public domain everywhere; **no clean text** | no | n/a | n/a |
| 5 | The Interior Castle (`interior-castle`) | best candidate: John Dalton (T. Jones, 1852). The Benedictines of Stanbrook (CCEL `castle2`, Thomas Baker, third edition 1921) were checked | Dalton (1874, per the Online Books Page); the Stanbrook nuns are not named | 1852 (Stanbrook: 1906 to 1912) | none used; [scan 1852](https://archive.org/details/interiorcastleor00tere_0) `70fe8bed1260b32695ccfa1e424e721cd38abe9ddd9a2d2a5bbb4e787fd798a8`; [CCEL castle2](https://ccel.org/ccel/teresa/castle2) `7313d5ea4c70c51c69572a04fad72e7ac6fdd824f45bbf50c36f1183d2bed958` | Dalton: public domain everywhere, **no clean text**; Stanbrook: **unclear** (anonymous, but not older than 1900) | no | n/a | n/a |
| 6 | The Spiritual Exercises (`spiritual-exercises`) | Elder Mullan, translated from the autograph (P. J. Kenedy and Sons, New York, 1914; the preface is dated 1909) | Elder Mullan, S.J. (**1925**; heading "Mullan, Elder, 1865-1925" on the [Online Books Page](https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Mullan%2C%20Elder%2C%201865%2D1925)) | 1914 (copyright notice and imprimaturs of 1914) | [CCEL](https://ccel.org/ccel/ignatius/exercises) `exercises.txt` `a2914792b4234cd61e5aaf2ea774aa652d226ebeb4caea347a36c2ddf7d6ffcb` | public domain everywhere | **yes** | 88 | 27,321 |
| 7 | The Imitation of Christ (`imitation-of-christ`) | William Benham (Macmillan, 1874), the text of Gutenberg 1653 | William Benham (1910; Gutenberg's catalogue record "1831-1910") | 1874 (Macmillan, London; a Spectator notice of 7 November 1874) | [Gutenberg 1653](https://www.gutenberg.org/ebooks/1653) `7e9f72139575c267b0e65dd1c9665cc8541a289538fda4cff370dedd0cc83a74` | public domain everywhere | **yes** | 114 (25 + 12 + 59 + 18 in 4 books) | 59,423 |
| 8 | Introduction to the Devout Life (`devout-life`) | "A New Translation" in the Library of Spiritual Works for English Catholics (Rivingtons, London, 1876); the translator is not named on the title page ([title page of the scan](https://archive.org/details/introductiontod00salegoog)) | none named | 1876 | [CCEL](https://ccel.org/ccel/desales/devout_life) `devout_life.txt` `72a199c7f1b656efc22c53ef67cd11df4573067cda3ba38191cd1b4156a903b4` | public domain everywhere (anonymous translator, edition older than 1900) | **yes** | 120 (preface + 24 + 21 + 41 + 15 + 18) | 80,423 |
| 9 | Abandonment to Divine Providence (`abandonment-to-providence`) | Ella McMahon, from the eighth French edition revised by H. Ramière (Benziger, New York, 1887) | Ella McMahon (**death year not found**; no dates in the catalogues of [Gutenberg](https://www.gutenberg.org/ebooks/author/46648), the [Online Books Page](https://onlinebooks.library.upenn.edu/webbin/who/McMahon%2c%20Ella) or the Library of Congress; the novelist Ella MacMahon, listed as 1864 to 1956 in the Dictionary of Irish Biography (a page I could not open), is another person according to [Ricorso](http://www.ricorso.net/rx/az-data/authors/Mac/M-Mahon_E1/life.htm)) | 1887 | [Gutenberg 52057](https://www.gutenberg.org/ebooks/52057) `6c157eaaae913f11e814d61bc78c303f44644c535456acfdb0fadfa30f5c2b23` | **unclear** | no (the recipe is ready: 33 chapters) | (33) | (23,446) |
| 10 | Confessions (`confessions`) | E. B. Pusey (Parker, Oxford, 1838) | E. B. Pusey (1882) | 1838 (Parker and Rivington, 1838; library catalogue records) | [Gutenberg 3296](https://www.gutenberg.org/ebooks/3296) `ef3fa6267968c875def9091a1882d14b525a85bbf6996a3e2f130a775b2e22d2` | public domain everywhere | **yes** | 13 (the books) | 111,775 |
| 11 | The Dialogue of Saint Catherine of Siena (`dialogue-of-st-catherine`) | Algar Thorold, the new and abridged edition (Kegan Paul, 1907) | Algar Thorold (**1936**; heading "Thorold, Algar, 1866-1936" on the [Online Books Page](https://onlinebooks.library.upenn.edu/webbin/book/lookupname?key=Thorold%2C%20Algar%2C%201866%2D1936)) | 1896 (reviewed in the Spectator on 24 October 1896) | [CCEL](https://ccel.org/ccel/catherine/dialog) `dialog.txt` `79c7374b4ba14986017f343d1401e9fbff269f54e2f306f3d94922019a662546` | public domain everywhere | **yes** (abridged edition) | 94 | 81,926 |
| 12 | The Story of a Soul (`story-of-a-soul`) | Thomas N. Taylor, "Soeur Thérèse of Lisieux" (Burns, Oates and Washbourne, 1912; 8th edition 1922) | Thomas Nimmo Taylor (**1963**; Gutenberg's catalogue record "1873-1963") | 1912 | [Gutenberg 16772](https://www.gutenberg.org/ebooks/16772) `7a342092ea22733e015439cbc3cd0bdc31f90bb980bf396b0b34ff392131b2e2` | **US only** | no | n/a | n/a |

### What each text keeps and what it drops

Footnotes are **dropped, with their marks** (policy for every book, counted in `manifest.json`: `counts.footnotes`, `counts.footnote marks`):
the notes are Bible references and editors' remarks that interrupt a page read on a phone, and a mark left behind would be a stray number.
Introductions, prefaces and notes by editors and translators are left out unless they are the author's own text.

- **Life of St. Teresa**: keeps the Prologue and chapters I to XL (each title is the edition's chapter heading with its argument, as printed;
  paragraphs keep their numbers; the monogram "I.H.S." of the closing letter is kept). Drops the title pages, the introductions (Lewis, Zimmerman),
  the annals of the saint's life, the arguments of the chapters, the contents, 538 footnotes, the eleven Relations that follow the Life, the index.
- **Spiritual Exercises**: keeps the Annotations, the Presupposition (with the formal title of the Exercises as a heading), the four Weeks, the
  contemplation to gain love, the three methods of prayer, the mysteries of the life of Christ, the rules (88 chapters; the weeks and the groups are
  `part`). Drops the approbations, the preface and general note of the edition, the prayer of Father Diertins, the contents, the translator's 42
  textual notes ("Offering is in St. Ignatius' handwriting"), the index and the indexes of Scripture and pages, six lines of the letter G that stand
  for the grid of the Particular Examen. The CCEL file does not have the numbers of the paragraphs of the Exercises, so none are shown.
- **Imitation of Christ**: keeps the four books and 114 chapters (the first paragraph of a chapter has no number, the others do, as in the
  edition; "The Voice of Christ" and prayer titles are headings). Drops the contents, the introductory note, and 180 footnotes (Bible references).
- **Devout Life**: keeps the Preface by the Author and five parts of chapters; a paragraph that runs several numbered points together
  ("1. ... 2. ...") is split into list points (12 times). The first word of a section, printed in capitals in the edition ("DEAR reader"), is set as a
  word (96 times). Drops 213 footnotes, the contents and the five long headings in it, the index and what follows.
- **Dialogue**: keeps the four treatises and the 94 chapters of the abridged edition of 1907, each titled with its argument (the chapter numbers
  are not in CCEL's file), and the letter of Ser Barduccio Canigiani on the saint's death. Drops the translator's introduction. Each chapter is one or
  few long paragraphs, as the file has it. The abridged edition does not have every chapter of the original; the full translation is the 1896 one.
- **Confessions**: keeps the 13 books (this edition has no chapters inside a book: a book is a chapter), the verse of Terence and Ambrose as
  quotations, and the closing "Gratias tibi Domine". Drops the title page.

### Cleaning rules (all in `books_clean.py` and `books_build.py`)

- Hard-wrapped lines are joined into one paragraph; a hyphen at the end of a line stays and the next word is glued to it ("seed-" + "plots").
- `--` and `---` become an em dash; a longer run of hyphens (the blank lines of a form) stays. Underscore emphasis (`_word_`) is removed, the words stay.
  Quotation marks and apostrophes are as the edition has them (curly or straight): the words are never rewritten.
- A heading the edition prints in capitals is set in title case; other text is left alone.
- Poems and quotations (indented blocks) are `q` blocks with their lines; a row of asterisks is `hr`; a short line of capitalised words that stands alone
  is an `h`; numbered paragraphs of a book that numbers them (Imitation, Life, Devout Life) stay paragraphs with their numbers.
- **Strict, with no lenient mode.** A heading-like block that no rule takes, text before the first chapter, a chapter with no text, markup
  (`<`, `_`, `{}`, `[Illustration`, `[Footnote`), the name of the digital library, a double space, a stray line break, a block that is only a page or
  section number, a footnote mark without its note or a note without its mark, and a chapter count different from the recipe's: each is an error
  that names the book and the raw line. A download whose sha256 is not the recipe's is refused (the source may have been corrected: read the new
  text, then update the recipe).
- Output: compact UTF-8 JSON with a final newline, the same bytes on every run (the tests run the importer twice and `--check`s it).

### Size

Measured on 8 November 2026 with the six texts of the table. The JSON files are bundled as JavaScript (Metro), and Hermes compiles them into the
bundle even though each book is only `require`d when it is first opened.

| What | Size |
|---|---|
| the six books, index and manifest, as files | 2,842,527 bytes (2.8 MB), 946,683 bytes gzipped |
| the Android Hermes bundle of `main` | 4,969,952 bytes |
| the same with the Licences screen of this branch (it reads `manifest.json`, 10.6 KB) | 4,980,779 bytes (+10,827) |
| the same with the books pulled into the bundle (a probe import of `bookText.ts`, not committed) | 8,792,110 bytes (+3,822,158 over main) |

So the books cost about 3.8 MB of bundle, 1.35 times their size as JSON; every book that is added costs 1.35 times its file. The books alone are far
under 8 MB (the Bible text adds about 5.9 MB on its own: together they are about 9.7 MB of bundle if both are bundled as JavaScript). The way to cut
without a native module or a config change is to leave books out (remove their recipes from `RECIPES` in `books_recipes.py` and run the importer,
which writes only the books that have a recipe; the largest are the Life of St. Teresa, 0.74 MB, and the Confessions, 0.61 MB).

## The books that are not in the app, and what the owner can do

| Book | Why | Best alternatives |
|---|---|---|
| **The Way of a Pilgrim** | The only English translation found is R. M. French's of 1930 (first impression September 1930; the second impression of April 1931 is the one CCEL transcribes). It is public domain in the US since 1 January 2026, but French died in 1969, so it is protected until the end of 2039 in life-plus-70 countries and of 2049 in Spain. The Russian original (Kazan, 1884) is public domain. No English translation before 1930 was found. | (1) wait until 1 January 2040 (2050 for Spain); (2) commission a new translation from the Russian text; (3) replace the book with a pilgrim-on-foot classic that is public domain, for example Bunyan's *The Pilgrim's Progress* (Gutenberg 131, John Bunyan, 1628 to 1688), or a pilgrim's own account from a medieval or 19th-century source. |
| **The Story of a Soul** | Taylor's translation (1912) is public domain in the US but he died in 1963: protected until the end of 2033 in life-plus-70 countries and of 2043 in Spain. Searches turned up a first English translation of 1901 whose translator and publisher I could not confirm. | (1) wait until 1 January 2034 (2044 for Spain); (2) find the 1901 translation, confirm the translator died in 1955 or earlier (or is anonymous and the edition is older than 1900) and add its recipe; (3) a partial text of the Autobiography is not available either. |
| **Abandonment to Divine Providence** | First published in 1887, so the US is certain, but no source gives the translator's death year (see row 9). If she died after 1955 the text is still protected in life-plus-70 countries. | Find her dates (library authority record, a Catholic newspaper's death notice): if 1955 or earlier, change `verdict` in the recipe to `PD` and set `translator_died`; the importer then writes the text (the recipe is done and tested: 33 chapters, 23,446 words). Otherwise another translation. |
| **Dark Night of the Soul** | The translation is not the issue: David Lewis (1864) died in 1895 and Zimmerman (1908) in 1937. There is **no clean digital text**: Gutenberg and Wikisource have none, CCEL has only Peers (1935, fails rule (a): published after 1930), and the scans on the Internet Archive are OCR text with character errors. Measured on the 1908 scan after removing page heads, page numbers and the footnote lines: about 1,000 of its 43,000 words are not in the vocabulary of the six clean books, and in the part of the list I read about one in six of the words that occur only once is a real error (first letters lost to drop capitals, "j" and "t" marks stuck to words, footnote text that leaks into the body, words cut at a page end). The 1916 scan reads "hke" for "like" throughout. | (1) have the 1908 or 1916 scan proofread or re-keyed, then add a recipe (the structure is simple: stanzas, Book I with 14 chapters, Book II with 25); (2) Peers's translation: he died in 1952, so it is public domain in life-plus-70 countries since 2023; in the US it is protected until 2030 unless the copyright was not renewed (CCEL describes its 1959 Image Books source as "uncopyrighted", I could not verify the renewal): a decision for the owner and a lawyer, outside the rule above. |
| **The Interior Castle** | Stanbrook (CCEL `castle2`, third edition 1921): the translators are the nuns of Stanbrook Abbey, not named, and the translation dates from 1906 to 1912: anonymous but not older than 1900, so **unclear**. Dalton (1852, John Dalton 1814 to 1874) is public domain everywhere but has no clean digital text (the scan's OCR is readable but with the usual errors). | (1) have Dalton's scan proofread and add a recipe; (2) find who translated the Stanbrook version and when they died; (3) accept the Stanbrook text as a decision of the owner (UK and EU law treat an anonymous work as expired 70 years after publication, which is long past, but the rule above does not allow it). |
| **The Little Flowers of Saint Francis** | The translations are old and public domain (Arnold 1908, Arnold died 1930; Okey 1910, Okey died 1935; Heywood 1906) but no clean digital text exists: not on Gutenberg, the CCEL text (by its page title in a search result) is Hudleston's revision for the Heritage Press, sacred-texts.com (Heywood) answers only a bot check, and the Internet Archive scans are OCR text. | have one scan (Arnold or Okey) proofread and add a recipe. |

## Decisions that differ from, or add to, the brief

- `manifest.json` has `books` and `leftOut`, with a `basis` line per book (the rule applied) and `counts` (what was dropped or changed).
- The Devout Life has no named translator; its manifest entry has `translator: null` and the book file has no `translator` key. The credit line
  says "the translator not named".
- The Spiritual Exercises' text has no paragraph numbers because CCEL's file has none.
- A numbered paragraph stays `p`; `li` is used for the points of a run-on paragraph. (The brief's guard "every chapter has a paragraph" would
  fail for a chapter that is only points.)
