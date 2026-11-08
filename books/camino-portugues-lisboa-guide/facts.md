# Fact ledger: The Long Portuguese Way (camino-portugues-lisboa-guide)

Working file, not published. One row per hard fact in the book. The last column is `yes` (the page or file was read, in full or in the relevant part, on 2026-11-08, the date of writing), `computed` (calculated from figures cited in the row, not looked up) or `removed` (taken out of the book, or never put in, and kept here as a record). How a page was read is in the source column. A fact with no row here is not in the book.

Source short names (full addresses are in the rows or here):

- CAT = supabase/migrations/20261106120000_more_caminos.sql (row camino-portugues-lisboa: start Lisboa, end Santiago de Compostela, countries {PT,ES}, distance_km 620, stage_count null, difficulty 3; rows camino-frances 773 km difficulty 3, camino-portugues 240 km 12 stages difficulty 2, camino-del-norte difficulty 4)
- CAT-D = supabase/migrations/20261104150200_routes_maps.sql (difficulty smallint check between 1 and 5)
- APP = mobile/src/data/routeGuide.ts (the app's own note for camino-portugues-lisboa)
- SF = books/shared-facts.md (the Compostela rule, the purpose sentence and the welcome sentence, verified against the Pilgrim's Office on 2026-11-08; re-read against the Office pages again the same day, no difference)
- OP = Pilgrim's Reception Office of the Cathedral of Santiago, https://oficinadelperegrino.com/en/the-compostela/ , /en/pilgrimage/the-credencial/ , /en/pilgrimage/certificate-of-distance/ (read with curl -sL -A "Mozilla/5.0")
- XUNTA = Xunta de Galicia, https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way?vid=V1 (read with curl); XUNTA-PS = the stage page https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-padron-santiago-de-compostela?vid=V1 (read with curl)
- CSJ = Confraternity of St James, https://www.csj.org.uk/camino-portugues (published 2 March 2020, updated 11 September 2025; read with curl)
- CSJ-LP = "The Caminho Português, Section 1 - Lisbon to Porto", practical guide by Laurie Reynolds, revised draft of 12 December 2013; its own text says the Confraternity of St James publishes it among its online guides, but the CSJ page it names (csj.org.uk/guides-online.htm) now returns 404, so the owner should confirm the copy is the CSJ's (the file is a copy hosted by a third party, https://magwood.me/wp-content/uploads/2014/09/csj-lisbon-porto-2014.pdf, 34 pages, read with pdftotext). The book calls it "the older sheet" and says it is dated.
- TCP-G = Turismo Centro de Portugal (the regional tourism board), "Guia Caminhos de Santiago - Centro de Portugal", PDF made 25 September 2023, https://turismodocentro.pt/wp-content/uploads/2023/09/Guia-Caminhos-de-Santiago-Centro-de-Portugal_Site-TCP.pdf (Portuguese; read with pdftotext)
- TCP-MT = Turismo Centro de Portugal, "Guia Subregional Médio Tejo 2024", https://turismodocentro.pt/wp-content/uploads/2024/02/Guia-Subregional-Medio-Tejo_2024.pdf (Portuguese; read with pdftotext)
- TCP-A = Turismo Centro de Portugal, English article "Central Portuguese St. James Way", https://www.centerofportugal.com/jp/kiji/central-portuguese-st-james-way (the English text is served at this address; read with curl)
- VL = Via Lusitana (Associação de Peregrinos Via Lusitana), https://www.vialusitana.org/ ; the pages /associacao/, /caminho-de-santiago/credencial/, /caminho-de-santiago/compostela/, /albergues/ and /caminho-de-santiago/percursos/ were read through the fetch tool's summary (curl gets only a script challenge); the Portuguese quotations are as that summary printed them
- TAB-A = published stage table "The stages of the Portuguese road to Santiago" of a Spanish walking-holiday company, https://viajecaminodesantiago.com/en/jacobean-routes/the-stages-of-the-portuguese-road-to-santiago (English, read with curl; the figures are as printed, the stage summaries are paraphrased in the book)
- TAB-C = published stage table of another walking-holiday company, https://santiagoways.com/pt/caminho-de-santiago/caminho-portugues/ (Portuguese, read with curl; it prints "25 etapas, 620 km" in one place and "28 etapas, 618,9 km" in another, so the book uses it only for stage towns and for single-stage differences)
- WP-xxx = English Wikipedia, read on 2026-11-08 through the fetch tool's summary of the relevant section (Wikipedia rate-limits direct requests); the page is in the row
- SOLAR = NOAA solar equations computed with a short script for Lisbon (38.72 N), Porto (41.15 N) and Santiago (42.88 N), 21 December and 21 June 2026

## A. The route in the app, and the other books

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The app's catalog has a route Camino Portugués from Lisbon, from Lisboa to Santiago de Compostela, ~620 km, countries Portugal and Spain, difficulty 3, no stage count | ~620 km; 3 | CAT | yes |
| The catalog rates difficulty on a scale of 1 to 5 | 1 to 5 | CAT-D | yes |
| Catalog difficulty: Camino Francés 3, Portuguese Way from Porto 2, Camino del Norte 4 | 3; 2; 4 | CAT | yes |
| The catalog does not say what the rating weighs | as stated | CAT; CAT-D (no comment on the scale) | yes |
| Camino Francés ~773 km; crosses the Pyrenees and the mountains of León | ~773 km | CAT; books/series.md | yes |
| The catalog gives Porto to Santiago (Portugués Central) as ~240 km | ~240 km | CAT | yes |
| Finisterre and Muxía ~90 km from Santiago, and the book *To the End of the Earth* | ~90 km | CAT; books/series.md | yes |
| *The Portuguese Way* describes Porto to Santiago, starting at the Sé; *The Coastal Way* describes the coastal road from Porto | as stated | books/camino-portugues-guide/chapters/05 (Day 1 begins at the Sé); books/series.md | yes |
| The app has no stages for the Lisbon route; the stages of the Portugués Central are added hidden (is_published false), so the book has no "In the app" lines and makes no claim about the app's contents for this route | n/a | supabase/migrations/20261113000000_camino_portugues_stages.sql (header); tools/offline-maps/catalog (only camino-frances, camino-ingles, camino-portugues) | yes |
| The app's own note: "The long Portuguese Way from Lisbon along the Tagus to Porto, then on to Santiago"; terrain "Mostly flat; some road sections"; tip "Add about two weeks to the Porto start" | as quoted | APP | yes |
| The CaminoPlus website says the road takes 25 to 29 days | 25-29 | tools/build_web.py line 314 (the book does not use it; flagged for the owner) | removed |
| The series' order table gives order 14 to songs-of-ascents-readings, and the brief gave this book order 14 as well (book.json follows the brief; flagged for the owner) | 14 | books/series.md; books/songs-of-ascents-readings/book.json | yes |

## B. Length and stage figures

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Confraternity: Lisbon to Santiago via Porto approximately 640 km; Porto to Santiago circa 252 km | ~640 km; ~252 km | CSJ | yes |
| Wikipedia: ~620 km from Lisbon in the infobox; "610 km long starting in Lisbon" in the text | ~620 km; ~610 km | WP-CP https://en.wikipedia.org/wiki/Camino_Portugu%C3%A9s | yes |
| TAB-A: full road from the Sé of Lisbon 616.7 km in 27 stages | ~617 km; 27 | TAB-A | yes |
| TAB-A stage lengths: Lisboa-Alpriate 21.7; Alpriate-Vila Franca de Xira 18.8; Vila Franca-Azambuja 20; Azambuja-Santarém 33; Santarém-Golegã 30.7; Golegã-Tomar 31.3; Tomar-Alvaiázere 31.7; Alvaiázere-Ansião 22.7; Ansião-Cernache 26.1; Cernache-Coimbra 11.3; Coimbra-Mealhada 24.8; Mealhada-Águeda 23.5; Águeda-Albergaria-a-Velha 15.8; Albergaria-São João da Madeira 28.8; São João da Madeira-Grijó 19; Grijó-Porto 15.1 | the sixteen days of the book, rounded to ~22, ~19, ~20, ~33, ~31, ~31, ~32, ~23, ~26, ~11, ~25, ~24, ~16, ~29, ~19, ~15 | TAB-A | yes |
| TAB-A: the first six stages total 155.5 km, Tomar to Coimbra 91.8 km, Coimbra to Albergaria 64.1 km, Albergaria to Porto 62.9 km | ~156 km; ~92 km | TAB-A (printed section totals) | yes |
| Coimbra to Porto, six days: 64.1 + 62.9 | ~127 km | TAB-A | computed |
| Lisbon to Porto, sum of the 16 stages: 155.5 + 91.8 + 64.1 + 62.9 | 374.3, ~374 km | TAB-A | computed |
| TAB-A: Porto to Santiago 242.4 km in 11 stages (Porto-Vilarinho 26.5; Vilarinho-Barcelos 27.3 and so on) | ~242 km; 11 | TAB-A | yes |
| TAB-A: from Santarém 523.2 km in 23 stages; from Tomar 461.2 km in 21; from Coimbra 369.4 km in 17 | ~523; ~461; ~369 km | TAB-A | yes |
| TAB-A: the four stages Azambuja-Santarém 33, Santarém-Golegã 30.7, Golegã-Tomar 31.3 and Tomar-Alvaiázere 31.7 are all 30 km or more, "between Azambuja and Alvaiázere four stages in a row of more than 30 km" | four stages | TAB-A (text and stage list) | yes |
| TAB-A rates two of the 16 Lisbon-Porto stages Hard (Azambuja-Santarém, Tomar-Alvaiázere); Coimbra-Mealhada and Albergaria-São João da Madeira Moderate; Mealhada-Águeda, Águeda-Albergaria, São João-Grijó and Grijó-Porto Easy | as stated | TAB-A | yes |
| CSJ-LP: Lisbon to Porto "approximately 380 kilometers" | ~380 km | CSJ-LP | yes |
| CSJ-LP plan of 13 days: Lisbon-Vila Franca de Xira 37; Vila Franca-Azambuja 20; Azambuja-Santarém 32; Santarém-Golegã 30.5; Golegã-Tomar 22; Tomar-Alvaiázere 32; Alvaiázere-Rabaçal 33; Rabaçal-Coimbra 32 (or Rabaçal-Conímbriga 11 and Conímbriga-Coimbra 21); Coimbra-Mealhada 26; Mealhada-Águeda 31; Águeda-Albergaria 19.5; Albergaria-São João da Madeira 29; São João da Madeira-Porto 35 | km as listed | CSJ-LP ("Planning the Stages") | yes |
| CSJ-LP first-day options out of Lisbon: ~8 km to the Parque das Nações, ~11 km to Sacavém, ~32 km to Alhandra, ~29 km to Verdelha, ~37 km to Vila Franca | ~8; ~11; ~32; ~29; ~37 km | CSJ-LP | yes |
| TAB-C stage list (Lisboa-Santa Iría de Azoia 19; Santa Iría-Vila Franca 22; Vila Franca-Azambuja 20; Azambuja-Santarém 32; Santarém-Golegã 30.7; Golegã-Tomar 31.3; Tomar-Alvaiázere 31; Alvaiázere-Ansião 32; Ansião-Condeixa-a-Nova 32; Condeixa-Coimbra 16; Coimbra-Mealhada 23; Mealhada-Águeda 25; Águeda-Albergaria 17; Albergaria-São João 29; São João-Grijó 16; Grijó-Oporto 16) | used only for: Santa Iría de Azoia ~19 and Vila Franca ~22, Condeixa-a-Nova, Condeixa-Coimbra ~16, Coimbra-Mealhada ~23, Mealhada-Águeda ~25, Águeda-Albergaria ~17, São João-Grijó ~16, Grijó-Porto ~16 | TAB-C | yes |
| Disagreements between the three lists, as written in the days: Azambuja-Santarém ~32 to ~33; Santarém-Golegã ~30.5 to ~30.7; Golegã-Tomar ~31 against ~22; Tomar-Alvaiázere ~31 to ~32; Coimbra-Mealhada ~23 to ~26; Mealhada-Águeda ~24, ~25, ~31; Águeda-Albergaria ~16 to ~19.5; Albergaria-São João ~29; São João-Grijó ~16 to ~19 | ranges as stated | TAB-A; CSJ-LP; TAB-C | yes |
| Other sources count 24 to 28 days for the whole road: the older sheet plans 13 days to Porto plus the 11 from Porto (24), TAB-A 27, TAB-C 25 or 28 | 24 to 28 | CSJ-LP; TAB-A; TAB-C | computed |
| The book's 27 days: 16 from Lisbon to Porto plus the 11 of The Portuguese Way, ~23 km a day on ~620 km | 27; ~23 km | CAT; TAB-A (617 / 27 = 22.9) | computed |
| Visit Portugal's page on the road (visitportugal.com ... /229178) answers every request, curl and fetch tool alike, with a bot-check page; figures a search summary attributed to it (Lisbon-Alhandra 33, Santarém-Golegã 30.5, Golegã-Tomar 22 and others) were not read and are not used | n/a | https://www.visitportugal.com/pt-pt/destinos/porto-e-norte/229178 (Anubis challenge; origin.visitportugal.com returns 403) | removed |
| A coach-tour itinerary PDF (HighSun Tourism Experiences, "Caminho Português de Santiago: Central", 10 days by bus) turned up in a search; it is a tour, not a stage list, and is not used | n/a | https://cdn.optigest.net/high_sun/202607/caminho_portugue__770_s_de_santiago_central_pt.pdf | removed |
| The Galician Amigos del Camino PDF "Caminho central português" (2007, 68 pages), which CSJ-LP names as its main source, downloaded but was not read for figures | n/a | https://www.amigosdelcamino.com/attachments/article/143/Caminho%20central%20portugues.pdf | removed |

## C. Where the road goes: official and regional sources

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Xunta lists the places of the Portuguese Way in Portugal: Lisbon, Santarém, Coimbra, Porto, Barcelos, Ponte de Lima and Valença do Minho, where the Minho is crossed into Galicia | as stated | XUNTA ("passing through the locations established for the Portuguese Way to Galicia: Lisbon, Santarem, Coímbra, Porto, Barcelos, Ponte de Lima and Valença do Minho") | yes |
| The Xunta says the road grew in importance from the 12th century, after Portugal's independence, and that Portugal's north to south road network was organised around the pilgrimage | 12th century | XUNTA | yes |
| The Xunta names Elizabeth of Portugal, the "Holy Queen", pilgrimage in the 14th century, "would be buried in Coímbra with a pilgrim's staff" | 14th century | XUNTA | yes |
| The Xunta says King Manuel I made the pilgrimage from Lisbon to Santiago in 1502 and ordered that a lamp remain lit in the church at Santiago night and day | 1502 | XUNTA | yes |
| TCP-A: the Central Portuguese Way starts in Lisbon Cathedral, is "the second in terms of number of pilgrims, only beaten by the French", follows the banks of the Tagus via Tomar, continues towards Coimbra passing Alvaiázere and Ansião, then via Mealhada, Águeda, Albergaria-a-Velha, São João da Madeira and Grijó before entering Porto | as stated | TCP-A | yes |
| TCP-A: the tomb of Queen Isabel in the monastery of Santa Clara-a-Nova at Coimbra, with the symbols of the scallop shell, the cross of Santiago and the staff | as stated | TCP-A | yes |
| TCP-G: the Caminho Português de Santiago Central, Região Centro, officially certified in July 2023, 191.6 km, 12 municipalities (Vila Nova da Barquinha, Tomar, Ferreira do Zêzere, Alvaiázere, Ansião, Penela, Condeixa-a-Nova, Coimbra, Mealhada, Anadia, Águeda, Albergaria-a-Velha); it begins at Pedregoso in Vila Nova da Barquinha | 191.6 km (not in the book); July 2023 | TCP-G (pages 9 and 10) | yes |
| TCP-G lists as the stage places (its "ETAPAS" boxes): Vila Nova da Barquinha, Tomar, Alvaiázere, Rabaçal, Coimbra, Mealhada, Águeda, Albergaria-a-Velha | as stated | TCP-G (pages 8 to 9) | yes |
| TCP-G: Cernache is reached by "um pequeno desvio no caminho" (a small detour from the way) | as stated | TCP-G (page 12) | yes |
| TCP-G: Queen Teresa is said ("terá") to have founded in 1117 a hostel for pilgrims at Albergaria-a-Velha; the town's name comes from it | 1117 | TCP-G (pages 6 and 14) | yes |
| Wikipedia: Albergaria-a-Velha, Aveiro District; "in 1117 donated to the nobleman Gonçalo Eriz the lands that constitute Albergaria-a-Velha" | 1117 | WP-ALB https://en.wikipedia.org/wiki/Albergaria-a-Velha | yes |
| TCP-G: after Albergaria-a-Velha the road leaves Central Portugal for the Tomb of the Apostle | as stated | TCP-G (page 15) | yes |
| TCP-G: the way follows a stretch of the old Roman road that once linked Tomar to Conímbriga; limestone outcrops of the Sicó massif; ancient olive trees, vines and native forest towards Alvaiázere | as stated | TCP-G (page 11) | yes |
| TCP-G: the Convent of Christ, classified by UNESCO in 1983, keeps the octagonal Charola of the 12th century; the Pegões Altos aqueduct built under Philip II of Spain and I of Portugal; the bridge of King Manuel I over the Nabão at Tomar | 1983; 12th century | TCP-G (page 11) | yes |
| TCP-G: Ansião legend, the name comes from alms given by Queen Santa Isabel to a poor old man (ancião); the Ponte da Cal, 17th century, is linked to her pilgrimage | as stated | TCP-G (pages 11 and 12) | yes |
| TCP-G: Rabaçal Roman villa, mosaics of the 4th and 5th centuries; Rabaçal DOP cheese | 4th and 5th centuries | TCP-G (pages 12 and 13) | yes |
| TCP-G: at Coimbra the tomb of Queen Isabel is in the monastery of Santa Clara-a-Nova on the south bank of the Mondego, and shows the shell, the cross and the staff of Santiago; the University of Coimbra, Alta and Sofia, a UNESCO site since 2013; the church of Santa Cruz, national pantheon since 2003, holds the tombs of the first two kings | 2013; 2003 | TCP-G (pages 13 and 14) | yes |
| TCP-G: after Coimbra the way follows Roman roads; a Roman milestone 1.79 m high in the entrance of the Câmara Municipal of Mealhada; the sparkling wines and the leitão da Bairrada; arrows towards Avelãs de Caminho in Anadia, then Águeda; Águeda known for the urban art of its centre; Pateira de Fermentelos, the largest natural lagoon in the Iberian Peninsula, in Águeda; the old bridge over the Marnel at Lamas do Vouga; the Santuário de Nossa Senhora do Socorro after Albergaria | ~1.8 m | TCP-G (pages 14 and 15) | yes |
| TCP-G: convent sweets at Tomar; the pastéis de Santa Clara at Coimbra; the pastel de Águeda | as stated | TCP-G (pages 11, 13 and 15) | yes |
| TCP-MT: coming from the south, from the Quinta da Cardiga (concelho of Golegã), the road enters the Centro region at Vila Nova da Barquinha, whose Atalaia parish church is a national monument, then Tomar and Ferreira do Zêzere | as stated | TCP-MT (page 5) | yes |
| TCP-G: the Caminho do Oeste and the Caminho Marítimo are "em desenvolvimento" (in development); the Oeste is based on the written accounts of Confalonieri and Dalrymple (16th and 18th centuries) and goes by Arruda dos Vinhos, Torres Vedras, Lourinhã, Óbidos, Alcobaça, Batalha and Soure; the Marítimo by the ports Peniche, São Martinho do Porto, Nazaré, Figueira da Foz and Aveiro | as stated | TCP-G (pages 6, 32 and 33) | yes |
| TCP-G: for the ways not yet waymarked, "compete ao caminhante munir-se da informação necessária e dos traçados GPS" | as stated | TCP-G (page 3) | yes |
| Wikipedia: an older road from Lisbon passes the thermal hospital of Caldas da Rainha (1485) and the monastery of Alcobaça; pilgrims used Roman roads to Coimbra and had to reach Porto before the city gates closed | 1485 (not in the book) | WP-CP | yes |
| Wikipedia: in 2025 the Portuguese Way was the second most popular route after the French Way, 19%; most who received the certificate started in Tui (41%), Porto (26%) or Valença (18%); most finish May to September | 2025; 19%; 41; 26; 18 | WP-CP | yes |
| The three starts together are 85 per cent, so the other starts share 15 per cent | 85; 15 | WP-CP | computed |
| Confraternity: most pilgrims start in Porto but many also walk from Lisbon | as stated | CSJ | yes |
| Confraternity: the Lisbon-Porto route has less support for pilgrims, new albergues open every year, and it is much easier than five years ago; initially quite a lot of road walking and infrequent pilgrim accommodation; more beautiful after Santarém (detour to Fátima); Tomar to Coimbra delightful; now well waymarked but less infrastructure than from Porto | as stated | CSJ | yes |
| Confraternity: yellow arrows plentiful from the cathedral at Porto to the Portuguese border thanks to the Associação dos Amigos do Caminho Português de Santiago; blue arrows indicate the route from Santiago to Porto and thence to Fátima; in Galicia granite pillars give the distance to Santiago | as stated | CSJ | yes |
| Confraternity: Via Lusitana publishes the latest accommodation lists | as stated | CSJ | yes |
| Confraternity: when using roads be aware of traffic and use the indicated strip between the road and the drainage ditch | as stated | CSJ | yes |
| Confraternity: the Coastal route follows the Central route out of Porto, branches off to the coast, and rejoins the Central route at Redondela; the Litoral route leaves Porto by the Douro promenades and the sea to Vila do Conde; the Spiritual Variant starts at Pontevedra, goes to Vilanova on the Sea of Arousa, then by boat to Pontecesures and on by the Central route | as stated | CSJ | yes |
| Confraternity: you can fly into Lisbon, Porto, Vigo or Santiago; a regular bus between Santiago and Porto of four hours' journey | ~4 h | CSJ | yes |

## D. The older sheet (CSJ-LP, 2013) and the stage tables: what the days say

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CSJ-LP: the arrows in Lisbon start at the Sé; in the old streets many arrows are close to the ground; TAB-A: the first stage starts at the Sé | as stated | CSJ-LP; TAB-A | yes |
| CSJ-LP: from Sacavém the way goes inland along an old canal and through industrial estates, "basically an ugly walk all the way to Alhandra. But very well marked" (the book says "unlovely") | as stated | CSJ-LP | yes |
| TAB-A: Day 1 leaves the Sé by Santa Apolónia, the Parque das Nações and the Tagus, the city lets up at Sacavém and Alpriate, a quiet farming hamlet, is the first rural stop | as stated | TAB-A | yes |
| TAB-A: Day 2 returns to the Tagus at Póvoa de Santa Iria, boardwalks beside the river, a stretch of road before Alhandra, then a path to Vila Franca de Xira; CSJ-LP: Alverca, a river path opened in 2008 between Alhandra and Vila Franca, the arrows pass the bullring | as stated | TAB-A; CSJ-LP | yes |
| TAB-A: Day 3, 20 flat km following the Tagus floodplain and the railway line, a transition stage through the farming heart of the Ribatejo; CSJ-LP: industrial parks, then the N-1 with wide shoulders into Azambuja, "not pleasant, but not dangerous" | as stated | TAB-A; CSJ-LP | yes |
| TAB-A: Day 4 "one of the longest and most demanding days", very exposed to the sun, set off early and hydrated; beside the Tagus, at times on top of the flood levee, as far as Valada and Porto de Muge, then a stretch of farmland with no shade or services, and a tough final climb into Santarém | as stated | TAB-A | yes |
| CSJ-LP: after Porto de Muge "no facilities for the next 9 km until Omnias"; the top of the dyke may be overgrown, but you can always walk on the road below; the farm path near Azinhaga "could be a bit boggy in wet weather" | ~9 km | CSJ-LP | yes |
| CSJ-LP and TAB-A: Santarém has a gate of Santiago ("São Tiago gate") in the old walls through which the way leaves | as stated | CSJ-LP; TAB-A | yes |
| TAB-A: Day 5 on dirt tracks among vineyards and cornfields by Vale de Figueira and Pombalinho and through Azinhaga; easy, flat | as stated | TAB-A | yes |
| CSJ-LP: near Azinhaga, as of spring 2013, "municipal disagreement and confusion" over the marking, arrows leading away from the traditional route; two ways in use | as stated, dated 2013 | CSJ-LP | yes |
| TAB-A: Day 6 via São Caetano and the Quinta da Cardiga, the way leaves the Tagus; Vila Nova da Barquinha and Atalaia (parish church a National Monument) come before the Nabão; Tomar | as stated | TAB-A; TCP-MT | yes |
| TAB-A: Day 7 begins the first serious climbs in the limestone landscapes of the Serra de Sicó, among olive groves, pine woods and holm oaks; Day 8 a shorter, easier day through the Serra de Ariques, holm oaks and olive trees | as stated | TAB-A | yes |
| TAB-A: Day 9 "one of the most beautiful stages since leaving Lisbon", an easy one, a gentle descent along old Roman roads and paths among vineyards, olive groves and riverside woods; Rabaçal, Fonte Coberta, Conímbriga; Cernache | as stated | TAB-A | yes |
| CSJ-LP: the Roman villa about 2 km outside Rabaçal; Rabaçal to Coimbra 32 km, or split at Conímbriga for rest and the ruins | ~2 km | CSJ-LP | yes |
| TAB-A: Day 10 the shortest stage, a gentle climb by Pousada and Palheira, past the remains of an old aqueduct, up to Santa Clara and Mesura with views of the city; before crossing the Mondego the monastery of Santa Clara-a-Nova | as stated | TAB-A | yes |
| TAB-A: Day 11 after crossing the Mondego, rolling terrain, tracks and minor roads, pine and eucalyptus woods and the first vineyards of the Bairrada, a densely populated stage where one must keep an eye on the arrows | as stated | TAB-A | yes |
| TAB-A: Day 12 a transition stage with a gentle profile and plenty of settlements, villages, semi-rural areas and the odd industrial estate, extra care on the asphalt stretches | as stated | TAB-A | yes |
| TAB-A: Day 13 a short day, perfect for resting your legs, one of the most beautiful of the section; climbs gradually out of the Águeda valley and from Pedaçães follows dirt paths through lush vegetation | as stated | TAB-A | yes |
| TAB-A: Day 14 on dirt tracks through pine and eucalyptus woods and small settlements, an increasingly built-up landscape, crossing the historic centres of Bemposta and Oliveira de Azeméis | as stated | TAB-A | yes |
| TAB-A: Day 15 an urban stage, mostly asphalt, the odd short steep climb, through the historic centre of Arrifana and towards Escapães | as stated | TAB-A | yes |
| TAB-A: Day 16 through Vila Nova de Gaia between urban streets and the odd park, crossing the Douro on the Luís I bridge into the heart of Porto | as stated | TAB-A | yes |
| CSJ-LP: at Vila Nova de Gaia the arrows may lead down to the river; the bridge has a low crossing next to the port lodges to the riverfront and a high crossing to the upper town "very near the Cathedral"; the way ends in front of the cathedral | as stated | CSJ-LP | yes |
| CSJ-LP: at least 75% on asphalt (the author's estimate, "my estimate would be"), industrial parks, quiet rural roads, residential streets; wide shoulders on national roads, some report heavy truck traffic | 75% (in words: three quarters) | CSJ-LP | yes |
| CSJ-LP: "some days of 30+ km are inevitable", buses very infrequent | ~30 km | CSJ-LP | yes |
| CSJ-LP: south of Porto stamps (carimbos) can be found at post offices, Junta da Freguesia offices, the Câmara Municipal, train stations; in 2013 volunteer fire stations in many towns let pilgrims sleep for a donation, with fewer accepting | as stated, dated 2013 | CSJ-LP | yes |
| CSJ-LP: Fátima markers stand beside the yellow arrows between Alpriate and Alverca | as stated | CSJ-LP | yes |
| CSJ-LP: private guesthouses (residencial, pensão) take pilgrims | as stated | CSJ-LP | yes |
| CSJ-LP: Via Lusitana was formed in May 2010 and took on waymarking from Lisbon to Porto | May 2010 | CSJ-LP (the book gives only the association's own statutes, not this date) | removed |
| The book says Via Lusitana is the association that works on waymarking and upkeep of the Portuguese ways | as stated | VL /associacao/ ("Promover a sinalização e manutenção dos Caminhos Portugueses a Santiago") | yes |
| TAB-C: several railway crossings without barriers, much of the way parallel to railway lines; hotels, rural houses, fire stations, parish houses and youth hostels are the lodging south of Porto | as stated | TAB-C | yes |
| Via Lusitana: "Em Portugal estão disponíveis dois modelos oficiais da Credencial do Peregrino", the cathedral's and the association's, issued with the cathedral's authorisation; it can be requested through a form on the site | 2 models | VL /caminho-de-santiago/credencial/ | yes |
| Via Lusitana: stamps are usually obtained where you sleep, but also in churches, tourist offices and official bodies | as stated | VL /caminho-de-santiago/credencial/ | yes |
| Via Lusitana: at a hotel or guesthouse say you are a pilgrim and show the credencial, some give a discount; the hostel list may be momentarily out of date; some entries are "donativo" | as stated | VL /albergues/ | yes |
| Via Lusitana: in the last 100 km the credencial must be stamped twice a day | n/a | VL /caminho-de-santiago/credencial/ and /compostela/ (the Office's own pages say "at the start and end of each stage"; the book gives the Office's wording only) | removed |
| TCP-G: the credencial from Via Lusitana or the Associação Espaço Jacobeus, and also at the Sé of Lisbon and the Sé Nova and Sé Velha of Coimbra; some tourist offices stamp it | as stated | TCP-G (pages 7, 11 and 15) | yes |
| CSJ-LP: Credenciales in Lisbon at the cathedral and at a church near the Chiado, 2 euros each | price | CSJ-LP | removed |

## E. Wikipedia: history and places

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Lisbon Cathedral: built after the 1147 reconquest of the city, on the site of the main mosque, late Romanesque | 1147 | WP-LC https://en.wikipedia.org/wiki/Lisbon_Cathedral | yes |
| Parque das Nações: the district laid out in 1998 as the site of the World Exposition, in eastern Lisbon | 1998 | WP-PN https://en.wikipedia.org/wiki/Parque_das_Na%C3%A7%C3%B5es | yes |
| The Tagus is the longest river in the Iberian Peninsula | as stated | WP-TAGUS https://en.wikipedia.org/wiki/Tagus | yes |
| Vila Franca de Xira lies on both banks of the Tagus, ~32 km north-east of Lisbon; known for its bull-running festivals in July and October | ~32 km | WP-VFX https://en.wikipedia.org/wiki/Vila_Franca_de_Xira | yes |
| Azambuja: a municipality in the district of Lisbon, in the historical region of the Ribatejo | as stated | WP-AZ https://en.wikipedia.org/wiki/Azambuja | yes |
| Santarém: on a plateau on the right bank of the Tagus, ~65 km north-east of Lisbon; known as the "Capital of the Portuguese Gothic"; the old castle (Porta do Sol) is a park; the church of Graça holds the Gothic tomb of Pedro de Meneses and, under a plain slab near the main chapel, Pedro Álvares Cabral | ~65 km | WP-SANT https://en.wikipedia.org/wiki/Santar%C3%A9m,_Portugal | yes |
| Golegã: the National Horse Fair every November; the "Capital do Cavalo"; the church built in the early 16th century in Manueline style with a remarkable main portal | as stated | WP-GOL https://en.wikipedia.org/wiki/Goleg%C3%A3 | yes |
| Azinhaga, a parish of Golegã: José Saramago born there in 1922, Nobel Prize in Literature 1998 | 1922; 1998 | WP-GOL | yes |
| Tomar: the Templars received the land in 1159 and Gualdim Pais laid the first stone of the castle and convent in 1160; the Convent of Christ page says the Templar castle was founded in 1118 (the book says "in the twelfth century") | 12th century | WP-TOMAR https://en.wikipedia.org/wiki/Tomar; WP-COC https://en.wikipedia.org/wiki/Convent_of_Christ | yes |
| Convent of Christ: UNESCO World Heritage Site since 1983; the Charola built in the second half of the 12th century by the Templars | 1983 | WP-COC | yes |
| Pegões aqueduct built between 1503 and 1614, about 6 km long | ~6 km | WP-TOMAR | yes |
| Tomar's Festa dos Tabuleiros is held every four years, the most recent in June and July 2023; the next may fall in 2027 | every four years | WP-TOMAR (the 2027 is the book's own arithmetic, with "may") | computed |
| Alvaiázere: municipality in the district of Leiria; the name comes from an Arabic word meaning "the falconer" | as stated | WP-ALV https://en.wikipedia.org/wiki/Alvai%C3%A1zere | yes |
| Conímbriga: not the largest Roman city in Portugal but the best preserved; National Monument 1910; 16 km from Coimbra; a junction on the road that linked Olisipo (Lisbon) to Bracara Augusta (Braga); museum opened 1962; the House of Fountains has mosaics of hunting scenes with dogs | 1910; ~16 km; 1962 | WP-CON https://en.wikipedia.org/wiki/Con%C3%ADmbriga | yes |
| Coimbra: capital of Portugal from 1131 to 1255; the university founded as a Studium Generale in Lisbon in 1290 and permanently in Coimbra from 1537; UNESCO 2013; Baroque Joanina Library of the 18th century; the Old Cathedral begun in the 12th century; Queen Elizabeth's Gothic tomb moved to Santa Clara-a-Nova | 1131; 1255; 1290; 1537; 2013 | WP-COI https://en.wikipedia.org/wiki/Coimbra | yes |
| Wikipedia on the Bairrada: "well known for its vineyards and wine industry" | as stated | WP-AGU https://en.wikipedia.org/wiki/%C3%81gueda,_Portugal | yes |
| Oliveira de Azeméis: an important industrial centre, 35 km south of Porto, in the district of Aveiro | ~35 km | WP-OLI https://en.wikipedia.org/wiki/Oliveira_de_Azem%C3%A9is | yes |
| Dom Luís I Bridge: construction to 30 October 1886, the upper deck inaugurated the next day, the lower deck the following year; the upper deck for pedestrians and the metro, the lower for buses, taxis, cyclists and pedestrians; designed by Théophile Seyrig | 1886 | WP-DLI https://en.wikipedia.org/wiki/Dom_Lu%C3%ADs_I_Bridge | yes |
| Santiago cathedral: begun in 1075, Romanesque with later Gothic and Baroque additions; Obradoiro façade by Fernando de Casas Novoa, completed 1740; Pórtico da Gloria by Master Mateo, 1188; the Holy Door opened only in a Jacobean Holy Year; the botafumeiro used at all Pilgrims' Masses in Jubilee Years | 1075; 1740; 1188 | WP-CATH https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| Jacobean Holy Years occur when 25 July falls on a Sunday; the next are 2027, 2032 (and 2038) | 2027; 2032 | WP-HOLY https://en.wikipedia.org/wiki/Jacobean_Holy_Year | yes |
| The Xunta: the last stage Padrón to Santiago is 25.2 km; through the valley of the Sar and the Sanctuary of A Escravitude to O Milladoiro, the "humilladoiro" where pilgrims knelt on first seeing the cathedral; into the old quarter by A Porta Faxeira and O Franco Street; the traditional entrance for pilgrims on the Portuguese Route is through As Praterías Square | ~25 km | XUNTA-PS | yes |
| Pilgrims' Mass held in the cathedral (time not stated in the book) | as stated | WP-CATH | yes |
| Lisbon Airport lies seven kilometres north-east of the historic city centre, with a metro station at the terminal | ~7 km | WP-LAIR https://en.wikipedia.org/wiki/Lisbon_Airport | yes |

## F. The Pilgrim's Office, the credencial and the Compostela

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The credencial: official model of cardboard, sixteen concertina-folded pages, boxes for stamps; two practical purposes: access to the hostels of the Way and certification when applying for the Compostela | 16 pages | OP /en/pilgrimage/the-credencial/ | yes |
| A digital credential exists, an app | as stated | OP /en/pilgrimage/the-credencial/ | yes |
| Stamps normally collected where pilgrims sleep, and in parish churches, monasteries, cathedrals, hotels, town halls and other places | as stated | OP /en/pilgrimage/the-credencial/ | yes |
| Hostels without subsidies are maintained with contributions from pilgrims | as stated | OP /en/pilgrimage/the-credencial/ | yes |
| The Compostela rule: the Office's description of the Compostela as awarded to those who come to the tomb of the Apostle for religious and/or spiritual reasons, on foot, by bicycle or on horseback | as stated | SF; OP /en/the-compostela/ | yes |
| At least the last hundred kilometres on foot or on horseback, or the last two hundred by bicycle, shown by the credencial, stamped along the route | in words | SF; OP /en/the-compostela/ | yes |
| On foot or on horseback at least a hundred continuous kilometres on the same route to Santiago that the Office recognises; the final stage must include at least the last one leading into the Cathedral | in words | SF; OP /en/the-compostela/ | yes |
| The Way may be done in stages in chronological and geographical order; a pilgrim who walks only the minimum distance must get the credencial stamped at the start and end of each stage with the date | as stated | SF; OP /en/the-compostela/ | yes |
| A pilgrim who has already walked part of a recognised route outside Spain needs no less than seventy kilometres in Spain | in words | SF; OP /en/the-compostela/ | yes |
| The Cabildo reserves the right to grant the Compostela in special and exceptional cases | as stated | SF; OP /en/the-compostela/ | yes |
| The purpose: "with a Christian sentiment, even if it is only with an attitude of search"; the Certificate of Distance records the kilometres walked from wherever one started (the standard sentence, word for word) | as stated | SF; OP /en/pilgrimage/the-credencial/ and /en/pilgrimage/certificate-of-distance/ | yes |
| From Lisbon the road is ~620 km, far more than the last hundred kilometres (the book says no more about the arithmetic) | ~620 km | CAT | yes |
| Certificate of Distance: issued by the Chapter of the Cathedral, certifies the kilometres travelled whatever the starting point; shows the day and starting point, the kilometres, the day of arrival and the route; a price (not in the book) | as stated | OP /en/pilgrimage/certificate-of-distance/ | yes |
| The Office says its reception service and the Compostela are free | as stated | OP /en/pilgrimage/certificate-of-distance/ | yes |
| To collect the Compostela one takes a ticket with a QR code; in times of great influx same-day collection is not guaranteed | as stated | OP /en/the-compostela/ (footer) | yes |
| The Office's opening hours, the days it is closed, and the price of the certificate | n/a | OP footer | removed |
| The Office's English text of the Compostela ("an attitude of devotion or because of a vow or promise") | n/a | OP /en/the-compostela/ | removed |

## G. Climate, daylight, time, language, safety

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Lisbon (Instituto Geofísico D. Luís, 1991 to 2020): mean daily maximum January 15.1 °C, March 18.9, May 23.1, June 26.1, July 28.2, August 28.8, September 26.6 | ~15; ~19; ~23; ~26; ~28; ~29; ~27 °C | WP-LIS https://en.wikipedia.org/wiki/Lisbon (table read from the second part of the page) | yes |
| Lisbon rainfall: July 2.6 mm, August 5.4, September 38.6, October 110.6, November 133.9, January 103.8; year 793.6 mm | ~3; ~5; ~39; ~111; ~134; ~104; ~794 mm | WP-LIS | yes |
| Lisbon record high 44.0 °C, dated 4 August 2018 by the article's text | ~44 °C | WP-LIS | yes |
| Santarém (IPMA, 1991 to 2020): mean daily maximum July 30.8 °C, August 31.5; year 608.1 mm; Csa | ~31; ~32 °C; ~608 mm | WP-SANT | yes |
| Santarém record high given as 46.4 °C | n/a | WP-SANT (the summary was confused about the date; not used) | removed |
| Coimbra (IPMA, 1991 to 2020): July mean daily maximum 27.6 °C; record high 41.6 °C (1971 to 2020); year 866.1 mm | ~28 °C; ~41.6 °C; ~866 mm | WP-COI | yes |
| Porto Airport (1991 to 2020): July mean daily maximum 24.3 °C; April rainfall 95.5 mm; October 148.9; year 1,146.9 mm | ~24 °C; ~96; ~149; ~1,147 mm | WP-PORTO https://en.wikipedia.org/wiki/Porto | yes |
| Santiago de Compostela (city station, 1991 to 2020): mean daily maximum January 12.3 °C, July 24.8; October rainfall 214.0 mm, January 195.8; year 1,526.6 mm | ~12; ~25 °C; ~214; ~196; ~1,527 mm | WP-SCQ https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes |
| Frosts at Santiago common only from December to February, about 13 days a year; snow uncommon, 2 to 3 days | ~13; 2 to 3 | WP-SCQ | yes |
| TCP-G: spring and autumn are the most suitable times for the Caminhos de Santiago, since summer and winter can be very harsh ("rigorosos") | as stated | TCP-G (page 7) | yes |
| Confraternity: northern Portugal and Galicia a changeable maritime climate, westerly winds and generous rain; early autumn fairly dry and settled; spring a rewarding time; summer can be hot and humid and the peak holiday months crowded | as stated | CSJ | yes |
| Daylight: Lisbon 21 December sunrise 07:51, sunset 17:18, 9.5 h; 21 June sunrise 06:11, sunset 21:04, 14.9 h; Santiago 21 December 09:01 to 18:03, 9.0 h; 21 June 06:55 to 22:16, 15.4 h (local clocks) | ~9.5 h; ~15 h; ~9 h; about 08:00, 09:00, 17:20, 18:00, 21:05, 22:15 | SOLAR | computed |
| Continental Portugal uses Western European Time (UTC+0) and summer time (UTC+1) | as stated | WP-TPT https://en.wikipedia.org/wiki/Time_in_Portugal | yes |
| Peninsular Spain, Galicia included, uses Central European Time (UTC+1) and summer time (UTC+2), so Galicia is one hour ahead of Portugal | as stated | WP-TES https://en.wikipedia.org/wiki/Time_in_Spain | yes |
| TCP-G advice: begin walking five months before; a pack that should not exceed ten kilos; drink water regularly; stop ten minutes every two hours; use a hat and sun protection; walk by day, preferably in the morning, avoid the hottest hours, and shelter shortly before sunset until daybreak; pack a sleeping bag and slippers; wear light clothes in layers | five months; ten kilograms; ten minutes; two hours (in words) | TCP-G (page 7) | yes |
| Portugal and Spain both use the euro | as stated | books/camino-portugues-guide/facts.md (Portugal uses the euro, Spanish euro coins) | yes |
| Portuguese words: caminho, bom caminho, peregrino, albergue, carimbo, bom dia, obrigado/obrigada, albergaria; Galician grazas; Spanish gracias, sello, Buen Camino; leitão, donativo, Sé | as stated | standard vocabulary; books/shared-facts.md and the brand guideline for Buen Camino and sello; TCP-G and VL for albergaria, donativo, leitão | yes |
| In Galicia there are two official languages, Galician and Spanish | as stated | books/camino-portugues-guide/facts.md | yes |
| 112 is the European emergency number, in Portugal as in Spain | 112 | brand/BRAND_GUIDELINE.md section 9 ("112 in Spain and Portugal"); .claude/skills/book-writer/reference/voice-and-honesty.md | yes |
| IPMA's weather warnings and fire-risk index | n/a | Wikipedia's article on IPMA does not mention them and ipma.pt's warnings page could not be read; the book says only "the national weather services" | removed |
| Advice with no fact in it (shoes, socks, blisters, dormitory etiquette, bedbugs, hydration, shade, shoulders and traffic, heat, stopping, tell someone where you sleep, ask your host about diversions): prudent general advice in the voice file's terms, not a claim | advice | .claude/skills/book-writer/reference/voice-and-honesty.md | yes |
| Atalaia church built in 1526 (TCP-G) or 1528 (TCP-MT): the two official guides differ, and the book gives no year | n/a | TCP-G; TCP-MT | removed |
| Alvaiázere "capital of the chícharo" and the festival dates of Vila Franca de Xira (Colete Encarnado, July) | n/a | TAB-A only (Wikipedia's article on Vila Franca does not mention the festival) | removed |
