# Voice and honesty (both kinds of book)

The voice is the brand voice (`brand/BRAND_GUIDELINE.md`, sections 1 and 2) at book length: **warm, calm, capable, a little playful, with the
ease of a friend who knows the road.** Not a tour operator, not a guru, not a preacher.

**The author did not walk it, and must never suggest otherwise.** The books are written by an AI from sources. Never write "I", "my" or "we walked", never
claim to have been anywhere, never invent an anecdote, a conversation or "a pilgrim told me". The warmth comes from the second person ("you"), from
specific sourced detail, and from honesty about what is uncertain. "Many pilgrims find..." is allowed only where a source says so.

## Voice rules for a book

1. **Second person, short sentences, plain English.** "Your feet will thank you" beats "Optimise your trekking experience".
   Vary the rhythm; a long sentence is fine when it earns its length.
2. **Every page earns its place.** Each section gives a fact, a decision, a tip or a feeling, ideally two. No filler, no
   "in this chapter we will explore".
3. **Be specific.** Name the place, the stage, the kilometre. Specific and approximate beats vague: "~22 km", never "a long day".
4. **Warm, never cheesy.** No emoji in books. No exclamation-mark enthusiasm. No "must-see before you die", no FOMO.
5. **Inclusive of every reason to walk**: faith, sport, grief, curiosity, a rest from work. Never preach to a guide's reader and
   never mock the religious roots. In a reflection book the classic is Christian and you say so plainly; you invite the reader
   in, you do not push.
6. **Respect pilgrims, hosts and locals.** A village is a home, not a backdrop. Say "pilgrim", never "user", "customer" or "tourist".
7. **Spanish and Portuguese words pilgrims really use are welcome** (*Buen Camino*, *albergue*, *credencial*, *hospitalero*,
   *sello*, *peregrino*, *menú del peregrino*). Italicise and explain at first use in each book; plain after that.
8. **"the Way" and "the Camino" are capitalised.** Route names keep their accents: Camino Francés, Camino Portugués, Camino
   Inglés, Finisterre, Muxía, Santiago de Compostela.
9. **British spelling, consistently**, as in the brand guideline ("colour", "optimise", "programme", "grey"). Use the metric
   system, with miles in brackets only where it helps ("~25 km (~15.5 mi)"). The paid plan name and anything else in the
   brand guideline is written as the guideline writes it.

Words to use: walk, pilgrimage, the Way, stage, albergue, stay, offline. Words to avoid: trip package, tour, hack, crush it,
revolutionary, game-changing, "AI-powered", "cheap", "free" (only the free tier of the app is free), "must-see", "bucket list".

## The app, in two sentences, and no more

A guide may close with one short box about the app. Say only what is true today (README): CaminoPlus is the offline-first
companion app for the Camino, with maps that work without signal, stays and cafes, a pilgrim passport with stamps, a journal
and friends. The paid plan is called **Pilgrim Plus** (never "CaminoPlus plan"). Do not quote a price in a book (prices change
and the books are long-lived), do not promise a feature, and do not claim a route is available offline unless the repo says so.

## Honesty rules

**A fact needs a source you can name.** The kinds of fact, from safest to riskiest:

- *Safe to state* (still ledger it): well-documented history and geography: a monument's century, a town's province, a famous
  landmark, a river, the cathedral at the end.
- *State only as approximate, marked with `~`*: distances, altitudes, timings, ascent, stage lengths, typical costs as a range
  of orders of magnitude only if a public source gives it. Say how stage lengths vary between sources.
- *Never state, send the reader to the app or the local source*: prices, phone numbers, opening hours or seasons, bed counts,
  the names of specific albergues, restaurants, cafes, taxis or shops (landmarks and famous churches are fine), website
  addresses of businesses, coordinates, and anything that changes season to season (closures, diversions, new variants).
  The books are long-lived; a name that was right in 2026 can mislead in 2029.

**Say what you do not know.** "Sources differ by about a kilometre here" is a good sentence. So is "Check the current route
before you go; the path was being rerouted when this was written."

**Safety needs the calmest voice.** Heat, cold, river crossings, mountain weather, roads without verges, dogs, your own
limits: be direct, concrete and without jokes. Give the standard prudent advice (water, an early start, a rest day, a doctor
for anything that worries you, 112 as the European emergency number) and no medical claims beyond it.

**Credit sources.** A guide has a "Sources and thanks" section naming the public sources used. A reflection book names the
classic, the author, the translator and the year in its front matter and under every passage.

## Quoted passages (reflection books)

- Copy the passage word for word from the source file. Do not fix spelling, do not modernise, do not join sentences. Use
  `…` between separate stretches of the same passage.
- Under every passage, an attribution line starting with an em dash: `— Thomas à Kempis, *The Imitation of Christ*, Book 3,
  chapter 5 (tr. William Benham)`.
- The checker (`tools/check_books.py`) rejects any blockquote that is not found in the source named in `book.json`.
- Keep each passage short, 40 to 250 words. The reflection is yours; the classic is the guest.

## Things to refuse to do

- Do not present a guess as a fact because the sentence reads better.
- Do not copy sentences from a modern guidebook, a blog or a website. Facts are free; wording is not. Write it fresh.
- Do not invent a pilgrim, a testimonial, a remark or a quotation ("a pilgrim told me...", "someone once said..."). If you want a human voice, quote a
  public-domain source. A general observation about walkers is allowed only if it is plainly possible and hedged ("you may find...", "many walkers say..." only where a
  source says so), never a claim of fact you cannot source, and never a story.
- Do not mention competing apps, guidebooks or publishers by name.
- Do not claim the app does something it does not do yet.
