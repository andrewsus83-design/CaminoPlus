# Fact ledger: The Portuguese Way (camino-portugues-guide)

Working file, not published. One row per hard fact in the book. "Checked" says how: `yes` = the page or file was read in full or in the relevant part on 2026-11-08 (the date of writing); `yes (repo)` = read in this repository; `yes (Wikipedia)` = a single non-official source, attributed to Wikipedia in the text; `computed` = calculated, not looked up (flagged for the owner); `advice` = a piece of prudent advice, not a fact; `removed` = taken out of the book.

Source short names (full addresses are given in each row):

- XUNTA = Xunta de Galicia official portal caminodesantiago.gal (route page "The Portuguese Way" and its six stage pages, `?vid=V1`)
- OP = Oficina del Peregrino (Pilgrim's Reception Office of the Cathedral of Santiago), oficinadelperegrino.com
- CSJ = Confraternity of St James, csj.org.uk (page "Camino Portugués")
- WP = Wikipedia (English)
- CAT = tools/offline-maps/catalog/camino-portugues/NN.json (the CaminoPlus catalog, notes read 2026-11-08; the notes record the OpenStreetMap measurements of 2026-11-07 and the published figures "seen, not copied")
- SF = books/shared-facts.md

## A. Route, stages and distances

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The eleven stages and their order | Porto to Vilarinho; Vilarinho to Barcelos; Barcelos to Ponte de Lima; Ponte de Lima to Rubiães; Rubiães to Tui; Tui to O Porriño; O Porriño to Redondela; Redondela to Pontevedra; Pontevedra to Caldas de Reis; Caldas de Reis to Padrón; Padrón to Santiago de Compostela | supabase/migrations/20261113000000_camino_portugues_stages.sql; CAT 01..11.json | yes (repo) |
| Route row: Porto to Santiago de Compostela, ~240 km, stage count 12 | 240; 12 | supabase/migrations/20261106120000_more_caminos.sql (row camino-portugues) | yes (repo) |
| The catalog has eleven stages although the route row says twelve; division follows two published guides for Porto to Rubiães and the Xunta for Tui to Santiago; one tour operator counts twelve and cuts Porto to Barcelos into three days | 11; 12; 3 days | supabase/migrations/20261113000000_camino_portugues_stages.sql (comment); CAT 02.json (notes: tour operator "Oporto to Fajozes, Fajozes to Arcos, Arcos to Barcelos"; name not used in the book) | yes (repo) |
| The text does not say why the route row has twelve; it says only that published plans differ | not stated | as above (the migration comment does not give the reason) | yes (repo) |
| Stages of the Camino Portugués are hidden in the app today (is_published = false; no later migration publishes them) | not stated in the book | supabase/migrations/20261113000000_camino_portugues_stages.sql (comment and rows); grep of supabase/migrations 2026-11-08 | yes (repo); the book therefore has no "In the app: stage N" lines |
| Length Porto to Santiago, Confraternity of St James | circa 252 km; Lisbon to Santiago ~640 km | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Length from Porto, Wikipedia | 260 km from Porto (infobox and text); 620 km (infobox) or 610 km (text) from Lisbon | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Length of the Galician Way (Tui to Santiago), Xunta route page; difficulty "Medium-Low" | 118.8 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way | yes |
| Xunta Tui to O Porriño | 18.1 km; Low; 3 h 35 min; sections 7.7 + 4.5 + 5.9 = 18.1 km; each of the three sections is marked Medium-High (the page disagrees with itself) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1 | yes |
| Xunta O Porriño to Redondela | 16.4 km; Low; 3 h 10 min; sections 5.8 + 6.9 + 2.7 = 15.4 km (a kilometre less than the stage figure) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-o-porrino-redondela?vid=V1 | yes (sum computed) |
| Xunta Redondela to Pontevedra | 18.2 km; Medium; 4 h 35 min; sections 7.1 + 5.1 + 6.0 = 18.2 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-redondela-pontevedra?vid=V1 | yes |
| Xunta Pontevedra to Caldas de Reis | 22.9 km; Medium; 5 h 45 min; sections 5.3 + 6.4 + 6.3 + 4.8 = 22.8 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-pontevedra-caldas-de-reis?vid=V1 | yes |
| Xunta Caldas de Reis to Padrón | 18.8 km; Medium; 4 h 45 min; sections 5.9 + 6.4 + 6.5 = 18.8 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-caldas-de-reis-padron?vid=V1 | yes |
| Xunta Padrón to Santiago de Compostela | 25.2 km; Low; 5 h 00 min; sections 6.4 + 11.3 + 7.6 = 25.3 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-padron-santiago-de-compostela?vid=V1 | yes |
| The six Xunta stage figures add up to about 120 km, a little more than its route page's 118.8 | 18.1 + 16.4 + 18.2 + 22.9 + 18.8 + 25.2 = 119.6 km; "~119 km" and "~120 km" in the book | XUNTA (rows above) | computed |
| Xunta difficulty of the six stages: Low, Low, Medium, Medium, Medium, Low | as stated | XUNTA (rows above) | yes |
| Day 1 Porto to Vilarinho measured along the OpenStreetMap route (relation 12786090, ref CP, read through the OSM API on 2026-11-07 by the catalog author) | 27.4 km; published figures seen: 25.7 km and 27 km | CAT 01.json (notes) | yes (repo) |
| Day 2 Vilarinho to Barcelos, OSM route | 27.0 km; published figures seen: 25.7 km and 27.5 km | CAT 02.json (notes) | yes (repo) |
| Day 3 Barcelos to Ponte de Lima, OSM route | 34.0 km; published figures seen: 33.8 km and 35 km | CAT 03.json (notes) | yes (repo) |
| Day 4 Ponte de Lima to Rubiães, OSM route | 17.9 km; published figures seen: 17.9 km and 18 km | CAT 04.json (notes) | yes (repo) |
| Day 5 Rubiães to Tui, OSM route; Valença is 3.9 km before Tui on the OSM route | 20.6 km; ~4 km; one tour operator's Rubiães to Tui 19.1 km; Rubiães to Valença 16.3 km and 17 km in two guides; a guide's Valença to O Porriño 20.4 km | CAT 05.json and 06.json (notes) | yes (repo) |
| Day 6 Tui to O Porriño, OSM route | 17.3 km | CAT 06.json (notes) | yes (repo) |
| Day 7 O Porriño to Redondela, OSM route | 15.9 km; published figures seen 16.7 km and 16 km | CAT 07.json (notes) | yes (repo) |
| Day 8 Redondela to Pontevedra, OSM route; guides | 20.4 km; published figures seen 18.8 km and 18 km | CAT 08.json (notes) | yes (repo) |
| Day 9 Pontevedra to Caldas de Reis, OSM route; guides | 21.2 km; published figures seen 23.0 km and 23 km | CAT 09.json (notes) | yes (repo) |
| Day 10 Caldas de Reis to Padrón, OSM route; guides | 18.9 km; published figures seen 18.5 km and 18.5 km | CAT 10.json (notes) | yes (repo) |
| Day 11 Padrón to Santiago, OSM route; guides | 25.2 km; published figures seen 25.0 km and 25 km | CAT 11.json (notes) | yes (repo) |
| The Portuguese days (1 to 5) add up to about 127 km on the OSM route; the Galician days on the OSM route add up to about 119 km | 27.4 + 27.0 + 34.0 + 17.9 + 20.6 = 126.9 km; 17.3 + 15.9 + 20.4 + 21.2 + 18.9 + 25.2 = 118.9 km | CAT 01..11.json (notes) | computed |
| The eleven days in the book add up to ~246 km; average ~22 km a day | 127 + 119 = 246 km; 246 / 11 = 22.4 km | computed from the day figures in the book (Portuguese days on the OSM route, Galician days on the Xunta) | computed |
| The OSM route and the Xunta differ by no more than ~2.5 km on any Galician stage; the largest gap is Redondela to Pontevedra | 17.3 v 18.1; 15.9 v 16.4; 20.4 v 18.2; 21.2 v 22.9; 18.9 v 18.8; 25.2 v 25.2 (largest 2.2 km) | CAT 06..11.json (notes); XUNTA | computed |
| The Portuguese figures agree with published guides to within about 2 km | largest difference ~1.7 km (Day 1: 27.4 v 25.7) | CAT 01..05.json (notes) | computed |
| Start from Ponte de Lima: Days 4 to 11 | 18 + 21 + 18 + 16 + 18 + 23 + 19 + 25 = 158 km; eight days | day figures in the book | computed |
| Start from Tui: Days 6 to 11 | ~119 km (Xunta); six days | XUNTA (route page) | yes |
| Day 3, ~34 km, is the longest day of the book; days run from ~16 to ~34 km | 34; 16 | day figures in the book | computed |
| A milestone near the entrance to the old town of Tui reads 115.4 km to Santiago | ~115 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1 | yes |
| Wikipedia's figures for Tui or Valença to Santiago: "a 108 km walk to Santiago" from the Minho at Valença; a distance table with Tui at 107 km; "116 kilometres" in the Tui article | ~107 km; ~108 km; ~116 km | WP https://en.wikipedia.org/wiki/Portuguese_Way ; WP https://en.wikipedia.org/wiki/Tui,_Galicia | yes (Wikipedia) |
| Lisbon route ~620 km in the catalog; reaches Porto first | 620 | supabase/migrations/20261106120000_more_caminos.sql (row camino-portugues-lisboa); WP Portuguese Way | yes (repo) |
| Most pilgrims start in Porto but many walk from Lisbon | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Camino Francés ~773 km; crosses the Pyrenees, the Meseta and the mountains of León | ~773 km | supabase/migrations/20261106120000_more_caminos.sql; .claude/skills/book-writer/reference/guidebook.md (sections of the Francés) | yes (repo) |
| Santiago to Finisterre and Muxía ~90 km | ~90 km | books/series.md; supabase/migrations/20261106120000_more_caminos.sql | yes (repo) |
| The Coastal Way has its own book in the series ("The Coastal Way") | camino-portugues-costero-guide | books/series.md | yes (repo) |
| The Coastal Way goes from Porto to Santiago by the sea | as stated | books/series.md (row 3: "Porto to Santiago by the sea") | yes (repo) |
| Visit Portugal's stage list for Porto to Valença could not be read (anti-bot page); not used | n/a | https://www.visitportugal.com/pt-pt/destinos/porto-e-norte/229178 | removed |

## B. The Compostela, the credencial and the Pilgrim's Office

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Compostela is for those who come to the tomb of the Apostle for religious and/or spiritual reasons and follow the routes on foot, by bicycle or on horseback | as stated | SF (verified 8 Nov 2026); OP https://oficinadelperegrino.com/en/the-compostela/ | yes |
| At least the last hundred kilometres on foot or on horseback, or the last two hundred by bicycle, shown by the credencial, stamped along the route | 100 km; 200 km (in words in the book) | SF; OP https://oficinadelperegrino.com/en/the-compostela/ | yes |
| On foot or on horseback, at least a hundred continuous kilometres on the same route recognised by the Office; the final stage must include at least the last one leading into the Cathedral | 100 km | SF; OP (same page) | yes |
| The Way may be done in stages in chronological and geographical order; a pilgrim who walks only the minimum must get the credencial stamped at the start and end of each stage, with the date | as stated | SF; OP (same page) | yes |
| A pilgrim who has already walked part of a recognised route outside Spain needs no less than seventy kilometres in Spain | 70 km (in words) | SF; OP (same page) | yes |
| The Cabildo (the cathedral's governing council) reserves the right to grant the Compostela in special and exceptional cases | as stated | SF; OP (same page) | yes |
| From Porto the Spanish stretch (~119 km, Xunta) is more than seventy kilometres; all Tui-to-Santiago figures are more than a hundred kilometres; the book does not say that any start "works" and sends the reader to the Office | ~119 km v seventy | XUNTA (route page); SF | computed |
| The Compostela is a Latin document; the phrase devotionis affectu, voti vel pietatis; the Office's English text "with an attitude of devotion or because of a vow or promise" | quote | OP https://oficinadelperegrino.com/en/the-compostela/ | yes |
| A QR-code ticket is needed to collect the Compostela; in times of great influx same-day collection is not guaranteed | as stated | OP https://oficinadelperegrino.com/en/the-compostela/ | yes |
| The Office's reception service and the issuing of the Compostela are free; the certificate of distance has a fee (amount not stated in the book) | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/ | yes |
| Certificate of distance: issued by the Chapter, certifies the kilometres travelled whatever the starting point; shows the day and starting point, the kilometres, the day of arrival and the route | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/ | yes |
| The credencial: official model on cardboard, sixteen concertina-folded pages, with boxes for stamps | 16 pages | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Issued in person at the Office or at institutions authorised by the cathedral (parish churches, associations of friends of the Way, pilgrim hostels, confraternities); the Office lists distribution sites by country, region or city | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Two practical purposes: access to hostels offered by the Christian hospitality of the Way; certification when applying for the Compostela. "The Credencial does not generate any rights to the pilgrim" | quote | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Stamps are normally collected where pilgrims sleep, and in parish churches, monasteries, cathedrals, hotels, town halls and other places | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| The Office describes a digital credential, an app | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Hostels that receive no subsidies are maintained with contributions from pilgrims | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| The Catholic Monarchs founded the Royal Hospital in the 16th century in the building on the cathedral square (now a hotel since 1954); pilgrims showing the Compostela once had the right to stay three days free | 16th century; 1954; 3 days | OP https://oficinadelperegrino.com/en/the-compostela/ | yes; the hotel is not named in the book. Wikipedia (Santiago page) says 1492, so the book gives no founding date |
| Archbishop Diego Gelmírez (1100-1140) promoted the pilgrimage energetically in the early 12th century | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/introduction/ | yes |
| In 2025 the Portuguese Way was the second most walked route after the French Way, with 19%; most who received the certificate started in Tui (41%), Porto (26%) or Valença (18%); most finish from May to September | 19%; 41%; 26%; 18% | WP https://en.wikipedia.org/wiki/Portuguese_Way (citing oficinadelperegrino.com/en/statistics-2/, a dynamic page that could not be read) | yes (Wikipedia) |
| Reading of those figures: many join at or near the border, so Portugal may be quieter than Galicia (hedged in the book) | not a fact | derived from the row above | computed (flag for the owner) |

## C. History, legends and the road

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The route grew in importance from the 12th century, after Portugal's independence | 12th century | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way | yes |
| It follows ancient roads including Via XIX, built in the 1st century AD, linking Braga with Astorga via Ponte de Lima, Tui, Pontevedra, Santiago and Lugo | 1st century AD | XUNTA (route page) | yes |
| Elizabeth of Portugal, the "Holy Queen": 14th-century pilgrimage, offered her crown at the altar of St James, buried in Coimbra with a pilgrim's staff | 14th century | XUNTA (route page) | yes |
| Queen Isabel of Portugal, 1271 to 1336, canonised in the 17th century, made at least one pilgrimage | 1271-1336 | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Manuel I of Portugal made the pilgrimage from Lisbon to Santiago in 1502 | 1502 | XUNTA (route page) | yes |
| Portugal's north-south road network was organised around the pilgrimage | as stated | XUNTA (route page) | yes |
| In the 19th century, the century of the lowest influx of pilgrims, the Portuguese Way was the most active; more than 80% of foreign pilgrims were Portuguese | 80% | XUNTA (route page) | yes |
| The coastal variant crosses the Miño at A Guarda and meets the inland route at Redondela | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way (route page) | yes |
| The Coastal route leaves the Central route out of Porto and hugs the coast; from Redondela the route is the same | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| The Coastal Way splits from the Central way in the countryside of Vila do Conde | as stated | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Spiritual Variant: begins in Pontevedra, goes to Vilanova on the shores of the Sea of Arousa; a boat up the estuary to Pontecesures; the Central route to Santiago; described as relatively newly established | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Mar de Arousa and Río Ulla Route: a maritime and river itinerary commemorating the arrival of the body of the Apostle by sea; the body came into the Ría de Arousa and up the Ulla to Padrón, the river harbour of the Roman city of Iria Flavia, in a Stone Boat; about 25 km on foot to Santiago | ~25 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/the-mar-de-arousa-and-rio-ulla-route | yes |
| Yellow arrows are plentiful from Porto cathedral to the border thanks to the Associação dos Amigos do Caminho Português de Santiago; blue arrows beside them point back to Porto (the route from Santiago to Porto and Fátima); red and white GR11-E9 marks around Barcelos and north of Tui; in Galicia granite pillars give the distance to Santiago | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Terrain: secondary and minor roads, farm tracks and forests; the Central route follows a transport corridor and meets national roads, often at the entrance and exit of towns; major road works are still met and usually marked with a diversion; on roads, use the indicated strip between the road and the drainage ditch | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Both Central and Coastal routes spend their first day walking through the urban and industrial sprawl of Porto | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| The Portuguese Way passes the Cávado at Barcelos, the Lima at Ponte de Lima and the Minho at the border | as stated | WP https://en.wikipedia.org/wiki/Portuguese_Way; CAT 02, 03, 05 | yes |

## D. Places on the way

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Porto cathedral (Sé): present building begun in the second half of the 12th century, worked on until the 16th; Romanesque rose window, Baroque porch; King John I of Portugal married Philippa of Lancaster there in 1387 | 12th century; 16th century; 1387 | WP https://en.wikipedia.org/wiki/Porto_Cathedral | yes (Wikipedia) |
| The Caminho is waymarked from the Sé do Porto | as stated | CAT 01.json (notes); CSJ ("yellow arrows ... from the Cathedral at Porto") | yes |
| Day 1 waypoints: Moreira da Maia (the usual halfway point in published guides), Vilar de Pinheiro, Aldeia Nova; Vilarinho is a hamlet in Macieira da Maia, municipality of Vila do Conde; Portugal has many places of that name | as stated | CAT 01.json (notes) | yes (repo) |
| Day 2 waypoints: Arcos, São Pedro de Rates, Pedra Furada, Carvalhal, then Barcelos across the medieval bridge over the Cávado | as stated | CAT 02.json (notes) | yes (repo) |
| Rates: the Romanesque church, a national monument since 1910; rebuilding began around 1100 (c. 1096; in 1100 Count Henry invited Benedictine monks from La Charité-sur-Loire); among the oldest Romanesque churches in Portugal | 1910; ~1100 | WP https://en.wikipedia.org/wiki/Church_of_S%C3%A3o_Pedro_de_Rates | yes (Wikipedia) |
| Rates is considered a central site of the Portuguese Way, where pilgrims were most numerous; legend of Peter of Rates, first bishop of Braga ordained by St James in AD 44; the relics moved to Braga cathedral in 1552; the medieval Dom Zameiro bridge on the way to the monastery, (re)built in 1185, on a Roman road | AD 44; 1552; 1185 | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Barcelos is known for its "figurado" pottery (figurines of farmers, folk musicians and nativity scene characters) and belongs to UNESCO's Creative Cities Network as a Crafts and Folk Art City | as stated | WP https://en.wikipedia.org/wiki/Barcelos,_Portugal | yes (Wikipedia) |
| Barcelos: the Gothic bridge over the Cávado built 1325 to 1328; a stop for pilgrims since the Middle Ages; the Rooster of Barcelos legend (a Galician pilgrim wrongly accused, a roasted rooster crowed, the knot did not tighten, he raised a stone cross); the rooster often seen as a national symbol | 1325-1328 | WP https://en.wikipedia.org/wiki/Barcelos,_Portugal | yes (Wikipedia) |
| Day 3 waypoints: Lijó, Aborim, Balugães, Vitorino dos Piães, Facha, Correlhã; the pass of Portela de Tamel (named by a published guide); published guides split the day around the middle (Vitorino dos Piães) | as stated | CAT 03.json (notes) | yes (repo) |
| Ponte de Lima: the oldest vila (chartered town) in Portugal; first charter 4 March 1125 | 1125 | WP https://en.wikipedia.org/wiki/Ponte_de_Lima | yes (Wikipedia) |
| Ponte de Lima's bridge over the Lima possibly dates to the 1st century, rebuilt in 1125; the Labruja hills are "hard to cross" and one of the most tiring parts of the inland way | 1st century; 1125 | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Ponte de Lima lay on the Roman Via XIX, with a Roman stone bridge | as stated | WP https://en.wikipedia.org/wiki/Ponte_de_Lima; XUNTA (route page) | yes |
| The Lima was said in antiquity to cause loss of memory; Strabo compared it to Lethe; Roman soldiers feared crossing it in 136 BC | 136 BC | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Day 4 waypoints: Arcozelo, Labruja; Rubiães | as stated | CAT 04.json (notes) | yes (repo) |
| Ponte de Rubiães: a Roman bridge over the small river Coura, built in the 2nd century, part of the Portuguese Way | 2nd century | WP https://en.wikipedia.org/wiki/Ponte_de_Rubi%C3%A3es | yes (Wikipedia) |
| Day 5 waypoints: Cossourado, Fontoura, Arão, Valença; Valença ~4 km before Tui | as stated | CAT 05.json (notes) | yes (repo) |
| Valença: walled, left bank of the Minho; first walls 13th century, present bastions 17th and 18th centuries; two polygons on two small hills; main entrance the Porta do Sol; view across the river to Galicia; populated by Sancho I in the 12th century and called Contrasta, "village opposed to another" (Tui) | 13th; 17th-18th; 12th century | WP https://en.wikipedia.org/wiki/Valen%C3%A7a_(Portugal) | yes (Wikipedia) |
| Inside Valença's walls a Roman milestone marks the forty-second mile of the road from Braga to Tui | 42 Roman miles | WP https://en.wikipedia.org/wiki/Valen%C3%A7a_(Portugal) | yes (Wikipedia) |
| The route enters Galicia by the International Bridge between Valença and Tui across the Miño; the bridge carries a road and a railway | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1; WP https://en.wikipedia.org/wiki/Valen%C3%A7a_(Portugal) | yes |
| Portugal and Spain are Schengen signatories; normally no formalities at the crossing | as stated | WP https://en.wikipedia.org/wiki/Tui,_Galicia | yes (Wikipedia) |
| Tui: one of the seven capitals of the ancient Kingdom of Galicia; declared an area of artistic and historical importance in 1967; the cathedral of Santa María with Romanesque and Gothic elements | 1967 | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1 | yes |
| Tui cathedral 11th to 13th century, restored 15th to 19th; on top of the hill; Tui on the right bank of the Miño | 11th-13th century | WP https://en.wikipedia.org/wiki/Tui,_Galicia | yes (Wikipedia) |
| San Telmo (Peter González), a Dominican friar, patron of sailors, died in Tui on 15 April 1246 and is buried in the cathedral | 1246 | WP https://en.wikipedia.org/wiki/Peter_Gonzalez | yes (Wikipedia) |
| Day 6: leaves the old town to San Bartolomé Park (pre-Romanesque church); the chapel of A Virxe do Camiño; Paredes de Abaixo; the San Telmo bridge, also called As Febres; the wood A Ribeira; A Madanela; the Louro, which divides Tui and O Porriño; Orbenlle, with a choice by Os Eidos or As Gándaras; granite quarries, "pink granite", exported to the United States and Japan | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1 | yes |
| O Porriño's nearby sights: the Templete de la Red de San Luis (the former entrance structure of a Madrid underground station) and the fountain of O Cristo (1907) | 1907 | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-tui-o-porrino?vid=V1 | yes |
| O Porriño: an important industrial town with among the highest rates of demographic growth in the province of Pontevedra; architect Antonio Palacios, born 1874; Town Hall (1924) | 1874; 1924 | XUNTA (same page) | yes |
| Day 7: As Angustias chapel; the N-550 (watch for vehicles; a way that diverts to the right to avoid traffic); the Louro heard, hidden; A Rúa, once the municipal capital of Mos; a stone cross inscribed "Camino de Santiago" and a cross monument; O Enxertado, a slight climb to Santiaguiño de Anta chapel in an oak wood; a Roman milestone (1 Roman mile = 1,480 m) of Via XIX; Vilar de Infesta; pine and eucalyptus; Chan das Pipas ("legendary"); Saxamonde, Quintela, O Muro; Redondela entered at Ponteareas Square | 1,480 m | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-o-porrino-redondela?vid=V1 | yes |
| Redondela known as the "village of the viaducts" for two 19th-century railway viaducts | 19th century | WP https://en.wikipedia.org/wiki/Redondela,_Pontevedra | yes (Wikipedia) |
| Day 8: As Angustias chapel; parish of Cesantes; the Ría de Vigo on the left (east); islands of San Simón and San Antón; remains of galleons of the Battle of Rande (1702) beneath the water; the cable-stayed Rande Bridge above mussel farmers' rafts; O Viso; Arcade; the medieval Sampaio Bridge over the Verdugo, the Pontevedra municipality beginning at its midpoint; Ponte Sampaio; sections of the Roman Via XIX including the climb of the Brea Vella de A Canicouva; Santa Comba de Bértola, Tomeza; the Virxe Peregrina shrine | 1702 | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-redondela-pontevedra?vid=V1 | yes |
| The carrack Santa María, one of Columbus's ships, originally La Gallega ("The Galician"), was built in Pontevedra | as stated | WP https://en.wikipedia.org/wiki/Pontevedra | yes (Wikipedia) |
| Pontevedra: old town the second most important historic centre in Galicia after Santiago; pedestrianised centre; the circular Baroque church of the Pilgrim Virgin (18th century) with a scallop-shell floor plan; the medieval Burgo Bridge (12th century) with scallop shells in its arches | 18th century; 12th century | WP https://en.wikipedia.org/wiki/Pontevedra | yes (Wikipedia) |
| Day 9: leaves by A Santiña street after crossing the Lérez on O Burgo Bridge; the wetland A Xunqueira de Alba; between the railway and the Granda; Pontecabras and the church of Santa María de Alba; Diego Gelmírez stopped at Guxilde on his way from Braga to Compostela; woods of Reirís and Lombo da Maceira; a small stone bridge into the municipality of Barro; Valbón; three stone crosses (one with St James the Pilgrim looking north towards Compostela, the solitary Soutelo); the route meanders, the N-550 a constant presence, a new high-speed rail line has altered the landscape, pay close attention to signs; Tivo | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-pontevedra-caldas-de-reis?vid=V1 | yes |
| Caldas de Reis: the Aquae Celenis of the Antonine Itinerary, a 3rd-century document; the Umia and Bermaña; a bridge over the Umia leading to the hot spring that gave the town its name since Roman times; a medieval bridge over the Bermaña; the chapel of San Roque ends the stage | 3rd century | XUNTA (same page) | yes |
| Caldas de Reis appears in Ptolemy's Tables as Aquae calidae, "hot springs" | as stated | WP https://en.wikipedia.org/wiki/Caldas_de_Reis | yes (Wikipedia) |
| Day 10: Casalderrique, Casal de Eirigo, Valga, O Pino, Mount Castelo (dense woods, the Valga river, old mills); Cimadevilla, the bridge over the Fontenlo, Cedelo, Condide (Pontecesures); the Pino Manso viewpoint over the Ulla valley; the bridge over the Ulla, originally Roman, much changed, separating the provinces of Pontevedra and A Coruña; Padrón "home of the Jacobean tradition" | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-caldas-de-reis-padron?vid=V1 | yes |
| Padrón: the church of Santiago keeps O Pedrón, a Roman altar stone with a carved cross said to have been added by the disciples of St James | as stated | XUNTA (same page) | yes |
| According to tradition the disciples Theodore and Athanasius brought the body of St James in a stone boat from Jerusalem, moored to a pedrón; the legendary stone is in the parish church of Santiago de Padrón | as stated | WP https://en.wikipedia.org/wiki/Padr%C3%B3n | yes (Wikipedia) |
| Padrón has been home to four important writers, among them Rosalía de Castro (1837 to 1885) and Camilo José Cela (1916 to 2002, Nobel Prize) | 1837-1885; 1916-2002 | WP https://en.wikipedia.org/wiki/Padr%C3%B3n | yes (Wikipedia) |
| Padrón peppers, fried in olive oil and coarse salt; "uns pican e outros non" (some are hot and some are not); the heat varies from pepper to pepper | as stated | WP https://en.wikipedia.org/wiki/Padr%C3%B3n | yes (Wikipedia) |
| Day 11: leaves by Dolores Street, crosses the Sar to Iria Flavia, once a Roman city and an episcopal see until the 11th century; the foundation of Camilo José Cela (Nobel laureate), who is buried opposite; crosses the N-550 (a way to the right avoids traffic); the Sar valley; the sanctuary of A Escravitude with views of the valleys of Padrón; A Angueira de Suso, O Faramello, Rúa de Francos, Osebe; O Milladoiro, the "humilladoiro" where pilgrims knelt on first catching sight of the cathedral; A Rocha Vella and the Old Bridge over the Sar; two signed options at a fork, meeting at Rosalía de Castro Street; the old quarter by A Porta Faxeira and O Franco Street; the traditional entrance for pilgrims on the Portuguese Way is As Praterías Square | 11th century | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-padron-santiago-de-compostela?vid=V1 | yes |
| Santiago cathedral: the reputed burial place of St James; construction began 1075; Romanesque with later Gothic and Baroque additions; the Praterías façade built by Master Esteban in 1103; the Baroque Obradoiro façade completed by Fernando de Casas Novoa in 1740; the Pórtico da Gloria by Master Mateo, completion dated 1188 | 1075; 1103; 1740; 1188 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes (Wikipedia) |
| The Holy Door is opened only in a Jacobean Holy Year; the botafumeiro is swung on certain important religious holidays and at all the Pilgrims' Masses in Jubilee Years | as stated | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes (Wikipedia) |
| Jacobean Holy Years: 2021-2022, then 2027, then 2032 | 2027; 2032 | WP https://en.wikipedia.org/wiki/Jacobean_Holy_Year | yes (Wikipedia) |
| Santiago's old town inscribed as a UNESCO World Heritage Site in 1985; Santiago is the capital of Galicia in the province of A Coruña | 1985 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes (Wikipedia) |
| The cathedral holds a Pilgrims' Mass (time not stated in the book) | as stated | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes (Wikipedia) |
| Valença's food: lampreia à minhota (lamprey), cabrito (goat), bacalhau (salt cod), empanada (meat or fish pie) | as stated | WP https://en.wikipedia.org/wiki/Valen%C3%A7a_(Portugal) | yes (Wikipedia) |

## E. Climate and daylight

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| A changeable maritime climate; westerly winds bring generous rain, hence "Green Portugal" and "Green Spain"; low-pressure rain can be heavy and prolonged; spring cool with fresh growth; early autumn fairly dry and settled; summer hot with high humidity and crowded in the peak holiday months | as stated | CSJ https://www.csj.org.uk/camino-portugues | yes |
| Walking season March to October (infobox) | March-October | WP https://en.wikipedia.org/wiki/Portuguese_Way | yes (Wikipedia) |
| Porto airport (1991-2020, IPMA): mean daily maximum January 14.0 °C, May 20.3, June 22.7, July 24.3, August 24.8; mean daily minimum January 6.4 °C | ~14 °C; ~20 to ~23 °C; ~24 to ~25 °C; ~6 °C | WP https://en.wikipedia.org/wiki/Porto (climate table) | yes (Wikipedia) |
| Porto airport rainfall: January 151.0 mm, March 101.1, April 95.5, July 16.6, September 68.2, October 148.9, annual 1,146.9 mm | ~150; ~100; ~100; ~17; ~68; ~149 mm | WP https://en.wikipedia.org/wiki/Porto | yes (Wikipedia) |
| Porto airport record high 38.6 °C (August) | ~38.6 °C | WP https://en.wikipedia.org/wiki/Porto | yes (Wikipedia) |
| Santiago (1991-2020, AEMET): January high 12.3 °C, low 5.4; May 19.8, June 22.8, July 24.8, August 25.0 | ~12 °C; ~5 °C; ~20 to ~23 °C; ~25 °C | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes (Wikipedia) |
| Santiago rainfall: January 195.8 mm, March 139.9, April 130.0, July 30.6, September 88.6, October 214.0, annual 1,526.6 mm; the article's text says about 1,800 mm; wettest month October | ~196; ~140; ~130; ~31; ~89; ~214 mm; ~1,500 to ~1,800 mm | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes (Wikipedia) |
| Santiago airport record high 39.4 °C (July) | ~39.4 °C | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes (Wikipedia) |
| Frosts at Santiago are common only from December to February, about 13 days a year; snow uncommon, 2 to 3 days a year | 13; 2-3 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes (Wikipedia) |
| Porto's winters are mild and damp | as stated | WP https://en.wikipedia.org/wiki/Porto | yes (Wikipedia) |
| Daylight: about nine hours at the December solstice and about fifteen at the June solstice in Porto and Santiago | ~9 h; ~15 h | sunrise-sunset.org Porto (about 9 h 15 min on 21 December 2026, read through a web search summary); NOAA solar equations computed for both cities (Porto 9.2 h and 15.1 h; Santiago 9.0 h and 15.3 h) | yes (two sources; the second is computed) |
| Winter sun rises at about 08:00 in Porto and about 09:00 in Santiago; the June sun sets at about 21:10 in Porto and about 22:15 in Santiago; the December sun sets at about 17:10 in Porto and about 18:00 in Santiago (local clocks) | as stated | computed from the NOAA solar equations (Porto 21 Dec 07:56 to 17:08 WET, 21 Jun 06:01 to 21:10 WEST; Santiago 21 Dec 09:01 to 18:03 CET, 21 Jun 06:55 to 22:16 CEST); owner to confirm with a sun table | computed |
| Continental Portugal uses Western European Time (UTC+0) and Summer Time (UTC+1); peninsular Spain uses Central European Time (UTC+1) and Summer Time (UTC+2); so Galicia is one hour ahead of Portugal | as stated | WP https://en.wikipedia.org/wiki/Time_in_Portugal ; WP https://en.wikipedia.org/wiki/Time_in_Spain | yes (Wikipedia) |

## F. Getting there, money, language

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Porto airport (Francisco Sá Carneiro, OPO) is 11 km northwest of the centre of Porto, with a station on line E of the Porto Metro | ~11 km | WP https://en.wikipedia.org/wiki/Porto_Airport | yes (Wikipedia) |
| Santiago airport (SCQ) is 12 km east of the city | ~12 km | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Airport | yes (Wikipedia) |
| Flying in from the UK one can arrive in Lisbon, Porto, Vigo or Santiago; there is a regular bus service of about four hours between Santiago and Porto | ~4 h | CSJ https://www.csj.org.uk/camino-portugues | yes (timetable not stated; the book says to check) |
| Portugal uses the euro; Spanish euro coins | as stated | WP https://en.wikipedia.org/wiki/Portugal (currency); WP https://en.wikipedia.org/wiki/Santiago_de_Compostela (Spanish euro coins) | yes (Wikipedia) |
| Galicia has two official languages, Galician and Spanish; Portuguese is spoken in Portugal | as stated | WP https://en.wikipedia.org/wiki/Galicia_(Spain) | yes (Wikipedia) |
| Galician spellings of place names used in the book (O Porriño, A Escravitude, Pontevedra and others) | as stated | XUNTA stage pages | yes |
| Portuguese words: caminho (way, road), bom caminho, peregrino, albergue, carimbo (stamp), bom dia, obrigado / obrigada; Galician grazas; Spanish gracias, sello, Camino | as stated | standard vocabulary; Spanish "Buen Camino" and "sello" as in books/shared-facts.md and the brand guideline | yes (standard vocabulary) |
| 112 is the European emergency number, in Spain and Portugal | 112 | brand/BRAND_GUIDELINE.md section 9 ("112 in Spain and Portugal"); .claude/skills/book-writer/reference/voice-and-honesty.md | yes (repo) |
| Portuguese Way crosses five main rivers: not used (the Wikipedia count includes coastal crossings) | n/a | WP Portuguese Way | removed |

## G. Brand and repository statements

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CaminoPlus: the offline-first companion app for the Camino, with maps that work without signal, stays and cafes, a pilgrim passport with stamps, a journal and friends; the app is in development; the paid plan is Pilgrim Plus | as stated | README.md; .claude/skills/book-writer/reference/voice-and-honesty.md | yes (repo) |
| The book was written with AI assistance from public sources; the author has not walked the road | as stated | books/series.json (ai_disclosure); .claude/skills/book-writer/reference/voice-and-honesty.md | yes (repo) |

## H. Advice, not facts (no source needed, kept plain)

Break in shoes before you go; two pairs of socks; treat a hot spot at once; a rain jacket and pack cover, a spare pair of dry socks in a plastic bag; a hat, sun protection and water; start early and carry more water than you think you need on hot days; a head torch and earplugs for dorms; check mattress seams and keep the pack off the bed; walk facing traffic where there is no path; do not walk on main roads in the dark; stop in the shade and call 112 if dizzy and it does not pass; tell someone your plan; carry your passport or identity card; check diversions, closures and, in summer, heat and fire warnings; ask the Office, not a blog, about a start near the limit; get your first stamp before leaving Porto (the book says to ask where); carry the paper credencial. Marked `advice`.

## Not verified and left out

- Total ascent and altitudes of every stage, and the height of the Labruja ridge: no official figure was read; the only statement is Wikipedia's "hard to cross".
- Which towns have a hostel, a cafe or a shop, and any name, bed count, price, opening hour, phone number or coordinate: left out by the rules.
- The Cruz dos Franceses on Day 4 (named in the catalog notes from a published guide): its history rests on visitor and local pages only, so it is not in the book.
- The date of the International Bridge: Wikipedia's Tui article says completed 1878, its Valença article says agreed in 1879; left out.
- The Hostal dos Reis Católicos founding date: the Office says the 16th century, Wikipedia says 1492; the book gives no date and does not name the hotel.
- The Visit Portugal stage table for Porto to Valença: the page is behind an anti-bot check and could not be read; the Confraternity page "The route in Portugal" returned a server error (a total of ~232 km split ~117 + ~112 + ~3 turned up in a search summary only and is not used).
- Pilgrim Office statistics pages are dynamic and were not readable; the 2025 shares come through Wikipedia.
- The reason the app's route row says twelve stages: not stated in the repo; the book says only that published plans differ.
- Whether "As Gándaras" on Day 6 passes the Gándaras de Budiño nature reserve (named as a section in the Xunta list and as a point in the catalog): not stated by one source, so left out.
