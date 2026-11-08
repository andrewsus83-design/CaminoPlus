# The CaminoPlus Library: 20 books

Twenty books written for the app's **Library** and for sale as EPUB and PDF (neither is done yet: see "In the app" below): **eight route guidebooks** and **twelve reflection books**, each reflection book
made from a famous book in the public domain and paired with one Camino. Written with the [`book-writer`](../.claude/skills/book-writer/SKILL.md) skill, built and
packaged with the [`book-publisher`](../.claude/skills/book-publisher/SKILL.md) skill. Where the classics come from: [`sources/SOURCES.md`](sources/SOURCES.md).

The same plan exists in machine-readable form in [`plan.json`](plan.json): `python3 tools/check_series.py` fails when a planned book is missing, an unplanned book appears, or a book disagrees with the plan.
Six catalog routes (Aragonés, Salvador, Sanabrés, Madrid, Baztanes, Lisbon) have no guide yet; the plan lists them on purpose, and a second batch is writing them.

## The guidebooks (up to 12,000 words each)

Each guide covers one route of the app's catalog (14 routes), so a book can be linked to its route (`route_slug`). They follow
[`guidebook.md`](../.claude/skills/book-writer/reference/guidebook.md): practical, honest and warm; no prices, phone numbers or business names; every distance marked `~`;
every fact in the book's fact ledger (`facts.md`).

| # | Book id | Title | Route (catalog `route_slug`) | Data in the repo |
|---|---|---|---|---|
| 1 | `camino-frances-guide` | The French Way | Camino Francés, Saint-Jean-Pied-de-Port to Santiago, ~773 km (`camino-frances`) | 33 stages |
| 2 | `camino-portugues-guide` | The Portuguese Way | Camino Portugués Central, Porto to Santiago, ~240 km (`camino-portugues`) | 11 stages |
| 3 | `camino-portugues-costero-guide` | The Coastal Way | Camino Portugués Costero, Porto to Santiago by the sea, ~260 km (`camino-portugues-costero`) | route row only |
| 4 | `camino-del-norte-guide` | The Northern Way | Camino del Norte, Irun to Santiago, ~820 km (`camino-del-norte`) | route row only |
| 5 | `camino-primitivo-guide` | The Original Way | Camino Primitivo, Oviedo to Santiago, ~320 km (`camino-primitivo`) | route row only |
| 6 | `camino-ingles-guide` | The English Way | Camino Inglés, Ferrol to Santiago, ~120 km (`camino-ingles`) | 6 stages, **no cited distances** |
| 7 | `camino-finisterre-muxia-guide` | To the End of the Earth | Santiago to Finisterre and Muxía, ~90 km (`camino-finisterre-muxia`) | route row only |
| 8 | `camino-de-invierno-guide` | The Winter Way | Camino de Invierno, Ponferrada to Santiago, ~260 km (`camino-de-invierno`) | route row only |

Why these eight: they are the best known and most walked of the 14 routes, from the Atlantic coast to the mountains. Six routes have no guide yet
(Aragonés, Salvador, Sanabrés, Madrid, Baztanes, Lisbon): a second series.

## The reflection books: twelve famous books, each for a Camino

Each follows [`reflection.md`](../.claude/skills/book-writer/reference/reflection.md). A book has as many **days** as suits the classic and its Camino (3 to 21), and each day is
a **morning reading of about 5 minutes** (a verbatim passage from the classic, an original reflection, a question for the walk) and an **end-of-day reflection of about
3 minutes** (a look back over the day, its questions, a short prayer). The passages are checked by `tools/check_books.py` against the source text. A pairing is a
recommendation (`route_slug` in `book.json`, one line to change), chosen for the length and character of the road.

| # | Book id | Title | The famous book | Days | For the Camino | Why this pairing |
|---|---|---|---|---|---|---|
| 9 | `imitation-of-christ-readings` | The Quiet Road | *The Imitation of Christ*, Thomas à Kempis | 21 | Francés (`camino-frances`) | The great road and the great devotional classic; three weeks |
| 10 | `confessions-readings` | The Restless Heart | *The Confessions*, Augustine of Hippo | 13 | Primitivo (`camino-primitivo`) | The hard mountain road; one day for each of the 13 books |
| 11 | `pilgrims-progress-readings` | The Slough and the City | *The Pilgrim's Progress*, John Bunyan | 12 | Portugués Central (`camino-portugues`) | A road from Porto to Santiago, and the story of a pilgrim |
| 12 | `purgatory-readings` | The Mountain of the Heart | *Purgatory* (*The Divine Comedy*), Dante, tr. Longfellow | 14 | Norte (`camino-del-norte`) | A long road of sea and hills; a climb in terraces |
| 13 | `presence-of-god-readings` | Present at Every Step | *The Practice of the Presence of God*, Brother Lawrence | 6 | Inglés (`camino-ingles`) | A short, simple book for a short road of six stages |
| 14 | `songs-of-ascents-readings` | Songs for the Climb | The Psalms of Ascent (Psalms 120 to 134) | 8 | Aragonés (`camino-aragones`) | The pilgrim psalms for the road that climbs over the Pyrenees: 15 psalms in 8 days |
| 15 | `revelations-readings` | All Shall Be Well | *Revelations of Divine Love*, Julian of Norwich | 8 | Invierno (`camino-de-invierno`) | Quiet and consoling, for the quiet winter road |
| 16 | `teresa-life-readings` | The Road to Ávila | *The Life of St. Teresa of Jesus*, Teresa of Ávila | 10 | Madrid (`camino-de-madrid`) | Spain's own saint, for the road across Spain's heartland |
| 17 | `ignatius-pilgrim-readings` | The Pilgrim's Tale | *The Autobiography of St. Ignatius*, Ignatius of Loyola | 7 | Baztanes (`camino-baztanes`) | A conversion that began wounded at Pamplona, where this road ends |
| 18 | `walking-readings` | Toward the Sunset | *Walking*, Henry David Thoreau | 5 | Finisterre and Muxía (`camino-finisterre-muxia`) | An essay about walking west, for the road to the end of the earth. Not a Christian book: it speaks in its own voice |
| 19 | `francis-readings` | The Poor Man of the Road | *St. Francis of Assisi*, G. K. Chesterton | 9 | Portugués Costero (`camino-portugues-costero`) | Creation, joy and poverty, for the road beside the sea |
| 20 | `pascal-readings` | The Silence of the Heart | *The Thoughts of Blaise Pascal* | 10 | Sanabrés (`camino-sanabres`) | A quiet inland road, and the book of a restless mind in silence |

