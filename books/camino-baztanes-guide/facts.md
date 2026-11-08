# Fact ledger: The Baztán Way (camino-baztanes-guide)

Working file, not published. One row per hard fact in the book. Last column: `yes` = the page or file was read in the relevant part on 2026-11-08 (the date of writing); `computed` = calculated from the figures cited, not looked up (flagged for the owner); `removed` = taken out of the book, kept here as a record. A fact with no row here is not in the book.

Source short names (addresses as read; the sites that failed are listed in section K):

- CAT = supabase/migrations/20261106120000_more_caminos.sql (route row `camino-baztanes`) and supabase/migrations/20261104150200_routes_maps.sql (difficulty check 1 to 5)
- APP = mobile/src/data/routeGuide.ts (the app's route notes for `camino-baztanes`)
- VN-R = Visit Navarra, route page "Camino Baztanés": https://www.visitnavarra.es/camino-baztanes (Spanish original; English at /en/camino-baztanes is machine-translated and was read too; where they differ the Spanish was followed). Visit Navarra is "Web Oficial de Turismo de Navarra".
- VN-B = Visit Navarra blog, "El Camino Baztanés, la belleza del Camino de Santiago en Navarra", 5 Aug 2024: https://www.visitnavarra.es/-/camino-santiago-baztanes
- VN-V = Visit Navarra, "Valle de Baztan": https://www.visitnavarra.es/es/valle-de-baztan
- VN-F = Visit Navarra, "Camino Francés" page: https://www.visitnavarra.es/camino-santiago-frances ; VN-C = https://www.visitnavarra.es/es/te-gusta/camino-de-santiago ; VN-P = https://www.visitnavarra.es/es/pamplona
- PF = Policía Foral de Navarra leaflet "Consejos para el Camino de Santiago 2026" (PDF linked from VN-C, https://www.visitnavarra.es/documents/8191683/59452711/Consejos+para+el+Camino+de+Santiago.+Policia+Foral+2026.pdf/659e0322-decd-3f62-2685-2052724db786). The PDF's text layer is overlapped (Spanish and Basque columns); the lines used were read in the Spanish column.
- MN = Meteo Navarra (regional weather and climate service): https://meteo.navarra.es/climatologia/ ; /climatologia/zona_atlantica.cfm ; /climatologia/zona_media.cfm
- ER = Eroski Consumer, Camino pages for the Baztán route. Main page https://caminodesantiago.consumer.es/en/the-st-james-way/baztan-way (Spanish: /los-caminos-de-santiago/camino-baztanes). Stage pages: ER-1 bayona-to-ustaritz (ES: etapa-de-bayona-a-ustaritz), ER-2 ustaritz-to-urdax (ES: etapa-de-ustaritz-a-urdax), ER-3 urdax-to-elizondo-stage (ES: etapa-de-urdax-a-elizondo), ER-4 stage-from-elizondo-to-berroeta (ES: etapa-de-elizondo-a-berroeta), ER-5 berroeta-to-olague-stage (ES: etapa-de-berroeta-a-olague), ER-6 olague-to-pamplona (English page only: the Spanish page returned "not found"). The English pages are machine-translated; the Spanish original was read for ER main, ER-1 to ER-5. Eroski is a consumer-advice site, a secondary source, named in the text where used; the pages are undated, and the text mentions 2016.
- AC = Albergues del Camino (a pilgrim-hostel directory, a secondary source): https://www.alberguescaminosantiago.com/camino-baztanes/guia-etapas/ ; AC-25 = https://www.alberguescaminosantiago.com/2025/09/25-anos-de-camino-en-las-montanas-de-baztan/
- CF = compostelle.fr, website of the Amis du chemin de St-Jacques Pyrénées-Atlantiques (the French association): home https://www.compostelle.fr/ ; topo https://www.compostelle.fr/chemins/voie-du-baztan/topos/ ; route topos https://www.compostelle.fr/chemins/voie-du-baztan/gpx-bayonne-urdax-par-ainhoa/article/topo , .../gpx-bayonne-urdax-par-st-pee-s-nivelle/article/topo , .../gpx-bayonne-pamplona/article/topo (Urdax to Pamplona)
- BT = Office de tourisme de Bayonne: https://www.bayonne-tourisme.com/fr/decouvrir-bayonne/ville-art-histoire/les-chemins-de-saint-jacques.php
- T64 = Tourisme 64, "Aïnhoa, une bastide-rue au Pays basque": https://www.tourisme64.com/nos-destinations/pays-basque/ainhoa/ ; AIN = commune of Ainhoa, "Identité": https://www.ainhoa.fr/identite
- WP = Wikipedia (English): Baztan, Navarre; Pamplona Cathedral; Festival of San Fermín; Ignatius of Loyola; Urdazubi/Urdax. WP-FR = French Wikipedia, "Voie du Baztan": https://fr.wikipedia.org/wiki/Voie_du_Baztan
- OP = Pilgrim's Reception Office, Santiago: https://oficinadelperegrino.com/en/the-compostela/ ; /en/pilgrimage/the-credencial/ ; /en/pilgrimage/certificate-of-distance/
- XG = Xunta de Galicia, "Get ready" pages: https://www.caminodesantiago.gal/en/get-ready/what-you-cannot-leave-at-home ; /get-ready/physical-and-mental-preparation/recommendations-for-keeping-fit-and-healthy
- CSJ = Confraternity of St James: https://www.csj.org.uk/pilgrim-passports
- SHARED = books/shared-facts.md ; FW = books/camino-frances-guide (chapter 03 and chapter 06, and its facts.md) ; CALC = NOAA general solar equations, computed by the author

## A. The route in the catalogue and in the app

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The app's catalogue has the road as Bayonne to Pamplona, in France and Spain, with no distance and no stage count | no length | CAT (row camino-baztanes: countries FR, ES; start Bayonne; end Pamplona; distance_km null; stage_count null) | yes |
| Difficulty 3 on a scale of 1 to 5; the Francés is rated 3, the Primitivo 4, the Inglés 2 | 3; 3; 4; 2 | CAT (rows camino-baztanes, camino-frances, camino-primitivo, camino-ingles; check between 1 and 5 in 20261104150200) | yes |
| The app has no stage rows or files for this road, so the book has no "In the app" pointers | none | CAT; tools/offline-maps/catalog (only camino-frances, camino-ingles, camino-portugues); .claude/skills/book-writer/reference/guidebook.md | yes |
| The app's route notes: hilly with forest paths, rain is common, small route so plan stops; best May to September | as stated | APP (entry camino-baztanes: terrain, tip, best) | yes |
| The app spells the route "Baztanes"; Spanish sources write "Baztanés" | as stated | CAT; VN-R, VN-B, ER | yes |
| Description of CaminoPlus (offline-first companion app; maps without signal, stays and cafes, pilgrim passport with stamps, journal, friends); the paid plan is Pilgrim Plus | as stated | .claude/skills/book-writer/reference/voice-and-honesty.md | yes |

## B. Length and stages

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Visit Navarra proposes dividing the 109.4 km between Bayonne and Pamplona into six stages | ~109 km; 6 | VN-B ("dividir los 109,4 km entre Bayona y Pamplona en 6 tramos") | yes |
| Eroski gives the same six stages and the same total (109.4 km) | ~109 km; 6 | ER main ("Etapas 6, KM 109,4") | yes |
| ~32 km in the French Basque Country and ~77 km in Navarre | ~32; ~77 km | VN-B; ER main (both: 32 km in Pyrénées-Atlantiques, 77 km in Navarre) | yes |
| Stage 1 Bayonne to Ustaritz 14.3 km; no difficulty; about 3 hours | ~14 km | VN-B; ER-1 (km 14,3; 3 h 15 in ER) | yes |
| Stage 2 Ustaritz to Urdazubi/Urdax 21.2 km; about 5.5 hours | ~21 km | VN-B; ER-2 (km 21,2) | yes |
| Stage 3 Urdazubi/Urdax to Elizondo 18.8 km; about 4.5 hours | ~19 km | VN-B; ER-3 (km 18,8) | yes |
| Stage 4 Elizondo to Berroeta 9.7 km; about 2 h 15 | ~10 km | VN-B; ER-4 (km 9,7) | yes |
| Stage 5 Berroeta to Olagüe 20.4 km; about 5 hours | ~20 km | VN-B; ER-5 (km 20,4; 5 h 15 in ER) | yes |
| Stage 6 Olagüe to Pamplona 25 km; about 6 hours | ~25 km | VN-B; ER-6 (km 25,0) | yes |
| The six stage figures add up to the 109.4 km | 14.3+21.2+18.8+9.7+20.4+25.0 = 109.4 | computed from the six rows above | computed |
| Visit Navarra's route page shows 86 km for "De Urdazubi/Urdax a Arre"; its blog says 77 km in Navarre (the book uses the blog and notes the mismatch) | ~86 km; ~77 km | VN-R (header "86 kilómetros ... De Urdazubi/Urdax a Arre"); VN-B | yes |
| The French association's five stages: Bayonne to Souraïde 24.7, Souraïde to Amaiur 20.8, Amaiur to Berroeta 18.5, Berroeta to Olagüe 20, Olagüe to Pampelune 24.4 km | ~25, ~21, ~19, ~20, ~24 km | CF topos | yes |
| The five stages add up to ~108 km | 108.4 km | computed (24.7+20.8+18.5+20+24.4) | computed |
| The French association's six-stage plan by Saint-Pée-sur-Nivelle: Bayonne to Saint-Pée 24, Saint-Pée to Urdax 19 km (then Urdax to Elizondo 19, Elizondo to Berroeta 10, Berroeta to Olagüe 20, Olagüe to Pampelune 24.4) | ~24; ~19 km | CF topos | yes |
| By Saint-Pée and Sare, Bayonne to Urdax is ~43 km; by Ainhoa, ~36 km | ~43; ~36 km | computed (24+19 = 43; ER/VN-B 14.3+21.2 = 35.5) | computed |
| The Saint-Pée route follows the GR 10 (red and white marks) for part of the way to the frontier, crosses on a woodland path and reaches Urdax by a lane | as stated | CF topo (par St-Pée s/Nivelle: "GR 10 (balisage rouge/blanc) sur 2,5 km jusqu'à la frontière") | yes |
| The directory's six stages to La Trinidad de Arre: 14.1, 21.7, 9.57, 18.3, 19.5, 19.7 km; about 103 km | ~14, ~22, ~10, ~18, ~20, ~20 km; ~103 km | AC (table "Etapas del Camino Baztanés de un vistazo"; intro "aproximadamente 103 km") | yes |
| The directory's stages add up to 102.9 km | 102.87 km | computed | computed |
| Bayonne to the frontier is ~32 km (14.3 + 17.7), Urdax ~36 km | ~32; ~36 km | computed from ER-1 (14.3) and ER-2 (frontier km 17.7; Urdax km 21.2) | computed |
| Where the same stage is in two sources, the figures differ by a kilometre or two | as stated | VN-B vs AC vs CF (14.3/14.1; 21.2/21.7; 20.4/19.5/20; 25/24.4) | yes |
| On Day 2 the frontier is ~18 km after Ustaritz; Souraïde ~10 km after Ustaritz | ~18; ~10 km | ER-2 (Km 17,7 Dantxarinea; Km 10,1 Souraide), Spanish original read | yes |
| Almandoz ~2 km after Berroeta; Lantz ~15 km into Day 5 (15.3 in AC, 15.6 in ER-5) and ~4 km before Olagüe (4.2 in AC) | ~2; ~15; ~4 km | ER-5 (Km 2,4; Km 15,6; Km 20,4); AC | yes |
| Sorauren is ~14 km into Day 6; no catering before it in ER's notes; ~6 km of river park after it | ~14; ~6 km | ER-6 (Km 14.1; "until Sorauren ... we will not find any catering service"; "next six kilometres run through the river park") | yes |
| Arre is ~20 km from Olagüe (Km 20.4); Pamplona 25: the rest is ~4.6 km (ER) or ~4.9 km (AC) | ~20; ~5; ~4.6; ~4.9 km | ER-6; AC ("continuar hasta Pamplona ... aproximadamente 4,9 km por Villava") | yes |
| Day 1 can be stretched to Souraïde or Espelette, about 25 km from Bayonne (ER), which is also the French association's first stage (24.7 km) | ~25 km | ER-1 (Spanish: "cerca de 25 kilómetros desde Bayona"); CF topos | yes |
| Day 3 can be lengthened to Berroeta, 28.5 km (ER); Day 4 can be extended by 5.3 km to the inn on the climb (ER) | ~28 km; ~5 km | ER-3 ("alargarla ... 28,5 kilómetros"); ER-4 ("5,3 kilómetros hasta la Venta San Blas") | yes |
| The directory ends its third stage at Amaiur/Maya after 9.57 km (the Otsondo climb) | ~10 km | AC | yes |
| The directory suggests Lantz as an earlier stop on the Belate day | as stated | AC ("Lantz después de Belate ...") | yes |
| Pamplona is ~712 km from Santiago by the French Way, 30 days; other tables differ by several kilometres | ~712 km; 30 days | FW chapter 03 and its facts.md (row 68) | yes |
| Baztán road plus French Way from Pamplona make about 820 km | ~820 km | computed (109 + 712) | computed |
| The French Way guide's day from Pamplona to Puente la Reina is ~24 km | ~24 km | FW chapter 06 | removed |

## C. Heights and effort

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Belate pass 847 m | ~847 m | CF topos ("col de Belate, 847 m"); WP-FR | yes |
| "près de 900 m" at the col de Belate (the association's description of the Berroeta to Olagüe day) | about 900 m | CF gpx-bayonne-pamplona topo | yes |
| Belate pass 938 m | ~938 m | VN-B ("Puerto de Belate (938 metros)") | yes |
| Otsondo pass 670 m | ~670 m | WP-FR (col d'Otxondo, 670 m) | yes |
| Belate is considerably lower than the entrances of the Francés and the Aragonés | as stated | VN-B ("considerable menor altitud con respecto a las entradas del Camino Francés y Aragonés") | yes |
| The French association: the road crosses the Pyrenees by the lowest pass (Belate); "peu connu"; green landscapes | as stated | CF topos | yes |
| ~450 m of climbing at the start of Day 3 | ~450 m | AC ("unos 450 metros de ascenso acumulados en el tramo inicial") | yes |
| More than ~600 m of accumulated climbing between Almandoz and the pass; "etapa reina" | ~600 m | ER-5 Spanish original ("superando los 600 metros de desnivel acumulado") | yes |
| The first ~13.5 km of Day 2 are "rompepiernas" | ~13.5 km | VN-B; ER-2 Spanish original | yes |
| Eroski rates Days 1, 4 and 6 as easy or nearly so: no difficulty; no serious difficulties, a short climb to Zigaurre; "little or no" difficulty | as stated | ER-1; ER-4 (Spanish original); ER-6 (English only) | yes |
| Visit Navarra's route page calls the road gentle and beautiful ("suavidad y belleza del recorrido") | as stated | VN-R (Spanish original; the English page says "beautiful, gentle landscape") | yes |
| Otsondo is easily wrapped in mist (CF); thick woods, easily misty (ER-3) | as stated | CF gpx-bayonne-pamplona topo; ER-3 Spanish original ("bosque ... de bruma fácil") | yes |
| Day 5: the weather weighs more here than on any other stage; rain, mud or fog slow the going | as stated | AC ("La meteorología pesa aquí más que en cualquier otra etapa") | yes |

## D. History and meaning

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| One of the oldest paths in Navarre; armies, merchants and kings used it; from the 9th century European pilgrims, especially from Aquitaine and Brittany | as stated | VN-B | yes |
| Pilgrims' hospitals and monasteries of the 11th and 12th centuries known from remains and deeds of donation; the monasteries of Urdazubi/Urdax and Belate stand out; a pilgrims' hospital was set up at the Urdax monastery | 11th and 12th centuries | VN-B | yes |
| Padre Germán de Pamplona's 1964 study "Bayona-Urdax-Velate-Pamplona" argued the road was busier than some think; it has guided the recovery | 1964 | ER main (Spanish original) | yes |
| The Association of Friends of the Camino de Santiago in Urdax-Baztán began in 2000 to recover the road (founded 12 September 2000) | 2000 | ER main; AC-25 | yes |
| The road was close to lost in places; volunteers cleared paths with brushcutters | as stated | AC-25 ("desbrozadoras") | yes |
| The chapel of Santiago at Belate, of the 12th century, was rebuilt after great effort and blessed on 5 June 2016 | 12th century; 2016 | ER-5 Spanish original ("domingo 5 de junio de 2016"); AC-25 ("inaugurada ... el 5 de junio de 2016") | yes |
| Documents about the road go back to the 12th century, in the association's own account as reported by the directory | 12th century | AC-25 | yes |
| Written references from 1221 | 1221 | AC-25 | removed |
| The hospital of Santa María de Belate is of the 12th century; a letter of 1378 from the bishop of Bayonne, reported by Padre Germán, said countless men would be lost and die in these mountains and forests, especially in winter, without the hospital's free hospitality, food, help and guidance | 12th century; 1378 | ER-5 Spanish original | yes |
| The old hospital of Belate received pilgrims on the Baztán road | as stated | WP-FR | yes |
| The way crosses the line between the Atlantic and Mediterranean basins; a gate marks the boundary of the Baztán and Ultzama valleys | as stated | ER-5 Spanish original | yes |
| The Eroski text says the old road at Belate may be Roman, with no agreement | removed | ER-5 (Spanish: "La calzada ¿Romana?") | removed |
| Bayonne is at the crossroads of the Camino del Norte and the Voie de Soulac; you can join the Camino Francés at Pamplona by continuing on the Baztán road from Bayonne | as stated | BT | yes |
| Bayonne's cathedral Sainte-Marie was inscribed by UNESCO in 1998 as part of the "Chemins de Saint-Jacques-de-Compostelle en France" | 1998 | BT (UNESCO's own site refuses fetches; the date is the tourist office's) | yes |
| Bayonne's cathedral is Gothic; the road begins at its front | Gothic | ER-1 ("the Gothic cathedral, from the 13th to the 17th centuries"; Km 0) | yes |
| The French association starts the route from the cathedral or from its pilgrims' refuge in Bayonne; its site lists the refuge among its activities | as stated | CF gpx-bayonne-urdax-par-ainhoa topo; CF home ("Nos activités") | yes |
| Three Jacobean roads leave Bayonne: toward Saint-Jean-Pied-de-Port, toward Irun and the coast, and to Pamplona | 3 | ER-1 (post showing the three possible Jacobean paths; remarks list the three routes) | yes |
| Eroski note: credencial and stamps could be had at Bayonne's cathedral; the association ran an information point in season (hours not used; date unknown) | as stated | ER-1 remarks | yes |
| Baztán is the largest municipality in Navarre | removed | WP Baztan, Navarre | removed |
| Portal de Francia dated 1553 | removed | ER-6 (English only) | removed |

## E. The days, from France to the Ultzama

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The way is marked "voie du Baztan" all the way to the frontier; beyond it, follow the Spanish yellow arrows | as stated | CF gpx-bayonne-urdax-par-ainhoa topo | yes |
| The marks on the French side are small (stickers); more attention is needed than later | as stated | ER main; ER-1; ER-2 | yes |
| Day 1: mostly the Nive's towpath (chemin de halage); mules pulled the barges; under the A-63 and a rail bridge | as stated | ER-1 Spanish original; CF topo ("chemin de halage jusqu'à Ustaritz") | yes |
| Ustaritz: church of St Vincent, 19th century | 19th century | ER-1 | yes |
| Day 2: oak and chestnut woods; two places in the first ~4 km where many pilgrims lose the way; follow only the voie du Baztan marks, other yellow marks lead to local routes | as stated | ER-2 | yes |
| Espelette is about a kilometre off the way | ~1 km | ER-2 ("A little over a kilometre ... diversion to Espelette") | yes |
| Souraïde has a church dedicated to St James | as stated | CF gpx-bayonne-urdax-par-ainhoa topo ("église dédiée à St Jacques"); ER-2 | yes |
| At the Col de Pinodieta the way crosses the Camino from Saint-Jean-Pied-de-Port to Irun | as stated | ER-2 | yes |
| Ainhoa: a bastide-rue (one broad street) built in the 12th century to welcome pilgrims on the voie du Baztan; church of Notre-Dame de l'Assomption of the 13th century with tiers of galleries | 12th; 13th century | T64 | yes |
| Ainhoa straddles the frontier; the pilgrims' road passes through it; frontier at the quarter Dantxaria (Ainhoa) leading to the quarter Dantxarinea (Urdax) | as stated | AIN | yes |
| Dantxarinea lives on border trade; you pass the old customs buildings and the small stream Lapitxuri entering Spain; a path beside the Ugarana river leads to Urdax | as stated | ER-2 | yes |
| At Dantxarinea the way runs beside the N-121-B and leaves it at a Jacobean milestone | N-121-B | ER-2 | yes |
| The caves of Urdazubi/Urdax, carved by the river Urtxuma, about 14,000 years old, visited on a guided tour | ~14,000 years | VN-R ("una gruta de 14.000 años originada por la erosión del río Urtxuma"); WP Urdazubi/Urdax says the same | yes |
| Day 3: the pass of Otsondo comes at the start and must be taken calmly; strong ramps on a rough track, then a forest track | as stated | VN-B; ER-3 Spanish original | yes |
| Amaiur/Maya: Navarre lost its independence in 1512; troops loyal to the Navarrese crown held the castle until defeated in 1522; ruins and a monolith on the hill of Gaztelu; a museum | 1512; 1522 | VN-R; VN-V | yes |
| Amaiur village: one street, farmhouses of all local styles, a porticoed arch, a medieval church of the Assumption, a restored mill grinding maize since the 18th century | as stated | VN-V ("pueblo-calle", "arco porticado", "Iglesia de la Asunción, de origen medieval", "molino ... desde el S.XVIII") | yes |
| Two ways out of Amaiur, by Urrasun and by Bozate, rejoining at Arizkun | as stated | AC ("dos alternativas iniciales ... ambas vuelven a reunirse en Arizkun") | yes |
| The hermitage of Santiago at Urrasun was restored in 2007 and 2008 | 2007; 2008 | ER-3 Spanish original | yes |
| Bozate is the quarter of Arizkun where the agotes lived, a people who suffered exclusion and about whom much has been speculated | as stated | VN-V (Spanish original) | yes |
| Elizondo: the main town of the valley; mansions and palaces reflect the wealth emigrants to America brought home; the baroque palace of Arizkunenea, of 1730; the baroque church of Santiago | 1730 | VN-V | yes |
| The road stops at Elizondo, where you can reach more services | as stated | VN-B ("lo que te permitirá acceder a más servicios") | yes |
| Elizondo's chocolate with hazelnuts | as stated | VN-R | yes |
| The valley: one of the most idyllic of the Atlantic Pyrenean valleys; soft green hills, farmhouses of stone with pinkish stonework, cattle in the meadows | as stated | VN-B; VN-V ("caseríos de piedra con tejados y sillares rosados") | yes |
| Day 4 route: past the town hall, over the river, Lekaroz, Irurita, Zigaurre and its chapel of San Andrés, Ziga, Aniz, Berroeta | as stated | ER-4 Spanish original | yes |
| Irurita is the second most populous village of the valley, with fine civil architecture | as stated | VN-V | yes |
| Ziga's church of St Lawrence is large for so small a village; the locals call it the cathedral | as stated | VN-V ("sorprende por su gran envergadura"); ER-4; CF gpx-bayonne-pamplona topo ("surnommée par les locaux « la cathédrale »") | yes |
| A viewpoint over the valley near Ziga, a little off the path | as stated | ER-4 ("not exactly on the road path"); VN-V | yes |
| Day 5: two thirds through woods and mid-mountain; the climb passes an inn on the site of an old hostel for wayfarers and pilgrims; steep forest path over Mount Larrondo and Mount Arluz; stone markers at the top | as stated | VN-B; ER-5 Spanish original ("antiguo albergue de viandantes y peregrinos, sito en este mismo lugar") | yes |
| The road runs close to the path as far as the monastery of Belate; the stretch from there to Lantz is the loneliest; extra care in fog or bad weather | as stated | ER-5 Spanish original | yes |
| Beyond Belate the path crosses the young Ultzama river and runs through beech woods where the track fades; watch the arrows | as stated | ER-5 Spanish original | yes |
| In winter snow is easy to find at the pass; Eroski's advice is to abandon the stage or go on with extreme caution by the road from the inn | as stated | ER-5 Spanish original ("fácil encontrar nieve ... abortar la etapa, o continuar con extrema precaución por la carretera") | yes |
| Olagüe is the capital of the Anué valley, with a baroque parish church | as stated | ER-5 | yes |
| Day 6: Leazkue, Etulain, Burutain, Ostiz, Enderiz, Olaiz (valleys of Anué, Odieta, Olaibar); Sorauren with a medieval four-arched bridge; industrial estate; the ring road; Arre | as stated | ER-6 | yes |
| The path between Enderiz and Olaiz can be muddy after a little rain and may have a fallen tree | as stated | ER-6 | yes |
| At the medieval bridge of the Trinity in Arre the Baztán road meets the Francés; across the bridge are the old hospital of the Trinity (a pilgrims' hostel today) and a Romanesque basilica | as stated | ER-6; VN-F ("la Trinidad de Arre ... basílica, de origen románico ... Hoy es hospital de peregrinos"); CF gpx-bayonne-pamplona topo | yes |
| The French Way goes on through Villava and Burlada to the river Arga (Magdalena bridge) and Pamplona | as stated | ER-6 | yes |
| The Portal de Francia is the gate pilgrims from France entered by | as stated | FW chapter 06 | yes |

## F. Weather, daylight and safety

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Northern valleys of Navarre: oceanic climate, abundant rain, fog and drizzle, the rainiest zone; representative station Doneztebe/Santesteban | as stated | MN zona_atlantica.cfm ("la zona más lluviosa de Navarra"; "Los gráficos climáticos de Doneztebe/Santesteban ... son representativos") | yes |
| Spring: highs rising from 16 C in March to 21 C in May in the valleys; rain 260 to 570 l/m2 over the season | ~16; ~21 C; ~260 to ~570 mm | MN zona_atlantica.cfm | yes |
| Summer: daily lows and highs between 11 and 26 C in July and August; rain 120 to 360 l/m2; no summer drought | ~11 to ~26 C; ~120 to ~360 mm | MN zona_atlantica.cfm | yes |
| Autumn: 25 C afternoon in September at Doneztebe/Santesteban; 14.8 C in November; rain 250 to 650 l/m2 | ~25; ~14.8 C; ~250 to ~650 mm | MN zona_atlantica.cfm | yes |
| Winter: the mildest in Navarre, January average 7.2 C at Doneztebe/Santesteban; colder higher and further inland; rainy | ~7.2 C | MN zona_atlantica.cfm | yes |
| Annual rain in the zone 900 to 2,500 l/m2 | ~900 to ~2,500 mm | MN zona_atlantica.cfm ("entre los 900 ... y los 2500 l/m2") | yes |
| The Belate-Azpirotz ridge screens the rain fronts from the north and north-west; the southern valleys (Ultzama among them) keep some oceanic traits | as stated | MN /climatologia/ and zona_atlantica.cfm | yes |
| The Pamplona basin: sub-oceanic, less rainy than the north-west, a dry summer; July and August maxima 28 to 30 C | ~28 to ~30 C | MN zona_media.cfm | yes |
| A south wind (Foehn) brings sharp rises of temperature to the northern valleys; warm, dry, spreads fires quickly | as stated | MN zona_atlantica.cfm | yes |
| The Pilgrim's Office statistics page is built by script and cannot be read | as stated | SHARED (notes on the Office's pages) | yes |
| Météo-France is the French national weather service (named as a place to ask; no figure taken) | as stated | general knowledge, safe to state | yes |
| Sunrise and sunset at Elizondo (43.15 N, 1.52 W), local clock: 21 Dec 08:34 and 17:34, 9.0 h; 15 Nov sunset 17:44; 15 Apr sunset 20:47 (CEST); 15 May sunset 21:21; 21 Jun 06:26 and 21:49, 15.4 h; 21 Sep sunset 20:08; 15 Oct sunset 19:25 | ~08:35, ~17:35, ~17:45, ~20:45, ~21:20, ~06:25, ~21:50, ~20:10, ~19:25; 9 h; 15 h | CALC (script in the author's scratchpad; NOAA general solar equations) | computed |
| From late autumn to early spring ~9 to ~10 hours of light | ~9 to ~10 h | computed from the rows above (21 Dec 9.0 h; 15 Nov 9.8 h) | computed |
| Navarre keeps Central European Time, with summer time | CET/CEST | WP Baztan, Navarre (infobox: UTC+1 CET, summer UTC+2 CEST) | yes |
| San Fermín runs from noon on 6 July to midnight on 14 July | 6 to 14 July | WP Festival of San Fermín | yes |
| Visit Navarra: the road is far less popular than the French Way (less crowded); the French Way is better waymarked and has more services; some people link the road to the Primitivo because it keeps off road traffic; it keeps away from road traffic; "big landscapes" | as stated | VN-B ("no goza ni de lejos de la popularidad ... mejor señalizada y con más servicios ... menos masificado ... evita el tránsito por carreteras ... lo asocian al Camino Primitivo") | yes |
| The road is recommended to those who start in Bayonne or arrive on foot from the coastal route | as stated | CF topos ("recommandée aux pèlerins démarrant à Bayonne ou venant à pied depuis la voie du littoral") | yes |
| Policía Foral: on roads walk on the left, on the hard shoulder if there is one; in a group in single file; at night or in poor visibility use lights or reflective clothing | as stated | PF (Spanish column: "circule por la izquierda y, si existiese, por el arcén"; "hilera individual"; "elementos luminosos o reflectantes") | yes |
| Policía Foral: keep belongings in sight; bags and rucksacks closed and fastened; carry only the money needed in an inner wallet; keep passport or DNI in a safe place; do not confront the aggressor; report to the Policía Foral | as stated | PF | yes |
| "Facing the traffic" (walking on the left on a road where vehicles keep right) | as stated | inferred from the Policía Foral advice (left) and right-hand traffic in France and Spain | computed |
| Eroski's route notes mention crossings of main roads: at the frontier (N-121-B), below Otsondo (N-121-B), on the climb to Belate (NA-1210) | as stated | ER-2; ER-3; ER-5 Spanish original | yes |
| Eroski notes mud beside streams on Day 2, and a stream on the way to Belate that runs in the rainy season | as stated | ER-2; ER-5 | yes |
| Field gates and cattle grids on the path | as stated | ER-2; ER-5 ("portillo", "paso canadiense") | yes |
| 112 is the European emergency number; it works in France and in Spain | 112 | .claude/skills/book-writer/reference/voice-and-honesty.md (European emergency number); a European number | yes |

## G. Practical advice

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The credencial: stamps collected where pilgrims sleep, also in parish churches, monasteries, cathedrals, town halls and other places; official cards from parish churches, associations, hostels, confraternities and other authorised institutions in Spain and abroad | as stated | OP /the-credencial/ | yes |
| The CSJ pilgrim credencial is accredited by Santiago Cathedral | as stated | CSJ pilgrim-passports | yes |
| Most people starting in Navarre go to Pamplona, bus to Elizondo, taxi to Urdax; others begin in Bayonne by bus from San Sebastián | as stated | VN-B | yes |
| Visit Navarra lists bus lines from Pamplona to Orreaga/Roncesvalles, Saint-Jean-Pied-de-Port and Sangüesa (none is used as a timetable) | as stated | VN-C | yes |
| Rucksack should not exceed 10 kg, padded straps; a waterproof garment regardless of the time of year | 10 kg | XG what-you-cannot-leave-at-home ; keeping-fit | yes |
| Footwear broken in, hard soles for irregular terrain, new stiff shoes will hurt; seamless socks; dry feet thoroughly (fungus); a staff helps on stony ground; see a doctor or pharmacist | as stated | XG keeping-fit; what-you-cannot-leave-at-home | yes |
| Carry documents and cards rather than a lot of cash | as stated | XG what-you-cannot-leave-at-home | yes |
| About two litres of water a day; the "15 kilometre barrier must never be passed without drinking water" (written in words) | ~2 litres | XG keeping-fit | yes |
| Hostels without subsidies are kept going within austerity with pilgrims' contributions | as stated | OP /the-credencial/ | yes |
| A hostel about every 11.5 km on average in Navarre | ~11.5 km | VN-B | yes |
| Several stage ends are small villages; some hostels work by prior notice or key collection | as stated | AC | yes |
| Beds may be scarce in high season | as stated | ER main (Spanish: "en temporada alta puede ser algo escasa") | yes |
| Hostels are run by an association of friends, parishes and town councils | as stated | ER (Urdax hostel by the association; Olagüe in the parish house); AC-25 | yes |
| Regional foods: cuajada de Ultzama, chuletones, cider-house menus | as stated | VN-B | yes |
| Talos at the restored mill in Amaiur | as stated | VN-R | yes |
| Pinchos in the bars of Pamplona's old town | as stated | VN-P | yes |
| Espelette peppers hang on the houses on the French side | as stated | ER-2 | yes |
| Eroski's notes: long stretches with nothing (the Otsondo climb, Belate to Lantz, the first ~14 km of Day 6) and some places closing on a Monday or a Tuesday (treated as a warning, no list) | as stated | ER-3; ER-5; ER-6 | yes |
| A pilgrim-hostel directory advises downloading the track before the Belate day | as stated | AC ("lleva el trazado descargado en el móvil") | yes |
| Navarre's official pages give place names in Basque and Spanish together (Urdazubi/Urdax, Amaiur/Maya, Doneztebe/Santesteban) | as stated | VN-R; VN-V; MN | yes |
| Visit Navarra's Camino page links to a Meteo Navarra forecast page for the Camino de Santiago | as stated | VN-C (link to meteo.navarra.es/predicciones/caminodesantiago.cfm; the link returned 503 when tried, so it is not relied on) | yes |

## H. Pamplona

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The old town has kept its medieval layout; three burghs (Navarrería, San Cernin, San Nicolás) united in 1423 by Charles III the Noble's Privilege of the Union | 1423 | VN-P | yes |
| The cathedral of Santa María: austere neoclassical façade, Gothic interior, alabaster tomb of Charles III and Eleanor, choir stalls, Gothic cloister "one of the best of Europe in its style" | as stated | VN-P | yes |
| The Gothic church is 15th century; the façade of 1783 | 15th century; 1783 | WP Pamplona Cathedral | yes |
| The walls can be walked; a Renaissance citadel; a day is hardly enough | as stated | VN-P | yes |
| At the Battle of Pamplona on 20 May 1521 a cannonball that ricocheted off a wall fractured the right leg of Íñigo de Loyola, who underwent a spiritual conversion during his recovery and became Ignatius of Loyola | 20 May 1521 | WP Ignatius of Loyola | yes |
| No source says Ignatius walked this road | as stated | books/ignatius-pilgrim-readings/chapters/00-how-to-use-this-book.md (the edition does not say which road he took) | yes |
| The Library holds a French Way guide and "The Pilgrim's Tale", seven days with the autobiography of Ignatius, made for the Camino Baztanes | as stated | books/series.md; books/ignatius-pilgrim-readings/book.json | yes |

## I. The Compostela and the Office

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Compostela rule, in the Office's words: religious and/or spiritual reasons, on foot, by bicycle or on horseback; at least the last 100 km on foot or on horseback, the last 200 by bicycle, shown by the stamped credencial; 100 continuous km on the same route the Office recognises, the final stage including the last into the cathedral; stages allowed in order, stamps at start and end of each stage with the date; no less than 70 km in Spain if a recognised route outside Spain was walked; the Cabildo may grant it in exceptional cases | as stated (words, not estimates) | SHARED (verified 8 Nov 2026); OP /the-compostela/ re-read the same day | yes |
| The Office's layers: "for Christian purposes", "religious and/or spiritual reasons", and the credencial "with a Christian sentiment, even if it is only with an attitude of search" (standard purpose sentence, word for word) | as stated | SHARED; OP /the-compostela/ and /the-credencial/ | yes |
| The Certificate of Distance records the kilometres whatever the starting point | as stated | OP /certificate-of-distance/ | yes |
| The Office's pages (the Compostela, the credencial, the certificate of distance) do not mention the Camino Baztanés and do not list the routes it recognises ("routes recognized by the International Pilgrim's Reception Office system") | as stated | OP (three pages read in full; no occurrence of Baztan) | yes |
| The standard welcome sentence | as stated | SHARED | yes |

## J. Left out (and why)

- Prices, phone numbers, opening hours, bed counts, the names of hostels, cafes, inns, mills, shops: not given (the book rule). The sources name several (Eroski, the directory); none is in the book.
- Zugarramurdi's cave and the 1610 trial: Visit Navarra's page mentions the cave; not needed for the walking days, so not used.
- The Gorramendi and Autza summits and other heights quoted by Eroski: not used.
- The stone waymarks carved by named craftsmen (VN-B, ER): not used.
- A UNESCO page for Bayonne's cathedral: refused all fetches (see K); the 1998 date is the Bayonne tourist office's and is attributed.
- Any pilgrim count for this road: none found in a source that could be checked.

## K. Sources that failed or were not usable

- www.turismo.navarra.es and the old Gobierno de Navarra Camino site (www.caminosantiago.navarra.es): connection refused by the proxy; the bare host turismo.navarra.es redirects to www.visitnavarra.es, which was read.
- www.baztan.eus, www.urdazubi.eus, www.baiona.org, compostelle-pyrenees-atlantiques.com: not reachable. The valley's own council page was therefore not read; Visit Navarra stands in.
- gronze.com: 403 to every fetch (and search results only); not used.
- espelette.fr page on the Chemins: redirects to a sign-up page; not used.
- Wikipedia's API rate-limited; pages were read through the plain article URLs, spaced out. English Wikipedia's "Velate Pass" and "Elizondo" are not articles (redirect or disambiguation), so the French article "Voie du Baztan" was used for the pass heights.
- Eroski's Spanish page for stage 6 (Olagüe to Pamplona) returned "not found"; the English page was used for it and the book's claims from it are limited to what other sources also say (Visit Navarra's 25 km, the French association's Arre bridge).
