---
name: book-writer
description: Write a book for the CaminoPlus Library, either a route guidebook (up to 12,000 words) or a reflection book built on a famous public-domain book (3 to 21 days, up to 3 hours of reading). Use whenever someone asks to write, draft, extend or revise a CaminoPlus book, a guidebook for a Camino route, or a set of readings from a classic. Covers voice, structure, honesty rules (no invented facts, no unlicensed text) and the checks a book must pass before it goes to the book-publisher skill.
---

# Book writer

You write books that pilgrims read on a phone, often offline, at the end of a walking day. The books live in the app's Library
(Books tab) and are also published as EPUB and PDF. Two kinds exist:

| Kind | Length | What it is | Spec |
|---|---|---|---|
| `guide` | 9,000 to 12,000 words (hard maximum 12,000) | A practical and human guidebook to one Camino route | [`reference/guidebook.md`](reference/guidebook.md) |
| `reflection` | 3 to 21 days, each a 5-minute morning reading and a 3-minute end-of-day reflection; never more than 3 hours (39,000 words) | A famous public-domain book walked in short days, for a Camino of fitting length: a verbatim passage, an original reflection, a prompt for the walk, an evening reflection with its questions, a short prayer | [`reference/reflection.md`](reference/reflection.md) |

Read the spec of the kind you are writing **before** you write a word. Read [`reference/voice-and-honesty.md`](reference/voice-and-honesty.md)
for both kinds: it holds the rules that matter most here.

## The two rules that outrank everything else

1. **Never invent a fact.** A guidebook that is wrong about a bed, a price or a distance sends a tired person the wrong way.
   The repo's own rule is "an invented number is worse than none". If you cannot name where a number, date, name or opening
   time came from, leave it out or mark it approximate (`~`) and send the reader to the app for the live answer.
2. **Never use text we may not publish.** A quotation from a classic must be copied word for word from a public-domain edition
   named in `book.json`, and the translator and the source must be credited. Never quote from memory, never use a modern
   translation or a modern edited edition (a "2002 edition, copyright the editor" is not free). Everything else in the book is
   written fresh, in our own words.

Faithfulness to the reader comes first. Write what is true, give the reader the credit-worthy source, and be plain about what
you do not know. That is also the best service to the person who will walk with this book in their pocket.

## Where things go

```
books/
  series.json               shared publisher facts (publisher, rights, AI disclosure)
  series.md                 the plan: all 20 books, order, days, Camino pairing, sources
  shared-facts.md           facts several guides repeat (the Compostela rule), verified once; state them as this file does
  <book-id>/
    book.json               metadata (schema below)
    chapters/
      00-welcome.md         one file per chapter, in reading order, numbered
      01-....md
```

Markdown subset (the app reader, the EPUB and the PDF all read the same files, so keep to it): one `#` heading per file (the
chapter title), `##` and `###` sections, paragraphs, `-` and `1.` lists, `>` quotes, `*italic*`, `**bold**`, `[text](url)` links,
`---` for a break. **No tables, no images, no raw HTML, no emoji.** Use lists where you would want a table.

## `book.json`

```json
{
  "id": "camino-ingles-guide",
  "kind": "guide",
  "order": 6,
  "title": "The English Way",
  "subtitle": "A Pilgrim's Guide to the Camino Inglés",
  "route_slug": "camino-ingles",
  "description_short": "One sentence, 200 characters at most, what the book gives the reader.",
  "description_long": "Plain text, paragraphs separated by a blank line, 600 to 2,500 characters. For store pages.",
  "keywords": ["seven at most", "each 50 characters or fewer"],
  "categories": ["Travel / Special Interest / Pilgrimages", "Travel / Europe / Spain"],
  "cover": { "colour": "goldSoft", "icon": "library" },
  "version": "1.0.0",
  "date": "2026-11"
}
```

Reflection books add `"days"` (3 to 21, the number of day chapters), `"route_slug"` (the Camino it goes with, from `books/series.md`) and `"sources"`, one entry
per classic, which is what the checker verifies every quote against:

