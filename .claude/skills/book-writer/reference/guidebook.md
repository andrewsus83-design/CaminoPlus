# Guidebook spec (`kind: guide`)

One book per Camino route in the app's catalog. **9,000 to 12,000 words, never more than 12,000.** Chapters of 400 to 1,800
words, so that each is a comfortable read on a phone and a sensible unit in the app.

## What the reader needs

Three readers, in order of the book's attention: the **Planner** (one to six months out, choosing and preparing), the **Walker**
(on the road tonight, wants the next stage), the **Dreamer** (wondering if they could). The book serves the Planner first and the
Walker's evenings second. It is not a replacement for a live map or for local advice; it says so once, plainly, and sends the
reader to the app for beds, cafes, closures and weather.

## Chapters (adapt the names and the order to the route; keep all the jobs)

| # | Chapter | Words | Job |
|---|---|---|---|
| 00 | Welcome | 300 to 500 | What this book is, how to use it, what it is not. A promise in one line. |
| 01 | The Way in brief | 700 to 1,000 | Where the route starts, ends, how long, what it feels like, why it exists, a short honest history. |
| 02 | Is this Camino for you? | 500 to 800 | Difficulty, who it suits, who should choose another, how it compares with its neighbours in general terms. |
| 03 | When to go | 500 to 800 | Seasons, weather patterns, daylight, crowds, heat, snow, what a month feels like. No forecasts, only patterns. |
| 04 | Before you go | 1,000 to 1,500 | Credencial, getting there and back, training, packing, shoes and feet, money in general terms, language. |
| 05 to NN | The stages | 4,500 to 6,000 together | The route in sections, see below. |
| NN+1 | Sleeping, eating, resting | 700 to 1,000 | Albergue life and etiquette, hospitaleros, the pilgrim menu, rest days, sharing a room, noise, bedbugs. |
| NN+2 | Body, weather and safety | 500 to 800 | Feet, heat, cold, rain, road and path safety, when to stop, 112. |
| NN+3 | The inner Way | 400 to 700 | Why people walk, what the Way does to them, questions for the walk. For every reason to walk. |
| NN+4 | Arriving | 500 to 800 | The end of the route, the Compostela and how it is earned, the pilgrim Mass in general terms, what to do the next day. |
| NN+5 | Going home | 250 to 400 | Re-entry, keeping the Way alive, walking again. |
| NN+6 | With the app, and sources | 300 to 500 | One short app box (see the voice file), then "Sources and thanks" and a short glossary as a list. |

## The stages

Group the route into **sections** the way a walker plans, not one chapter per day. A section is 3 to 8 walking days, or a
region. For a long route such as the Francés a section per region (the Pyrenees and Navarra, La Rioja, Burgos and the Meseta,
León and the mountains, Galicia). For a short route, a section per day is fine.

Each section: a short opening that gives its **character** in a few sentences, then the days as `###` entries:

```
### Day 3: Larrasoaña to Pamplona (~15 km)
Two or three short paragraphs: what the day is like, one or two real highlights, the thing to be careful about, a human
detail. End with a one-line "In the app" pointer only if the stage is in the app (see below). No lists of businesses.
```

Use "typical" stages and say that stage lengths vary: "Many pilgrims split this differently. This book follows the usual
stage towns."

## Ground truth in this repository (read it before you write about these routes)

The app's catalog is the source of truth for names and the order of towns. Do not contradict it; where you add a number from a
public source, write `~`.

- Catalog and route list: `supabase/migrations/20261106120000_more_caminos.sql` (route names, countries, start and end, `distance_km`).
- Camino Francés, 33 stages: `supabase/migrations/20261112000000_camino_frances_stages.sql` and `tools/offline-maps/stages/camino-frances-NN.json` (stage names, "A to B").
- Camino Portugués Central, 11 to 12 stages: `supabase/migrations/20261113000000_camino_portugues_stages.sql`, `tools/offline-maps/stages/camino-portugues-NN.json`.
- Camino Inglés, 6 stages: `supabase/migrations/20261113010000_camino_ingles_stages.sql`, `tools/offline-maps/stages/camino-ingles-NN.json`.
  Note the comment in that migration: the catalog has **no cited distance** for these stages, so a book may quote `~` figures
  only from a named public source (for example the Xunta de Galicia) and says that sources differ by up to a kilometre.
- Other routes (Norte, Primitivo, Costero, Finisterre and Muxía, Invierno, and so on): the catalog gives start, end and an overall
  distance only. For the stage towns, use the long-established traditional stage towns, say stage lengths vary, and ledger the source.

If a stage of the app has a slug (`camino-frances-07`), you may add a closing line "In the app: stage 7". Nothing more specific
about the app's contents.

## Required in every guide

- A **fact ledger** at `books/<id>/facts.md` (format below).
- Honest approximations (`~`) for every distance, altitude and duration; a sentence saying that figures vary by source.
- A "check before you go" line for anything seasonal: closures, diversions, river levels, snow, fires, heat.
- A short **Sources and thanks** section naming the public sources used (no URLs to businesses).
- No table, no image, no emoji, no price, no phone number, no business name, no coordinates, no opening hour.

## Fact ledger format (`facts.md`, not published)

```
| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Distance Porto to Santiago, central route | ~240 km | supabase/migrations/20261106120000_more_caminos.sql | yes |
| Sé Cathedral in Porto begun | 12th century | en.wikipedia.org/wiki/Porto_Cathedral | yes |
```

(Tables are fine here: the ledger is a working file and is not published.) If a fact has no source and you cannot find one, take
the fact out of the book.

## Quality bar

Read the finished book as a Planner. Could they decide whether this is their Camino, plan the shape of the walk, pack, and
know what to check locally? Read a stage as a Walker. Does it tell them what the day is like, not just the km? Is any sentence
one a friend who has walked it would not say? Cut it.
