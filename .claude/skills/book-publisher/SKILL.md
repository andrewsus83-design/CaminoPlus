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
| **App Library bundle**: `catalog.json` and `books/<id>.json` | `mobile/assets/library/` | **not yet**: the bundle format is ready, but the app's Library does not read it and the bundle is not in the repository (see `books/series.md`, "In the app: not yet") |

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

5. **App bundle.** Not part of the repository yet. When the app takes the books, the bundle is committed with the books that produced it and `python3 tools/build_books.py --check` becomes a CI step again; until then it is only built, never committed.

6. **Report.** For each book: title, kind, words, reading time, PDF pages, what the checker warned about, and the open
   decisions below.

## In the app: bookmarks, side notes and reflections

The bundle is built so an app can attach a pilgrim's own writing to the books. This is a **design, not a shipped feature**: it was built once on a branch and not merged (see `books/series.md`, "In the app: not yet"), and it has to be reconciled with the Notes tab the owner built (a feed of the diary). The design:

- **Side notes, not a feed.** A note is **anchored** to the thing it is about and shown beside it, like a note in the margin: a small mark next to the paragraph, a side sheet to read and
  write it. There is no timeline, no likes, no comments, no followers. Notes are **private and on the phone** (kept under the pilgrim's own key and cleared on log-out, like the Library's bookmarks; the Diary, by contrast, keeps its pages when you log out; the screens say which) unless the
  pilgrim presses an explicit Share, which is never automatic. Notes are listed in one quiet **Notebook**, organised by anchor (Books, Bible, Daily reading, Camino stages) and searchable.
- **Anchors** (one scheme for everything, so the same notes can sit on books today and on the Bible, the daily reading and the Camino's stages and places later):
  `book:<bookId>/<chapterId>#<blockIndex>` (a paragraph; `chapterId` is the chapter's file name without `.md`, `blockIndex` the index of the block in the chapter's `blocks`),
  `book:<bookId>/<chapterId>` (a whole chapter or day), `book:<bookId>` (a book); later `bible:<translation>/<book>/<chapter>:<verse>`, `daily:<date>`, `stage:<routeSlug>/<n>`, `place:<id>`.
  A note stores the anchor, the **quoted text** it was made on (so it can be found again if a book is revised: chapter ids and the text are stable, block indexes are not guaranteed to be), its own
  text, and the **context** added automatically: date and, when known, the Camino and the stage the pilgrim is on. That context is how a note on a reading joins the Camino experience.
- **Bookmarks** are markers on the same anchors (a book, a chapter or day, a paragraph) and "continue reading" remembers the last place in each book.
- **Reflections**: each day of a reflection book ends with its questions as a list (`## At the end of the day`, a `-` list; the checker requires it). The app shows those questions as the prompt,
  and the pilgrim's answer is a note of type *reflection* on that day. A side note can be grown into a Diary page.
- **Never** in the bundle: a pilgrim's notes. The bundle is the book; notes are the pilgrim's, and live only on the phone (any later backup through the paid plan's cloud storage is a separate,
  explicit decision, and must be part of the data export and the account deletion).

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
  The categories in `store.json` are the writer's suggestions: confirm each against the store's own category list before you choose.
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
- `books/series.json`: shared publisher facts. `books/series.md`: the plan for the 20 books. `books/sources/SOURCES.md`: where the
  classics come from.
