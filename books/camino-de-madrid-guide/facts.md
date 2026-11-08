# Fact ledger: The Road from Madrid (camino-de-madrid-guide)

Working file, not published. One row per hard fact in the book. Last column: `yes` = the page, file or table was read in full or in the relevant part on 2026-11-08 (the date of writing); `computed` = calculated from the figures cited, not looked up (flagged for the owner); `removed` = taken out of the book, kept here as a record. A fact with no row here is not in the book. Page numbers are the printed numbers of the guide cited (the Association's guide is printed in two-page spreads, so a number may be off by one page).

Source short names (addresses in each row or here):

- CAT = supabase/migrations/20261106120000_more_caminos.sql (row camino-de-madrid: start Madrid, end Sahagun, distance_km 320, stage_count null, difficulty 3; the same file for camino-frances 3, camino-del-norte 4, camino-primitivo 4, camino-ingles 2). The scale is 1 to 5 (supabase/migrations/20261104150200_routes_maps.sql).
- APP = mobile/src/data/routeGuide.ts, entry 'camino-de-madrid' (the app's route notes).
- AAM = Asociacion de Amigos de los Caminos de Santiago de Madrid, a members' association (its name uses "Caminos"). AAM-G = its guide "Camino de Madrid a Santiago de Compostela. Cartografia e itinerario Madrid-Sahagun", 1st edition, July 2014, in Spanish, free download: https://demadridalcamino.com/wp-content/uploads/Guia-del-Camino-de-Madrid-a-Sahagun.pdf (linked from https://demadridalcamino.com/anuncios/guia-del-camino-de-madrid-a-santiago/). The PDF has a text layer with spacing errors; every figure used was read in the Spanish and agrees within the guide. Its kilometre marks count DOWN to Santiago by the Camino de Madrid (Madrid km 676, Sahagun km 355). AAM-Q = its page "Quienes somos", https://demadridalcamino.com/quienes-somos/ ; AAM-C = its page "Credencial", https://demadridalcamino.com/credencial/ ; AAM-L = its one-page leaflets "Sugerencias y consejos para preparar y realizar el Camino de Santiago", summer and winter, version 02.2021, https://demadridalcamino.com/wp-content/uploads/Recomendaciones-a-los-peregrinos_verano.pdf and ..._invierno.pdf (written in the COVID period; only the advice that does not depend on COVID is used); AAM-N = the title and date of its news item "Situacion de los albergues del Camino de Madrid a fecha 1 de octubre de 2026", https://demadridalcamino.com/situacion-de-los-albergues-del-camino-de-madrid-a-fecha-1-de-octubre-de-2026/ (the body of the item is not readable as text; only its title and date are used).
- JCYL-G = Junta de Castilla y Leon, pilgrim guide "The Madrid Route: A Practical Guide for Pilgrims" (Spanish original "Guia del Peregrino del Camino de Madrid"), published by Fundacion Siglo para el Turismo y las Artes de Castilla y Leon, last updated June 2020, 144 pages, ENGLISH EDITION read (translation credited to a professional translation agency in the colophon): https://www.turismocastillayleon.com/cm/facm/182911/203393-Gu%C3%ADa_del_Peregrino_del_Camino_de_Madrid_ENG.pdf . The Spanish edition (203389 and 203743 on the same portal, 19 MB) could not be downloaded (the connection was reset mid-transfer, five attempts), so the Spanish original of the guide was NOT read; its table figures were cross-checked with the Junta's Spanish web page (JCYL-W) and with AAM-G. JCYL-T = the table "Itinerary table-list of contents", pp. 28-31 (partial km, km in Castilla y Leon, km remaining to Santiago, altitude, inhabitants).
- JCYL-W = Junta de Castilla y Leon tourism portal, page "Camino de Santiago de Madrid" (Spanish original read): https://www.turismocastillayleon.com/es/patrimonio-cultura/camino-santiago-madrid ; JCYL-B = same portal, page "Ruta Camino de Madrid" (the cycling route; Spanish): https://www.turismocastillayleon.com/es/naturaleza/castilla-leon-bicicleta/ruta-camino-madrid
- CM = Comunidad de Madrid tourism site, page "Camino de Santiago en Madrid: Rutas jacobeas en la Comunidad de Madrid" (Spanish): https://www.visitmadrid.es/hacer-madrid-planes-experiencias-imperdibles/hacer/deporte-turismo-activo/camino-santiago-madrid . Direct curl returned 404; the page was read through the fetch tool, asked to quote the Spanish sentences verbatim (the quotes are in the rows).
- CSJ = Confraternity of St James, page "Camino de Madrid" (published 2 March 2020, updated 19 June 2025, author Hannah Murray): https://www.csj.org.uk/camino-de-madrid . CSJ is a charity (the site says so) based in the United Kingdom (csj.org.uk, pages on "Caminos in the UK").
- OP = Pilgrim's Reception Office of the Cathedral of Santiago: https://oficinadelperegrino.com/en/the-compostela/ , /en/pilgrimage/the-credencial/ , /en/pilgrimage/certificate-of-distance/ (re-read 2026-11-08; none of the three pages contains the word Madrid).
- SHARED = books/shared-facts.md (the Compostela rule, the purpose sentence, the welcome sentence).
- WP-VLL = https://en.wikipedia.org/wiki/Valladolid ; WP-SEG = https://en.wikipedia.org/wiki/Segovia ; WP-MAD = https://en.wikipedia.org/wiki/Madrid ; WP-AIR = https://en.wikipedia.org/wiki/Adolfo_Su%C3%A1rez_Madrid%E2%80%93Barajas_Airport ; WP-SAH = https://en.wikipedia.org/wiki/Sahag%C3%BAn,_Spain ; WP-MESTA = https://en.wikipedia.org/wiki/Mesta ; WP-ES = https://es.wikipedia.org/wiki/Camino_de_Santiago_de_Madrid . Wikipedia pages were read through the fetch tool's summary of the relevant section (direct fetches rate-limit); the values below are as that summary printed them.
- REPO-V = .claude/skills/book-writer/reference/voice-and-honesty.md ; REPO-R = README.md.

## A. Route, length, joins

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route in the app's catalog: Camino de Madrid, Madrid to Sahagun, Spain, distance_km 320, no stage count, difficulty 3 | ~320 km; 3 | CAT (row camino-de-madrid) | yes |
| App route notes: from Madrid north over the Sierra de Guadarrama to Sahagun, joining the Frances; areas Madrid and Sierra, Segovia, Castilla plains; best April to June and September to October; tip "lodging is sparse; check municipal albergues" | as stated | APP | yes |
| The app's note says "Navacerrada pass into Segovia province"; the sources put the crossing at the Puerto de la Fuenfria (the town of Navacerrada is passed before Cercedilla; the Navacerrada pass is the road alternative). The book follows the sources and does not repeat "Navacerrada pass" as the crossing | Fuenfria | AAM-G pp. 7, 25, 27; CM; JCYL-G p. 39; CSJ | removed |
| The start: the church of Santiago y San Juan Bautista, Plaza de Santiago, near the Royal Palace | as stated | CM ("El Camino comienza en la emblematica Iglesia de Santiago y San Juan Bautista (Plaza de Santiago), cerca del Palacio Real"); AAM-G p. 17 | yes |
| The present church dates from 1811 and replaced a medieval one | 1811 | AAM-G p. 17 (neoclassical, 1811, replaced a Romanesque one); JCYL-G p. 34 (built 1811 on the ruins of a 13th century temple) | yes |
| Two streets near the church called Conchas and Veneras (shells, scallop shells); the route passes them | as stated | AAM-G pp. 8, 17 | yes |
| Direction: north-west, almost straight, over the Sierra de Guadarrama, through Segovia and Coca, across the Duero, over the Tierra de Campos by Medina de Rioseco to Sahagun | as stated | CSJ ("goes north-westwards from Madrid to Sahagun virtually in a straight line ...") | yes |
| The road runs through 2 autonomous communities (Madrid, Castilla y Leon) and 4 provinces (Madrid, Segovia, Valladolid, Leon) | 2; 4 | AAM-G p. 13; JCYL-B (provinces Segovia, Valladolid, Leon) | yes |
| Landscape areas: foothills ~50 km from Madrid to Mataelpino rising 650 to 1,000 m; sierra from Mataelpino (1,080 m) to the Cruz de la Gallega (1,260 m), a little over 40 km; Tierra de Pinares ~100 km between Segovia and Puente Duero; Montes Torozos almost 50 km between Simancas and Medina de Rioseco; Tierra de Campos ~60 km to Sahagun | ~50; ~650 to ~1,000 m; ~100; ~50; ~60 | AAM-G pp. 10-11 | yes |
| The Puerto de la Fuenfria is the highest point of the Camino de Madrid | as stated | AAM-G p. 10; JCYL-G p. 20 | yes |
| At Sahagun you cross the river Cea by the Puente de Cantos and are on the Camino de Santiago (the Frances); the Madrid road joins the Frances at Sahagun | as stated | AAM-G p. 67 ("La salida de Sahagun hacia Compostela ya se hace sobre el Camino de Santiago tras cruzar el rio Cea por el puente de Cantos"); JCYL-W; CM; CSJ | yes |
| Length: CSJ 321 km; AAM-G 321 km | ~321 km | CSJ ("The route is 321 km long"); AAM-G pp. 7, 12 | yes |
| Length: Spanish Wikipedia infobox 324 km | ~324 km | WP-ES (infobox, as the fetch tool's summary printed it; the same summary said its waypoint table adds to 292 km, so the page disagrees with itself) | yes |
| Length: Junta 325.3 km, of which 241.5 km in Castilla y Leon; beyond Sahagun a little over 364 km to Santiago | ~325 km; ~242 km; ~364 km | JCYL-W ("325,3 kilometros de los que 241,5 ... algo mas de 364"); JCYL-G p. 25 | yes |
| The Association's own page "Quienes somos" gives 668 km total, 360 km "el Camino de Madrid, propiamente", and the Fuenfria at "casi 1.900 m"; its printed guide does not repeat these | ~360 km; ~1,900 m | AAM-Q | yes |
| CSJ: about two weeks to walk, excluding rest days; "can be walked in 2 weeks, an ideal pilgrimage for the busy individual" | about 2 weeks | CSJ | yes |
| Distance to Santiago by the Camino de Madrid: AAM-G 676 km from Madrid, 355 km from Sahagun; Junta table 689.4 km remaining at Madrid, 364.1 at Sahagun | ~676; ~690; ~355; ~364 | AAM-G p. 12; JCYL-T | yes |
| Madrid to Santiago together ~675 to ~690 km (320 + 355 up to 325 + 365) | ~675 to ~690 km | computed from the two rows above | computed |
| Santiago from Sahagun at the Junta's 25 to 30 km a day: ~12 to ~15 days | ~12 to ~15 days | computed: 355/30 = 11.8 and 364/25 = 14.6; the Junta's 25 to 30 km is in JCYL-G p. 8 | computed |
| Sahagun is a small town of about 2,400 inhabitants | ~2,400 | WP-SAH (infobox, 2,380 on 2025-01-01) | yes |

## B. The thirteen days (book's own grouping; neither guide divides the road into stages)

The Junta's table (JCYL-T) gives km remaining to Santiago: Madrid 689.4, Tres Cantos 666.6, Colmenar Viejo 654.7, Manzanares el Real 639.1, Cercedilla 619.2, Segovia 588.1, Santa Maria la Real de Nieva 556.1, Coca 537.1, Alcazaren 509.1, Puente Duero 485.1, Penaflor de Hornija 458.6, Medina de Rioseco 435.8, Cuenca de Campos 408.8, Santervas de Campos 386.8, Sahagun 364.1. Each day is the difference. The Association's marks (AAM-G pp. 69-73, "km N a Santiago") are: Madrid 676, Tres Cantos 653, Colmenar Viejo 641, Manzanares 626, Cercedilla 607, Segovia 576, Santa Maria la Real de Nieva 544, Coca 522, Alcazaren 497, Puente Duero 472, Penaflor 446, Medina de Rioseco 422, Cuenca de Campos 400, Santervas 378, Sahagun 355.

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Neither the Association's guide (26 map itineraries) nor the Junta's guide (town-to-town table) divides the road into stages; the thirteen days are the book's grouping | 13 days | AAM-G index and pp. 17-67; JCYL-G pp. 28-31 (JCYL-G pp. 8-10 and 18-21 give only general advice) | yes |
| Comunidad de Madrid lists four stages from Madrid to Segovia (Madrid-Tres Cantos, Tres Cantos-Manzanares el Real, Manzanares el Real-Cercedilla, Cercedilla-Segovia) and says the road is completed "en diez etapas hasta llegar a Sahagun" | 4; 10 | CM ("El Camino de Madrid se completa en diez etapas hasta llegar a Sahagun, en la provincia de Leon") | yes |
| Ten stages to Sahagun means ~32 km a day on average | ~32 km | computed: 325.3/10 | computed |
| Day 1 Madrid to Tres Cantos | ~23 km (Junta 22.8; Association 23) | JCYL-T; AAM-G p. 69 | computed |
| Day 2 Tres Cantos to Manzanares el Real | ~28 km (Junta 27.5; Association 27) | JCYL-T (11.9 + 15.6); AAM-G | computed |
| Day 3 Manzanares el Real to Cercedilla | ~20 km (Junta 19.9; Association 19) | JCYL-T; AAM-G | computed |
| Day 4 Cercedilla to Segovia | ~31 km (Junta 31.1; Association 31) | JCYL-T; AAM-G p. 13 (31 km between Cercedilla and Segovia) | computed |
| Day 5 Segovia to Santa Maria la Real de Nieva | ~32 km (Junta 32.0; Association 32) | JCYL-T; AAM-G | computed |
| Day 6 Santa Maria la Real de Nieva to Coca | ~19 km (Junta 19.0), ~22 km (Association) | JCYL-T (2 + 10 + 7); AAM-G (544 to 522) | computed |
| Day 7 Coca to Alcazaren | ~28 km (Junta 28.0), ~25 km (Association); Coca to Villeguillo ~10 km (Junta), ~7 km (Association); Villeguillo to Alcazaren ~18 km in both | JCYL-T; AAM-G pp. 17, 72 | computed |
| Day 8 Alcazaren to Puente Duero | ~24 km (Junta 24.0; Association 25); Valdestillas ~16 km from Alcazaren and ~8 km before Puente Duero (Association: ~9) | JCYL-T; AAM-G | computed |
| Day 9 Puente Duero to Penaflor de Hornija | ~27 km (Junta 26.5; Association 26); Simancas ~6 km from Puente Duero, Cigunuela 6.3, Wamba 7, Penaflor 7 | JCYL-T (6.2 + 6.3 + 7 + 7); AAM-G | computed |
| Day 10 Penaflor de Hornija to Medina de Rioseco | ~23 km (Junta 22.8; Association 24); Castromonte ~9 km (Association: ~10) | JCYL-T (9.3 + 8 + 5.5); AAM-G | computed |
| Day 11 Medina de Rioseco to Cuenca de Campos | ~27 km (Junta 27.0), ~22 km (Association); Moral de la Reina ~19 km from Medina (Junta), ~14 km (Association), then ~8 km to Cuenca (both) | JCYL-T; AAM-G (422 to 408 to 400) | computed |
| Day 12 Cuenca de Campos to Santervas de Campos | ~22 km (both); Villalon de Campos ~5 km; Fontihoyuelo; Santervas ~10 km after Fontihoyuelo | JCYL-T; AAM-G | computed |
| Day 13 Santervas de Campos to Sahagun | ~23 km (Junta 22.7; Association 23) | JCYL-T; AAM-G | computed |
| The thirteen days add up to ~325 km on the Junta's figures (321 on the Association's) | ~325 km | computed from the rows above | computed |
| Sections: days 1-4 ~101 km (101.3); days 5-8 ~103 km (103.0); days 9-13 ~122 km (122.0) | ~101; ~103; ~122 | computed from JCYL-T | computed |
| The Association's figures agree with the Junta's within ~3 km on most days, except day 11 (~5 km) | within ~3 km | computed from the two columns above | computed |
| Splits: Colmenar Viejo ~12 and ~16 km (day 2); La Granja ~18 km from Cercedilla and ~13 km from Segovia (day 4); Ane ~21 and ~11 km (day 5); Valdestillas ~16 and ~8 (day 8); Moral de la Reina ~19 and ~8 (day 11) | as stated | JCYL-T (Colmenar 11.9/15.6; La Granja 619.2-601.1 = 18.1 and 13; Ane 38.5-17.5 = 21 and 6 + 5 = 11); AAM-G (Ane 576-555 = 21, 555-544 = 11) | computed |

## C. Day by day: places and details

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Day 1: ~11 km of Madrid streets before open country; the route is not waymarked inside the city, arrows start at the Plaza de Castilla (2014 edition) | ~11 km | AAM-G pp. 12, 19 ("Nuestra ruta no esta senalizada dentro del casco urbano de Madrid, pero a partir de la plaza de Castilla ...") | yes |
| Day 1: goes up the Castellana past the Cuatro Torres skyscrapers and hospitals (La Paz, Ramon y Cajal), through Fuencarral, once a village, now a district of Madrid | as stated | AAM-G pp. 17, 19 | yes |
| Day 1: a path between the railway and the wall of the Monte de El Pardo, a Mediterranean forest that was a royal hunting ground by the 14th century | 14th century | AAM-G p. 19 ("ya era cazadero real en el siglo XIV") | yes |
| Day 1: Tres Cantos planned in the 1970s, first residents 1982; a granite Jacobean waymarker erected in 2004 by the Comunidad de Madrid; the credencial can be stamped in Tres Cantos | 1970s; 1982; 2004 | AAM-G p. 21; CM ("donde podras sellar tu credencial") | yes |
| Day 2: the Tejada stream is crossed up to eleven times on stepping blocks of granite and concrete; in rainy periods the water can cover them and one must take shoes off | eleven | AAM-G p. 21 | yes |
| Day 2: Colmenar Viejo church portal has a noble coat of arms with scallop shells; the guide calls the bridge of the Batan over the Manzanares Roman; the route follows a cañada (de los Gallegos) | as stated | AAM-G pp. 8-9, 21, 23 | yes |
| Day 2: Manzanares el Real at the foot of La Pedriza, with a 15th-century castle (the New castle, restored) | 15th century | AAM-G p. 23; JCYL-G p. 37 | yes |
| Day 2: the Camino Mendocino (from the province of Guadalajara) joins the Camino de Madrid at Manzanares el Real | as stated | CM ("conecta con el de Madrid en Manzanares el Real"; "donde el Camino Mendocino finaliza su trayecto propio para fundirse con el Camino de Madrid") | yes |
| Day 3: Comunidad de Madrid describes the stage as at the foot of La Pedriza, taking one fully into the Sierra de Guadarrama; the Junta's guide calls the stretch around Mataelpino demanding ("particularly demanding characteristics") | as stated | CM ("Una etapa a los pies de la Pedriza que te introduce de lleno en la Sierra de Guadarrama"); JCYL-G p. 37 | yes |
| Day 3: leaves Manzanares westward, crosses the Collado de la Jarosa; Mataelpino ~1,080 m below La Maliciosa (2,227 m); Navacerrada ~1,200 m (1,204 AAM-G; 1,203 JCYL-T); the route crosses the road that climbs to the Navacerrada pass and continues by tracks to Cercedilla | ~1,080 m; ~1,200 m | AAM-G pp. 23, 25; JCYL-T | yes |
| Day 3: Cercedilla at the foot of the Siete Picos, a Roman mansio on the road that the Camino follows; a station on the Madrid-Segovia line since 1888 | 1888 | AAM-G p. 25 | yes |
| Day 4: ~31 km between Cercedilla and Segovia is the longest gap between settlements on the road | ~31 km | AAM-G p. 13 | yes |
| Day 4: climb ~650 m in ~8 km on the old Roman road to the Puerto de la Fuenfria | ~650 m; ~8 km | CSJ ("a stiff climb of 650m in 8 km to the Puerto de Fuenfria"); JCYL-T (Cercedilla to the pass 8 km); AAM-G p. 25 | yes |
| Fuenfria altitude: CM 1,790 m; AAM-G 1,796 m (also 1,790 in its text); JCYL-G 1,796 m; the Junta's cycling page gives a maximum altitude of 1,793 m for its route | ~1,790 to ~1,796 m | CM; AAM-G pp. 8, 10, 27; JCYL-T and p. 20; JCYL-B | yes |
| Day 4: at the top, the boundary between the Comunidad de Madrid and Castilla y Leon (and between the provinces of Madrid and Segovia); a plaque of 2005 for the founding president of the Madrid Association, Jose Antonio Cimadevila | 2005 | AAM-G p. 27 | yes |
| Day 4: ruins of an old post house (Casaras) and of the inn mentioned by Cervantes in Rinconete y Cortadillo; the Cruz de la Gallega, a viewpoint over the Castilian plain (1,260 m); a choice there between going straight to Segovia and a detour east by Valsain to La Granja | as stated | AAM-G pp. 8, 27, 29 | yes |
| Day 4: Segovia's Roman aqueduct is ~28 m high (28.10 m) and was built without mortar; "exact date unknown" | ~28 m | JCYL-G p. 42 | yes |
| The road over the Navacerrada pass has snowploughs all year (the book gives no date for the pass's opening) | as stated | AAM-G p. 7 ("cuenta con maquinas quitanieves todo el ano") | yes |
| Day 5: leaves Segovia by the Puerta de Santiago, past the site of a vanished Romanesque church of Santiago, down the walk named for St John of the Cross who liked to stroll there; crosses the Eresma; the monastery of El Parral (Gothic) and the octagonal Romanesque church of the Vera Cruz (dated 1208) | early 13th century | AAM-G p. 31 | yes |
| Day 5: near Los Huertos the path follows the old Segovia-Medina del Campo railway, in use 1884 to 1985, a greenway since 2013; first sandy pine wood after crossing the Eresma | 1884; 1985; 2013 | AAM-G p. 33 | yes |
| Day 5: Santa Maria la Real de Nieva founded in 1392 by Catherine of Lancaster after a shepherd's vision of the Virgin; the monastery church holds the grave of Blanche of Navarre, who died there in 1441 | 1392; 1441 | AAM-G p. 35 | yes |
| Pine woods: sandy soil (old dunes fixed by pines) slows walking and can cause injury if one keeps the usual speed; more than ten pine woods adding up to ~30 km in a stretch of ~87 km, from before Ane to Simancas | ~30 km; ~87 km | AAM-G pp. 7, 10-11 | yes |
| Tierra de Pinares described as a plain with pine woods and river gorges, no mountains, only plateaus and eroded valleys | as stated | AAM-G p. 11 | yes |
| Day 6: Nieva ~2 km after Santa Maria, the shortest gap on the road; Romanesque-Mudejar church; Nava de la Asuncion ~10 km after Nieva; high-speed railway alongside for a while; the gorge of the Eresma; Coca | ~2 km; ~10 km | AAM-G pp. 13, 35, 37, 39; JCYL-T | yes |
| Day 6: Coca's walls Roman in origin and rebuilt in the Middle Ages; a 15th-century Mudejar castle; "cuna del emperador Teodosio el Grande" | 15th century | AAM-G p. 39 | yes |
| Day 7: leaves Coca by the tower of San Nicolas, crosses the Voltoya, a wide track through pines beside the Eresma to Villeguillo | as stated | AAM-G p. 39 | yes |
| Day 7: the Cañada de los Gallegos, also Cañada Real de Madrid; "real" for stockmen, "de los Gallegos" for reapers, "de Madrid" for its reach; ~2 km after Villeguillo the boundary into Valladolid province | ~2 km | AAM-G pp. 9, 41 | yes |
| Day 7: ~18 km Villeguillo to Alcazaren is the second longest gap on the road | ~18 km | AAM-G p. 13; JCYL-T (18) | yes |
| Day 7: Alcazaren is the first town in Valladolid province on the road; Romanesque-Mudejar church of Santiago with an altarpiece to the Apostle | as stated | JCYL-G p. 52; AAM-G p. 9 | yes |
| Day 8: the name Valdestillas from "Valle de las Astillas" (woodchip valley), timber; a bridge over the Adaja with Roman cutwaters and arch | as stated | JCYL-G p. 53 | yes |
| Day 8: Puente Duero's medieval bridge blown up by the French in 1812 and rebuilt in the mid-19th century; independent council until 1960, since then part of Valladolid | 1812; 1960 | AAM-G p. 47 | yes |
| Day 8: one more pine wood on the way to Simancas, the last of the road | as stated | AAM-G p. 47 | yes |
| Day 9: Simancas with a long medieval bridge over the Pisuerga and a castle holding the General Archive; Roman Septimanca; in 939 Castilian-Leonese troops beat the army of Abd al-Rahman III; leaves by a pedestrian underpass under the motorway; gentle rise over cereal fields | 939 | AAM-G p. 49; JCYL-G p. 57 | yes |
| Day 9: Ciguñuela's church has two images of Saint James; Wamba's Romanesque church; Recesvinto died at Wamba in 672 and was first buried there; his successor Wamba was chosen there | 672 | AAM-G pp. 9, 51 | yes |
| Day 10: Santa Espina ~6 km from Castromonte (Junta); monastery founded 1147, with a relic of a thorn from Christ's crown | ~6 km; 1147 | JCYL-G p. 62; AAM-G pp. 9, 53 | yes |
| Day 10: Medina de Rioseco: the church of Santiago "one of the most noteworthy due to its size and the unsurpassable wealth of symbols of Saint James"; one branch of the Canal de Castilla ends here; tradition: Saint Francis came from Sahagun on his pilgrimage to Compostela between 1213 and 1215; the Tierra de Campos begins here | 1213 to 1215 | JCYL-G p. 23; AAM-G pp. 9, 57 | yes |
| Day 11: Moral de la Reina has two small bridges of Roman origin; the path runs a few hundred metres on the verge of the N-601 at the boundary between Medina de Rioseco and Berrueces | as stated | AAM-G pp. 12, 57, 59 | yes |
| Day 12: Fontihoyuelo's church porch has wooden columns carved with scallop shells and staffs; Santervas' Romanesque-Mudejar church (12th century) on the river Valderaduey; the road leaves Valladolid province and enters Leon just beyond Santervas | 12th century | AAM-G pp. 9, 63, 65 | yes |
| Day 13: Grajal de Campos castle (1517-1521), one of the last built to resist the artillery of its time; two ways beyond Grajal (by San Pedro de las Dueñas, with a Gothic-Mudejar monastery, or straight to Sahagun) | 1517 | AAM-G pp. 9, 65, 67; JCYL-G p. 23 | yes |
| Day 13: the sanctuary of the Virgen Peregrina, a former Franciscan convent restored in 2011; the dressed Virgin with a staff, of 1687 (Luisa Roldan), patron of the Camino de Madrid since 2013 | 2011; 1687; 2013 | AAM-G p. 67 | yes |
| Sahagun between the rivers Cea and Valderaduey; "a major milestone on the Pilgrims' Route and the end of the seventh stage described in the Codex Calixtinus" | as stated | AAM-G p. 67; JCYL-G p. 78 | yes |
| Sahagun grew around a monastery of the martyrs Facundus and Primitivus; little remains (arch of San Benito, chapel of San Mando); Mudejar churches; Wikipedia: "some of the earliest examples of mudejar architecture" | as stated | AAM-G p. 67; WP-SAH | yes |
| Mudejar: a Spanish style that joins Islamic decoration to Christian buildings | definition | WP-MUD = https://en.wikipedia.org/wiki/Mud%C3%A9jar_style ("the confluence of Islamic ornamentation and Christian architecture" in the Iberian Christian kingdoms) | yes |

## D. History and ground

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Association says it was founded in 1987 | 1987 | AAM-Q; AAM-G p. 6 | yes |
| The Association researched and traced the road between 1993 and 1996, marked it with yellow arrows, presented it in September 1996 at the IV International Congress of Jacobean Associations in Carrion de los Condes, and published a first guide in 1999 (a Holy Year) | 1993-1996; 1996; 1999 | AAM-G p. 6 | yes |
| The Junta's guide calls it the most modern of the traditional or historical routes ("one of the most recent incorporations") | as stated | JCYL-G pp. 2, 18 | yes |
| The Association is a members' association (not a public body) | as stated | AAM-Q ("asociacion"); its site offers "Hazte socio" | yes |
| ~35 km on Roman secondary roads between Colmenar Viejo and Cercedilla; ~150 km from Cercedilla to Simancas on the line of the Roman road of the Antonine Itinerary linking Titulcia (Madrid) and Septimancas (Simancas) | ~35 km; ~150 km | AAM-G pp. 12-13 | yes |
| The Antonine Itinerary is a Roman register of roads and distances | definition | https://en.wikipedia.org/wiki/Antonine_Itinerary ("a register of the stations and distances along various roads") | yes |
| The Mesta's flocks used the line for transhumance between the cool mountains of summer and the warm south in winter; the Mesta was the Castilian association of livestock owners | as stated | AAM-G pp. 12-13; WP-MESTA (a "powerful association" protecting livestock owners; recognised 1273; the book gives no date) | yes |
| Galician reapers walked these tracks for almost five hundred years until the railway joined Castile and Galicia in the mid-20th century; the Association calls them the nearest ancestors of today's pilgrims on this road | ~500 years | AAM-G pp. 12-13 | yes |
| Madrid has been the Spanish region sending most pilgrims to Santiago by the cathedral's annual figures (as the 2014 guide says) | as of 2014 | AAM-G pp. 8-9 | yes |
| The road was recovered so that a pilgrim from Madrid could set out "desde la misma puerta de casa" | as stated | AAM-G p. 6 | yes |
| The Association says the road was marked in a pilgrim spirit, not as a simple hiking route, and that there is no harm in starting as a walker, since the road is long and generous | as stated | AAM-G p. 7 | yes |
| Surface: the AAM-G says ~97% earth, asphalt under 3% (local roads and a few hundred metres beside the N-601); urban asphalt 42 km in all, 11 km in Madrid | 97%; 3%; ~42 km; ~11 km | AAM-G pp. 7, 12 | yes |
| CSJ: almost exclusively footpaths and cañadas, rarely tarmac; excellently waymarked with yellow arrows; "more path and less road than on any other pilgrim route"; very quiet with very few pilgrims; "solitude and the open spaces and wide horizons of the meseta" | as stated | CSJ | yes |
| Comunidad de Madrid markers (granite markers, wooden posts) between 2001 and 2004; the Junta says the entire road is marked with yellow arrows and milestones | 2001-2004 | AAM-G p. 13; JCYL-G p. 10 | yes |
| An average of ~7.6 km between settlements; ~14 km between places that host pilgrims; the shortest gap ~2 km (Santa Maria la Real de Nieva to Nieva), the longest ~31 km, then ~18 km | ~7.6; ~14; ~2; ~31; ~18 km | AAM-G p. 13 | yes |
| Madrid association: a group of its members goes over the markings every spring since 1997 | 1997 | AAM-G p. 6; AAM-Q ("pintaflechas") | yes |

## E. Is it for you; when to go; weather

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Difficulty ratings in the catalog: Camino de Madrid 3, Frances 3, Norte 4, Primitivo 4, Ingles 2, on a scale of 1 to 5 | 3; 3; 4; 4; 2 | CAT | yes |
| CSJ: apart from the Sierra de Guadarrama climb, "flat and easy walking, no hills or gradients of any significance, and difficult to get lost" | as stated | CSJ | yes |
| Junta: ideal average 25 to 30 km a day; start with shorter stages; after the first week longer ones; occasional rest day; "you don't have to be a highly-trained athlete" | ~25 to ~30 km | JCYL-G pp. 8-9 | yes |
| Services: app notes "lodging is sparse"; ~14 km between hosting places | as stated | APP; AAM-G p. 13 | yes |
| CSJ: weather: mountain weather Madrid to Segovia; walkable all year; July to early September extremely hot with long stretches without shade; winter severe with short days; spring and autumn best but may be wet; snow on the sierra until May; avoid the sierra in snow or bad weather, there are no farms, villages or facilities; few pressures from tourism except perhaps Madrid | as stated | CSJ | yes |
| Best months April to June and September to October | as stated | APP | yes |
| Valladolid (station at 734 m, 1991-2020): July mean daily maximum 30.9 and minimum 14.4 C; January maximum 8.1 and minimum 0.7 C; ~433 mm rain a year; "fog is very typical in the morning during winter" | ~31; ~14; ~8; ~1 C; ~430 mm | WP-VLL | yes |
| Segovia (1988-2010, elevation 1,005 m): July 29.7 and 14.6 C; annual precipitation 474 mm | ~30; ~15 C; ~470 mm; ~1,000 m | WP-SEG | yes |
| Madrid: July daytime highs about 32 to 34 C, often above 35 C | ~32 to ~34 C | WP-MAD (text of the climate section; the table was truncated in the summary) | yes |
| Fog can be intense and persistent in the sierra and in Castile; carry a means of orientation or use the nearest road; the Fuenfria can be impassable in snow; the road over the Navacerrada pass has snowploughs all year | as stated | AAM-G p. 7 | yes |
| Daylight: ~9 hours around the winter solstice, ~12 at the equinoxes, ~15 around midsummer, for the latitudes of Madrid, Segovia and Valladolid | ~9; ~12; ~15 h | computed with the standard sunrise equation (declination, refraction -0.833 degrees): Madrid 9 h 17, 12 h 06, 15 h 04; Valladolid 9 h 09, 12 h 06, 15 h 12 (latitudes not printed in the book) | computed |
| In midwinter a ~31 km day leaves little spare light | advice | computed from ~9 h of daylight and ~31 km | computed |
| CSJ: wild camping in the pine forests is not recommended because of the risk of fire | as stated | CSJ | yes |
| AAM leaflets: sun cream and hat; confirm in the hostels which are open for the next stretch (in winter, and even in summer) | as stated | AAM-L | yes |
| Junta: in summer get up a bit earlier to avoid the full heat; use sun cream; avoid only T-shirts and shorts at first | as stated | JCYL-G p. 10 | yes |

## F. Before you go; sleeping, eating, resting; safety

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The cereal plains: the Association's guide says cereal is grown on the Tierra de Campos plain and the Montes Torozos ("reina el cereal") | cereal | AAM-G pp. 10-11 | yes |
| The credencial: two practical purposes (access to hostels; certification when applying for the Compostela); gives no rights; issued by a parish, confraternity, diocese, association of friends of the Way or another Christian institution connected with the pilgrimage | as stated | OP credencial page | yes |
| The Madrid association issues the credencial in person at its office and gives a short talk at the same visit; (the price, address and hours are not in the book) | as stated | AAM-C | yes |
| Stamps are normally collected where you sleep but also in parish churches, monasteries, cathedrals, hotels, town halls and other places | as stated | OP credencial page | yes |
| Madrid is the capital and largest city of Spain | as stated | WP-MAD | yes |
| Madrid-Barajas is ~13 km north-east of the Puerta del Sol; Wikipedia calls it the country's busiest airport, 68.1 million passengers in 2025 | ~13 km; 68.1 million | WP-AIR | yes |
| Cercedilla has a station on the Madrid-Segovia line (since 1888); CSJ: one can take a train from Cercedilla to Segovia instead | 1888 | AAM-G p. 25; CSJ | yes |
| Rucksack: AAM leaflets, not more than 10% of body weight and preferably never over 6 to 7 kg; Junta, the same rule of a tenth, and over 8 kg "you may come to regret it" | ~6 to ~7 kg; ~8 kg | AAM-L; JCYL-G p. 9 | yes |
| Footwear: Junta recommends light boots that let the feet breathe and protect the ankles, trainers an option in summer, broken in beforehand; AAM leaflets: not new, petroleum jelly and technical socks, stop at the first rubbing and look | as stated | JCYL-G p. 9; AAM-L | yes |
| Kit: a waterproof that covers the pack (AAM leaflets, Junta); sleeping bag "essential" for the hostels (Junta), light in summer and warm in winter (AAM leaflets); keep the bottle full and no more than a day's food (Junta); first-aid kit with plasters, anti-inflammatory cream, sun cream (Junta); health card or European health card, identity document (Junta) | as stated | JCYL-G pp. 9-10; AAM-L | yes |
| Cash: no large sums; cash machines in the main towns (AAM leaflets); use cards (Junta); tell family your route (Junta) | as stated | AAM-L; JCYL-G p. 10 | yes |
| CSJ on language: "not impossible" to walk without Spanish, but "strongly urged to learn as much as possible" | as stated | CSJ | yes |
| The Association's guide has 1:50,000 maps and a description of the places on the road, in Spanish, and can be downloaded; the Junta's guide is 144 pages, published in Spanish, English, French and German, with a distance table from Madrid | 1:50,000; 144 pages | AAM-G; the page https://demadridalcamino.com/anuncios/guia-del-camino-de-madrid-a-santiago/ ("Puedes descargarla libremente"); JCYL-G; the Junta's portal lists ES, ENG, FR, DE editions (cm/facm 203389, 203393, 203392, 203407) | yes |
| CSJ: hotel/hostal accommodation at intervals of ~30 km except over the sierra, and between Simancas and Sahagun only two places with hotels or hostals on the road itself; "a limited amount of free or donation-based or inexpensive pilgrim refugios"; very few campsites; "adequate accommodation, indeed a quite remarkable amount considering the route passes through so few towns" | ~30 km; two places | CSJ | yes |
| The Association publishes dated news on the state of the road's hostels (title and date of the item of 1 October 2026 seen) | 1 October 2026 | AAM-N | yes |
| Hospitality on the road is offered by parishes, town councils, institutions and private people; some hostels run on donations | as stated | AAM-G p. 13; AAM-L | yes |
| Hostel etiquette: donativo does not mean the stay costs nothing, give at least what it has cost; lights out in the evening and rooms empty in the morning; packs on the floor; respect hospitaleros | as stated | AAM-L | yes |
| Booking: the Junta says the refuges take no reservations and that large groups should look elsewhere; the AAM leaflets say to reserve a bed if in doubt | as stated | JCYL-G p. 8; AAM-L | yes |
| Food: the AAM leaflets say shops in the main towns, carry little food, avoid heavy meals before arriving; the Junta: Segovia's hallmark is roast suckling pig | as stated | AAM-L; JCYL-G p. 42 | yes |
| Menu del peregrino: a set meal for pilgrims | as stated | REPO-V | yes |
| Segovia: aqueduct and old town on the UNESCO list since 1985 (as the Association's guide says; the UNESCO site refuses fetches); the cathedral "the last Gothic cathedral built in Spain"; CSJ: "even Segovia is a collection of small village centres" | 1985 | AAM-G p. 31; JCYL-G p. 42; WP-SEG (1985); CSJ | yes |
| Medina de Rioseco (about 5,000 inhabitants) and Coca (about 2,000) are towns of a few thousand | ~5,000; ~2,000 | AAM-G pp. 39, 57; JCYL-T (4,643; 1,659) | yes |
| Valladolid: cathedral of the late 16th century (Junta); seat of the regional government since 1983 (Association's guide) | 1983 | JCYL-G p. 23; AAM-G p. 49 | yes |
| Valladolid detour: Puente Duero to Valladolid ~12 km, Valladolid to Simancas ~14 km by a local road or tracks; ~20 km longer than the direct ~6 km; a track from the city to Ciguñuela with a steep climb | ~12 km; ~14 km; ~20 km | JCYL-G pp. 54-57 (11.8; 14.1; 6.2); AAM-G p. 49 | computed |
| The Sierra de Guadarrama National Park: from the upper Fuenfria valley to the edge of Segovia the road is inside it (created 2013) | 2013 | AAM-G pp. 11, 25, 33 | yes |
| Heat: CSJ July to early September extremely hot; the Junta: avoid the full heat; 112 is the European emergency number | as stated | CSJ; JCYL-G p. 10; REPO-V | yes |
| Roads: the Junta says that on roads you are the most vulnerable and drivers can't easily spot a pedestrian; the Junta says to inform family of the route | as stated | JCYL-G p. 10 | yes |

## G. The Compostela and arriving

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Compostela rule (religious and/or spiritual reasons; last hundred km on foot or on horseback, last two hundred by bicycle, credencial stamped; 100 continuous km on the same route the Office recognises; the final stage includes the last into the cathedral; stages in chronological and geographical order, stamps at start and end of each stage when only the minimum is walked; seventy km in Spain after a route outside Spain; the Cabildo's right in exceptional cases) | as stated | SHARED; OP Compostela page | yes |
| The purpose sentence (the Office awards the Compostela to those who walk for religious or spiritual reasons ... Certificate of Distance) | word for word | SHARED | yes |
| The Office's pages speak of "any of the routes recognized by the International Pilgrim's Reception Office system"; none of the three pages read names the Camino de Madrid | as stated | OP Compostela page; grep for "Madrid" in the three pages: no match | yes |
| The Office issues the Compostela in Santiago, a document in Latin | as stated | OP Compostela page ("SAMI Catedral de Santiago will issue the Compostela, an historical document written in latin") | yes |
| The welcome sentence (written with AI assistance ...) | word for word | SHARED | yes |
| The French Way (camino-frances-guide) is the book in this series for the Camino Frances from Sahagun to Santiago | as stated | books/series.md; books/camino-frances-guide | yes |

## H. App, catalog, terms

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CaminoPlus: the offline-first companion app for pilgrims, with maps that work without signal, stays and cafes, a digital pilgrim passport with stamps, a journal and friends; the paid plan is Pilgrim Plus; the app is in development; the Camino de Madrid is on its list of routes | as stated | REPO-R; CAT | yes |
| The pilgrim words used (Buen Camino, albergue, credencial, sello, hospitalero, menu del peregrino) | as stated | REPO-V | yes |
| Cabildo = the cathedral's governing council; cañada = historic drove road; puerto = mountain pass; meseta = the high plain of central Spain | definitions | AAM-G p. 13 (cañada); SHARED (Cabildo); CSJ (meseta); puerto is the Spanish word used in AAM-G | yes |
| Madrid association's volunteer work: weekend walks on the Caminos of Spain, Portugal and France every month from September to June; many members volunteer as hosts in donation-based hostels | as stated | AAM-Q | yes |
| CSJ is a charity in the United Kingdom | as stated | CSJ site (csj.org.uk; "our work as a charity") | yes |

## I. Removed from the book

| Fact | Why | Source | Checked |
|---|---|---|---|
| ~~"Navacerrada pass" as the crossing of the sierra (the app's route note and the brief)~~ | The sources put the crossing at the Puerto de la Fuenfria; Navacerrada is the town before Cercedilla and its pass is the road alternative | AAM-G pp. 7, 25, 27; CM; JCYL-G p. 39 | removed |
| ~~Which towns have a hostel, and names of hostels, guesthouses, bars~~ | The book lists none: they change (the Junta's guide lists names, phone numbers and bed counts, none used) | n/a | removed |
| ~~Prices (the Association's credencial price), phone numbers, opening hours, addresses~~ | Rules of the series | AAM-C; JCYL-G | removed |
| ~~A date for the Segovia aqueduct~~ | Sources disagree (late 1st or early 2nd century in Wikipedia, end of the 2nd century "believed" in the Junta's guide, "s. I" in the Association's); the book gives only its height | WP-SEG; JCYL-G p. 42; AAM-G p. 31 | removed |
| ~~Date of the opening of the Navacerrada pass~~ | AAM-G gives 1780 (citing Madoz) and "end of the 18th century"; JCYL-G gives 1788 | AAM-G pp. 7, 12-13; JCYL-G p. 39 | removed |
| ~~Birthplace of Ponce de Leon at Santervas~~ | The Association's guide gives 1460, other sources differ; not needed | AAM-G p. 63 | removed |
| ~~Pilgrim statistics for the road~~ | The Office's statistics page is rendered by script and shows nothing to a plain fetch | SHARED | removed |
| ~~Total ascent, per-day ascent~~ | No official figure found for the days | n/a | removed |
| ~~A closing season or official closing rule for the Fuenfria~~ | No official notice found; the book says check before you go | CM; JCYL-G; AAM-G | removed |
| ~~Whether the Office recognises the Camino de Madrid~~ | The Office's pages do not say; the book says ask | OP | removed |

## Not verified and left out

- The Junta's Spanish pilgrim guide could not be downloaded (connection reset); the English edition was read, and its table figures agree with the Junta's Spanish web page (325.3, 241.5, 364). Any difference between the English and Spanish editions would not have been seen.
- The Comunidad de Madrid page was read through the fetch tool (direct requests returned 404); its quotes are as the tool returned them.
- Wikipedia pages (Valladolid, Segovia, Madrid, the airport, Sahagun, Mesta, the Spanish article) were read through the fetch tool's summaries.
- The Association's guide is from 2014; waymarking in Madrid, the state of paths, stream crossings and every "the guide says" detail may have changed. The 2019 date in the PDF metadata is the printer's.
- The contents of the Association's hostel notice of 1 October 2026 (only the title and date are readable).
- Mobile signal along the road; fountains and water points; the state of the Fuenfria in snow today; the rules of the Sierra de Guadarrama National Park; fire restrictions.
- Prices, phone numbers, opening hours, bed counts, coordinates, and hostel, cafe and shop names: left out by the rules.
