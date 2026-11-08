# Fact ledger: The Coastal Way (camino-portugues-costero-guide)

Working file, not published. One row per hard fact in the book. "Checked" says how: `yes` = the page or file was read in full or in the relevant part on 2026-11-08 (the date of writing); `yes (repo)` = read in this repository; `yes (Wikipedia)` = a single non-official source, attributed to Wikipedia in the text; `yes (plan)` = a published walking plan (a private tour-planner page, not named in the book), attributed to "published plans"; `computed` = calculated from figures cited, not looked up (flagged for the owner); `advice` = a piece of prudent advice, not a fact; `removed` = taken out of the book, kept here as a record. A fact with no row here is not in the book.

Source short names (full addresses are given in each row or here):

- XUNTA-C = Xunta de Galicia, route page "The Portuguese Coastal Way", English https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-coastal-way and Spanish https://www.caminodesantiago.gal/es/planifica/las-rutas/camino-portugues-de-la-costa . The English pages read like translations and differ from the Spanish in places (noted in the rows); every figure and warning was checked in the Spanish original.
- XC-1 to XC-8 = the eight Xunta stage pages of that route, English `.../portuguese-coastal-way/stage-<slug>?vid=V1`, Spanish `.../camino-portugues-de-la-costa/etapa-<slug>?vid=V1` (slugs: a-guarda-oia XC-1, oia-baiona XC-2, baiona-vigo XC-3, vigo-redondela XC-4, redondela-pontevedra XC-5, pontevedra-caldas-de-reis XC-6, caldas-de-reis-padron XC-7, padron-santiago-de-compostela XC-8)
- XC-CEN = the four Xunta stage pages of the Central route for the shared days, https://www.caminodesantiago.gal/en/make-plans/the-ways/portuguese-way/stage-<slug>?vid=V1 (redondela-pontevedra, pontevedra-caldas-de-reis, caldas-de-reis-padron, padron-santiago-de-compostela)
- XAR = Xunta page "The Mar de Arousa and Río Ulla Route", https://www.caminodesantiago.gal/en/make-plans/the-ways/the-mar-de-arousa-and-rio-ulla-route (Spanish: https://www.caminodesantiago.gal/es/planifica/las-rutas/ruta-del-mar-de-arousa-y-rio-ulla)
- XPR = Xunta press release, April 2022, "A Xunta habilita unha embarcación para atravesar o Miño entre A Guarda e Caminha...", https://www.xunta.gal/hemeroteca/-/nova/145622/xunta-habilita-unha-embarcacion-para-atravesar-mino-entre-guarda-caminha-que
- PORT = Portaria n.º 67/2022, de 2 de fevereiro, Diário da República, 1.ª série, N.º 23, p. 3 (PDF read at https://www.cm-viana-castelo.pt/cmvianadocastelo/uploads/writer_file/document/2221/portaria67_2022.pdf ; the DRE page is https://diariodarepublica.pt/dr/detalhe/portaria/67-2022-178532521)
- TP = Turismo de Portugal, "Certificado o Caminho Português de Santiago - Caminho da Costa", https://business.turismodeportugal.pt/pt/Conhecer/programas-iniciativas/caminhos-da-fe/Paginas/certificado-caminho-portugues-santiago-caminho-costa.aspx
- TPN-EN / TPN-PT = Turismo do Porto e Norte de Portugal, http://www.portoenorte.pt/en/what-to-do/caminho-portugues-da-costa-portuguese-way-by-the-coast/ and http://portoenorte.pt/pt/o-que-fazer/caminho-portugues-a-santiago/
- CCP = official portal of the ten municipalities, https://www.caminhoportuguesdacosta.com/pt
- LEAF = official guide leaflet "Caminho Português da Costa, Guia do Caminho" (ten municipalities), PDF on the Visit Porto site, https://visitporto.travel/storage/01HRWDCK4YFGHYGTX62AX2WBFT.pdf (file created 13 September 2017 by its metadata). The leg distances are read from its schematic map (rendered and read by eye on 2026-11-08)
- VIANA = Câmara Municipal de Viana do Castelo, page "Caminho Português da Costa", https://www.cm-viana-castelo.pt/visite-viana/sentir-viana/caminho-portugues-da-costa (updated 22 April 2025)
- CERV = Câmara Municipal de Vila Nova de Cerveira, "Caminhos de Santiago", https://www.cm-vncerveira.pt/pages/215
- OP = Oficina del Peregrino (Pilgrim's Reception Office of the Cathedral of Santiago): https://oficinadelperegrino.com/en/the-compostela/ ; .../en/pilgrimage/the-credencial/ ; .../en/pilgrimage/certificate-of-distance/ ; .../en/pilgrimage/after-the-pilgrimage/ ; .../en/pilgrimage/planning/ (page names as on the site)
- CSJ = Confraternity of St James, page "Camino Portugués", https://www.csj.org.uk/camino-portugues (page says published 2 March 2020, updated 11 September 2025)
- WP = Wikipedia (English), article named in the row
- VAGA = a published walking plan, https://www.vagamundos.pt/caminho-portugues-da-costa-guia/ (13 stages, Portuguese; read in full)
- VIAJE = a published walking plan (a tour planner's product pages), https://viajecaminodesantiago.com/en/portuguese-way-along-the-coast-from-porto-to-a-guarda/ (stage table of the 5-stage Porto to A Guarda plan, and the list of its other itineraries)
- SF = books/shared-facts.md (the Compostela rule, the purpose sentence, the welcome sentence)
- CAT = supabase/migrations/20261106120000_more_caminos.sql and 20261104150200_routes_maps.sql

Not read: the Visit Portugal pages (visitportugal.com) sit behind an anti-bot check and could not be fetched; nothing in the book rests on them. The Visit Porto page on the Coastal Way showed only the home page to a plain fetch.

## A. The route, its length and its stages

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route row: Camino Portugues Costero (Coastal), Porto to Santiago de Compostela, countries PT and ES, distance_km 260, stage_count empty, difficulty 2 | ~260 km; 2 | CAT (row camino-portugues-costero) | yes (repo) |
| Difficulty scale of the catalog is 1 to 5 | 1 to 5 | CAT routes_maps migration (check between 1 and 5) | yes (repo) |
| The catalog has no stage rows or stage files for this route, so the book has no "In the app: stage N" lines | n/a | grep of supabase/migrations and tools/offline-maps (2026-11-08); .claude/skills/book-writer/reference/guidebook.md | yes (repo) |
| Welcome sentence, word for word | standard sentence | SF | yes (repo) |
| Names: Coastal Way; Caminho Português da Costa; Camino Portugués de la Costa; the catalog says Costero | names | XUNTA-C (Spanish title); PORT ("Caminho Português de Santiago — Caminho da Costa"); CCP; CAT | yes |
| The twelve days: Porto to Vila do Conde, Vila do Conde to Esposende, Esposende to Viana do Castelo, Viana do Castelo to Caminha, Caminha to Oia, Oia to Baiona, Baiona to Vigo, Vigo to Redondela, Redondela to Pontevedra, Pontevedra to Caldas de Reis, Caldas de Reis to Padrón, Padrón to Santiago | 12 days | the four Portuguese legs follow LEAF (Porto, Vila do Conde, Marinhas, Viana do Castelo, Caminha); Days 5 to 12 follow the eight Xunta stages XC-1 to XC-8 | computed (the grouping is this book's) |
| The list of the twelve days with rounded figures (29, 27, 26, 27, 17, 19, 27, 16, 18, 23, 19, 25 = 273, a kilometre more than the 272.4 total) | 273 vs 272.4 | LEAF; XC-1 to XC-8 | computed |
| The twelve days add up to ~272 km on foot, plus the boat | 29 + 27 + 26 + 27 = 109 (LEAF 29, 27.3, 26, 27 = 109.3) ; XUNTA-C 163.1 ; total 272.4 | LEAF; XUNTA-C | computed |
| Xunta: the coastal route in Galicia enters at A Guarda "after crossing the mouth of the River Miño", goes by Oia, Baiona and Vigo, and joins the Portuguese Way at Redondela ("After Vigo the route joins the Portuguese Way at Redondela") | A Guarda; Redondela | XUNTA-C (English and Spanish: "tras cruzar el río Miño en su desembocadura"; "tras Vigo el camino se une con el Camino Portugués en Redondela") | yes |
| The last four days (Redondela to Santiago) are the same road as the Central route | 4 stages | XUNTA-C stage list (Redondela, Arcade, Pontevedra, Caldas de Reis, Padrón, Santiago) and XC-5 to XC-8; XC-4 text "meets up with the inland Portuguese Route" | yes |
| Wikipedia: the Portuguese Way is ~260 km from Porto | 260 km | WP Portuguese_Way (infobox and text) | yes (Wikipedia) |
| Xunta: length of the Galician coastal route, A Guarda to Santiago; difficulty Medium-Low | 163.1 km; Media-Baja | XUNTA-C (English "Length 163.1 Km Difficulty Medium-Low"; Spanish "Longitud 163,1 Km Dificultad Media-Baja") | yes |
| The Xunta's eight stages sum to its route figure | 16.7 + 18.6 + 26.8 + 16.3 + 18.2 + 23 + 18.7 + 24.8 = 163.1 | XC-1 to XC-8 (stage headers) | computed |
| The leaflet's Galician legs: A Guarda to Mougás 24; Mougás to A Ramallosa 17; A Ramallosa to Freixo 18; Freixo to Redondela 23; then Redondela to Pontevedra 20, Pontevedra to Caldas de Reis 21, Caldas de Reis to Padrón 18, Padrón to Santiago 25: sum from A Guarda ~166 km | 82 + 84 = 166 | LEAF (schematic map) | computed |
| One published plan counts the road from A Guarda to Santiago at ~151 km (8 stages), from Baiona ~122 km (6 stages), from Vigo ~99 km (5 stages) and the whole road from Porto at ~271 km (13 stages) | 151; 122; 99; 271 | VIAJE (list of itineraries on the page) | yes (plan) |
| Portuguese state: the certified route is 138 km, through Porto, Matosinhos, Maia, Vila do Conde, Póvoa de Varzim, Esposende, Viana do Castelo, Caminha, Vila Nova de Cerveira and Valença | 138 km; 10 municipalities | PORT (first paragraph); portugal.gov.pt news of 2 February 2022 https://portugal.gov.pt/gc22/comunicacao/noticias/assinada-portaria-que-certifica-o-caminho-da-costa | yes |
| Turismo de Portugal: 137.9 km, 9 stages, Porto to the Galician border at Valença, on foot, by bicycle, on horseback | 137.9 km; 9 | TP | yes |
| Official portal of the ten municipalities: 149.5 km; average duration 7 days; difficulty Média-Baixa; 10 municipalities | 149.5 km; 7 days; Medium-Low | CCP (home page: "Duração média 7 dias, 149,5 km, Dificuldade Média-Baixa") | yes |
| Leaflet legs in Portugal: Porto to Vila do Conde 29; Vila do Conde to Marinhas 27.3; Marinhas to Viana do Castelo 26; Viana do Castelo to Caminha 27; Caminha to Vila Nova de Cerveira 16; Vila Nova de Cerveira to Valença 16; Caminha to A Guarda 4 | 29; 27.3; 26; 27; 16; 16; 4 km | LEAF (schematic map, rendered at 220 dpi and read by eye) | yes |
| Porto to Caminha by the leaflet ~109 km; to Valença ~141 km; the three official figures for Porto to Valença are ~138, ~141 and ~149.5 km | 109.3; 141.3 | LEAF; PORT; CCP | computed |
| Published plans put the whole road at ~271 to ~280 km | 271 (13 stages); "sensivelmente 280 km" (13 stages) | VIAJE; VAGA | yes (plan) |
| The leaflet is an official guide of the ten municipalities, its file dates from 2017 | created 2017-09-13 | LEAF (PDF metadata, pdfinfo) | yes |
| The text says that no official Portuguese stage table could be read; the Portuguese figures are the least certain | not stated by any source | VIANA (no table); CCP (planner is script-driven); TP, PORT (totals only) | yes |

## B. History, certification and who walks it

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The coast route partly follows the Via Veteris, named in the Inquirições of 1258 (royal inquiries), for centuries the chief link between Porto and Vila do Conde | 1258 | PORT ("coincide parcialmente com a Via Veteris, referida nas Inquirições de 1258, que constituiu, durante séculos, a mais importante ligação entre o Porto e Vila do Conde") | yes |
| North of Vila do Conde a very old road network is proven on the coastal plain, but pilgrims' use of the route gains prominence only from the 18th century | 18th century | PORT ("só ganha projeção a partir do século XVIII") | yes |
| The official portal and TPN say the road gained relevance in the modern age, above all from the 18th century, used by coastal populations and those who landed in the ports | 18th century | CCP; TPN-EN; TPN-PT; CERV; VIANA | yes |
| Wikipedia: the Coastal Way gained prominence in the 15th century, with the Age of Discovery | 15th century | WP Portuguese_Way (section "Ave river crossing") | yes (Wikipedia) |
| The Municipality of Viana calls the Coastal Way a derivation of the Central Way, an alternative link to Galicia | quoted idea | VIANA | yes |
| Certified February 2022 (Portaria 67/2022, 2 February); the third certification of the process begun in 2019; renewed in 2025 | Feb 2022; third; 2025 | TP; PORT | yes |
| Xunta: the other name, the Monastic Route ("Camino monacal"), comes from the monastery of Oia | name | XC-1 (Portecelo to Oia section; Spanish "el 'Camino monacal'") | yes |
| Wikipedia, Office statistics 2025: the Portuguese coastal route third most walked, 17%; those who received the Compostela on it started in Porto 51%, Vigo 21%, Baiona 12%; of all who started in Porto, 55% went via Tui and 45% via Vigo; most finish in May and September | 17%; 51/21/12; 55/45 | WP Portuguese_Way (section "Statistics", citing the Office's statistics page, retrieved 2026-01-02) | yes (Wikipedia) |
| A third of those who finish the Coastal route started in Vigo or Baiona | 21 + 12 = 33% | WP Portuguese_Way | computed |
| CSJ: the Coastal route follows the Central out of Porto to Padrão da Légua, then branches to Vila do Conde | place name | CSJ ("follows the same route out of Porto till Padrao de Legua where it branches off to the Vila de Conde") | yes |
| Wikipedia: the route splits from the Central way in the countryside of Vila do Conde | quoted | WP Portuguese_Way (section "Ave river crossing") | yes (Wikipedia) |
| TPN: Valença is the meeting point of the Central and Coastal routes | quoted idea | TPN-PT ("Valença é ponto de confluência do Caminho Central Português e da Costa") | yes |
| Redondela to Santiago ~85 km | 18.2 + 23 + 18.7 + 24.8 = 84.7 (Central pages 85.1) | XC-5 to XC-8; XC-CEN | computed |

## C. What the road is like

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Wikipedia: a seaside version follows beach boardwalks; a picture caption gives a way of 1.5 km over the dunes at Ofir, Esposende; a pine forest at Fão; a boardwalk at Santo André, Póvoa de Varzim | ~1.5 km | WP Portuguese_Way (section "The beach boardwalks", captions) | yes (Wikipedia) |
| CSJ: the coastal route "presents an interesting if undulating journey" because several rivers are crossed; mixed farms and smallholdings with pine and eucalyptus | quoted | CSJ (section Terrain) | yes |
| Xunta describes the coast beyond A Guarda as sheer and wild ("escarpada y agreste"), Cape Silleiro, the Ría de Vigo; mussel rafts at Rande | description | XUNTA-C; XC-2; XC-5 | yes |
| Xunta stage ratings: A Guarda-Oia Low; Oia-Baiona Low; Baiona-Vigo Low; Vigo-Redondela Low; Redondela-Pontevedra Medium; Pontevedra-Caldas de Reis Medium; Caldas de Reis-Padrón Medium; Padrón-Santiago Low (five Low, three Medium) | 5 + 3 | XC-1 to XC-8 (Spanish: Baja, Baja, Baja, Baja, Media, Media, Media, Baja) | yes |
| Xunta: Portecelo to Oia is flat with hardly any shade; the sea breeze lessens the summer sun (the first section, A Guarda to Portecelo, 10.8 km, is rated Medium-High) | flat; little shade | XC-1 (Spanish "llano y con apenas sombras... La brisa marina suavizará los rigores del sol en verano"; "Media-Alta") | yes |
| Xunta names the regional road 550 (C-550) as a constant presence (stated in the A Ramallosa to Nigrán section of Baiona to Vigo) | C-550 | XC-3 (Spanish "La carretera comarcal 550 será presencia constante en toda nuestra ruta") | yes |
| CSJ: the coast is a popular holiday area, crowded in summer, with pressure on services and accommodation | quoted idea | CSJ (section Waymarking) | yes |
| Pointer: the Original Way climbs through the mountains of Asturias; the French Way crosses the Pyrenees and the Meseta; The Northern Way ~820 km; Finisterre and Muxía ~90 km; The Portuguese Way is the Central route; *To the End of the Earth* is the Finisterre book | series facts | books/series.md; books/camino-primitivo-guide/chapters/00-welcome.md; books/camino-portugues-guide/chapters/02-is-this-camino-for-you.md; CAT | yes (repo) |
| The app's route notes call wind and sun the main challenge (not used in the text; the book cites Wikipedia, the Xunta and the CSJ for wind and sun) | n/a | mobile/src/data/routeGuide.ts (camino-portugues-costero) | removed |

## D. Days 1 to 4 (Portugal)

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CSJ: Central and Coastal routes both spend the first day in the urban and industrial sprawl of Porto; both start at the cathedral | quoted idea | CSJ | yes |
| Leça do Balio monastery, 1180, in Matosinhos, known for assisting pilgrims | 1180 | WP Portuguese_Way (section "Ave river crossing") | yes (Wikipedia) |
| The certification text names the monasteries of Leça do Balio and Moreira da Maia among the testimonies of pilgrimage and worship along the route | names | PORT | yes |
| Published plans for Day 1: Porto to Labruge ~25 km; Porto to Póvoa de Varzim ~37 km (VIAJE) and ~40.5 km (25 + 15.5) (VAGA) | 25; 37; 40.5 | VAGA (1.ª etapa 25 km, 2.ª 15,5 km); VIAJE (Stage 1 Oporto-Póvoa 37 km) | yes (plan) |
| Monastery of Santa Clara, Vila do Conde, founded 1318 | 1318 | WP Vila_do_Conde | yes (Wikipedia) |
| Church of Azurara rebuilt in 1502 to commemorate Manuel I's pilgrimage | 1502 | WP Portuguese_Way (section "Ave river crossing") | yes (Wikipedia) |
| Póvoa de Varzim: small chapel of St James, 1582, on the square; 18th-century fishermen's quarter | 1582 | WP Portuguese_Way | yes (Wikipedia) |
| Póvoa de Varzim: on 27 February 1892 seven *lanchas poveiras* wrecked in a storm just off the shore, 105 fishermen killed; fishermen of the region known to fish off Newfoundland since at least 1506 | 1892; 105; 1506 | WP Póvoa_de_Varzim (section "Shipbuilders, seafarers and fishermen") | yes (Wikipedia) |
| Esposende: crossing of the Cávado at Fão on a bridge of 1892 that replaced the barges from Barca do Lago | 1892 | WP Portuguese_Way (section "Cávado river crossing") | yes (Wikipedia) |
| Published plans: Póvoa de Varzim to Esposende ~21 km; Póvoa de Varzim to Marinhas ~24.5 km | 21; 24.5 | VIAJE (Stage 2); VAGA (3.ª etapa) | yes (plan) |
| The leaflet's stop is Marinhas, in the municipality of Esposende, a little beyond the town (the leaflet's hostel list places Marinhas under Esposende; on its map Esposende lies before Marinhas) | place | LEAF | yes |
| Castelo de Neiva: church of St James consecrated in the 9th century (certification text); the oldest consecrated to the apostle outside Spanish territory (Viana) | 9th century | PORT ("Igreja de São Tiago em Castelo de Neiva, sagrada no século IX"); VIANA ("a mais antiga consagrada ao apóstolo, fora do território espanhol") | yes |
| Published plans for Day 3: Marinhas to Viana do Castelo ~21 km (VAGA); Esposende to Viana ~24 km (VIAJE) | 21; 24 | VAGA (4.ª etapa); VIAJE (Stage 3) | yes (plan) |
| Viana do Castelo: Eiffel bridge over the Lima; the railway reached the town in 1878, bridge designed by Gustave Eiffel; the Municipality says the pilgrim reaches Viana across the Eiffel bridge | 1878 | WP Viana_do_Castelo (history); VIANA ("do outro lado da ponte Eiffel") | yes |
| Viana: the Hospital Velho, a medieval pilgrims' hostel | named | VIANA ("Hospital Velho, medievo albergue de peregrinos"); PORT also names the Hospital Velho and the Misericórdia | yes |
| Viana: sanctuary of Santa Luzia, construction began 1904 | 1904 | WP Viana_do_Castelo | yes (Wikipedia) |
| Viana to Caminha: the way through Areosa, Carreço, carved rocks, farm buildings, churches, chapels, *alminhas* and crosses, Afife, the convent of Cabanas and the old Cividade of Afife, where Viana's part ends | places | VIANA (section "O Caminho Português da Costa no concelho de Viana do Castelo") | yes |
| The Cividade (Cividade de Âncora, also called Cividade de Afife) is an archaeological site of the Castro culture, built in the Iron Age and occupied up to Roman times | Iron Age | WP Cividade_de_Âncora | yes (Wikipedia) |
| Day 4: ~27 km on the leaflet and on one published plan (VAGA, 5.ª etapa 27 km); another plan stops at Vila Praia de Âncora, ~19 km from Viana | 27; 19 | LEAF; VAGA; VIAJE (Stage 4 Viana-Vila Praia de Ancora 19 km) | yes (plan) |
| Caminha: on the Minho estuary ~2 km from the Atlantic; the old keep became the clock tower in the 17th century; the Mother Church dates from the 16th century; the estuaries of the Minho and Coura form a protected landscape (wetlands, sandbanks, reed beds, birds, above all in winter) | 2 km; 17th; 16th | WP Caminha (sections history, geography, main sights, nature) | yes (Wikipedia) |

## E. Days 5 to 12 (the Xunta's stages)

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The crossing: Xunta says the route enters at A Pasaxe (A Guarda), "Hemos despedido Portugal en Caminha"; CSJ "with a boat across the estuary"; Wikipedia "the ferryboat in Caminha heads to A Guarda" | boat | XC-1; CSJ; WP Portuguese_Way (section "Minho river crossing") | yes |
| April 2022: the Xunta announced a boat service for pilgrims and residents between A Guarda and Caminha, two boats (one electric), a dedicated electric boat (12 passengers) from July; the book does not name the service and says it cannot say whether a boat runs on a given day | April 2022 | XPR (image path "Novas/2022/Abril"; text "nesta Semana Santa"; "a partir de xullo") | yes |
| Day 5, A Guarda to Oia | 16.7 km; Low; 3 h 20 min; A Guarda-Portecelo 10.8 km Medium-High; Portecelo-Oia 5.9 km Low | XC-1 | yes |
| The leaflet puts the stop at Mougás, a little beyond Oia, 24 km from A Guarda | 24 km | LEAF | yes |
| A Guarda grew under Mount Santa Tegra (Santa Trega), a viewpoint over the Atlantic and Portugal and a pre-Roman fortified settlement, occupied from the 1st century BC to the 1st century AD; National Historic-Artistic Monument 1931; petroglyphs on the hill's stones | 1931; 1st c. BC to 1st c. AD | XUNTA-C; XC-1 (Spanish: "entre los siglos I a. de C. y I d. de C."; "Monumento Histórico-Artístico Nacional en 1931") | yes |
| The Miño estuary is especially attractive at low tide and at sunset, with rushes, cormorants and ducks (anátidas) on the marsh | description | XC-1 (Spanish "juncos, cormoranes y anátidas sobre la marisma") | yes |
| Monastery of Santa María de Oia on the shore: Cistercian front of the late 12th century; baroque altarpieces; mid-18th century the monks foiled an attack by the Turkish fleet; "en fase de rehabilitación" (being restored) | late 12th c.; mid-18th c. | XC-1 (Spanish); XUNTA-C | yes |
| Day 6, Oia to Baiona; Oia is a fishing village ("pueblo marinero") | 18.6 km; Low; 3 h 45 min; Oia-Silleiro 13.8; Silleiro-Baiona 4.8 | XC-2 | yes |
| Cape Silleiro lighthouse opened 1866, the south end of the Ría de Vigo and the chief landmark for ships; the climb to Baredo by the old royal path (vereda real) | 1866 | XC-2 (Spanish: "faro inaugurado en 1866, extremo sur de la ría de Vigo y punto principal de orientación de los navíos"; "vieja vereda real") | yes |
| Castle of Monterreal repelled Francis Drake, who landed in 1585; a path circles it by the sea; it is a hotel today (the book does not name the hotel) | 1585 | XC-2 (Spanish) | yes |
| Baiona: on 1 March 1493 the first port in Europe to learn of the discovery of America, via the caravel La Pinta, captain Martín Alonso Pinzón; the Cíes Islands, heart of the Illas Atlánticas National Park, are visitable by boat from Baiona | 1 March 1493 | XC-2; XUNTA-C | yes |
| Day 7, Baiona to Vigo | 26.8 km; Low; 5 h 25 min; sections 4.8 + 4.2 + 9 + 8.9 (= 26.9) | XC-3 | yes |
| The fountain of O Pombal; Romanesque bridges over the Groba (Sabarís) and at A Ramallosa (ten arches, possibly on a Roman one); the mouth of the Miñor river, a marsh of great ecological richness | ten arches | XC-3 (Spanish) | yes |
| Nigrán: country houses (pazos), stone crosses; Panxón: Templo Votivo do Mar by the architect Antonio Palacios; fine white sand beaches and a mild climate most of the year | names | XC-3 (Spanish: "clima benigno casi todo el año") | yes |
| The way into Vigo: the Lagares river path from Samil beach, with wetlands; an alternative through Coia, closer to tradition but "deturpada" (spoilt, marred) by housing developments and heavy traffic (the English page says "interrupted") | description | XC-3 (Spanish "deturpada por las grandes urbanizaciones y el exceso de tráfico") | yes |
| Vigo: Galicia's largest city, close to 300,000 inhabitants, over 500,000 in the metropolitan area, a fishing and container port | ~300,000 | XC-3 | yes |
| Day 8, Vigo to Redondela | 16.3 km; Low; 3 h 10 min; Vigo-Teis 5.7; Teis-Redondela 10.1 | XC-4 | yes |
| Vigo: Paseo de Alfonso XII by the olive tree, symbol of the city; a surviving stretch of the old entrance to the walled town; O Berbés; A Pedra known for restaurants and the oysters of the ría; the Salinae site, an underground museum of Roman saltworks | names | XC-4 (Spanish) | yes |
| Redondela: railway viaducts of the 1870s; church of Santiago consecrated by Archbishop Gelmírez in 1114; Festa do Choco (cuttlefish) each May | 1870s; 1114 | XC-4 (Spanish "década de 1870 a 1880"; "1114"; "Cada mes de mayo") | yes |
| Day 9, Redondela to Pontevedra | 18.2 km; Medium; 4 h 35 min (Central page: 18.2, Medium, 4 h 35 min) | XC-5; XC-CEN | yes |
| The ría on the walker's left: the Spanish page says "A nuestra izquierda, al oeste"; the English page says "On the left, to the east" | west | XC-5 (Spanish and English compared) | yes |
| Islands of San Simón and San Antón; the galleons of the Battle of Rande (1702) under the water; Rande Bridge above the mussel rafts (bateas); chapel of As Angustias; parish of Cesantes | 1702 | XC-5 (Spanish) | yes |
| Arcade: the medieval Sampaio Bridge over the Verdugo; the municipality of Pontevedra begins mid-bridge; sections of the Roman road Via XIX (climb of A Brea Vella de A Canicouva) | names | XC-5 (Spanish) | yes |
| Arrival in Pontevedra past the shrine of the Virxe Peregrina to the historic centre | names | XC-5 | yes |
| The Portuguese Way book suggests Pontevedra for a rest day | pointer | books/camino-portugues-guide/chapters/09-other-ways-to-split-and-the-compostela-rule.md and 10-sleeping-eating-resting.md | yes (repo) |
| Day 10, Pontevedra to Caldas de Reis | 23 km (sections 22.8); Medium; 5 h 45 min (Central page 22.9) | XC-6; XC-CEN | yes |
| Bridge of O Burgo over the Lérez; the wetland of A Xunqueira de Alba; three stone crosses, one with St James the Pilgrim looking north; attention to signs because of the N-550 and the new high-speed railway | names | XC-6 (Spanish "N-550, siempre presente, y la nueva vía férrea de la alta velocidad, que ha alterado el paisaje") | yes |
| Caldas de Reis: spa town, the Aquae Celenis of the Antonine Itinerary (3rd-century document of the routes of the Roman Empire), hot spring that gives the town its name; a medieval bridge over the Bermaña | 3rd century | XC-6 | yes |
| Day 11, Caldas de Reis to Padrón | 18.7 km; Medium; 4 h 45 min (Central page 18.8) | XC-7; XC-CEN | yes |
| Leaves Caldas by the N-550 then a path; Santa Mariña de Carracedo; Valga woods and old mills | names | XC-7 | yes |
| Pontecesures: the bridge over the Ulla, Roman in origin and much changed, separates the provinces of Pontevedra and A Coruña; Padrón, "cuna de la tradición jacobea"; the church of Santiago keeps O Pedrón, a Roman altar stone to which a carved cross is said to have been added by the disciples of St James | names | XC-7 (Spanish) | yes |
| Day 12, Padrón to Santiago | 24.8 km; Low; 5 h 00 min (Central page 25.2) | XC-8; XC-CEN | yes |
| Iria Flavia, once a Roman city and an episcopal see until the 11th century; the Camilo José Cela foundation; the N-550 crossing with a branch to the right to avoid traffic; the sanctuary of A Escravitude with views | names | XC-8 (Spanish) | yes |
| O Milladoiro, the humilladoiro where pilgrims knelt on first seeing the cathedral; the Old Bridge over the Sar; two signed ways into the city; the Porta Faxeira and Rúa do Franco; the traditional pilgrims' entrance on the Portuguese route is through the Praza das Praterías | names | XC-8 (Spanish "La entrada tradicional a la catedral de los peregrinos del Camino Portugués se efectúa por la Praza das Praterías") | yes |
| The Xunta's coastal and Central pages differ by up to ~0.4 km on shared days (~25.2 against ~24.8 on the last) | 0.4 | XC-5 to XC-8 against XC-CEN | computed |

## F. Other ways in and out

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CSJ: the Litoral Route starts at the cathedral, drops to the promenades of the Douro estuary, goes to the sea and north on promenades and boardwalks to Vila do Conde, where it becomes the Coastal route | description | CSJ | yes |
| Wikipedia: a contemporary version of the Coastal Way, pushed by German pilgrims, keeps to the sea on beach walkways; gaining importance because the traditional line is increasingly urbanised; bicycles not allowed on some walkways | description | WP Portuguese_Way (section "The beach boardwalks") | yes (Wikipedia) |
| The Minho can be crossed at three places: Caminha to A Guarda, Vila Nova de Cerveira to Goián, Valença to Tui | 3 | VIANA; TPN-EN; TPN-PT; CERV | yes |
| Caminha to Valença: a gentle way parallel to the Minho at the foot of Monte de Goios and the Serra da Gávea, through the centre of Vila Nova de Cerveira, whose castle King Dinis had built to defend the crossing | description | CERV ("caminho suave, paralelo às margens do Minho"; "Castelo mandado construir por D. Dinis defendia a passagem do Rio") | yes |
| Published plan: Caminha to Vila Nova de Cerveira ~12.5 km, Vila Nova de Cerveira to Valença ~14.5 km | 12.5; 14.5 | VAGA (6.ª and 7.ª etapas, Valença route) | yes (plan) |
| The certified route ends at the border at Valença; Valença is the meeting point of the Central and Coastal routes | n/a | TP; TPN-PT | yes |
| The Spiritual Variant: relatively newly established, begins in Pontevedra, leaves the Central route for Vilanova de Arousa, boat up the estuary to Pontecesures (the stone-boat route of the body of St James), then the Central to Santiago | description | CSJ | yes |
| The Xunta's Mar de Arousa and Río Ulla Route: maritime-river itinerary commemorating the arrival of the apostle's body by sea; forty nautical miles to Iria Flavia then about 25 km on foot to Santiago (Spanish "cuarenta millas náuticas... unos 25 kilómetros a pie") | 40 nautical miles; ~25 km | XAR (English and Spanish) | yes |
| The Xunta pages read for this book (route page, eight stage pages, Arousa page) contain no mention of the Spiritual Variant | 0 matches | grep of the saved pages (English and Spanish), 2026-11-08 | yes |
| Pontevedra is the point where the variant leaves the road | place | CSJ | yes |
| The Xunta has eight stages in Galicia; the official portal says an average of seven days for the Portuguese part | 8; 7 | XUNTA-C; CCP | yes |
| Splits: A Guarda to Baiona ~35 km (16.7 + 18.6 = 35.3); the Xunta's sections on Day 7 end at A Ramallosa, Nigrán, Coruxo | 35.3 | XC-1; XC-2; XC-3 | computed |
| Twelve days, ~272 km: ~23 km a day on average | 272 / 12 = 22.7 | computed from the day figures | computed |

## G. The Compostela rule and the Office

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The rule: the last hundred kilometres on foot or horseback, or two hundred by bicycle, credencial stamped; a hundred continuous kilometres on the same route recognised by the Office; the final stage includes the last one into the Cathedral; stages in chronological and geographical order; stamps at the start and end of each stage, with the date, for a pilgrim who walks only the minimum; no less than seventy kilometres in Spain after walking part of a recognised route outside Spain; the Cabildo's right to grant it in special and exceptional cases | as SF | SF; OP the-compostela (read 2026-11-08) | yes |
| The standard purpose sentence (religious or spiritual reasons; "with a Christian sentiment, even if it is only with an attitude of search"; the Certificate of Distance) | word for word | SF ("How a guide writes it"); OP the-credencial for the quoted phrase | yes |
| The Certificate of Distance exists; the book states no price (it says only that it carries a fee) | n/a | OP certificate-of-distance (price on the page, not repeated); SF | yes |
| The Office pages speak of routes recognised by its system and of "many traditional and recognised routes"; they do not list them and do not mention the Portuguese Coastal route | not mentioned | OP the-compostela ("routes recognized by the International Pilgrim's Reception Office system"); OP planning; grep of the Office pages (2026-11-08) | yes |
| The Office's statistics count the Portuguese coastal route as a route of its own | per Wikipedia | WP Portuguese_Way (section "Statistics") | yes (Wikipedia) |
| Vigo to Santiago ~101 km by the Xunta's coastal stage figures; ~101.4 km with its Central figures for the shared days | 16.3 + 18.2 + 23 + 18.7 + 24.8 = 101.0; 16.3 + 18.2 + 22.9 + 18.8 + 25.2 = 101.4 | XC-4 to XC-8; XC-CEN | computed |
| CSJ calls Vigo "the 100 km mark from Santiago" | quoted | CSJ ("Vigo (The 100 km mark from Santiago)") | yes |
| Baiona to Santiago ~128 km (26.8 + 101.0 = 127.8) | 127.8 | XC-3 plus the Vigo figure | computed |
| Credencial: official model on cardboard, sixteen concertina-folded pages; obtained in person at the Office or at institutions authorised by the cathedral (parish churches, associations of friends of the Way, pilgrim hostels, confraternities); two practical purposes, access to hostels and proof for the Compostela; "does not generate any rights"; stamps normally where pilgrims sleep and also in parish churches, monasteries, cathedrals, hotels, town halls; a digital credential app exists | quoted | OP the-credencial | yes |
| The Office asks groups with a support car, or by bicycle, to seek alternative shelter; hostels without subsidies are maintained by pilgrims' contributions | quoted | OP the-credencial | yes |
| The Office: both the reception service and the issuing of the Compostela are completely free | quoted | OP the-compostela | yes |
| Arrival: a ticket with a QR code to follow the queue; in times of great influx same-day collection cannot be guaranteed | quoted | OP (pilgrims/after-the-pilgrimage pages) | yes |
| After the pilgrimage: a credencial can bring discounts on tickets to some places, including the cathedral museum; the cathedral is open all day, with a chapel where many sit to think or pray | quoted idea | OP after-the-pilgrimage | yes |
| The royal hospital founded by the Catholic Monarchs: those who showed their Compostela had the right to stay free for three days; a hotel since 1954 (the hotel is not named) | 1954; 3 days | OP the-compostela (history text) | yes |

## H. Santiago, Holy Year, climate, daylight and practical facts

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Cathedral: construction began 1075; the Praterías façade 1103; the Baroque Obradoiro façade completed 1740; the Holy Door opened only in a Jacobean Holy Year | 1075; 1103; 1740 | WP Santiago_de_Compostela_Cathedral | yes (Wikipedia) |
| In Holy Years the botafumeiro is used at all the Pilgrims' Masses | statement | WP Santiago_de_Compostela_Cathedral (section Botafumeiro) | yes (Wikipedia) |
| The next Jacobean Holy Years: 2027 and 2032 | 2027; 2032 | WP Jacobean_Holy_Year (list) | yes (Wikipedia) |
| Santiago: the walk on to Finisterre and Muxía ~90 km farther | ~90 km | CAT (row camino-finisterre-muxia, distance_km 90) | yes (repo) |
| CSJ: a changeable maritime climate; westerly winds bring generous rain, "Green Portugal" and "Green Spain"; heavy and prolonged rain in low pressure; spring rewarding, cool, fresh growth; early autumn fairly dry and settled; summer hot with high humidity, crowded in peak holiday months | quoted | CSJ (section Timings and Weather) | yes |
| Stations: Porto airport (IPMA 1991 to 2020, 68 m); Viana do Castelo (Meadela; temperature normals 1981 to 2010, rainfall 1971 to 2000); Vigo airport (AEMET 1991 to 2020, 261 m); Santiago (AEMET 1991 to 2020) | stations | WP Porto; WP Viana_do_Castelo; WP Vigo; WP Santiago_de_Compostela (climate tables) | yes (Wikipedia) |
| April rain: Porto airport 95.5 mm; Viana 117.7; Vigo 150 | ~96; ~118; ~150 mm | same tables | yes (Wikipedia) |
| July mean daily maximum: Porto airport 24.3; Viana 26.3; Vigo 24.9; Santiago 24.8 | ~24; ~26; ~25; ~25 °C | same tables | yes (Wikipedia) |
| May and June mean daily maximum: Porto airport 20.3 and 22.7; Viana 20.7 and 24.5; Vigo 19.8 and 22.7; Santiago 19.8 and 22.8 | ~20 to ~25 °C | same tables | yes (Wikipedia) |
| Record highs: Porto airport 38.6; Viana 39.5; Vigo airport 40.8 (7 August 2016); Santiago 39.4 | ~38.6; ~39.5; ~40.8; ~39.4 °C | same tables; WP Vigo (text on the 2016 record) | yes (Wikipedia) |
| July rain: Porto airport 16.6 mm; Vigo 40 | ~17; ~40 mm | same tables | yes (Wikipedia) |
| October rain: Porto airport 148.9; Vigo 208; Santiago 214.0; November at Vigo 236 | ~149; ~208; ~214; ~236 mm | same tables | yes (Wikipedia) |
| January: mean daily maximum Porto airport 14.0, Vigo 12.2, Santiago 12.3; mean daily minimum 6.4, 5.6, 5.4; rain Porto 151.0, Vigo 222 | ~14; ~12 °C; ~5 to ~6 °C; ~151; ~222 mm | same tables | yes (Wikipedia) |
| Annual rain: Porto airport 1,146.9; Viana 1,470.2; Santiago 1,526.6; Vigo 1,695 on 126 days of 1 mm or more; Vigo "the rainiest city in Galicia" | ~1,150; ~1,470; ~1,530; ~1,700 mm; ~126 days | same tables; WP Vigo (climate text) | yes (Wikipedia) |
| Wikipedia: the beaches near Porto are often windier and cooler than inland areas | quoted idea | WP Porto (climate text) | yes (Wikipedia) |
| Daylight and sunrise: Porto about 9.2 h (rise 07:56, set 17:08 by the Portuguese clock) on 21 December and 15.2 h (06:01, 21:10) on 21 June; Vigo 9.1 h (09:00, 18:05 by the Spanish clock) and 15.3 h (06:58, 22:14) | ~9 h; ~15 h; "about eight and nine"; "about ten past five and just after six"; "about six and about seven"; "about ten past nine and about a quarter past ten" | NOAA solar algorithm, run with scratchpad sun.py (2026-11-08) for Porto and Vigo; clock offsets from the two Time articles | computed |
| Time: mainland Portugal on Western European Time (UTC+0, summer +1); Galicia on Central European Time (UTC+1, summer +2): one hour apart | 1 h | WP Time_in_Portugal; WP Time_in_Spain | yes (Wikipedia) |
| Getting there: CSJ says you can fly into Lisbon, Porto, Vigo or Santiago; a regular bus between Santiago and Porto of about four hours | ~4 h | CSJ (section Getting there) | yes |
| Vigo airport ~12 km east of the city; Vigo has railway stations with direct connections to Porto | ~12 km | WP Vigo (section Transport) | yes (Wikipedia) |
| Choosing a start: from Viana do Castelo nine days ~190 km (27 + 16.7 + 18.6 + 26.8 + 16.3 + 18.2 + 23 + 18.7 + 24.8 = 190.1); from A Guarda eight days ~163 km; from Vigo five days ~101 km; a Porto start is "a little over two weeks" door to door (12 days, a rest day or two, a day each way) | 190.1; 163.1; 101.0; about 16 days | LEAF; XC-1 to XC-8 | computed |
| The longest planned day is Day 1, ~29 km (leaflet); the longest Galician day is Baiona to Vigo, ~26.8 km (~27) | 29; 26.8 | LEAF; XC-3 | computed |
| Pontevedra is reached on Day 9; Day numbers of the book (Days 1 to 4 Portugal, Day 5 the crossing, Days 6 to 7 the coast, Days 8 to 12 Vigo to Santiago) | numbering | this book's own plan (see section A) | computed |
| Galicia has two official languages, Galician and Spanish; Oia, Baiona and A Guarda are Galician forms | 2 | WP Galicia_(Spain) | yes (Wikipedia) |
| Portugal and Spain both use the euro | euro | WP Eurozone (member list) | yes (Wikipedia) |
| 112 is the European emergency number and works in Portugal and Spain | 112 | WP 112_(emergency_telephone_number) | yes (Wikipedia) |
| Schengen: Portugal and Spain are both members, normally no border checks; temporary controls can be introduced | n/a | WP Schengen_Area (list of members; section "Temporary border controls") | yes (Wikipedia) |
| The official portal says: for your safety, do not walk on roads with heavy traffic; use the certified, signposted itinerary | quoted idea | CCP (home page banner "Para sua segurança, não caminhe por estradas rodoviárias com trânsito intenso") | yes |
| CSJ: use the indicated strip between the road and the drainage ditch | quoted idea | CSJ (section Waymarking) | yes |
| Eating: A Pedra (Vigo) and the oysters of the ría; mussel rafts; the Festa do Choco; Póvoa a town of fishermen | names | XC-4; XC-5; WP Póvoa_de_Varzim | yes |
| The Cíes Islands can be reached by boat from Baiona | statement | XC-2 | yes |
| Xunta: Translatio, the apostle's body came by sea to Galicia, up the Ulla to Padrón, in a Stone Boat (Book III of the Codex Calixtinus and ancient Christian traditions) | legend | XAR | yes |
| Advice rows (water, early start, feet, hats, windproof layer, rain gear, boardwalks slick when wet, sea not a swimming pool, follow the crew on the boat, stop when something hurts, 112) | prudent advice | .claude/skills/book-writer/reference/voice-and-honesty.md | advice |
| Visit Portugal (the national tourism site) could not be read, so the book says nothing on its authority | n/a | visitportugal.com returned an anti-bot page | removed |
| Claims about how many walkers do something at a given place; named hostels, cafes, ferry operators, boat timetables, fares | n/a | left out on purpose (changes; no business names) | removed |
