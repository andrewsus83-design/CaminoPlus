# The CaminoPlus Library: 12 books

Twelve books for the app's **Library** (Books tab) and for sale as EPUB and PDF: **eight route guidebooks** and **four reflection books**.
Written with the [`book-writer`](../.claude/skills/book-writer/SKILL.md) skill, built and packaged with the
[`book-publisher`](../.claude/skills/book-publisher/SKILL.md) skill. Where the source texts come from: [`sources/SOURCES.md`](sources/SOURCES.md).

## The guidebooks (up to 12,000 words each)

Each guide covers one route of the app's catalog, so a book can be linked to its route (`route_slug`). They follow
[`guidebook.md`](../.claude/skills/book-writer/reference/guidebook.md): practical, honest and warm; no prices, phone numbers or business names;
every distance marked `~`; every fact in the book's fact ledger (`facts.md`).

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

Why these eight: they are the best known and most walked of the 15 routes in the catalog, they run from the Atlantic coast to the mountains,
and four of them (Francés, Portugués, Inglés and the last 90 km to the sea) have the most people looking for a guide. Seven routes are left
for a second series (Aragonés, Salvador, Sanabrés, Madrid, Baztanes, Lisbon and a "last 100 km" book).

## The reflection books (about 2 to 3 hours of reading each)

Each follows [`reflection.md`](../.claude/skills/book-writer/reference/reflection.md): **30 readings** of ~5 minutes. A reading is a verbatim passage from a
public-domain classic (checked by `tools/check_books.py` against the source text), an original reflection from the road, a prompt for
the walk and a short prayer.

| # | Book id | Title | The classic | Translation (public domain) |
|---|---|---|---|---|
| 9 | `imitation-of-christ-readings` | The Quiet Road | *The Imitation of Christ*, Thomas à Kempis (about 1420) | William Benham, 1886 |
| 10 | `presence-of-god-readings` | Present at Every Step | *The Practice of the Presence of God*, Brother Lawrence (17th century) | Fleming H. Revell edition, from the French |
| 11 | `songs-of-ascents-readings` | Songs for the Climb | The Psalms of Ascent, Psalms 120 to 134: the pilgrim psalms | World English Bible |
| 12 | `confessions-readings` | The Restless Heart | *The Confessions*, Augustine of Hippo (about 400) | E. B. Pusey, 1838 |

Why these four: the first two are the quiet classics a walker can carry in a pocket; the third is scripture and the actual songs of
people walking up to a holy city, the oldest pilgrim text there is; the fourth is the book that says "our heart is restless until it
rests in you", the best known description of a spiritual journey. All four texts are free to publish and are fetched from verified editions.

## On the length: a recommendation

You asked for books of up to about 3 hours of reading with reflections. That is possible, and this is the plan:

- **3 hours is about 39,600 words** (220 words a minute). The checker treats 39,000 words as a hard ceiling.
- **Aim at 2 to 2 h 45 min: 26,000 to 36,000 words.** A walker reads in small pieces: a rest by the road, a bench, an albergue evening.
  Thirty readings of about 5 minutes make that length without ever asking for a long sitting. The same readings work one a day for a month.
- **Reflection is most of each reading.** About 70 percent of every reading is original reflection; the quoted passage is 40 to 250 words.
  The checker warns if the classic passes 30 percent of a book, because a store can refuse a title that is mostly a reprint, and
  because the books are meant to be companions, not copies.
- **Brother Lawrence is the shortest classic** (about 14,000 words in all), so its readings use short passages and the reflections carry the weight.
- **Possible later titles**, all with public-domain sources to check first: *The Pilgrim's Progress* (Bunyan), Teresa of Ávila and John of the Cross
  (Spanish saints, but check the translation: the best-known ones are still in copyright), *Introduction to the Devout Life* (Francis de Sales),
  the Rule of St Benedict on welcoming guests (a fine companion to the albergue), Julian of Norwich. *The Way of a Pilgrim* is a natural fit for
  walkers, but its common English translation may still be protected: do not use it until its licence is confirmed.

## What is decided and what is yours to decide

Decided here (and easy to change): the choice and order of the 12 books, the length targets, British spelling, the covers (navy for guides, parchment
for reflection books), the format of a reading.

Yours to decide (the build leaves these open on purpose, see the publisher skill): who holds the rights to the original text and how it is licensed;
the wording of the AI disclosure (it says today only that the books were written with AI assistance under CaminoPlus's direction); who checks the facts of
each guide before it is sold; ISBNs and prices; and whether and where to publish. Putting a book in the app's Library is a product decision too:
the Books tab says today that "Books are not in the app yet", and that notice has to change when the first book goes in.

## Status

See the list below; the checker prints the real numbers for each book (`python3 tools/check_books.py`).

| Book | Written | Checked | In the Library bundle |
|---|---|---|---|
| 1 to 12 | not yet | not yet | not yet |
