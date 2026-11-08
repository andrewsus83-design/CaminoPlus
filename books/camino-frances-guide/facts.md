# Fact ledger: The French Way (camino-frances-guide)

Working file, not published. One row per hard fact in the book. The last column says how the row was checked: `yes` = the page or file was read (or the figure computed and the inputs read) on 2026-11-08, the date of writing; `yes (search summary)` = the claim was confirmed through a web-search summary and the page itself could not be opened (flagged for the owner); `computed` = calculated from other rows, not looked up (flagged for the owner); `removed` = taken out of the book.

Source short names (full addresses are in each row):

- XUNTA = Xunta de Galicia, official portal caminodesantiago.gal (pages read by curl on 2026-11-08)
- OP = Oficina del Peregrino (Pilgrim's Reception Office of the Cathedral of Santiago), oficinadelperegrino.com
- CSJ = Confraternity of St James, csj.org.uk
- WP-en, WP-es, WP-de = Wikipedia in English, Spanish and German. WP-es TABLE = the "km to Santiago" and altitude columns of the route tables in the Spanish article https://es.wikipedia.org/wiki/Camino_de_Santiago_Franc%C3%A9s (wikitext read 2026-11-08). WP-en ITIN = the "Example itinerary" table of https://en.wikipedia.org/wiki/French_Way. WP-de TABLE = the "Detaillierte Wegführung" table of https://de.wikipedia.org/wiki/Camino_Franc%C3%A9s (stage lengths and altitude profile).
- CAT = the repository: supabase/seed.sql, supabase/migrations/20261106120000_more_caminos.sql, supabase/migrations/20261112000000_camino_frances_stages.sql, tools/offline-maps/catalog/camino-frances/*.json

## A. Route, length and the 33 stages

The repository's catalog holds no cited distance for stages 4 to 33 (the migration says so), and only the seed values for stages 1 to 3. The stage figures below therefore come from public tables, as described in each row. Rule used: the book states the WP-en ITIN figure where its stage ends at the same towns as the app; the Xunta figure for the Galician stages (27 to 33); the computed WP-es TABLE difference where WP-en ITIN splits the road differently; and the app's seed value for stages 1 to 3. Where two sources differ by more than 2 km the book says so in the day's entry.

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route: Saint-Jean-Pied-de-Port to Santiago de Compostela; 33 stages; catalog length 773 | ~773 km; 33 stages | CAT: supabase/migrations/20261106120000_more_caminos.sql (row camino-frances: start Saint-Jean-Pied-de-Port, end Santiago de Compostela, 773, 33) | yes |
| The 33 stage names and their order are those of the app | as stated | CAT: supabase/seed.sql (stages 1 to 3), supabase/migrations/20261112000000_camino_frances_stages.sql (stages 4 to 33) | yes |
| Published length of the whole route: 769 km from Saint-Jean | ~769 km | WP-en ITIN https://en.wikipedia.org/wiki/French_Way (first row: 0 km from Saint-Jean, 769 km to Santiago); WP-de TABLE gives the same | yes |
| The cathedral's pilgrim portal quoted at 774 km from Saint-Jean | ~774 km | WP-de https://de.wikipedia.org/wiki/Camino_Franc%C3%A9s (section Route: "Das Jakobus-Portal der Kathedrale ... gibt als Entfernung ab Saint-Jean-Pied-de-Port 774 Kilometer an") | yes |
| "Published figures run from about 770 to about 780" and "treat ~775 km as a good guide": 769 (WP-en ITIN), 773 (catalog), 774 (cathedral portal via WP-de), 777 (the stage rows below), and about 779 (WP-es TABLE puts Roncesvalles at 755 km from Santiago, plus the ~24 km of day 1); ~775 is the author's middle figure, not a published one | ~770 to ~780 km; ~775 km | WP-en ITIN; WP-de; CAT; WP-es TABLE; computed | computed |
| The 33 stage figures in the book add up to 777 km; average 23.5 km a day | ~777 km; ~24 km | computed: sum of the 33 rows below (24+21+20+24+22+22+28+29+21+23+24+28+20+20+23+19+27+25+26+19+24+28+26+27+23+30+22+18+22+25+29+18+20 = 777; 777/33 = 23.5), by the San Xil route on day 28 | computed |
| A typical walk takes at least four weeks, allowing one or two rest days | 4 weeks | WP-en https://en.wikipedia.org/wiki/French_Way (lead) | yes |
| 33 walking days plus a rest day or two is about five weeks | ~5 weeks | computed (33 days = 4 weeks and 5 days, plus rest days); consistent with WP-en "at least four weeks" | computed |
| The Xunta rates its Galician section (O Cebreiro to Santiago) "Medium", and its Galician stages from "Low" (Melide to Arzúa, Arzúa to Arca) to "Medium-High" (O Cebreiro to Triacastela, Sarria to Portomarín) | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way and the stage pages in the rows below | yes |
| Days in the book run from about 18 to about 30 km | ~18 to ~30 km | the stage rows below (shortest day 28 via San Xil, ~18 km; longest day 26, ~30 km) | computed |
| Day 1 Saint-Jean-Pied-de-Port to Roncesvalles | ~24 km | CAT: supabase/seed.sql (distance_km 24.2; "not independently verified" in catalog/camino-frances/02.json notes); WP-en ITIN 25 km; WP-de TABLE 25 km | yes |
| Day 2 Roncesvalles to Zubiri | ~21 km | CAT: supabase/seed.sql (21.4); WP-en ITIN 21.5 km; WP-es TABLE 755 to 733 = 22 km | yes |
| Day 3 Zubiri to Pamplona; "sources give ~20 to ~22 km" | ~20 km | CAT: supabase/seed.sql (20.4); WP-en ITIN 22 km; WP-es TABLE 733 to 712 = 21 km | yes |
| Day 4 Pamplona to Puente la Reina | ~24 km | WP-en ITIN 23.5 km; WP-es TABLE 712 to 688 = 24 km (Pamplona is "706 o 712" in the table; 712 is the main route) | yes |
| Day 5 Puente la Reina to Estella | ~22 km | WP-en ITIN 22 km; WP-es TABLE 688 to 666 = 22 km | yes |
| Day 6 Estella to Los Arcos | ~22 km | WP-en ITIN 22 km; WP-es TABLE 666 to 644 = 22 km | yes |
| Day 7 Los Arcos to Logroño | ~28 km | WP-en ITIN 28 km; WP-es TABLE 644 to 616 = 28 km | yes |
| Day 8 Logroño to Nájera | ~29 km | WP-en ITIN 29 km; WP-es TABLE 616 to 587 = 29 km (Nájera "603 o 587"; 587 used) | yes |
| Day 9 Nájera to Santo Domingo de la Calzada | ~21 km | WP-en ITIN 21 km; WP-es TABLE 587 to 566 = 21 km | yes |
| Day 10 Santo Domingo de la Calzada to Belorado | ~23 km | WP-en ITIN 23 km; WP-es TABLE 566 to 544 = 22 km | yes |
| Day 11 Belorado to San Juan de Ortega; "sources give ~21 to ~24 km" | ~24 km | WP-en ITIN 24 km; WP-es TABLE 544 to 523 = 21 km (San Juan de Ortega "529/523"; 523 used) | yes |
| Day 12 San Juan de Ortega to Burgos; "Spanish Wikipedia's table puts this stage at ~31 km" | ~28 km | WP-en ITIN 28 km; WP-es TABLE 523 to 492 = 31 km | yes |
| Day 13 Burgos to Hornillos del Camino | ~20 km | WP-en ITIN 20 km; WP-es TABLE 492 to 472 = 20 km | yes |
| Day 14 Hornillos del Camino to Castrojeriz | ~20 km | WP-en ITIN 20 km; WP-es TABLE 472 to 452 = 20 km | yes |
| Day 15 Castrojeriz to Frómista; "Spanish Wikipedia's table gives ~25 km" | ~23 km | WP-en ITIN 23 km; WP-es TABLE 452 to 427 = 25 km (Frómista "491 o 427"; 427 used, between Boadilla 433 and Población 423) | yes |
| Day 16 Frómista to Carrión de los Condes | ~19 km | WP-en ITIN 19 km; WP-es TABLE 427 to 408 = 19 km | yes |
| Day 17 Carrión de los Condes to Terradillos de los Templarios | ~27 km | WP-es TABLE 408 to 381 = 27 km; cross-check WP-en ITIN: Carrión to Calzadilla 17 km plus WP-es TABLE Calzadilla to Terradillos (390 to 381) 9 km = 26 km | computed |
| Day 18 Terradillos de los Templarios to Bercianos del Real Camino | ~25 km | WP-es TABLE 381 to 357 = 24 km; WP-en ITIN based: 13 km Terradillos to Sahagún (WP-es 381 to 368) + 19.5 km Sahagún to El Burgo Ranero (WP-en ITIN) minus 7 km Bercianos to El Burgo Ranero (WP-es 357 to 350) = 25.5 km | computed |
| Day 19 Bercianos del Real Camino to Mansilla de las Mulas | ~26 km | WP-es TABLE 357 to 331 = 26 km; WP-en ITIN El Burgo Ranero to Mansilla 19 km plus 7 km = 26 km | computed |
| Day 20 Mansilla de las Mulas to León | ~19 km | WP-en ITIN 19 km; WP-es TABLE 331 to 311 = 20 km | yes |
| Day 21 León to Villadangos del Páramo | ~24 km | WP-en ITIN 24 km; WP-es TABLE 311 to 289 = 22 km | yes |
| Day 22 Villadangos del Páramo to Astorga | ~28 km | WP-en ITIN 28 km; WP-es TABLE 289 to 262 = 27 km | yes |
| Day 23 Astorga to Foncebadón | ~26 km | WP-es TABLE 262 to 236 = 26 km; WP-en ITIN Astorga to Rabanal 20 km plus WP-es TABLE Rabanal to Foncebadón (242 to 236) 6 km = 26 km | computed |
| Day 24 Foncebadón to Ponferrada | ~27 km | WP-es TABLE 236 to 209 = 27 km; WP-en ITIN Rabanal to Ponferrada (16.5 + 16) 32.5 km minus 6 km = 26.5 km | computed |
| Day 25 Ponferrada to Villafranca del Bierzo | ~23 km | WP-en ITIN 23 km; WP-es TABLE 209 to 186 = 23 km | yes |
| Day 26 Villafranca del Bierzo to O Cebreiro | ~30 km | WP-de TABLE 30 km (Villafranca to O Cebreiro); WP-es TABLE 186 to 155 = 31 km; WP-en ITIN Villafranca to La Faba 25 km plus 6 km (WP-es 161 to 155) = 31 km | yes |
| Day 27 O Cebreiro to Triacastela; Xunta rating Medium-High | ~22 km (22.2) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-o-cebreiro-tricastela (Length 22.2 Km, Medium-High, 4h 30min) | yes |
| Day 28 Triacastela to Sarria by San Xil: 17.9 km, Medium-Low; by Samos: 25.1 km, Medium-Low | ~18 km; ~25 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-triacastela-sarria-through-san-xil and .../stage-triacastela-sarria-through-samos | yes |
| Day 29 Sarria to Portomarín; Medium-High; leaves by the bridge of A Áspera, Barbadelo (church of Santiago can be visited), about 1 km beside the railway, then "the hardest hill of the stage", oak groves and meadows, the municipality of Paradela, the bridge over the Miño | ~22 km (22.0) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-sarria-portomarin (Length 22 Km, Medium-High, 4h 35min) | yes |
| Day 30 Portomarín to Palas de Rei; stage Medium; Portomarín to Gonzar 8.2 km, Medium-High, "quite a steep ascent"; crossing the reservoir by a pedestrian bridge; Castromaior and Ligonde | ~25 km (25.1) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-portomarin-palas-de-rei | yes |
| Day 31 Palas de Rei to Arzúa: Palas to Melide 14.6 km (Medium), Melide to Arzúa 14.5 km (Low), total 29.1 km; WP-en ITIN gives 25.5 km | ~29 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-palas-de-rei-melide and .../stage-melide-arzua; WP-en ITIN (25.5 km); WP-es TABLE 65 to 37 = 28 km | yes |
| Day 32 Arzúa to O Pedrouzo (Arca): 18.4 km, Low | ~18 km (18.4) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-arzua-arca (Length 18.4 Km, Low, 4h 35min); WP-en ITIN 20 km; WP-es TABLE 37 to 19 = 18 km | yes |
| Day 33 O Pedrouzo (Arca) to Santiago: 20.2 km, Medium; WP-en ITIN gives 16.5 km | ~20 km (20.2) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-arca-santiago-de-compostela (Length 20.2 Km, Medium, 5h 05min); WP-en ITIN 16.5 km; WP-es TABLE 19 km | yes |
| Xunta route lengths from O Cebreiro to Santiago: through San Xil 155 km, through Samos 162.2 km; difficulty Medium | ~155 km; ~162 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way | yes |
| The Xunta's San Xil stages add up: 22.2 + 17.9 + 22 + 25.1 + 14.6 + 14.5 + 18.4 + 20.2 = 154.9 km, consistent with its 155 km | ~155 km | computed from the Xunta stage rows above | computed |
| Sarria to Santiago by the Xunta's stages: 22 + 25.1 + 14.6 + 14.5 + 18.4 + 20.2 = 114.8 km | ~115 km | computed from the Xunta stage rows above | computed |
| Portomarín to Santiago by the Xunta's stages: 114.8 minus 22.0 = 92.8 km | ~93 km | computed from the Xunta stage rows above | computed |
| Sarria is 115 km from the cathedral (Wikipedia, Sarria article); 113 km (WP-es TABLE); 107.5 km (WP-en ITIN) | ~115 km; ~113 km; ~108 km | WP-en https://en.wikipedia.org/wiki/Sarria,_Spain ; WP-es TABLE (Sarria 113); WP-en ITIN (Sarria row: 661.5 km from Saint-Jean, 107.5 to Santiago) | yes |
| Pamplona is ~700 km from Santiago in WP-en ITIN (700.5) and ~712 km in WP-es TABLE | ~700 km; ~712 km | WP-en ITIN; WP-es TABLE | yes |
| Remaining distance from each usual start (cumulative from the stage rows): Pamplona 712 (after stage 3), Burgos 491 (after 12), León 312 (after 20), Astorga 260 (after 22), O Cebreiro 154 (after 26), Sarria 114 to 115; days remaining 30, 21, 13, 11, 7, 5 | ~712, ~491, ~312, ~260, ~154, ~115 km | computed: 777 minus cumulative totals 65, 286, 465, 517, 623, 663 (Sarria quoted as ~115 from the Sarria rows above); agrees with WP-es TABLE (712, 492, 311, 262, 155, 113) | computed |
| The Aragonese Way crosses at Somport and joins the French Way at Puente la Reina, about 690 km from Santiago (WP-en says "about 700 kilometres") | ~690 km | WP-en https://en.wikipedia.org/wiki/French_Way (lead); WP-es TABLE (Puente la Reina 688 on the French Way, 692 on the Aragonese table) | yes |
| Three French routes (Tours, Vézelay, Le Puy-en-Velay) meet at Saint-Jean-Pied-de-Port | as stated | WP-en https://en.wikipedia.org/wiki/French_Way (lead) | yes |
| The Camino Primitivo joins at Melide, the Camino del Norte at Arzúa | as stated | WP-en https://en.wikipedia.org/wiki/Melide,_Spain ; https://en.wikipedia.org/wiki/Arz%C3%BAa | yes |
| Variants named: Valcarlos or Lepoeder (day 1); Samos or San Xil (day 28); the Roman road (Calzada Romana, Via Trajana) from Calzada del Coto that rejoins at Reliegos (day 18); a route by Villar de Mazarife to Hospital de Órbigo (day 21); a variant from Azofra to San Millán de la Cogolla (day 9) | as stated | WP-es https://es.wikipedia.org/wiki/Camino_de_Santiago_Franc%C3%A9s (section Alternativas); WP-de TABLE (notes: Azofra to Cañas and San Millán; Calzada del Coto to Reliegos); XUNTA (Samos and San Xil) | yes |
| Day 7: Viana is ~10 km short of Logroño; Navarrete is ~13 km from Logroño; Rabanal del Camino is ~20 km from Astorga; Calzadilla de la Cueza is ~17 to ~18 km from Carrión; La Faba is ~25 km from Villafranca | ~10, ~13, ~20, ~17 to ~18, ~25 km | WP-es TABLE (626 to 616; 616 to 603; 262 to 242; 408 to 390); WP-en ITIN (20; 17; 25) | yes |
| Distances to places within a day (each the difference of two km-to-Santiago values in the table): Hontanas ~11 km and the San Antón ruins ~18 km from Hornillos (472 to 461; 472 to 454); Puente Fitero ~10 km and Boadilla ~19 km from Castrojeriz (452 to 442; 452 to 433); Sahagún ~13 km from Terradillos (381 to 368); El Burgo Ranero ~7 km and Reliegos ~20 km from Bercianos (357 to 350; 357 to 337); Hospital de Órbigo ~10 km from Villadangos and Astorga ~17 km beyond it (289 to 279; 279 to 262); Manjarín ~4 km, El Acebo ~11 km and Molinaseca ~19 km from Foncebadón (236 to 232, 225, 217); Vega de Valcarce ~19 km from Villafranca (186 to 167); the last ~10 km into Burgos from Villafría (502 to 492) | as stated | WP-es TABLE (computed differences) | computed |
| Barbadelo is ~4 km from Sarria (the first sub-stage is 4.2 km) | ~4 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-sarria-portomarin | yes |
| Sample plans: 33 walking days plus three rest days and a day in Santiago is 37 days; Burgos to Santiago is 21 walking days (stages 13 to 33); León to Santiago 13 (stages 21 to 33); Sarria to Santiago 5 (stages 29 to 33) | 37; 21; 13; 5 | computed from the stage list (stage numbers) | computed |
| Day 17: no village between Carrión and Calzadilla de la Cueza (the table lists no settlement between 408 and 390; WP-en ITIN gives the leg as 17 km with nothing in the "passes through" column) | ~17 to ~18 km | WP-es TABLE; WP-en ITIN | yes (read from the tables; the book says "no village" on the strength of both tables) |
| Day 6: after Villamayor de Monjardín (657) the table lists only Urbiola (654) before Los Arcos (644), about 13 km | ~13 km | WP-es TABLE | yes |
| Day 19: villages every ~6 to ~13 km (Bercianos 357, El Burgo Ranero 350, Reliegos 337, Mansilla 331) | ~6 to ~13 km | WP-es TABLE | yes |
| Order of places named in each day's entry (Larrasoaña, Zuriáin, Zabaldika, Villava, Burlada; Mañeru, Cirauqui, Lorca, Villatuerta; and so on) | as stated | WP-es TABLE; CAT: tools/offline-maps/catalog/camino-frances/02.json to 33.json (via points, checked against the table) | yes |

## B. Altitudes and climbs

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Saint-Jean-Pied-de-Port ~175 m; Ibañeta pass ~1,057 m | ~175 m; ~1,057 m | WP-de TABLE (stage 1 altitude profile "175 - 1057 - 962 m"); WP-es TABLE (Puerto de Ibañeta 1057) | yes |
| Lepoeder pass ~1,430 m (the high route "closed in winter") | ~1,430 m | WP-es TABLE (row "Lepoeder (Camino alto, cerrado en invierno)", 762 km, 1430 m) | yes |
| Roncesvalles ~950 m (WP-es 950, WP-de 962, WP-en "some 900 metres") | ~950 m | WP-es TABLE; WP-de TABLE; WP-en https://en.wikipedia.org/wiki/Roncesvalles | yes |
| Net climb on day 1: 1,430 minus 175 | ~1,250 m | computed from the two rows above | computed |
| Mezkiritz pass ~925 m; Erro pass ~800 m; Zubiri ~530 m; the last ~6 km into Zubiri (Erro 739 km to Zubiri 733 km) fall ~270 m (801 to 530) | ~925, ~800, ~530, ~6 km, ~270 m | WP-es TABLE | yes (the 6 km and 270 m are computed) |
| Pamplona ~450 m | ~450 m | WP-en https://en.wikipedia.org/wiki/Pamplona (lead: "near 450 m"); WP-es TABLE 446 | yes |
| Alto del Perdón ~765 m (the table lists it as Erreniega, 765 m; other pages give 756 to 770 m); the drop to Uterga (480 m) is ~285 m in ~4 km (Erreniega 699 km to Uterga 695 km) | ~765 m; ~285 m; ~4 km | WP-es TABLE; web-search summary of walking-route pages (756 to 770 m) | yes (the 285 m and 4 km are computed) |
| Day 5 between ~345 m and ~500 m (Puente la Reina 344, high point 496, Estella 421) | ~345 to ~500 m | WP-de TABLE (stage 5: "344 - 496 - 421 m") | yes |
| Villamayor de Monjardín ~675 m | ~675 m | WP-es TABLE | yes |
| Logroño ~385 m; Ventosa ~640 m; Nájera ~490 m; Navarrete ~512 m (not used) | ~385, ~640, ~490 m | WP-es TABLE (Logroño 385; Ventosa 642; Nájera 491) | yes |
| Cirueña ~755 m; Santo Domingo ~640 m; Grañón ~725 m; Belorado ~770 m | ~755, ~640, ~725, ~770 m | WP-es TABLE | yes |
| Day 10 high point ~845 m (profile 638, 777, 845, 772) | ~845 m | WP-de TABLE (stage 10) | yes |
| Belorado is ~130 m higher than Santo Domingo (770 minus 640) | ~130 m | computed from WP-es TABLE | computed |
| Montes de Oca climb to ~1,000 m | ~1,000 m | WP-de TABLE (stage 11: "772 - 1000 m") | yes |
| Burgos ~865 m | ~865 m | WP-en https://en.wikipedia.org/wiki/Burgos (infobox elevation 865 m; the airport 891 m) | yes |
| The Meseta stages lie at about 800 to 900 m (Hornillos stage 856, 890, 808; Castrojeriz 808; Sahagún 822; El Burgo Ranero 881; León 838) | ~800 to ~900 m | WP-de TABLE (altitude profiles of stages 13 to 18); WP-en https://en.wikipedia.org/wiki/Meseta_Central says the Submeseta Norte is "mostly 700 to 800 m" | yes (the book's figure follows the route tables, which are for the road itself) |
| León ~840 m | ~840 m | WP-en https://en.wikipedia.org/wiki/Le%C3%B3n,_Spain (infobox 837 m) | yes |
| Astorga ~870 m; Foncebadón ~1,430 m; climb on day 23 ~560 m | ~870, ~1,430, ~560 m | WP-de TABLE (stage 21: "868 - 1145"); WP-es TABLE (Foncebadón 1430); computed difference | yes (560 is computed) |
| Cruz de Ferro ~1,500 m, the highest point of the Camino Francés (WP-en ITIN says 1,515 m near Manjarín; walking-route pages say 1,504 or 1,505 m) | ~1,500 m | WP-en ITIN (row Rabanal to El Acebo: "Highest point of trail, 1515 metres"); web-search summary (1,504 and 1,505 m) | yes |
| Molinaseca ~580 m; descent from Foncebadón to Molinaseca ~850 m in ~19 km (Foncebadón 236 km to Molinaseca 217 km) | ~580 m; ~850 m; ~19 km | WP-es TABLE (Molinaseca 580; Foncebadón 1430); computed | yes (850 and 19 are computed) |
| Day 25 between ~465 m and ~525 m (profile 508, 525, 464, 505) | ~465 to ~525 m | WP-de TABLE (stage 23) | yes |
| Villafranca to O Cebreiro: from ~505 m to ~1,300 m, net climb ~800 m | ~505 m; ~1,300 m; ~800 m | WP-de TABLE (stage 24: "505 - 1300 m"); XUNTA (O Cebreiro "at an altitude of 1,300 m"); computed difference | yes |
| Alto do Poio ~1,330 m; Triacastela ~665 m; descent on day 27 about 635 m (1,300 minus 665) | ~1,330 m; ~665 m; ~635 m | WP-de TABLE (stage 25: "1300 - 1228 - 1337 - 520"; its 520 m for Triacastela disagrees with WP-es TABLE's 665 m, which the book follows); computed | yes (the descent is computed) |
| Monte do Gozo: the Hill of Joy, 370 m, about 4.5 km from the city centre; pilgrims traditionally cheered at the first sight of the cathedral's spires | ~370 m; ~4.5 km | WP-en https://en.wikipedia.org/wiki/Monte_do_Gozo | yes |
| Many stages are in mountains at about a thousand metres | ~1,000 m | XUNTA https://www.caminodesantiago.gal/en/get-ready/what-you-cannot-leave-at-home | yes |

## C. The Compostela, the credencial and the Pilgrim's Office

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Compostela rule, as written in the book (religious and/or spiritual reasons; routes of the Way on foot, bicycle or horseback; at least the last 100 km on foot or on horseback, the last 200 km by bicycle, shown by the stamped credencial; 100 continuous km on the same recognised route; the final stage includes the last one leading into the Cathedral; stages in chronological and geographical order; credencial stamped at the start and end of each stage, with date, for the minimum distance; no less than 70 km in Spain after a recognised route outside Spain; the Cabildo may grant it in special and exceptional cases) | rule figures in words | books/shared-facts.md (verified 2026-11-08 against the Pilgrim's Office); OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes (see the note under "Not verified": the Office page's current wording of the purpose is "Christian purposes"; the book follows shared-facts.md, which CSJ supports) |
| The Office asks about motivation at the end of the walk; the Compostela for those who state "religious" or "spiritual" as a reason | as stated | CSJ https://www.csj.org.uk/the-compostela/ | yes |
| The credencial is "for pilgrims on foot, bicycle or horseback, who wish to make the pilgrimage with a Christian sentiment, even if it is only with an attitude of search" (quoted) | quote | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ ("Necessary considerations") | yes |
| Official model: a card of sixteen concertina-folded pages; first page for the pilgrim's data; the rest for stamps | sixteen pages | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Credencial available from the Pilgrim's Reception Office, from authorised associations of friends of the Way, confraternities, parish churches and pilgrim hostels; a list per country | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Stamps are normally collected where pilgrims sleep, and in parish churches, monasteries, cathedrals, hotels, town halls and other places | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| A digital credential exists as an app for Android and iOS | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| First practical use of the credencial: "access to hostels offered by the Christian hospitality of the Way" (quoted); hostels without subsidies are kept up by pilgrims' contributions | quote | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Certificate of distance: indicates the day and starting point, the kilometres covered, the day of arrival and the route; whatever the starting point; sold (the price is not in the book) | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/ | yes |
| The Office's reception service and the Compostela carry no charge | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/ ("completely free") | yes |
| A ticket with a QR code is collected; in times of great influx same-day collection cannot be guaranteed | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ (page footer and text) | yes |
| Hostal dos Reis Católicos: founded by the Catholic Monarchs in the 16th century as the Royal Hospital; a hotel since 1954 | 16th century; 1954 | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| CSJ: when 25 July is a Sunday it is a Holy Year; the last was 2021 (extended to 2022); the next is 2027; Holy Years bring a huge surge of pilgrims and Santiago is extremely busy, particularly around Easter and the feast of St James; book accommodation as far ahead as possible | 2027 | CSJ https://www.csj.org.uk/the-compostela/ | yes |
| A Jacobean Holy Year occurs when 25 July falls on a Sunday; recent 1993, 1999, 2004, 2010, 2021-22; next 2027 and 2032; the Holy Door is opened only in a Holy Year | 2027; 2032 | WP-en https://en.wikipedia.org/wiki/Jacobean_Holy_Year ; https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| 25 July 2027 and 25 July 2032 are Sundays | Sunday | computed (Python calendar) | computed |

## D. History and people

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| About 820 (the 820s) the tomb of St James the Elder was found by the hermit Paio in the wood of Libredón, on the word of Bishop Teodomiro of Iria; Alfonso II of Asturias ordered a modest church; it was the germ of the cathedral and the city | about 820 | XUNTA https://www.caminodesantiago.gal/en/discover/origins-and-evolution/from-the-first-pilgrims-to-the-present-day | yes |
| Asturian kings Alfonso II and Alfonso III were among the first known pilgrims | as stated | XUNTA (same page) | yes |
| Alfonso II was brought up in the Monastery of Samos | as stated | XUNTA (same page) | yes |
| Golden age of the pilgrimages in the 11th to 13th centuries: pilgrims from France, Italy, central and eastern Europe, England, Germany, on foot, on horseback and by ship; a network of hospitals founded by kings, nobles and bourgeoisie; in small medieval hospitals wards of twelve beds in memory of the twelve apostles | 11th to 13th centuries; twelve beds | XUNTA (same page) | yes |
| The pilgrim "was sent from heaven" and to be treated as Christ himself, for the medieval mind | quote | XUNTA (same page) | yes |
| The Reformation, wars of religion and the French Revolution reduced pilgrim numbers | as stated | XUNTA (same page) | yes |
| In May 1589, fearing an attack by Drake's English troops, the archbishop ordered the apostle's body concealed; the remains were found again in 1879 | 1589; 1879 | XUNTA (same page) | yes |
| First modern Jacobean associations: Paris 1950 and Estella 1963; Holy Years 1965 and 1971; the pilgrimage of Pope John Paul II in 1982 | 1950; 1963; 1982 | XUNTA (same page) | yes |
| Xunta: the French Way described in 1135 in the Codex Calixtinus, whose Book V is a medieval guide to the pilgrimage (stages, sanctuaries, hospitality, people, food, fountains, customs), attributed to the French cleric Aymeric Picaud | 1135 | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way | yes |
| Wikipedia: the compilation of the Codex likely dates to about 1138 to 1145; Book V is often called the first tourist guidebook; the work is falsely attributed to Pope Calixtus II; the author "Pseudo-Calixtus" is often identified with Aymeric Picaud, as a likely attribution rather than a certainty | 1138 to 1145 | WP-en https://en.wikipedia.org/wiki/Codex_Calixtinus | yes |
| The name Camino Francés is first recorded in the 12th century at Astorga and refers to the French settlers the rulers invited to build market towns | 12th century | WP-de https://de.wikipedia.org/wiki/Camino_Franc%C3%A9s (section Geschichte) | yes (German Wikipedia, single source; attributed in the text) |
| UNESCO inscribed the Camino Francés (with the Spanish Camino) in 1993; the northern routes were added in 2015 (not used in the text) | 1993 | UNESCO https://whc.unesco.org/en/list/669 (page blocked to fetch; confirmed by search results from whc.unesco.org); WP-en https://en.wikipedia.org/wiki/French_Way (infobox: designation date 1993) | yes (search summary for UNESCO; Wikipedia read) |
| The villages along the road have received pilgrims for "more than a thousand years" (from about 820 to 2026 is about 1,200 years) | >1,000 years | computed from the Xunta date above | computed |
| The Xunta describes the pilgrimage today as "spiritual and ecumenical, as well as open to knowledge, friendship and mutual understanding" (a "transversal phenomenon") | quote (paraphrased) | XUNTA https://www.caminodesantiago.gal/en/discover/origins-and-evolution/from-the-first-pilgrims-to-the-present-day (section "At the present time") | yes |
| Saint-Jean-Pied-de-Port: "Saint John at the foot of the pass"; old capital of the Basque province of Lower Navarre; the second most popular starting point of the French Way; Basque name Donibane Garazi | as stated | WP-en https://en.wikipedia.org/wiki/Saint-Jean-Pied-de-Port | yes |
| Battle of Roncevaux Pass in 778: Basques ambushed Charlemagne's rearguard; Roland killed; Basque name Orreaga | 778 | WP-en https://en.wikipedia.org/wiki/Battle_of_Roncevaux_Pass ; https://en.wikipedia.org/wiki/Roncesvalles | yes |

## E. Numbers of pilgrims

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| In 2024, 499,239 Compostelas; 47% on the Camino Francés, 19% on the Camino Portugués (the next most walked) | 499,239; 47%; 19% | WP-en https://en.wikipedia.org/wiki/Camino_de_Santiago (citing the Pilgrim's Office statistics) | yes (Wikipedia; the Office's statistics page is dynamic and was not readable) |
| In 2024 about 47% of pilgrims (over 235,000) took the French Way; 65% of those started in Sarria, 14% in Saint-Jean-Pied-de-Port; most finishers arrive between May and September | over 235,000; 65%; 14% | WP-en https://en.wikipedia.org/wiki/French_Way (section Statistics) | yes |
| In 2024 over 150,000 pilgrims set out from Sarria, about 64% of French Way pilgrims | 64% | WP-en https://en.wikipedia.org/wiki/Sarria,_Spain | yes |
| Pilgrims finishing the French Way by month, 2024: January 1,057; February 1,383; March 11,404; April 18,940; May 32,506; June 31,152; July 26,548; August 31,894; September 30,494; October 23,730; November 5,162; December 1,445; rounded in the book to ~1,000 to ~1,500 (Dec to Feb), ~11,000, ~19,000, ~32,500, ~31,000, ~26,500, ~32,000, ~30,500, ~24,000, ~5,000 | rounded | WP-en https://en.wikipedia.org/wiki/French_Way (timeline "Source: oficinadelperegrino.com") | yes (Wikipedia; the twelve figures add up to 215,715, below the "over 235,000" of the same article, which the book says) |

## F. Places on the way

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Valcarlos route: the lower road by Valcarlos and the Ibañeta pass is the way in bad weather and in winter | as stated | WP-es TABLE (rows for Lepoeder and "Puerto de Ibañeta (Camino bajo)"; "Alternativa al Puerto de Ibañeta por Valcarlos"); web-search summaries of pilgrim-route pages | yes |
| Winter closure of the high route: in November 2025 Navarre's government announced a closure from 1 November to 31 March | 1 Nov to 31 Mar | Noticias de Navarra, 7 November 2025 (https://www.noticiasdenavarra.com/navarra/2025/11/07/gobierno-navarra-activa-cierre-invernal-10316357.amp.html), as reported by a web-search summary; the page itself returned an error (HTTP 406) | yes (search summary; the owner should confirm against the Navarre government's own notice) |
| Pamplona: capital of Navarre; Basque name Iruña; the cathedral is 15th-century Gothic with a 13th- to 14th-century cloister | as stated | WP-en https://en.wikipedia.org/wiki/Pamplona ; https://en.wikipedia.org/wiki/Pamplona_Cathedral | yes |
| Pamplona's old walls; the Portal de Francia, the gate used since medieval times by pilgrims arriving from France | as stated | pamplona.es (https://www.pamplona.es/en/turismo/portaldefrancia) via a web-search summary; the page was not opened | yes (search summary) |
| The San Fermín festival runs from 6 to 14 July | 6 to 14 July | WP-en https://en.wikipedia.org/wiki/Festival_of_San_Ferm%C3%ADn | yes |
| Alto del Perdón: sculpture of iron pilgrims by Vicente Galbete, installed in 1996 | 1996 | web-search summary of walking and heritage pages (alberguescaminosantiago.com, 25th anniversary article, November 2021) | yes (search summary; single non-official source) |
| Santa María de Eunate: octagonal 12th-century Romanesque church about 2 km south-east of Muruzábal, in the countryside | 12th century; ~2 km | WP-en https://en.wikipedia.org/wiki/Church_of_Saint_Mary_of_Eunate | yes |
| Puente la Reina ("the Queen's bridge"): the first town after the junction of the French and Aragonese Ways | as stated | WP-en https://en.wikipedia.org/wiki/Puente_la_Reina,_Navarre | yes |
| Estella: founded in 1090 by a charter of King Sancho Ramírez; a landmark of the pilgrim road; Romanesque San Pedro de la Rúa and Palace of the Kings of Navarre | 1090 | WP-en https://en.wikipedia.org/wiki/Estella-Lizarra | yes |
| Monastery of Irache: former Benedictine monastery dating from the eighth century, surviving buildings later | 8th century | WP-en https://en.wikipedia.org/wiki/Monastery_of_Irache | yes |
| Villamayor de Monjardín: ruins of the castle of San Esteban de Deyo on the hill above | as stated | WP-en https://en.wikipedia.org/wiki/Villamayor_de_Monjard%C3%ADn | yes |
| Torres del Río: by the Linares river opposite Sansol; the Templar octagonal Romanesque church | as stated | WP-en https://en.wikipedia.org/wiki/Torres_Del_R%C3%ADo | yes |
| Viana: Cesare Borgia is buried there | as stated | WP-en https://en.wikipedia.org/wiki/Viana,_Spain | yes (Wikipedia; attributed in the text) |
| The Navarre to La Rioja border lies between Viana and Logroño | as stated | WP-es TABLE (Viana, province Navarra; Logroño, La Rioja); CAT: catalog/camino-frances/07.json notes | yes |
| Logroño: capital of La Rioja, on the Ebro, a centre of the Rioja wine trade | as stated | WP-en https://en.wikipedia.org/wiki/Logro%C3%B1o | yes |
| Rioja became Spain's first denominación de origen calificada in 1991; grapes from La Rioja, Navarre and Álava | 1991 | WP-en https://en.wikipedia.org/wiki/Rioja_(wine) | yes |
| Nájera: on the Najerilla river; capital of the Kingdom of Nájera-Pamplona until Castile conquered it in 1054; Santa María la Real founded 1052 by García Sánchez III; burial place of kings of Navarre | 1052; 1054 | WP-en https://en.wikipedia.org/wiki/N%C3%A1jera | yes |
| Santo Domingo de la Calzada: Saint Dominic died in 1109 and aided pilgrims on the Camino; the town is named after him; descendants of the chickens of the miracle are kept in the cathedral's choir loft; the legend of two cooked, beheaded chickens that came back to life to clear a pilgrim of theft | 1109 | WP-en https://en.wikipedia.org/wiki/Santo_Domingo_de_la_Calzada_Cathedral | yes |
| Redecilla del Camino is in the province of Burgos; La Rioja ends and Castilla y León begins (leaving La Rioja, entering Burgos, Castile and León) | as stated | WP-es TABLE (province column); WP-en ITIN (Santo Domingo to Belorado row notes) | yes |
| Montes de Oca: a comarca in the province of Burgos (Villafranca Montes de Oca) | as stated | WP-en https://en.wikipedia.org/wiki/Montes_de_Oca (disambiguation); WP-de TABLE | yes |
| San Juan de Ortega: Romanesque monastery at Barrios de Colina; commonly believed built by Saint John of Ortega himself around 1142 with Domingo de la Calzada; each March and September a beam of light at 5 pm solar time lights the Annunciation sculpture on a pillar | ~1142 | WP-en https://en.wikipedia.org/wiki/San_Juan_de_Ortega | yes |
| Atapuerca: UNESCO World Heritage Site since 2000; Gran Dolina remains of about 800,000 years ago, "the oldest known evidence of hominid settlement in Western Europe" | 2000; ~800,000 years | WP-en https://en.wikipedia.org/wiki/Archaeological_Site_of_Atapuerca | yes (Wikipedia; attributed in the text) |
| Burgos Cathedral: begun 1221, French Gothic, UNESCO World Heritage Site 1984, holds a tomb of El Cid | 1221; 1984 | WP-en https://en.wikipedia.org/wiki/Burgos_Cathedral | yes |
| Convent of San Antón (Castrojeriz): only an arch remains; founded by Alfonso VII in 1146; the Order of St Anthony; cared for sick pilgrims, especially those with St Anthony's fire | 1146 | WP-en https://en.wikipedia.org/wiki/Castrojeriz | yes |
| Castrojeriz: the route runs through the town for more than 1,500 m; ruins of a castle; the church of San Juan | ~1,500 m | WP-en https://en.wikipedia.org/wiki/Castrojeriz | yes |
| Puente Fitero over the Pisuerga: the line between the provinces of Burgos and Palencia | as stated | WP-en ITIN (Castrojeriz to Frómista row: "Leaving the province of Burgos, entering Palencia"); WP-es TABLE (Itero del Castillo, Burgos; Itero de la Vega, Palencia) | yes |
| Frómista: Romanesque church of San Martín de Tours, 11th century, underwritten in part by the widow of Sancho el Mayor of Navarre | 11th century | WP-en https://en.wikipedia.org/wiki/Fr%C3%B3mista | yes |
| Villalcázar de Sirga: in the Middle Ages the church of the Virgin of Villasirga was an important point on the road | as stated | WP-en https://en.wikipedia.org/wiki/Villalc%C3%A1zar_de_Sirga | yes |
| Carrión de los Condes: Hospital de la Herrada established in 1209 | 1209 | WP-en https://en.wikipedia.org/wiki/Carri%C3%B3n_de_los_Condes | yes |
| The Camino leaves Carrión past the monastery of San Zoilo | as stated | CAT: catalog/camino-frances/17.json (via point Monasterio de San Zoilo; "from memory" in the notes, so the book states only that the route leaves by it; the monastery is also named in the book as a landmark) | yes (repo) |
| Sahagún: in the province of León; often considered the halfway point between Saint-Jean and Santiago; some of the earliest examples of Mudéjar architecture | as stated | WP-en https://en.wikipedia.org/wiki/Sahag%C3%BAn | yes |
| Mansilla de las Mulas: a medieval bridge over the Esla | as stated | WP-en https://en.wikipedia.org/wiki/Mansilla_de_las_Mulas | yes |
| León: Roman military camp (Legio VI Victrix, about 29 BC); capital of the Kingdom of León after 910; the Cortes of 1188 | as stated | WP-en https://en.wikipedia.org/wiki/Le%C3%B3n,_Spain | yes |
| León Cathedral: begun in the 13th century, Gothic with French influences, one of the largest collections of medieval stained glass in the world | 13th century | WP-en https://en.wikipedia.org/wiki/Le%C3%B3n_Cathedral | yes |
| Basilica of San Isidoro: rededicated in 1063 to Isidore of Seville | 1063 | WP-en https://en.wikipedia.org/wiki/San_Isidoro,_Le%C3%B3n | yes |
| Casa Botines, by Gaudí, built 1891 to 1892 | 1891-1892 | WP-en https://en.wikipedia.org/wiki/Casa_Botines | yes |
| León suburbs on the way out: Trobajo del Camino, La Virgen del Camino, Valverde de la Virgen, San Miguel del Camino | as stated | WP-es TABLE (Trobajo del Camino "San Andrés del Rabanedo"; La Virgen del Camino) | yes |
| Hospital de Órbigo: a long stone medieval bridge, recently restored | as stated | WP-en https://en.wikipedia.org/wiki/Hospital_de_%C3%93rbigo | yes |
| Astorga: Roman military camp of the Legio X Gemina in the late 1st century BC, then Asturica Augusta; seat of one of Spain's oldest dioceses | as stated | WP-en https://en.wikipedia.org/wiki/Astorga,_Spain | yes |
| Episcopal Palace of Astorga, by Gaudí, built 1889 to 1913, one of only three Gaudí buildings outside Catalonia | 1889-1913; 3 | WP-en https://en.wikipedia.org/wiki/Episcopal_Palace,_Astorga | yes |
| Foncebadón: flourished in the Middle Ages as shelter for pilgrims; by the 1990s only two people lived among the ruins; pilgrims have brought it back | 1990s; two | WP-en https://en.wikipedia.org/wiki/Fonceb%C3%A1d%C3%B3n | yes |
| Cruz de Ferro: an iron cross on a tall wooden pole (about five metres in one description); about 1.6 km west of Foncebadón; pilgrims leave a stone brought from home; the origin is folklore and accounts vary | ~1.6 km | web-search summary (caminoways.com, followtheyellowshell.com and others); CAT: catalog/camino-frances/24.json notes ("Cruz de Ferro is a landmark ... 1.6 km west of Foncebadón") | yes (search summary; folklore, so the book says "custom" and "accounts vary") |
| Molinaseca: the name comes from old mills on the Meruelo river | as stated | WP-en https://en.wikipedia.org/wiki/Molinaseca | yes |
| El Bierzo: surrounded by mountains on all sides, remarkably isolated; Ponferrada is its capital | as stated | WP-en https://en.wikipedia.org/wiki/El_Bierzo ; https://en.wikipedia.org/wiki/Ponferrada | yes |
| Ponferrada: the Templars received the town from the king in the 12th century (the year usually given is 1178, from Ferdinand II) and built the castle to protect pilgrims; sources disagree on later dates | 12th century; 1178 | web-search summary (Ponferrada municipal visitor guide, spain.info, caminoways.com); the Wikipedia article on the castle was not found | yes (search summary; the owner may wish to check) |
| Villafranca del Bierzo: the name is said to mean "French town"; a Cluniac monastery founded in 1070 under Alfonso VI; a community of French pilgrims grew around it | 1070 | WP-en https://en.wikipedia.org/wiki/Villafranca_del_Bierzo | yes |
| Villafranca del Bierzo: the church of Santiago has the Puerta del Perdón; by tradition pilgrims unable to reach Santiago could receive the same indulgences; sources differ on when the door is open | tradition | web-search summary (caminoways.com, followthecamino.com, forum posts) | yes (search summary; the book says "by tradition" and "ask locally") |
| O Cebreiro: a village of prehistoric origin at 1,300 m between O Courel and Os Ancares; Galicia's first village on the road | ~1,300 m | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-o-cebreiro-tricastela ; WP-en https://en.wikipedia.org/wiki/O_Cebreiro | yes |
| O Cebreiro: pallozas, houses of an archaic type; the church of Santa María la Real built 1965 to 1971 on pre-Romanesque foundations; the legendary miracle of the Holy Grail | 1965-1971 | WP-en https://en.wikipedia.org/wiki/O_Cebreiro | yes |
| Triacastela to Sarria by San Xil passes A Balsa, Montán, Pintín, Calvor and San Mamede do Camiño; by Samos, San Cristovo do Real and the Monastery of Samos, "one of the oldest monasteries in the western world (VI century)" | 6th century | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-triacastela-sarria-through-san-xil | yes |
| Sarria: 13th-century church of O Salvador; the Convent of A Madalena, founded in the early 13th century as a pilgrim hospital | 13th century | WP-en https://en.wikipedia.org/wiki/Sarria,_Spain | yes |
| Portomarín: the Belesar reservoir flooded the old town in the 1960s; the church of San Xoán and other historic buildings were rebuilt in the new town | 1960s | WP-en https://en.wikipedia.org/wiki/Portomar%C3%ADn | yes |
| Ligonde: its hospital received the Emperor Charles I and his son Philip II, the best-known pilgrims of the 16th century; Palas de Rei owes its name to a supposed royal palace | 16th century | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-portomarin-palas-de-rei | yes |
| Palas de Rei to Melide: leafy woods; San Xiao do Camiño; O Leboreiro; Furelos; Melide to Arzúa "easy to walk on" with gradual climbs and descents, through Boente and Castañeda | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-palas-de-rei-melide ; .../stage-melide-arzua ; WP-es TABLE (O Leboreiro, Furelos) | yes |
| Melide: polbo á feira is a typical food of the town | as stated | WP-en https://en.wikipedia.org/wiki/Melide,_Spain | yes |
| Arzúa: the Arzúa-Ulloa cheese has protected designation of origin status | as stated | WP-en https://en.wikipedia.org/wiki/Arz%C3%BAa | yes |
| Arzúa to Arca: meadows and woods of oak, eucalyptus, fruit trees and fields; stretches of the N-547 highway, crossed several times ("special attention to the vehicles"); hamlets A Calzada, A Salceda, A Brea, Santa Irene and A Rúa; Arca is the municipal capital of O Pino, the last municipality before Santiago | as stated | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-arzua-arca | yes |
| Arca to Santiago: Santo Antón (where the ascent to the municipality of Santiago begins), O Amenal, Cimadevila, San Paio, Lavacolla (the first sub-stage Arca to A Lavacolla is 10 km of the 20.2), Monte do Gozo | ~10 km | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/french-way/stage-arca-santiago-de-compostela | yes |
| Santiago Cathedral: construction began in 1075; Romanesque at its core with Gothic and Baroque additions; the Pórtico da Gloria of Master Mateo, dated to 1188; the Baroque Obradoiro façade completed in 1740; built over the reputed tomb | 1075; 1188; 1740 | WP-en https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| The pilgrims' Mass at the high altar every day; a list of pilgrims who arrived in the past 24 hours is read with their starting points and nationalities or home provinces; more Masses in Holy Years; arrive well ahead | as stated | XUNTA https://www.caminodesantiago.gal/en/discover/origins-and-evolution/the-botafumeiro-and-pilgrim-mass | yes |
| The botafumeiro is used at Masses on key dates and on request from pilgrim groups (the book gives no weight or speed: XUNTA says 53 kg and 68 km/h, Wikipedia 80 kg and 80 km/h) | as stated | XUNTA (same page); WP-en https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| Finisterre was once believed to be the end of the world, hence its name | as stated | CSJ https://www.csj.org.uk/the-compostela/ | yes |

## G. Climate, daylight and seasons

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Pamplona: July average high 28.5 C; record 42.3 C; annual rain 720 mm (1991 to 2020) | ~28 C; ~42 C; ~720 mm | WP-en https://en.wikipedia.org/wiki/Pamplona (climate table; sources Météo Climat and Infoclimat) | yes |
| Burgos: June average high 24.3 C; July 27.9 C; record 39.3 C; January average high 7.3 C, low -0.3 C, record low -22.0 C; annual rain 546 mm (sum of the monthly values) (1991 to 2020) | ~24 C; ~28 C; ~39 C; ~7 C; about freezing; about -22 C; ~550 mm | WP-en https://en.wikipedia.org/wiki/Burgos (climate table, AEMET) | yes (the annual rain is a sum of the twelve monthly values) |
| Santiago: January average high 12.3 C, low 5.4 C; July high 24.8 C; rain by month January 195.8, September 88.6, October 214.0, July 30.6 mm; annual sum 1,526.6 mm | ~12 C; ~25 C; ~196, ~89, ~214 mm; ~1,500 mm | WP-en https://en.wikipedia.org/wiki/Santiago_de_Compostela (climate table, AEMET); sum computed | yes (the annual total is a sum) |
| The figures are 1991 to 2020 averages from AEMET for Burgos, León and Santiago and from French climate sites for Pamplona, as listed on Wikipedia | as stated | the climate tables above (source lines in the wikitext) | yes |
| Daylight: ~9 h at the December solstice and ~15 h at the June solstice anywhere on the road; the sun rises at about 08:30 in Saint-Jean and 09:00 in Santiago in December (08:33; 09:01) | ~9 h; ~15 h | computed with the NOAA solar equations at Saint-Jean (43.16 N, 1.24 W), Burgos, León, O Cebreiro and Santiago, for 21 December 2026 (CET) and 21 June 2026 (CEST): day length 8.98 to 9.08 h and 15.28 to 15.38 h | computed (owner to confirm with a sun table) |
| The Xunta advises a waterproof garment whatever the season, a cap against the sun and against cold in high places, and high-factor sunscreen | as stated | XUNTA https://www.caminodesantiago.gal/en/get-ready/what-you-cannot-leave-at-home | yes |

## H. Preparing, sleeping and eating

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CSJ training: walk regularly; add longer distances and hills; aim to walk 20 km or more a day over varied terrain; stretch; break in boots and socks; practise with a loaded rucksack and poles; train for stepping downhill; do not forget rest days; you will get fitter by doing the Camino itself; see a doctor with any worry | ~20 km | CSJ https://www.csj.org.uk/faqs/how-do-i-train-for-my-camino | yes |
| Xunta training: begin some months ahead with walks of gradually increasing time and difficulty; training walks of 23 to 30 km; shoes with ankle support; a hard sole and a heel that is not too soft; foot cream, seamless cotton socks, broken-in footwear; a light backpack; a small first-aid kit; short regular breaks | ~23 to ~30 km | XUNTA https://www.caminodesantiago.gal/en/get-ready/physical-and-mental-preparation | yes |
| CSJ packing: some advise no more than 10 to 15 per cent of body weight; one litre of water weighs 1 kg; base weight down to 7 to 10 kg; rucksack of 35 to 60 litres; boots in winter, late autumn, early spring, rough ground or ankle problems; some dislike Gore-Tex boots in hot dusty weather; buy from a specialist shop; do not buy boots that do not fit because they are cheap; poles optional; most airlines will not allow a stick in the cabin | 10 to 15%; ~7 to ~10 kg; 35 to 60 L | CSJ https://www.csj.org.uk/faqs/what-should-i-take-on-the-camino | yes |
| CSJ: a reflective vest (EN471) is a legal requirement in Spain when walking on roads in darkness or poor visibility; reflective clothing is a good idea in hunting season | as stated | CSJ https://www.csj.org.uk/faqs/what-should-i-take-on-the-camino | yes (CSJ's statement; the owner should check the current Spanish rule) |
| Xunta packing list: boots, light shoes for rest, seamless socks, trousers, two T-shirts, two jerseys, hat or cap, sleeping bag, canteen, high-factor sunscreen, small first-aid kit, documentation and credit cards ("it is advisable not to carry much cash"), mobile phone and charger, a waterproof garment in any season; optional: earplugs, torch, swimwear and others | as stated | XUNTA https://www.caminodesantiago.gal/en/get-ready/what-you-cannot-leave-at-home | yes |
| A regional TER train runs between Bayonne and Saint-Jean-Pied-de-Port; the line is 52 km | ~52 km | WP-en https://en.wikipedia.org/wiki/Bayonne%E2%80%93Saint-Jean-Pied-de-Port_railway | yes |
| Santiago airport (Santiago-Rosalía de Castro, formerly Lavacolla), about 12 km from the city, with flights to Spanish and other European cities and a city bus link | ~12 km | WP-en https://en.wikipedia.org/wiki/Santiago_de_Compostela_Airport | yes |
| Galician is an official language of Galicia along with Spanish; Santiago is the capital | as stated | WP-en https://en.wikipedia.org/wiki/Galicia_(Spain) | yes |
| Spain uses the euro | as stated | general knowledge (no price is stated in the book) | yes |
| Basque names: Orreaga (Roncesvalles), Iruña (Pamplona); Palas de Rei is also written Palas de Rey | as stated | WP-en https://en.wikipedia.org/wiki/Roncesvalles ; https://en.wikipedia.org/wiki/Pamplona ; WP-es TABLE ("Palas de Rey/ Palas de Rei") | yes |
| Public hostels of Galicia (Xunta network): places occupied as pilgrims arrive; people on foot have priority; one night maximum except illness or force majeure; lights out in the evening; hostels vacated early in the morning; payment (the amount and the hours are not in the book) | as stated | XUNTA https://www.caminodesantiago.gal/en/discover/the-way-at-the-present/1.4.2.-the-network-of-public-hostels | yes |
| Melide's polbo á feira; the cheese of Arzúa and A Ulloa; Rioja wine | as stated | rows in section F | yes |
| Burgos is known for its blood sausage (morcilla de Burgos); Castilla y León for milk-fed lamb (lechazo); the Spanish sources also say both hold protected geographical indications, which the book does not claim | as stated | web-search summary (ITACyL and alimentosdespana.es pages; WP-en https://en.wikipedia.org/wiki/Lechazo_de_Castilla_y_Le%C3%B3n) | yes (search summary) |
| The menú del peregrino is a set meal for pilgrims | as stated | general knowledge (same statement as the pilot guide); the book says to ask what is on it | yes |

## I. Brand and repository statements

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CaminoPlus: the offline-first companion app for the Camino, with maps that work without signal, stays and cafes, a pilgrim passport with stamps, a journal and friends; the app is in development; the paid plan is Pilgrim Plus | as stated | README.md; brand/BRAND_GUIDELINE.md section 1 | yes (repo) |
| Stages 1 to 3 are published in the app (is_published true in the seed); stages 4 to 33 are hidden (is_published false) | stages 1 to 3 | supabase/seed.sql (stages 1 to 3, is_published true); supabase/migrations/20261112000000_camino_frances_stages.sql (comments: stages 4 to 33 added hidden) | yes (repo; the book has "In the app" lines for days 1 to 3 only; the owner should confirm the live database matches the seed) |
| The catalog has 14 routes; Portuguese Way from Porto ~240 km; English Way ~120 km; Finisterre and Muxía ~90 km; Northern Way ~820 km | 14; ~240; ~120; ~90; ~820 km | supabase/migrations/20261106120000_more_caminos.sql; books/series.md ("each guide covers one route of the app's catalog (14 routes)") | yes (repo) |
| 112 is the European emergency number | 112 | .claude/skills/book-writer/reference/voice-and-honesty.md | yes |
| This book was written with AI assistance from public sources and not from a walk | as stated | books/series.json (ai_disclosure); .claude/skills/book-writer/reference/voice-and-honesty.md | yes |

## J. Advice, not facts (no source needed, kept plain)

Start slowly and take a rest day or two; carry food and water for the long stretches; start at first light in summer; use poles on the long descents; treat a hot spot early; keep your valuables close; earplugs and a head torch for dormitories; check mattress seams and keep the pack off the bed; take a private room when ill or sleeping badly; walk facing the traffic where there is no path; stay calm with a loose dog; see a doctor for anything that worries you; tell someone your plan; check that your insurance covers you in Spain; look at the app for beds; book ahead in busy months; arrive early in Santiago and leave a spare day; questions for the walk. Marked `advice`.

## K. Not verified and left out

- **Cited distances for stages 4 to 33 in the repository catalog.** The task brief expected several named sources per stage; the catalog's JSON files have no distance for stages 4 to 33 (the migration says so) and only seed values for stages 1 to 3. The book's figures come from the public tables described in section A and carry "~".
- **The Compostela purpose wording.** `books/shared-facts.md` says "religious and/or spiritual reasons". The Office's own pages as read on 2026-11-08 say that the Compostela is for those who walk "for Christian purposes" (devotionis affectu, voti vel pietatis) and that the credencial is for "a Christian sentiment, even if it is only with an attitude of search"; CSJ says "religious" or "spiritual". The book states the rule as shared-facts.md has it, quotes the Office's "attitude of search" phrase, and tells the reader to ask the Office. The owner should reconcile shared-facts.md with the Office's current text.
- **Ascent and descent per stage.** Only the figures worked out in section B are stated, and they are net differences between altitudes in Wikipedia tables, not surveyed ascents. Left out: total ascent per day.
- **Winter closure of the high route.** Only a news report of the 2025 announcement was found (read through a search summary; the article returned HTTP 406). The Navarre government's own notice and the legal text were not found. The book says "check the notice for your year".
- **The Alto del Perdón sculpture (author and year), the Puerta del Perdón at Villafranca, the Portal de Francia and the Templar castle of Ponferrada** were confirmed through web-search summaries only; the pages were not opened. The Wikipedia pages for the Ponferrada castle, the Roncesvalles collegiate church and the Órbigo bridge were not found at the expected addresses, so the book says little about them (no founding date for the Roncesvalles church, nothing about the Paso Honroso).
- **Hostel names, bed counts, prices, opening hours, phone numbers, coordinates.** Left out by the rules.
- **The Xunta's stage pages for Galicia** show full text only for the first sub-stage of each stage; the book uses the stage totals, ratings and the first sub-stage descriptions.
- **The Pilgrim's Office statistics page** is dynamic and was not readable; its numbers come through Wikipedia, and the monthly figures do not add up to the year's total there.
- **The Meseta altitude**: Wikipedia's article on the Meseta Central gives 700 to 800 m for the northern sub-plateau; the book says ~800 to ~900 m, which follows the altitude profiles of the route tables for the road itself.
- **Whether an app's digital stamps count for the Compostela**: left out; the book tells the reader to carry the paper credencial and ask the Office.

| Fact | Value | Source | Checked |
|---|---|---|---|
| The standard welcome sentence: written with AI assistance, from public sources; the author has not walked the road (added to the welcome, under "What this book is not") | as stated | books/shared-facts.md | yes |
