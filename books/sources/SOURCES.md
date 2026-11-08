# Source texts of the reflection books

Every passage quoted in a reflection book is copied word for word from one of the editions below, and `tools/check_books.py` verifies it. The texts are public
domain; the files are **not** kept in this repository (they are large). Fetch them into a folder outside the repository:

```bash
mkdir -p /tmp/book-sources && cd /tmp/book-sources
for n in 1653 3296 131 1002 13871 8294 52958 8120 24534 1022 63084 46921; do curl -sS -o pg$n.txt "https://www.gutenberg.org/cache/epub/$n/pg$n.txt"; done
python3 /path/to/repo/tools/check_books.py --sources /tmp/book-sources
```

## Used

Checked on 8 November 2026: the header and the beginning of each file were read (title, author, translator, editor, copyright notices). Where a year is
marked "known", the file does not state it and it is the well-documented first publication.

| Source `id` | Famous book | Edition, translator or editor | Why it is free |
|---|---|---|---|
| `gutenberg-1653` | *The Imitation of Christ*, Thomas à Kempis | Translated by Rev. William Benham, 1886 | Translator and author long out of copyright |
| `gutenberg-3296` | *The Confessions of St. Augustine* | Translated by E. B. Pusey, 1838 | Translator died in 1882 |
| `gutenberg-131` | *The Pilgrim's Progress*, John Bunyan | The original English text (1678, known); no translator, no modern editor named in the file | Seventeenth-century text |
| `gutenberg-1002` | *Divine Comedy*, Dante: *Purgatory* (the file also exists whole as 1004) | Translated by Henry Wadsworth Longfellow (1867, known) | Translator died in 1882 |
| `gutenberg-13871` | *The Practice of the Presence of God the Best Rule of a Holy Life*, Brother Lawrence | Fleming H. Revell Company edition, "translated from the French" (an old print edition) | Old print edition, no U.S. copyright |
| `gutenberg-8294` | *The World English Bible (WEB)*, Psalms 120 to 134 (the Songs of Ascents) | World English Bible | Dedicated to the public domain worldwide; no Crown patent |
| `gutenberg-52958` | *Revelations of Divine Love*, Julian of Norwich | Edited by Grace Warrack, 1901 (the edition's date is in the file) | Edition of 1901; the editor died in 1944 |
| `gutenberg-8120` | *The Life of St. Teresa of Jesus*, Teresa of Ávila | Translated by David Lewis (1814 to 1895); the edition of 1904 (the date of its imprimatur is in the file) | Translator died in 1895; the 1904 edition's own introduction is not quoted |
| `gutenberg-24534` | *The Autobiography of St. Ignatius*, Ignatius of Loyola | Edited by J. F. X. O'Conor, S.J., "Copyright 1900, by Benziger Brothers" (in the file) | Published in 1900 |
| `gutenberg-1022` | *Walking*, Henry David Thoreau | The essay (1862, known); no translator, no modern editor named in the file | Nineteenth-century text |
| `gutenberg-63084` | *St. Francis of Assisi*, G. K. Chesterton | The book (1923, known); no modern editor named in the file | Published in 1923; the author died in 1936 |
| `gutenberg-46921` | *The Thoughts of Blaise Pascal* | Translated by C. Kegan Paul, 1885 (the title page says MDCCCLXXXV); the file names Molinier's French edition of 1877 to 1879 as the one translated | Nineteenth-century translation |

The Gutenberg files are used only to **read and verify**. Nothing of the Project Gutenberg header, licence text or trademark is copied into a book. Some of these old editions have an
introduction or notes by their editor (Teresa, Ignatius, Pascal, Julian): only the classic itself is quoted, never the introduction.

## Looked at and not used

| Source | Why not |
|---|---|
| Gutenberg 5657, *The Practice of the Presence of God* | The "2002 Edition edited by Lightheart", marked **"Copyright (C) 2002 by Lightheart"**: a modern edit. The old Revell edition (13871) is used instead. |
| Gutenberg 18269, *Pascal's Pensées* | The file includes an introduction by **T. S. Eliot**, who is still in copyright. The Kegan Paul edition (46921) is used instead. |
| King James Version for the Psalms | Public domain in the United States, but in the United Kingdom it is under a perpetual Crown patent. The WEB is used. |
| *The Way of a Pilgrim* (common English translation by R. M. French, 1930) | Its copyright status was not confirmed. |
| Gutenberg 50040, *St. Benedict's Rule for Monasteries* | A mid-twentieth-century translation (Doyle); its status outside the United States was not confirmed. |
| Gutenberg 21152, Bernard of Clairvaux, *On Loving God* | The plain-text file is not usable (it holds only a stub). |
| Teresa's *Interior Castle*, John of the Cross, *Introduction to the Devout Life* in English, *The Little Flowers of St Francis*, *The Cloud of Unknowing* | Not found in a clean edition on Gutenberg when searched; the best-known modern translations are still protected. |

## Adding a source

1. Read the header of the edition: who translated it, when, who edited it, whether it holds an introduction by a modern author. A modern copyright over any part of a text is a reason to say no.
2. Write the finding in this table with the date, **before** a passage from it goes into a book.
3. Add its id to the fetch command above and to `.claude/skills/book-writer/reference/reflection.md` if its handling differs.