All twelve are free to publish: every edition was opened and its translator, editor and licence read before it was chosen
([`sources/SOURCES.md`](sources/SOURCES.md)). Two routes (Salvador, about three days, and Lisbon) have no reflection companion yet.

**On the size.** At 220 words a minute a day of 5 + 3 minutes is about 1,700 words, so a 21-day book is about 2 h 45 min and never passes the 3-hour ceiling; a
5-day book is about 40 minutes. The quoted passage is a minority of every book (the checker warns above 30 percent): the books are companions, not reprints.

**Possible later titles**, all to be checked first: the Rule of St Benedict on welcoming guests (a fine companion to the albergue), Teresa's *Interior Castle* and John of the Cross
(not found in a clean public-domain edition yet), *The Cloud of Unknowing*, *The Little Flowers of St Francis*, Marcus Aurelius's *Meditations*, *Introduction to the Devout Life*.
*The Way of a Pilgrim* is a natural fit for walkers, but its common English translation may still be protected.

## In the app: not yet

**The books are not in the app.** They are written, checked and ready: `python3 tools/build_books.py` turns them into the data an app can read (a catalog and one file per book, in blocks), but that bundle is **not
in the repository**, and the app's Library does not read it.

Why. While these books were being written, the owner rebuilt the Library on `main` (Bible, Books and Notes tabs; a Books tab of twelve free classics with a licence check for each; a Notes tab that shows the diary as a
feed) and other branches (`claude/books-text`, `claude/books-reader`, `claude/bible-reader`, `claude/bible-text`) were building the text importer and a reader. A reader with side notes, bookmarks on a paragraph and a
Notebook was built here as well, in the history of the branch `claude/funny-mendel-uphqz3` (the last commit that has it is `c7a3844`; it passed 724 app checks, the typecheck and the Android export on the Library as it was
then), and it was **not merged**: it would have conflicted in 14 files with the new Library and duplicated the reader of the other branch. How these books (and anchored side notes, which are not the same thing as the
Notes tab) join the owner's Library is a decision for the owner. The design is in `.claude/skills/book-publisher/SKILL.md` ("In the app") and the data format in `tools/book_kit.py` and `tools/build_books.py`.

## What is decided and what is yours to decide

Decided here (and easy to change): the choice and order of the 20 books, the days and the Camino of each reflection book, the length targets, British spelling, the covers (navy for
guides, parchment for reflection books), the format of a day.

Yours to decide (the build leaves these open on purpose): who holds the rights to the original text and how it is licensed; the wording of the AI disclosure (it says today only that the books
were written with AI assistance under CaminoPlus's direction); who checks the facts of each guide before it is sold; ISBNs and prices; and whether and where to publish. Putting the books in the
app's Library is a product decision too (see "In the app: not yet").

## Status (8 November 2026)

| | Written | Strict checker | EPUB, PDF, cover, store data | In the app |
|---|---|---|---|---|
| 8 route guidebooks | yes | passes, no warnings | built, structure checked | not yet |
| 12 reflection books | yes | passes, no warnings (every passage verified word for word) | built, structure checked | not yet |

The checker prints the real numbers for each book (`python3 tools/check_books.py --strict --sources <folder>`). Together the books are about 311,000 words; the longest reflection book reads in about 2 h 29 min
(the ceiling is 3 hours) and the longest guide has 11,648 words (the cap is 12,000).

**What "passes" does and does not mean.** The checker verifies structure, length, the rules of the skills, and that every quoted passage is in its public-domain source. It cannot verify a fact. The facts of each guide are
in its `facts.md` ledger with a named source, but **no person has reviewed them yet**, and the writers list in their reports the claims that rest on a single or a secondary source. The EPUBs have been checked for structure
(zip, XML, manifest) but **not with the official EPUBCheck validator**. Nothing has been uploaded, priced or published.
