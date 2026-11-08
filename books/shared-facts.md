# Facts the guides share

Some facts appear in several books. They are written down once, here, verified against the authority that owns them, so that every guide says the same thing. If a
book needs a fact in this file, it states it as the file does and adds the ledger row (`facts.md`) pointing here.

## The Compostela rule

Verified on 8 November 2026 against the Pilgrim's Office in Santiago, page "The Compostela": <https://oficinadelperegrino.com/en/the-compostela/> (the same office's
page on the credencial is <https://oficinadelperegrino.com/en/pilgrimage/the-credencial/>). The Office's pages can be read with `curl -sL -A "Mozilla/5.0"`; a plain
fetch may fail. Rules change: a guide says what the Office says, names the Office, and tells the reader to ask it in any doubtful case.

What the Office says:

- The Compostela is for those who come to the tomb of the Apostle for **religious and/or spiritual reasons** and follow the routes of the Way of St James on foot, by bicycle or on horseback.
- At least **the last 100 kilometres on foot or on horseback**, or **the last 200 kilometres by bicycle**, shown by the **credencial, stamped** along the route.
- On foot or on horseback: at least **100 continuous kilometres on the same route** to Santiago that the Office recognises. The **final stage must include at least the last one leading into the Cathedral**.
- The Way may be done in stages, if they follow in chronological and geographical order. A pilgrim who walks only the minimum distance must get the credencial stamped at the start and the end of each stage, with the date.
- A pilgrim who has already walked part of a recognised route outside Spain needs **no less than 70 kilometres in Spain**.
- The Cabildo (the cathedral's governing council) **reserves the right to grant the Compostela in special and exceptional cases**.

How a guide writes it:

- In the Office's words, as figures in words ("the last hundred kilometres", "seventy kilometres in Spain"): these are rules, not estimates, so no `~`.
- Route lengths next to it are estimates, with `~` and with the note that sources differ.
- If a start is near the limit, the guide gives the arithmetic with its sources and says: "ask the Pilgrim's Office". It never says that a start "works".
- It does not repeat advice from blogs or forums, and it does not state a rule that is not in this list.

## The standard sentence of a guide's welcome

Every guide says, once, in its welcome chapter, what it is and is not, in these words (the rest of the welcome is the book's own):

> This book was written with AI assistance, from public sources, and its author has not walked the road. So it gives you sources instead of memories, and it says plainly when the sources disagree.

The full disclosure of the series (`ai_disclosure` in `books/series.json`) is on the "About this edition" page of every book and in the app.

## Notes on the Pilgrim's Office pages (verified 8 November 2026)

- The Compostela is described on <https://oficinadelperegrino.com/en/the-compostela/> and also under <https://oficinadelperegrino.com/en/pilgrimage/the-compostela/>: both load. Use the first as the citation.
  One page may word the purpose differently from the other ("Christian purposes" against "religious and/or spiritual reasons", as one writer found): quote only the wording of the page cited, and do not elaborate.
- The Office's pages do **not** mention the Fisterrana or the Muxiana (the certificates for the walk from Santiago to the sea). The Concello de Fisterra says its own certificate is obtained at the
  municipal pilgrims' hostel and at the tourist office, and the Xunta and spain.info place the Muxiana at the tourist office in Muxía. A guide says only that, and tells the reader to ask.
- The Office's statistics page is rendered by script and shows nothing to a plain fetch: a statistic comes through a secondary source and is attributed ("Wikipedia reports...").
