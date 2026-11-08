# Reflection book spec (`kind: reflection`)

A reflection book walks the reader through **a public-domain classic** in 30 short readings, one for a day of walking (or a
day at home), each about five minutes. In the spirit of the classics themselves, the book is slow, honest and quiet.

**Length.** 26,000 to 36,000 words in total, which is about 2 hours to 2 hours 45 minutes of reading at 220 words a minute.
The hard ceiling is 3 hours, 39,000 words. Each reading is 850 to 1,300 words. Why this size: a walker reads in small pieces
(a rest, a bench, an evening in an albergue), so the length is made of many short readings, not a few long ones.

## Structure of the book

| Chapter | Words | Content |
|---|---|---|
| `00-how-to-use-this-book.md` | 500 to 700 | What this is, how to read a reading (slowly, once aloud if you can), how to use the prompts while walking, how to use the book at home. |
| `01-about-the-book-and-its-author.md` | 600 to 900 | Who wrote the classic, when and why; what the classic is; why it suits a pilgrim; **the translator, the edition and the licence** (public domain, with the source named); what we changed (nothing in the passages; the order and the selection are ours). |
| `02-reading-01.md` to `31-reading-30.md` | 850 to 1,300 each | The 30 readings (below). |
| `32-carry-it-with-you.md` | 400 to 700 | A closing: what to keep, how to go on, an invitation to the next reading or to walk again. |

## One reading

```
# 7. A short title that names the heart of the reading

*One line: the theme or the question this reading carries.*

## The passage

> The passage, word for word from the source (40 to 250 words).
>
> — Thomas à Kempis, *The Imitation of Christ*, Book 1, chapter 7 (tr. William Benham, 1886)

## Reflection

600 to 800 words in your own voice. Start from something concrete (a road, a blister, a bell, a bench, an early start, a stranger's
kindness, a long flat afternoon) and let the passage open it. Say what the passage says, plainly. Say where it is hard. Say
what it asks of an ordinary day. One or two sentences of honest doubt are worth more than a page of reassurance.

## For the walk

- One question to carry for the next hour. Short.
- One small practice that needs nothing but attention (a breath, a step count, a silence, a greeting).

## A short prayer

Three to six lines. Original. Plain words. Open enough that a reader who prays differently, or who does not pray, can still
say it as a wish.
```

Vary the shape from reading to reading: some readings open with the passage, some end on the prompt, some have a second shorter
passage; but every reading has the four parts (passage, reflection, for the walk, a short prayer) under the same headings so the
app and the EPUB can show them the same way.

## Choosing the passages

1. Fetch the source text (below) and read the parts you will draw from. Do not choose from memory.
2. Pick **30 passages in a deliberate order**, an arc that a reader can feel: setting out, the weight we carry, silence,
   weariness, companions, doubt, humility, gratitude, arrival, return. The classic's own order is not required; your order is
   the book's shape. Say what the arc is in `00-how-to-use-this-book.md`.
3. Keep every passage whole in sense. Do not cut a sentence in half to fit; cut between sentences and mark it with `…`.
4. Prefer passages a first-time reader can follow. Avoid the passages that need a long explanation unless the reading is that
   explanation.
5. Treat disputed or controversial passages with care: you may leave a hard passage out, and you may say in the reflection
   that a passage is hard. Do not argue against the author in the reader's ear and do not dress up a doubtful claim as the
   author's.

## Source texts

The checker verifies every `>` passage against the source named in `book.json` → `sources`. These are the sources that have been
checked and may be used, all public domain. Never use a different edition without checking its licence and adding it here.

| `id` | Work | Edition and translator | Where |
|---|---|---|---|
| `gutenberg-1653` | The Imitation of Christ, Thomas à Kempis | William Benham, 1886 | https://www.gutenberg.org/cache/epub/1653/pg1653.txt |
| `gutenberg-13871` | The Practice of the Presence of God, Brother Lawrence | Fleming H. Revell edition, translated from the French (old edition; **not** ebook 5657, which is a copyrighted 2002 modern edition) | https://www.gutenberg.org/cache/epub/13871/pg13871.txt |
| `gutenberg-3296` | The Confessions of St. Augustine | E. B. Pusey, 1838 | https://www.gutenberg.org/cache/epub/3296/pg3296.txt |
| `gutenberg-8294` | The World English Bible (WEB), Psalms 120 to 134 | World English Bible, public domain worldwide | https://www.gutenberg.org/cache/epub/8294/pg8294.txt |

Fetch them into a working folder **outside** the repository (they are large and must not be committed), for example:

```bash
mkdir -p /tmp/book-sources && cd /tmp/book-sources
for n in 1653 13871 3296 8294; do curl -sS -o pg$n.txt "https://www.gutenberg.org/cache/epub/$n/pg$n.txt"; done
```

The checker looks for `pg<number>.txt` for each source `id` of the form `gutenberg-<number>` inside the `--sources` folder.
For the Bible, the checker removes the verse references (`120:001`) and the `<<...>>` headings before it compares, so quote the
verses as readable text; for the Psalms say "Psalm 121:1 to 4 (WEB)" in the attribution. Do not use the King James Version for
the Psalms: it carries a Crown patent in the United Kingdom, and the WEB is free everywhere.

Credit under **About the book**: the work, the author, the translator, the edition and the year, and say the translation is in
the public domain. Copy only the passages themselves: never the Project Gutenberg header, licence text or trademark.

## Voice in a reflection

Quieter than a guide. Short paragraphs. Concrete images from the road. First person plural ("we") sparingly, to say what
walkers share; never a "you must". No jargon. Avoid religious cliché and avoid explaining a sacrament to someone who did
not ask. Be honest about doubt, about tiredness, about the hard sayings. The classics were written to console and to
challenge; do not file off either.

## Required checks

- 30 readings, each with the four parts under the headings `The passage`, `Reflection`, `For the walk`, `A short prayer`.
- Every passage is verbatim in its source; every passage has its attribution line.
- The total is within 26,000 to 36,000 words (error above 39,000).
- No quotation from anywhere except the named sources. No invented pilgrim stories.
