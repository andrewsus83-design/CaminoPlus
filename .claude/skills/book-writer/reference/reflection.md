# Reflection book spec (`kind: reflection`)

A reflection book walks the reader through **a famous book in the public domain** in a number of short days, one for a day of walking
(or a day at home). Each day has a **morning reading of about 5 minutes** and an **end-of-day reflection of about 3 minutes**. In the spirit of
the classics themselves, the book is slow, honest and quiet.

**How many days.** As many as suits the book and the Camino it goes with: **3 to 21 days**, declared in `book.json` as `"days"`. A short classic goes with
a short Camino (6 days for a six-day road), a long one with a longer road, never more than three weeks. At about 8 minutes a day,
21 days is about 2 hours 45 minutes, just under the **3-hour ceiling** (39,000 words, at 220 words a minute). The plan, with every book's days and
Camino, is in `books/series.md`; follow it. Why this size: a walker reads in small pieces (a rest by the road, a bench, an albergue evening),
so the length is made of many short sittings.

## Structure of the book

| Chapter | Words | Content |
|---|---|---|
| `00-how-to-use-this-book.md` | 600 to 800 | What this is, how a day works (morning reading, walking with a question, evening reflection), how to use it at home, the arc of the days, and which Camino it is made to go with (see `route_slug`). Never state a stage count of the route unless the repository has it (Francés 33, Portugués 11, Inglés 6): say "a road of about two weeks". |
| `01-about-the-book-and-its-author.md` | 600 to 900 | Who wrote the classic, when and why; what the classic is; why it suits a pilgrim; **the translator, the edition and the licence** (public domain, with the source named); what we changed (nothing in the passages; the order and the selection are ours). |
| `02-day-01-<slug>.md` onwards, one per day | 1,400 to 2,000 each | The days (below). |
| last chapter `NN-carry-it-with-you.md` | 400 to 700 | A closing: what to keep, how to go on, an invitation to the next reading or to walk again. |

File names: `00-how-to-use-this-book.md`, `01-about-the-book-and-its-author.md`, `02-day-01-<slug>.md` ... , then the closing chapter, numbers in order.

## One day

```
# Day 7. A short title that names the heart of the day

*One line: the theme or the question this day carries.*

## The passage

> The passage, word for word from the source (40 to 250 words).
>
> — Thomas à Kempis, *The Imitation of Christ*, Book 1, chapter 7 (tr. William Benham, 1886)

## Reflection

600 to 900 words in your own voice (longer when the passage is short, so that the morning still comes to about 1,000 to 1,100 words). Start from something concrete (a road, a blister, a bell, a bench, an early start, a stranger's
kindness, a long flat afternoon) and let the passage open it. Say what the passage says, plainly. Say where it is hard. Say
what it asks of an ordinary day. One or two sentences of honest doubt are worth more than a page of reassurance.

## For the walk

- One question to carry for the next hour. Short.
- One small practice that needs nothing but attention (a breath, a step count, a silence, a greeting).

## At the end of the day

450 to 580 words, written for the evening (an albergue bed, a bench, a quiet room): look back over the day that was lived with the
passage in mind. Name what was hard and what was good. Say an honest word about tiredness. This is NOT the morning reflection again.

- Two or three gentle questions, as a `-` list. The app shows exactly these as the reflection prompt, so write each as a
  complete question that makes sense without the text around it ("Where today did I rush past someone?").

## A short prayer

Three to six short sentences, in one italic paragraph (the books have no line breaks, so "lines" means short sentences). Original. Plain words, for the
end of the day. Open enough that a reader who prays differently, or who does not pray, can still say it as a wish.
```

The five `##` parts appear **once each, in this order**, under these exact headings, in every day: the app and the EPUB show them the same
way, and the app reads the `At the end of the day` list as the questions. Passage + Reflection + For the walk = the 5-minute morning reading
(850 to 1,350 words). At the end of the day + A short prayer = the 3-minute evening (450 to 800 words). Vary the shape inside the parts, never the headings.

**Aim for the times, not just the windows.** At 220 words a minute the morning reading is about **1,000 to 1,100 words** (5 minutes) and the evening about **550 to 650
words** (3 minutes). The checker's windows are wider (850 to 1,350 and 450 to 800) so a good day is never refused, but a book that sits at the bottom of every window
is short of what was promised. "For the walk" is 60 to 200 words.

## Quoting exactly

