# Facts the guides share

Some facts appear in several books. They are written down once, here, verified against the authority that owns them, so that every guide says the same thing. If a
book needs a fact in this file, it states it as the file does and adds the ledger row (`facts.md`) pointing here.

## The Compostela rule

Verified on 8 November 2026 against the Pilgrim's Office in Santiago, page "The Compostela": <https://oficinadelperegrino.com/en/the-compostela/> (the same office's
page on the credencial is <https://oficinadelperegrino.com/en/pilgrimage/the-credencial/>). The Office's pages can be read with `curl -sL -A "Mozilla/5.0"`; a plain
fetch may fail. Rules change: a guide says what the Office says, names the Office, and tells the reader to ask it in any doubtful case.

What the Office says:

- **What it is for, in the Office's own layers** (all three are on its pages, 8 November 2026, and a guide must not quote one and hide the others):
  the page on the Compostela says the document is awarded to those who come to the tomb of the Apostle "for Christian purposes (“devotionis affectu, voti vel pietatis”)", and, a few lines on, that
  "in modern times" the award is limited to those who come "for **religious and/or spiritual reasons**", on foot, by bicycle or on horseback; the page on the credencial says the credencial is for
  pilgrims "who wish to make the pilgrimage with a Christian sentiment, even if it is only with an attitude of search".
- The Office also offers a **Certificate of Distance**, issued by the Chapter of the Cathedral, which certifies the kilometres travelled "whatever the starting point of their pilgrimage" (it can be requested by
  someone who has walked before). Its price is not stated in a book.
- At least **the last 100 kilometres on foot or on horseback**, or **the last 200 kilometres by bicycle**, shown by the **credencial, stamped** along the route.
- On foot or on horseback: at least **100 continuous kilometres on the same route** to Santiago that the Office recognises. The **final stage must include at least the last one leading into the Cathedral**.
- The Way may be done in stages, if they follow in chronological and geographical order. A pilgrim who walks only the minimum distance must get the credencial stamped at the start and the end of each stage, with the date.
- A pilgrim who has already walked part of a recognised route outside Spain needs **no less than 70 kilometres in Spain**.
- The Cabildo (the cathedral's governing council) **reserves the right to grant the Compostela in special and exceptional cases**.

How a guide writes it:

- **The purpose, in one standard sentence** (in the chapter that explains the rule): *The Office awards the Compostela to those who walk for religious or spiritual reasons, and it describes the pilgrimage it has in mind as one made "with a Christian sentiment, even if it is only with an attitude of search". If that does not describe your reason for walking, ask the Pilgrim's Office what it can give you: it also offers a Certificate of Distance, which records the kilometres you walked from wherever you started.*

- In the Office's words, as figures in words ("the last hundred kilometres", "seventy kilometres in Spain"): these are rules, not estimates, so no `~`.
- Route lengths next to it are estimates, with `~` and with the note that sources differ.
- If a start is near the limit, the guide gives the arithmetic with its sources and says: "ask the Pilgrim's Office". It never says that a start "works".
- It does not repeat advice from blogs or forums, and it does not state a rule that is not in this list.

## The standard sentence of a guide's welcome

Every guide says, once, in its welcome chapter, what it is and is not, in these words (the rest of the welcome is the book's own):

> This book was written with AI assistance, from public sources, and its author has not walked the road. So it gives you sources instead of memories, and it says plainly when the sources disagree.

The full disclosure of the series (`ai_disclosure` in `books/series.json`) is on the "About this edition" page of every book and in the app.

## Notes on the Pilgrim's Office pages (verified 8 November 2026)

- The Compostela is described on <https://oficinadelperegrino.com/en/the-compostela/> and also under <https://oficinadelperegrino.com/en/pilgrimage/the-compostela/>: both load and carry the same text. Use the first as the citation.
  The credencial page is <https://oficinadelperegrino.com/en/pilgrimage/the-credencial/> and the certificate of distance page <https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/>.
- The Office's pages do **not** mention the Fisterrana or the Muxiana (the certificates for the walk from Santiago to the sea). The Concello de Fisterra says its own certificate is obtained at the
  municipal pilgrims' hostel and at the tourist office, and the Xunta and spain.info place the Muxiana at the tourist office in Muxía. A guide says only that, and tells the reader to ask.
- The Office's statistics page is rendered by script and shows nothing to a plain fetch: a statistic comes through a secondary source and is attributed ("Wikipedia reports...").
