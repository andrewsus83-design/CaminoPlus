# Books: the text of the twelve free books of the Library

The Books tab of the app lists twelve classics (`mobile/src/features/library/books/catalog.ts`). This folder turns public domain editions into
the text the reader shows offline: `mobile/assets/books/<id>.json`, an `index.json`, a `manifest.json` and the generated
`mobile/src/features/library/books/books.generated.ts`. Standard library only (Python 3).

```bash
python3 tools/books/import_books.py                    # download, check the sha256, clean, write the assets of every book that may go in
python3 tools/books/import_books.py --book confessions # rebuild one book; the others keep their entries
python3 tools/books/import_books.py --raw-dir DIR      # keep the downloads in DIR (a cache and a record); --offline never downloads
python3 tools/books/import_books.py --check            # write nothing; exit 1 if an asset is not what the recipes make (CI-style)
python3 tools/books/import_books.py --list             # the twelve books, their verdicts and editions
python3 -m unittest discover -s tools/tests -v         # the tests (no network)
```

_This file is a checkpoint: the sections below are completed as the remaining books are checked._

## What may go into the app

Only a text that is public domain **everywhere the app is used**: the translation was first published in 1930 or earlier (public domain in
the US in 2026) and the translator, and the author of anything else that is kept, died in 1955 or earlier (public domain where the term is
life plus 70 years in 2026), or the translator is anonymous and the edition is older than 1900. Every recipe in `books_recipes.py` states its
verdict; the importer writes a text only when it is `public domain everywhere`. Texts with another verdict (`US only`, `unclear`) are listed in
`manifest.json` under `leftOut` with the reason, and have no file.

Spain keeps a longer term for authors who died before 7 December 1987 (life plus 80 years): a translator who died between 1946 and 1955 would
pass the rule above and still be protected in Spain until 2026 to 2035. No text that is in the app is in that range; the table below gives every
death year, so the owner can see it.

## The recipes

| Book | Edition | Translator (died) | First published | Source | Verdict | Chapters | Words |
|---|---|---|---|---|---|---|---|
| The Life of St. Teresa of Jesus | Lewis, third edition (Thomas Baker, 1904) | David Lewis (1895) | 1870 | [Gutenberg 8120](https://www.gutenberg.org/ebooks/8120) | public domain everywhere | 41 (Prologue and I to XL) | 138,690 |
| The Imitation of Christ | Benham (Macmillan, 1874) | William Benham (1910) | 1874 | [Gutenberg 1653](https://www.gutenberg.org/ebooks/1653) | public domain everywhere | 114 | 59,423 |
| Confessions | Pusey (Parker, Oxford, 1838) | E. B. Pusey (1882) | 1838 | [Gutenberg 3296](https://www.gutenberg.org/ebooks/3296) | public domain everywhere | 13 | 111,775 |