- **Never copy a passage by hand.** Use `python3 tools/passage.py <source.txt> --from "first words" --to "last words"` (several pairs make one passage joined by `…`). It
  copies the exact stretch, turns `_italics_` into `*italics*`, and tells you the nearest book and chapter heading, so the citation is read from the source and not from memory.
  It warns about what old editions carry inside the text, and so must you: a footnote marker like `(3)` or `[3]`, a paragraph number like `2.`, and a quotation mark
  that opens in one stretch and closes in the next. End the stretch at the full stop before a marker, start after one, and never leave an opening quotation mark unclosed.
- **Inside the prose, anything in quotation marks or in italics that reads as the classic's words must be exact too.** A near-miss ("if I only knew" for "if I but knew")
  is a misquotation, and the checker warns on text that is almost, but not exactly, in the source. Either copy it exactly (put it in the passage), or say it in your own
  words without quotation marks or italics. The writer's own words in quotation marks ("This is today's weight") are fine: they are not the classic's.
- **The citation is checked by you.** The checker verifies the words, not the book and chapter named in the attribution line; read them off `tools/passage.py`.

## Keeping it fresh

The template invites the same phrases ("say where it is hard", "an honest word about tiredness", "look back over the day"). Vary the wording of the labels from day to day.
A short ritual opening for the evening is allowed, because evenings are a ritual, but it should not open the same sentence in more than a handful of days: the checker
warns when one opening recurs in six or more chapters.

## Choosing the passages

1. Fetch the source text (below) and read the parts you will draw from. Do not choose from memory.
2. Pick **one passage per day in a deliberate order**, an arc that a reader can feel: setting out, the weight we carry, silence,
   weariness, companions, doubt, humility, gratitude, arrival, return (a short book has a short arc: the same shape in fewer steps). The classic's own
   order is not required; your order is the book's shape. Say what the arc is in `00-how-to-use-this-book.md`.
3. Keep every passage whole in sense. Do not cut a sentence in half to fit; cut between sentences and mark it with `…`.
4. Prefer passages a first-time reader can follow. Avoid the passages that need a long explanation unless the day is that explanation.
5. Treat disputed or controversial passages with care: you may leave a hard passage out, and you may say in the reflection
   that a passage is hard. Do not argue against the author in the reader's ear and do not dress up a doubtful claim as the author's.
6. Quote the work itself, never an editor's introduction, preface or notes that the file also contains (many old editions have one).

## `book.json` for a reflection book

Besides the fields in `SKILL.md`: `"days"` (3 to 21, equal to the number of day chapters), `"route_slug"` (the Camino the book goes with, as in
the plan; it lets the app show the book on that route), and `"sources"` (below).

## Source texts

The checker verifies every `>` passage against the source named in `book.json` → `sources`. Only the sources in `books/sources/SOURCES.md` have
been checked and may be used (all public domain, each with its translator, edition and the finding of the check). Never use another edition
without checking its licence and adding it there first. Fetch the files into a working folder **outside** the repository (they are large and must
not be committed); `SOURCES.md` has the command. The checker looks for `pg<number>.txt` for each source `id` of the form `gutenberg-<number>` in the
`--sources` folder.

For the Bible, the checker removes the verse references (`120:001`) and the `<<...>>` headings before it compares, so quote the verses as readable text;
say "Psalm 121:1 to 4 (WEB)" in the attribution. Use the World English Bible (free everywhere), not the King James Version (a Crown patent applies in the
United Kingdom).

Credit under **About the book**: the work, the author, the translator, the edition and the year, and say the translation is in the public domain.
Copy only the passages themselves: never the Project Gutenberg header, licence text or trademark.

## Voice in a reflection

Quieter than a guide. Short paragraphs. Concrete images from the road. First person plural ("we") sparingly, to say what walkers share; never a "you
must". No jargon. Avoid religious cliché and avoid explaining a sacrament to someone who did not ask. Be honest about doubt, about tiredness, about the
hard sayings. The classics were written to console and to challenge; do not file off either. Not every classic here is Christian (Thoreau's *Walking* is not):
write each in its own voice and never make a book say what it does not say.

## Required checks

- `days` declared, equal to the number of day chapters; each day has the five parts in order; the end-of-day questions are a list.
- Every passage is verbatim in its source and has its attribution line; the total is within the ceiling of 3 hours.
- No quotation from anywhere except the named sources. No invented pilgrim stories.
