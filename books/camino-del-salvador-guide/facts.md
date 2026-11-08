# Fact ledger: The Way of the Saviour (camino-del-salvador-guide)

Working file, not published. One row per hard fact in the book. The last column says how a row was checked: `yes` = the page or file was read in full or in the relevant part on 2026-11-08 (the date of writing); `computed` = calculated by the author of the book from other rows, not looked up (flagged for the owner); `removed` = taken out of the book, kept here so that nobody puts it back unchecked. Where the repo is the source, the source column says so.

Source short names (full addresses in each row or here). Spanish originals were read for every Asturian figure and warning (the English pages of Turismo Asturias are machine-translated); the translations in the book are the author's own.

- AST = Turismo Asturias (Principado de Asturias), page "El Camino de El Salvador": https://www.turismoasturias.es/camino-de-santiago/camino-san-salvador (English, machine-translated: https://www.turismoasturias.es/en/camino-de-santiago/camino-san-salvador)
- AST-1, AST-2, AST-3 = the three Asturian stage pages under https://www.turismoasturias.es/descubre/cultura/itinerarios-culturales/camino-de-santiago/camino-san-salvador/ : san-miguel-del-rio-campomanes (title "Etapa 1: Puerto de Pajares - Campumanes"), campomanes-mieres, mieres-oviedo
- AST-INFO = https://www.turismoasturias.es/camino-de-santiago/informacion-util
- JCYL-G = Junta de Castilla y León, "Guía de los Caminos Históricos", chapter VII "Camino del Salvador" (reference VA-4/2010, data updated February 2011): https://www.turismocastillayleon.com/es/arte-cultura-patrimonio/caminos-santiago-castilla-leon.ficheros/117805-WEB_CaminoSalvador.pdf (curl to this host failed through the proxy; the PDF was read from the copy WebFetch saved, with pdftotext)
- JCYL-M = Junta de Castilla y León, leaflet map "Ruta de San Salvador" (strip map with elevation profile, a list of hostels that is not used): https://www.turismocastillayleon.com/es/patrimonio-cultura/camino-salvador.ficheros/388453-Mapa%20desplegable%20Camino%20del%20Salvador_compressed.pdf (PDF metadata: created 24 August 2016, modified 30 July 2024; read as text and as an image)
- JCYL-W = Junta de Castilla y León, tourism page: https://www.turismocastillayleon.com/en/heritage-culture/way-salvador (read through WebFetch)
- ASOC = Asociación de El Camino de San Salvador, whose members are the councils of León, Sariegos, Cuadros, La Robla, Pola de Gordón and Villamanín (page /asociacion-camino-san-salvador/): https://www.caminodesansalvador.org/ (front page with FAQ), /conoce-el-camino/, and the stage pages /etapa-leon-robla/, /etapa-robla-poladura-de-la-tercia/, /etapa-poladura-de-la-tercia-pajares/, /etapa-pajares-pola-de-lena/, /etapa-pola-de-lena-mieres/, /etapa-mieres-oviedo/
- CAT-S, CAT-A, CAT-P, CAT-C, CAT-F = Cabildo de la Catedral de Oviedo, https://catedraldeoviedo.com/ : /peregrinacion/el-camino-de-san-salvador/ (S), /peregrinacion/atencion-al-peregrino/ (A), /peregrinacion/el-camino-primitivo/ (P), /conoce-cada-rincon/camara-santa/ (C), /visita-cultural/prepara-tu-visita/preguntas-frecuentes/ (F); also /peregrinacion/acogida-de-peregrinos/ and /conoce-cada-rincon/cementerio-de-peregrinos/
- CSJ = Confraternity of St James, page "Camino San Salvador": https://www.csj.org.uk/camino-san-salvador (the address /camino-del-salvador gives a 404)
- OP = Oficina del Peregrino, Santiago: https://oficinadelperegrino.com/en/the-compostela/ , /en/pilgrimage/the-credencial/ , /en/pilgrimage/certificate-of-distance/
- SHARED = books/shared-facts.md (the Compostela rule, verified against the Office on 2026-11-08; re-read against the Office's page the same day)
- WP-ES-SAL = https://es.wikipedia.org/wiki/Camino_de_El_Salvador ; WP-ES-PAJ = https://es.wikipedia.org/wiki/Puerto_de_Pajares ; WP-LEON = https://en.wikipedia.org/wiki/Le%C3%B3n,_Spain ; WP-OVI = https://en.wikipedia.org/wiki/Oviedo ; WP-PBT = https://en.wikipedia.org/wiki/Pajares_Base_Tunnel ; WP-POL = https://en.wikipedia.org/wiki/Poladura_de_la_Tercia ; WP-ES-DES = https://es.wikipedia.org/wiki/Desamortizaci%C3%B3n_en_Espa%C3%B1a (section Desamortización de Mendizábal)
- EU = Your Europe, "Single emergency number" FAQ: https://europa.eu/youreurope/citizens/travel/security-and-emergencies/emergency/faq/index_en.htm
- AEMET = Agencia Estatal de Meteorología, warnings page: https://www.aemet.es/en/eltiempo/prediccion/avisos
- PRIM = books/camino-primitivo-guide (this repository)

## A. The road in the catalog, its length and its stages

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route in the app catalog: Camino del Salvador, short name Salvador, Spain, start Leon, end Oviedo, distance_km 120, stage_count empty, difficulty 4, published | ~120 km; 4 | the repo: supabase/migrations/20261106120000_more_caminos.sql (row camino-del-salvador) | yes |
| Difficulty is rated 1 to 5; Francés 3, Inglés 2, Primitivo 4, Norte 4 | 1 to 5; 3; 2; 4; 4 | the repo: supabase/migrations/20261104150200_routes_maps.sql (check between 1 and 5); more_caminos.sql (rows of the five routes) | yes |
| The app has no stage rows or stage files for this road (stage files exist only for Francés, Portugués, Inglés), so the book has no "In the app" lines and makes no claim about its contents beyond the catalog row | n/a | the repo: tools/offline-maps/catalog and tools/offline-maps/stages; .claude/skills/book-writer/reference/guidebook.md | yes |
| The app's route guide (hand-written, "general knowledge, not live data") suggests June to September for this road | June to September | the repo: mobile/src/data/routeGuide.ts (camino-del-salvador, best) | yes |
| The Confraternity gives the road as 120 km ("a 120km pilgrimage" and "some 120 km long") | ~120 km | CSJ | yes |
| The Junta's tourism page gives 120 km | ~120 km | JCYL-W ("A total of 120 kilometres") | yes |
| The Junta's guide: 120.3 km in all, 58.8 km in Castilla y León (León to Arbás del Puerto); Arbás to Oviedo 61.5 km; the table's distances add up to 120.3 | ~120.3 km; ~58.8 km; ~61.5 km | JCYL-G (table and text "A partir de aquí son 61,5 kilómetros los que nos separan de Oviedo") | yes |
| Asturias publishes three stages: Puerto de Pajares to Campomanes 22.1 km, Campomanes to Mieres 19.0 km, Mieres to Oviedo 18.4 km | ~22.1; ~19.0; ~18.4 km | AST (itinerary list); AST-1, AST-2, AST-3 | yes |
| The three Asturian stages add up to 59.5 km | ~59.5 km | computed from the row above | computed |
| Asturias: the official route recognises five stages, of which the last three are in Asturias; the first two are not named | 5; 3 | AST (es: "el trazado oficial reconoce cinco etapas, de las cuales las tres últimas transcurren por suelo asturiano") | yes |
| Oviedo's cathedral: the road is 122 km in the text, "que el peregrino suele dividir en 6 etapas": León to La Robla 27 km, La Robla to Poladura de la Tercia 23.2, Poladura to Pajares 14.1, Pajares to Pola de Lena 23.8, Pola de Lena to Mieres 13.4, Mieres to Oviedo 18.8 | ~122 km; ~27; ~23.2; ~14.1; ~23.8; ~13.4; ~18.8 km | CAT-S | yes |
| The cathedral's six figures add up to 120.3 km (27 + 23.2 + 14.1 + 23.8 + 13.4 + 18.8) | ~120.3 km | computed from the row above | computed |
| Book's rounded day lengths: ~27, ~23, ~14, ~24, ~13, ~19 km (sum ~120) | as stated | computed (rounding of the cathedral's figures) | computed |
| The association gives ~121 km (FAQ "¿Qué es El Camino de San Salvador?") and ~123 km (FAQ on difficulty) | ~121; ~123 km | ASOC front page | yes |
| The association's stage pages: León to La Robla 27 km, La Robla to Poladura 23.2, Poladura to Pajares 14.1, Pola de Lena to Mieres 13.4, Mieres to Oviedo 18.8 | as stated | ASOC stage pages | yes |
| The association's front-page plans: 6 days 27 and 24 km on days 1 and 2, then Pajares to Pola de Lena 24.8 (7-day plan), Pola de Lena to Mieres 14.1, Mieres to Oviedo 19 | ~24; ~24.8; ~14.1; ~19 km | ASOC front page (FAQ "¿En cuántas etapas...") | yes |
| The association's own stage page for Pajares to Pola de Lena gives 14.1 km, the same as the third day, and no other source agrees (the book does not use it) | ~14.1 km | ASOC /etapa-pajares-pola-de-lena/ | yes |
| The Junta's leaflet profile counts 125 km at Oviedo and 61 km at Arbás | ~125 km; ~61 km | JCYL-M (profile labels "Km. 125", "Km. 61") | yes |
| Spanish Wikipedia's infobox gives a length of 116 km | ~116 km | WP-ES-SAL | yes |
| First ~40 km to Buiza follow the Bernesga valley, fairly flat, on paths and very minor roads; the next ~25 km cross the Cordillera to Pajares village, with two quite substantial ascents and descents | ~40 km; ~25 km | CSJ | yes |
| The Junta's table adds up León to Buiza as 8 + 9.8 + 9 + 2.3 + 3 + 3.9 + 2 + 2.1 = 40.1 km (corroborates the Confraternity's ~40 km) | ~40 km | computed from JCYL-G table | computed |
| Asturias and the Junta both name Arbás del Puerto as the last place in Castilla y León; Pajares is in Asturias | as stated | JCYL-G ("En este punto toca a su fin el recorrido jacobeo por Castilla y León"); AST-1; WP-ES-SAL (route table) | yes |
| Asturias: the road follows the Lena and Caudal rivers through the mining basin, leaving "algún que otro resto de arqueología industrial" | as stated | AST | yes |
| Oviedo to Santiago on the Primitivo is ~320 km | ~320 km | the repo: more_caminos.sql (camino-primitivo, 320); PRIM | yes |

