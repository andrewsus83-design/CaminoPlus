---
name: book-publisher
description: Publish a finished CaminoPlus book: build its EPUB, reading PDF, cover and store metadata, and put it into the app's Library bundle. Use after the book-writer skill has produced a book that passes the checker, whenever someone asks to build, package, release or publish a CaminoPlus book, to prepare a store upload (Amazon KDP and similar), or to refresh the Library bundle in the app. It never uploads to a store itself.
---

# Book publisher

Takes books from `books/<id>/` (written with the `book-writer` skill) to everything that is published. One build, three
outputs from the same chapter blocks, so the app, the EPUB and the PDF cannot disagree.

| Output | Where | Committed? |
|---|---|---|
| EPUB 3 (fonts embedded, accessibility metadata, series position) | `books/dist/<id>/<id>.epub` | no (build product) |
| Reading PDF, 6 x 9 in, page numbers | `books/dist/<id>/<id>.pdf` | no |
| Store cover, 1600 x 2560 PNG | `books/dist/<id>/<id>.cover.png` | no |
| Store metadata: titles, descriptions, keywords, categories, rights, AI disclosure | `books/dist/<id>/store.json` | no |
| **App Library bundle**: `catalog.json` and `books/<id>.json` | `mobile/assets/library/` | **yes**: the app imports it |

## Steps

1. **Check first.** Nothing is built from a book that fails its checks.

   ```bash
   python3 tools/check_books.py --sources /tmp/book-sources     # all books; the folder holds the source texts of the reflection books
   ```

   If a reflection book's source files are not on disk, fetch them as shown in
   `.claude/skills/book-writer/reference/reflection.md`. Errors stop the release. Read every warning and either fix it or note
   in the release report why it stays.

2. **Build.**

   ```bash
   python3 tools/build_books.py                          # every book
   python3 tools/build_books.py --only camino-ingles-guide
   python3 tools/build_books.py --no-render              # no browser: refreshes the app bundle and the EPUBs without covers
   ```

   The cover and the PDF are rendered by headless Chromium (`tools/render_books.mjs`, Playwright from `tools/offline-maps` or
   installed globally). Fonts come from `web/assets/fonts` (Fraunces, SIL OFL), so nothing is fetched at build time.
   The build is deterministic: the same books give the same bytes.

3. **Look at what you built.** A passing build is not a good book.
   - Open the cover PNG and one or two PDF pages (`pdftoppm -r 50 -png file.pdf pg`) and look: title fits, nothing clipped,
     chapters start on a new page, quotes are set apart.
   - `pandoc -f epub -t plain books/dist/<id>/<id>.epub | head -80` reads the EPUB back the way a reader would.
   - Compare the word count and reading time in the build line with the book's promise (guide at most 12,000 words;
     reflection book at most 3 hours).

4. **Validate the EPUB with EPUBCheck before any store upload.** Stores reject EPUBs that fail it, and the tests here only
   check structure, not the full EPUB 3 specification. EPUBCheck is the official W3C validator (Java):
   `java -jar epubcheck.jar books/dist/<id>/<id>.epub`, from https://github.com/w3c/epubcheck/releases. Fix every error it
   reports in `tools/build_books.py`, not in the output file.

5. **App bundle.** Commit `mobile/assets/library/` together with the books that produced it. CI runs
   `python3 tools/build_books.py --check` and fails when the committed bundle is not what `books/` makes.

6. **Report.** For each book: title, kind, words, reading time, PDF pages, what the checker warned about, and the open
   decisions below.

## Decisions that belong to the owner (never decide these silently)

- **Rights holder and licence** of the original text (`books/series.json` → `rights`). Public-domain passages stay public domain.
- **AI disclosure** (`ai_disclosure` in `books/series.json`). It must stay truthful. Do not write "edited by" or "reviewed by"
  unless that has happened. If a person edits a book, they decide how to word it.
- **Who reviews the facts** of a guide before it is sold. The fact ledger (`facts.md`) is the review list.
- **ISBN and price.** `store.json` leaves both `null`. Do not invent either.
- **Whether to publish at all**, and where. This skill builds files; it does not upload, list, price or announce anything.
  Ask before any action that puts a book in front of the public.

## Notes for stores (check the store's current rules when you publish; they change)

- **Amazon KDP, ebook**: EPUB is accepted. The cover must be JPEG or TIFF, so convert the PNG for upload
  (`python3 -c "from PIL import Image; Image.open('x.cover.png').convert('RGB').save('x.cover.jpg', quality=92)"`).
  Title, subtitle, description and the seven keywords come from `store.json`; `description_long_html` is ready to paste.
- **AI-generated content**: KDP asks, for every title, whether text, images or translations were generated with AI, and
  expects "yes" when the text was AI-generated. These books were written with AI assistance: answer truthfully, using the
  wording in `ai_disclosure`.
- **Public-domain material**: stores can refuse titles that are mostly a public-domain text with little added. Reflection books
  stay original: the quoted passages are a minority of every book (the checker warns when they pass 30 percent of the words).
  Never present a reflection book as the classic itself, and credit the translation (the book's "About this edition" page does).
- **Print (KDP paperback)**: the reading PDF is a 6 x 9 in interior without bleed and without a cover. A print edition needs a
  cover file sized to the page count and an ISBN (KDP can assign one). That is a separate task; do not improvise it.
- **Accessibility**: EPUBs carry accessibility metadata (text only, table of contents, structural navigation). Keep it true:
  if a book ever gets images, add alt text and update the metadata in `tools/build_books.py`.

## What lives where

- `tools/book_kit.py`: the Markdown subset parser and the word and reading-time rules (220 words a minute).
- `tools/check_books.py`: the quality gate. `tools/build_books.py`: the build. `tools/render_books.mjs`: the browser step.
- `tools/tests/test_books.py`: the tests (`python3 -m unittest discover -s tools/tests -v`).
- `books/series.json`: shared publisher facts. `books/series.md`: the plan for the 12 books. `books/sources/SOURCES.md`: where the
  classics come from.