```json
"sources": [{
  "id": "gutenberg-1653",
  "work": "The Imitation of Christ",
  "author": "Thomas à Kempis",
  "translator": "William Benham",
  "year": "the year the file or its title page states, or: date not given in the file",
  "licence": "Public domain",
  "url": "https://www.gutenberg.org/ebooks/1653",
  "text_from": "optional: the first words of the work's own text, when the file starts with a long introduction"
}]
```

`cover.colour` is one of `goldSoft`, `blue100`, `successWash`, `red100`, `sand300`, `goldWash` (the Library's cover colours) and
`cover.icon` one of `library`, `book`, `chat`. Fixed series fields (publisher, rights, AI disclosure) live in `books/series.json`.

## Method

1. **Read the spec and the voice file.** Then read the brand guideline sections 1 and 2 (`brand/BRAND_GUIDELINE.md`).
2. **Gather facts before you write.** For a guide, keep a fact ledger at `books/<id>/facts.md`: one line per hard fact
   (distance, date, name, altitude, history) with where it came from. Use the repo's own data first (see the guide spec), then
   check anything else against a named public source (the Xunta de Galicia, the Confraternity of St James, Wikipedia for history).
   A fact with no line in the ledger does not go in the book. For a reflection book, read the source text itself (the spec says
   how to fetch it), choose your passages from it, and copy each one with `tools/passage.py`, never by hand.
3. **Outline, then write chapter by chapter**, one file each, in the voice. Keep the word budget of the spec in front of you.
4. **Run the checker** after every few chapters and fix what it reports:

   ```bash
   python3 tools/check_books.py books/<id> --sources <folder with the source texts>   # --sources is for reflection books
   ```

5. **Read it as the pilgrim.** Is each page useful, specific and calm? Would a tired person at 6 pm find what they need?
   Cut anything that is filler. A shorter true book beats a longer padded one.
6. **Hand over to the `book-publisher` skill** once the checker is clean. Do not build or publish from here.

## Done means

- The checker passes with no errors (warnings are read and either fixed or explained in a line of your report).
- `book.json` is complete. Every chapter file is numbered and in order.
- A guide has its `facts.md`. A reflection book has every passage verified against its source by the checker, `days` equal to its day chapters, and its end-of-day questions as lists.
- Your report to the person says: the word count and reading time, what you could not verify and left out, and anything they
  must decide (for example a claim you could not source).

## Running a batch of books (the lessons of the first twenty)

Writing many books at once works if the batch itself is controlled. What went wrong or nearly wrong, and the rule that prevents it:

1. **The plan comes first.** Add every book to `books/plan.json` (id, kind, order, route, and for a reflection book its days and source ids) and to `books/series.md` before any writer starts.
   `python3 tools/check_series.py` then fails on a book that is skipped, a folder nobody planned, a mismatch of order, kind, route, days or sources, and a catalog route with no guide.
2. **Half-written books never reach a commit.** While a batch runs, hide each new folder from git with a local line in `.git/info/exclude` (`books/<id>/`, never committed), and remove the line
   when the book passes. Commit by explicit path (`git add books/<id>`), never `git add -A` in the middle of a batch: a snapshot of a half-written book is how a red commit and a partly-finished book reach a branch.
3. **At most six writers at once**, each inside its own folder, none running git, none touching another folder or the tools. Nine to ten ran without a crash, but reports and commits then arrive faster than they can be checked.
4. **The sources list is derived, not typed.** `python3 tools/fetch_book_sources.py DIR` reads every `book.json`, so CI cannot check fewer sources than the books use (a hand-written list of four checked four of twelve).
5. **The gate, in this order:** `check_books.py --strict --sources DIR` on every book, then `check_series.py`, then (once the app takes the books) `build_books.py --check`, then the tests. A book is finished
   when it passes all of them and its writer's report has been read; "the checker passes" does not mean its facts have been reviewed by a person.
6. **Merge by squash, from a branch that holds only what is ready.** Before a merge, `git fetch` and look at what `main` and the other branches are doing: parts of the app may have been rebuilt by someone else in the
   meantime (the Library was), and content that does not touch the app can merge safely while app changes wait for a decision.
7. **Count by running the checker, never from memory.** Twice in this project a count of finished books was wrong because it was remembered.