## B. Heights

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| León stands at 837 m | ~837 m | WP-LEON (infobox); ASOC front page ("León: altitud 837 m") | yes |
| La Robla 950 m; Buiza 1,130 m; Poladura de la Tercia 1,230 m; Forcadas de San Antón 1,459 m (front page) and 1,450 m (stage 2 page); collada del Coito 1,568 m, "punto más alto de todo el camino" (stage 3 page) | ~950; ~1,130; ~1,230; ~1,459; ~1,450; ~1,568 m | ASOC front page FAQ; /etapa-robla-poladura-de-la-tercia/; /etapa-poladura-de-la-tercia-pajares/ | yes |
| The association also says the Way passes "cotas entre los 1435 y los 1568 m" and the highest point is "más de 1500 metros" | not used except "more than ~1,500 m" | ASOC front page; /conoce-el-camino/ ("la cota máxima será de más de 1500 metros") | yes |
| Poladura de la Tercia stands at 1,225 m | ~1,225 m | WP-POL | yes |
| The Puerto de Pajares (road pass) is 1,378 m; known for winter snowfalls and fog on summer nights | ~1,378 m | WP-ES-PAJ | yes |
| The Junta's leaflet marks Alto de las Forcadas de San Antón 1,462 m, Alto de la Gobia 1,418 m, El Cuchillo 1,567 m, El Canto la Tusa 1,568 m (on the stretch between Poladura and Arbás in its profile) | ~1,462; ~1,418; ~1,567; ~1,568 m | JCYL-M (text and image) | yes |
| 1,568 m minus 1,378 m is about 190 m | ~190 m | computed | computed |
| The walking line on the third day runs on tracks and mountain paths, crosses the Sierra del Cuchillo, descends to Arbás, and "desde el alto del puerto de Pajares" 5 km of descent through forest remain | ~5 km | ASOC /etapa-poladura-de-la-tercia-pajares/ | yes |

