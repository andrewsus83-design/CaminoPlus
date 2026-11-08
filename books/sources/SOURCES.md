# Source texts of the reflection books

Every passage quoted in a reflection book is copied word for word from one of the editions below, and `tools/check_books.py` verifies it. The
texts are public domain; the files are **not** kept in this repository (they are large). Fetch them into a folder outside the repository:

```bash
mkdir -p /tmp/book-sources && cd /tmp/book-sources
for n in 1653 13871 3296 8294; do curl -sS -o pg$n.txt "https://www.gutenberg.org/cache/epub/$n/pg$n.txt"; done
python3 /path/to/repo/tools/check_books.py --sources /tmp/book-sources
```

## Used

| Source `id` | Work | Edition and translator | Why it is free | Checked |
|---|---|---|---|---|
| `gutenberg-1653` | *The Imitation of Christ*, Thomas à Kempis | Translated by Rev. William Benham, 1886 | Translator and author long out of copyright | 8 November 2026: header, translator and text read |
| `gutenberg-13871` | *The Practice of the Presence of God the Best Rule of a Holy Life*, Brother Lawrence | Fleming H. Revell Company edition, "translated from the French" (old edition) | Old print edition, no U.S. copyright | 8 November 2026: header and publisher read |
| `gutenberg-3296` | *The Confessions of St. Augustine* | Translated by E. B. Pusey (Edward Bouverie Pusey), 1838 | Translator died in 1882 | 8 November 2026: header and translator read |
| `gutenberg-8294` | *The World English Bible (WEB)*, Psalms 120 to 134 | World English Bible | Dedicated to the public domain worldwide; no Crown patent | 8 November 2026: header read, Psalms 120 to 134 located |

The Gutenberg files are used only to **read and verify**. Nothing of the Project Gutenberg header, licence text or trademark is copied into a book.

## Looked at and not used

| Source | Why not |
|---|---|
| Gutenberg 5657, *The Practice of the Presence of God* | It is the "2002 Edition edited by Lightheart", marked **"Copyright (C) 2002 by Lightheart"**: a modern edit that is not free to republish. The old Revell edition (13871) is used instead. |
| King James Version for the Psalms | Public domain in the United States, but in the United Kingdom the KJV is under a perpetual Crown patent. A book for sale in several countries uses the WEB. |
| *The Way of a Pilgrim* (common English translation by R. M. French, 1930) | Its copyright status was not confirmed. Not used until it is. |
| Modern translations of Teresa of Ávila and John of the Cross (Peers and others) | Still protected. Older translations exist but have not been checked. |

## Adding a source

1. Read the header of the edition: who translated it, when, who edited it. A modern editor's copyright over a text is a reason to say no.
2. Write the finding in this table with the date, **before** a passage from it goes into a book.
3. Add it to the table in `.claude/skills/book-writer/reference/reflection.md` with its fetch address.