## C. Why the road exists, and what the sources say about it

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The road starts in León "a las puertas del antiguo hospital de peregrinos de San Marcos" | as stated | AST | yes |
| San Marcos is where the Camino Francés and the Camino del Salvador fork | as stated | JCYL-G ("el punto en el que se bifurca el Camino Francés y el Camino del Salvador") | yes |
| The road ends at the cathedral of San Salvador; its Cámara Santa "marca el final definitivo del viaje" | as stated | AST | yes |
| The Camino del Salvador "surge como un desvío del Camino Francés" allowing a connection with the Primitivo and also "un final de ruta con pleno sentido por sí mismo" | as stated | AST | yes |
| The cathedral: for many the cathedral was the end of the journey, for others the start of the pilgrimage to Santiago, continued by the Camino Primitivo (the older text says "Norte o Primitivo") | as stated | CAT-S | yes |
| Asturias: "no pocos" pilgrims made the same journey on their return from Compostela, passing through the Holy Chamber | as stated | AST | yes |
| From Oviedo pilgrims could go to Santiago by the coastal road or the Primitivo | as stated | WP-ES-SAL (intro) | yes |
| The Camino Primitivo begins in Oviedo | as stated | AST; CAT-P; the repo (catalog) | yes |
| Cathedral: tradition says the ark left Jerusalem when Khosrow II took it in 614, passed through Egypt and North Africa, Cartagena, Seville and Toledo, was hidden on Monsacro near Oviedo, and was moved to Oviedo by Alfonso II (791 to 842) | 614; 791 to 842 | CAT-C ("Según la tradición") | yes |
| Cathedral: the first known list of relics dates from the solemn opening of the ark on 13 March 1075 before bishops, King Alfonso VI and the court, who was passing through Oviedo on his pilgrimage to Santiago; "de sudario Domini" stands out; the Santo Sudario is the most important relic, a linen cloth that covered Christ's head after death | 1075 (13 March) | CAT-C | yes |
| Asturias: in 1075 Alfonso VI opened the Holy Ark; the discovery reinforced Oviedo as a point of departure and made it a pilgrimage centre on its own merits | 1075 | AST | yes |
| Junta: by the end of the 11th century the basilica of San Salvador was a milestone of the Way and "el segundo centro de peregrinación medieval en toda la Península"; Alfonso VI founded a pilgrims' hospital in the old palace of Alfonso III (the hospital is not in the book) | 11th century | JCYL-G | yes |
| The Confraternity: the purpose of the pilgrimage is to visit the Sudarium, "the head cloth wrapped around Jesus' head", see John 20:6-7 | as stated | CSJ | yes |
| The saying "Quien va a Santiago y no al Salvador, visita al criado y olvida al Señor": Asturias calls it a popular verse of the Middle Ages still recited; the Junta writes "deja al señor"; the cathedral calls it "refrán francés"; the Confraternity quotes "one French pilgrim" | as stated | AST; JCYL-G; CAT-P; CSJ | yes |
| The Junta gives three reasons for the decline: legends of hardness and danger, the N-630 opened in the 18th century (by Campomanes), the Desamortización de Mendizábal and the later disappearance of convents and hospitals; and says the road is "cada vez más utilizado" (2011) | 18th century; 2011 | JCYL-G ("Presentación") | yes |
| The Mendizábal confiscations of church property were in 1836 to 1837 (19th century) | 1836 to 1837 | WP-ES-DES | yes |
| The cathedral's building: Junta dates it to the 14th to 16th centuries and says it keeps the image of the Saviour of the 13th century, which gives the road its name | 14th to 16th; 13th century | JCYL-G | yes |
| Cámara Santa: long believed built under Alfonso II (791 to 842), archaeology points to Alfonso III (866 to 910); destroyed by an explosion in October 1934; rebuilt 1939 to 1942 | 866 to 910; 1934; 1939 to 1942 | CAT-C | yes |

## D. Certificates, the Compostela and the cathedral's services

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Salvadorana is a certificate signed by the Dean of the cathedral; to ask for it you show the credencial stamped at places along the way, one stamp per stage is enough; there is a specific credencial but any other model is valid | as stated | CAT-S | yes |
| The association says the same of the Dean's signature, and that the Salvadorana can be obtained at the cathedral or at the pilgrims' hostel of Oviedo | as stated | ASOC /conoce-el-camino/ | yes |
| The Confraternity: the Salvadorana is "its own 'Compostela'", a special credencial is available from the cathedral in León, the Salvadorana is available at the cathedral in Oviedo, any usual credencial can be used | as stated | CSJ | yes |
| The association lists where to get the credencial: tourist offices of La Robla and Pola de Gordón, the León seat of the pilgrim association, hostels; and says the official pilgrim credencial is also valid | as stated | ASOC /conoce-el-camino/ | yes |
| Stamps are kept by churches, hostels, tourist offices; stamps let you lodge in hostels | as stated | AST-INFO | yes |
| The cathedral stamps the credencial of any pilgrim, whatever Camino; a neighbouring parish church holds a pilgrims' Mass and blessing (day and time on the cathedral's page, not in the book) | as stated | CAT-A | yes |
| The Sudarium always stays in the Holy Chamber; the original can be visited only three weeks a year, otherwise there is an exact replica; "guardado en la Cámara Santa desde el siglo IX" | 3 weeks; 9th century | CAT-F | yes |
| Wikipedia: the Sudarium is shown on Good Friday, 14 September and 21 September | as stated | WP-OVI | yes |
| The cathedral publishes an opening calendar with closing days; a full visit with the audio guide takes about an hour | ~1 hour | CAT-F (dates of closing days, prices, discounts not used) | yes |
| The Compostela rule, six bullets (religious and/or spiritual reasons, on foot, bicycle or horse; last hundred kilometres on foot or horse, two hundred by bicycle; a hundred continuous kilometres on the same recognised route, final stage into the cathedral; stages in chronological and geographical order with stamps at start and end of each stage; seventy kilometres in Spain after a recognised route abroad; the Cabildo's right in exceptional cases) | as the Office writes it | SHARED; OP /en/the-compostela/ (re-read) | yes |
| The Office's layers on purpose: Christian purposes ("devotionis affectu, voti vel pietatis"); "in modern times" religious and/or spiritual reasons; the credencial for those with "a Christian sentiment, even if it is only with an attitude of search" | as stated | SHARED; OP (Compostela and credencial pages) | yes |
| The Office also offers a Certificate of Distance, issued by the Chapter of the Cathedral, certifying the kilometres travelled "whatever the starting point" | as stated | OP /en/pilgrimage/certificate-of-distance/ | yes |
| The Office's pages on the Compostela, the credencial and the Certificate of Distance do not contain the words Salvador, Oviedo or Primitivo (text searched) | none | OP (four pages: the-compostela, pilgrimage/the-compostela, the-credencial, certificate-of-distance) | yes |
| The cathedral says the Holy Chamber is the starting point of the Primitivo; opposite the statue of Alfonso II, "el primer peregrino", are the plaque from which the Primitivo leaves and the way to join the Camino del Norte | as stated | CAT-P; CAT-C | yes |
| The Primitivo book of the series covers the Oviedo to Santiago walk in fourteen days | 14 | PRIM (book.json and chapter 00) | yes |
| Salvadorana: no price in the book (the cathedral says it is given without charge; the association gives a range for the credencial) | n/a | CAT-S; ASOC | removed |
| Cathedral admission prices and discounts, closing days, opening hours, the pilgrims' Mass day and time, the suitcase and left-luggage rules | n/a | CAT-F; CAT-A | removed |
| Pilgrims' cemetery (a garden, never a burial ground for pilgrims as such; an old olive tree said to come from the Holy Land) | n/a | catedraldeoviedo.com/conoce-cada-rincon/cementerio-de-peregrinos/ | removed |

## E. Practical advice and weather

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Asturias: start walking some months before; comfortable shoes already used; sandals for the evening; a rucksack under 10 kg; torch and stick indispensable | ~10 kg | AST-INFO | yes |
| Association's pack list: sleeping bag, bottle, poles, torch, change of clothes, good socks, cap, plasters and gauze, waterproof, sunscreen and sunglasses, petroleum jelly, first-aid kit; documents ID, credencial, health card, card or cash; forget the "por si acasos" because the road passes several important villages with services | as stated | ASOC /conoce-el-camino/ and front page | yes |
| Mountain boots recommended in spring, autumn and above all winter | as stated | ASOC /conoce-el-camino/ | yes |
| The Confraternity: services scant; a 50 km stretch with no shops; strongly recommends phoning ahead for non-albergue accommodation; in several places a meal must be ordered by phone; a little Spanish helps on the crossing; waymarking generally very good but in the mountains find and follow the signs; "let people know when and where you are walking" | ~50 km | CSJ | yes |
| Association: some villages on stage 1 have no services (Cabanillas "carece de servicios"; none "hasta Cascantes") | as stated | ASOC /etapa-leon-robla/ | yes |
| Association: tell someone outside the group; waymarking by markers, wooden posts and yellow arrows in León, stone markers with the shell in Asturias | as stated | ASOC /conoce-el-camino/ | yes |
| León has a long-distance railway station, high-speed services to Madrid in about two hours, direct services to Galicia, Asturias and Valladolid; the airport is ~6 km from the centre and mostly domestic | ~2 hours; ~6 km | WP-LEON | yes |
| Oviedo has a railway station with long-distance, regional and suburban services; Asturias Airport is ~48 km away, linked by motorway and a scheduled bus | ~48 km | WP-OVI | yes |
| The Pajares Base Tunnel is 24,667 m long, part of the high-speed line between León and Gijón, and opened to passengers on 30 November 2023 | ~24.7 km; 30 November 2023 | WP-PBT | yes |
| León climate, station at 916 m, 1991 to 2020: January mean high 7.3 °C, mean low −0.7 °C, record low −17.4 °C; July mean high 27.4 °C, record high 38.2 °C (July and August); July rain 18.3 mm, year 495.7 mm | ~7; ~−1; ~−17; ~27; ~38 °C; ~18 mm; ~496 mm | WP-LEON (from AEMET) | yes |
| Oviedo climate, station at 336 m, 1991 to 2020: January mean high 12.1 °C, mean low 4.8 °C, record low −6.0 °C; August mean high 23.7 °C, record high 41.2 °C; rain 1,028 mm a year, July 44 mm, November 134 mm | ~12; ~5; ~−6; ~24; ~41 °C; ~1,028; ~44; ~134 mm | WP-OVI (from AEMET) | yes |
| The Confraternity on weather: León province very hot in July and August, much as on the Francés; the crossing highly variable (thick fog, heavy rain, severe cold); the Asturian side can be very different from the León side | as stated | CSJ | yes |
| The association on snow: it usually begins to snow from December or somewhat later, unpredictable, some winters hardly any, others heavy; heed the hostel and if it says conditions are bad do not venture out, "el camino siempre estará allí"; in summer with good fitness longer stages; hot by day, cool at night at altitude; in late autumn and winter leave a margin of daylight, anyone can sprain an ankle | as stated | ASOC front page FAQ; /conoce-el-camino/ | yes |
| The association on the third day: snowfields very difficult or impossible; several streams with a lot of water in the thaw; mud in the forest of Valgrande; all on tracks and mountain paths | as stated | ASOC /etapa-poladura-de-la-tercia-pajares/ | yes |
| The association on the road: never an alternative; in snow the ploughs clear the carriageway first, not the verge; "una de las carreteras más peligrosas de España"; take a taxi, train or bus and leave the mountain stages for another time | as stated | ASOC front page FAQ | yes |
| The association says taxis are much used on this road; on pace: "no corras, descansa lo necesario y verás que puedes hacer las etapas cómodamente" | as stated | ASOC /conoce-el-camino/; front page FAQ on difficulty | yes |
| The association's stage 4 text: descents "pondrán a prueba nuestras rodillas"; from Campomanes the stage is flat; Parque Natural de Las Ubiñas-La Mesa | as stated | ASOC /etapa-pajares-pola-de-lena/ | yes |
| Daylight at León (standard solar formula): 21 December sunrise 08:49, sunset 17:52, 9.05 h; 8 November sunset 18:08, 10.1 h; 20 March 07:28 and 19:33, 12.1 h; 21 June 06:44 and 22:03, 15.3 h; 22 September sunset 20:22, 12.2 h (local clock time; coordinates ~42.6 N, ~5.6 W, not in the book) | ~9; ~10; ~12; ~15 hours | computed (NOAA solar-position formula, run by the author) | computed |
| AEMET publishes warnings and town forecasts, in English as well as Spanish | as stated | AEMET (page and its menu: Forecast, Warnings, Towns) | yes |
| 112 works in every EU country alongside national numbers; callers are answered in the language(s) of the country; English only in some countries; no standard range of languages | as stated | EU | yes |

## F. The days, town by town

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Day 1: first waymark on the pilgrims' avenue to the right of San Marcos; a plaque in the ground points left to Santiago and right to the Saviour; a signed riverside path saves ~7 km of asphalt; oak and holm-oak woods at Carbajal; easy rating but constant small ups and downs; chapel of Celada at La Robla; "puerta y mano del peregrino"; the entry passes under the main road and over the railway | ~7 km | ASOC /etapa-leon-robla/ and front page FAQ (plaque) | yes |
| Carbajal de la Legua: 12th-century foundation of Augustinian canons, replaced in 1147 by Benedictine nuns of San Pelayo, "cariñosamente llamadas las Carbajalas"; Cabanillas: the Roman road León to Oviedo passed nearby; chapel of Celada Gothic from the 14th century, developed in the 17th and 18th | 12th century; 1147; 14th, 17th, 18th | JCYL-G | yes |
| Day 2: first half nearly flat to Pola de Gordón; 5 km of unavoidable asphalt to Buiza; then in 2.5 km the Forcadas de San Antón "tan espectacular como duro"; the Barrancón gully; track to San Martín and Poladura; medium-high rating | ~5 km; ~2.5 km | ASOC /etapa-robla-poladura-de-la-tercia/ | yes |
| Day 2 variant: the Hoces de Rodiezmo and the Cruz de la Salve (sight of the shrine of Golpejar and the chapel of Barrio; pilgrims prayed a Salve before the next day's mountains); turn sharply left at the cross or reach Rodiezmo and the road; about 200 m longer; rejoins about 1 km on; good if the Barrancón path is snowy | ~200 m; ~1 km | ASOC /etapa-robla-poladura-de-la-tercia/ | yes |
| Buiza: "importante cruce de calzadas romanas, caminos jacobeos y calzadas reales", named in 1036 in Fernando I's donation of the place to the cathedral of Oviedo; Buiza to Poladura 9.5 km and Poladura to Arbás 9 km | 1036; ~9.5 km; ~9 km | JCYL-G | yes |
| Day 3: "etapa reina", difficulty "Alta"; ramps to the Cruz del Salvador, the collada del Coito, Sierra del Cuchillo, Arbás; 14.1 km | ~14.1 km | ASOC /etapa-poladura-de-la-tercia-pajares/ | yes |
| Arbás: collegiate church of Santa María (12th to 13th century), "hito hacia San Salvador"; the road section "estaría incompleto" without a visit; fine example of rural Leonese Romanesque; many legends of its founding (a disciple of St James; King Pelayo after Campo Sagrado), little documented history; bells rung in fog; pilgrims awaited at the "canto de los pobres" and led to the vanished hospital opposite the monastery | 12th to 13th century | AST-1; JCYL-G | yes |
| From Arbás a path climbs to the Alto de la Gobia and the Boquete de La Calera and drops by the valley of La Casa Tibigracias to Samiguel del Río and the village of Payares (Pajares) | as stated | AST-1 | yes |
| Pajares: the old Calle Real, an arch and a stone house recall the pilgrims' hospital | as stated | JCYL-G | yes |
| Day 4 (Asturias' line): road to Floracebos, chapel of the Virgen de las Nieves, La Romía, pass of the hermitage of San Pedro, Naveo, west slope of the Alto de Torones, La Muela, steep descent to Fierros, hard slope to Fresneo, chestnut and holly woods, chapel of San Miguel, Erías, Camín de Los Moros to Campomanes | as stated | AST-1 | yes |
| Day 4 variants: San Miguel del Río and Llanos de Somerón; the Junta's leaflet draws a winter line and a summer line near Pajares and Puente de los Fierros | as stated | ASOC /etapa-pajares-pola-de-lena/; JCYL-M (legend: camino de verano, camino invierno, conexión) | yes |
| Asturias: the road is "fundamentalmente, una ruta de montaña" and the Asturian part "no desmerece" in terrain; climbs to Chanos, El Padrún, Picullanza and La Manxoya "requieren un buen estado de forma"; majestic landscapes especially descending from Payares | as stated | AST (section "Pasos en la montaña") | yes |
| Campomanes: crossroads of the Pajares and La Cubilla passes; Roman road León to Gijón by the river | as stated | JCYL-G | yes |
| Santa Cristina de Lena: Ramirense period, "uno de los edificios prerrománicos más paradigmáticos de Asturias", superb iconostasis; it lies between Campomanes and La Pola | as stated | AST; AST-2 (route list) | yes |
| Day 5: "sencilla y bastante tranquila", rest between hard ramps; service road of an industrial estate; Villallana church of San Martín beside the "Hospitalón", former pilgrims' hospital; Santa Eulalia de Ujo with Romanesque doorway and apse | as stated | ASOC /etapa-pola-de-lena-mieres/; AST (Vestigios del pasado) | yes |
| Day 5 warning: the official markers from Pola de Lena to Ujo follow the old national road, "totalmente desaconsejable por su peligrosidad"; the recovered stretch avoids the asphalt, follow the yellow arrows | as stated | ASOC /etapa-pola-de-lena-mieres/ | yes |
| Asturias: riverside path of the Caudal from Ujo to Mieres, crossing at La Ponte Verde on the traditional crossing; Mieres del Camín "aún se apellida del Camino"; enters by the bridge of La Perra, leaves by the Plaza de Requejo; the squares of La Pasera and Requexu are "catedral incomparable de la sidra asturiana" | as stated | AST-2; AST | yes |
| Day 6: "claramente urbana", asphalt predominates with pleasant stretches that avoid it; a Roman road; El Padrún, La Manzaneda, La Manxoya are short climbs | ~18.8 km | ASOC /etapa-mieres-oviedo/ | yes |
| Day 6 places: La Rebollá (an inn once; Romanesque corbels), footbridge over the dual carriageway and railway on the way into Olloniego (Romanesque bridge, keep and castle), peak of Arnea, valley of the Gafo, La Manxoya, district of San Lázaro; the pilgrims' "¡Mi Dios!" at the first sight of the tower | as stated | AST; AST-3 | yes |
| The Junta's guide describes the food of the Gordón and La Tercia valleys: chorizo, ham, botillos, longaniza, morcilla; lentils, beans, cabbage; game and fried trout; "entrecogido" made from the meats of the matanza | as stated | JCYL-G | yes |
| León cathedral, Rayonnant Gothic, almost all built from 1205 to 1301 (taken out of the book to save words) | 1205 to 1301 | WP-LEON | removed |
| Asturias: stages begin and end in towns with public or private hostels; the roads through Asturias have enough places to sleep; the association: hostel infrastructure for up to 9 days; the Confraternity: sufficient accommodation | ~9 days | AST-INFO; ASOC front page; CSJ | yes |
| The Junta's leaflet shows several small hostels in the mountain villages (bed counts not used) | n/a | JCYL-M | yes |
| The nine-day plan: León to Cabanillas 17.5, Cabanillas to La Robla 9.5, La Robla to Buiza 13.5, Buiza to Poladura 9.7, Poladura to Pajares 14.1, Pajares to Bendueños 16.8, Bendueños to Pola de Lena 10.7, Pola de Lena to Mieres 14.1, Mieres to Oviedo 19; Poladura to Llanos de Somerón 18.7; Bendueños to Mieres 24.8 (7-day plan) and 16.8 (8-day plan) | as stated | ASOC front page FAQ | yes |
| The nine-day figures add up to 124.9 km | ~125 km | computed | computed |
| Pola de Lena to Oviedo in one day: 13.4 + 18.8 = 32.2 km | ~32 km | computed from the cathedral's figures | computed |
| Buiza to Arbás by the valley line: 4.1 + 3.2 + 3.3 + 4.6 + 3.5 = 18.7 km; by Poladura 9.5 + 9 = 18.5 km | ~18.7 km; ~18.5 km | computed from the Junta's table (JCYL-G) | computed |
| Spanish Wikipedia lists the valley line (Buiza, Villasimpliz, Rodiezmo, Villamanín, Villanueva de la Tercia, Busdongo, Arbás) as "ruta principal" and the line by Poladura de la Tercia as "ruta alternativa" | as stated | WP-ES-SAL | yes |
| The Junta's guide says the route it describes goes down the valley by Villasimpliz, Villamanín, Villanueva de la Tercia and Busdongo, "existe otra senda" by the Forcada de San Antón | as stated | JCYL-G ("Itinerario") | yes |
| The Confraternity mentions an unofficial, unsigned "winter" route usable as an escape from the mountains in bad weather, described in its guide book | as stated | CSJ | yes |
| The Junta's leaflet draws the signed line (green dashes) by Buiza, the Forcadas de San Antón and Poladura; the cathedral's and the association's stages go by Poladura | as stated | JCYL-M (image); CAT-S; ASOC | yes |
| Asturias writes place names in Spanish and Asturian (Oviedo/Uviéu, Payares/Pajares, Campumanes/Campomanes, Lluniego/Olloniego); the book uses Spanish forms | as stated | AST; AST-1 to AST-3 | yes |
| The cathedral's prayer asks the Saviour to be a companion to pilgrims on the roads of life, to explain the Scriptures, and to be recognised in the breaking of bread (the book notes the echo of Luke 24, the walk to Emmaus) | as stated | CAT-W (/peregrinacion/acogida-de-peregrinos/); Luke 24:13-35 | yes |
| The cathedral's welcome: "Sed todos bienvenidos los que os habéis acercado desde los más diversos lugares hasta esta Catedral de San Salvador de Oviedo, meta de peregrinos" | as stated | CAT-W | yes |
| The Pilgrim's Office statistics page is rendered by script and shows nothing to a plain fetch; no pilgrim count for this road is given in the book | n/a | SHARED (notes on the Office's pages) | yes |
