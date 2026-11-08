# Fact ledger: The Aragonese Way (camino-aragones-guide)

Working file, not published. One row per hard fact in the book. The last column is `yes` (the page or file was read in the relevant part on 2026-11-08, the date of writing), `computed` (calculated by the author from other rows, not looked up: flagged for the owner), or `removed` (looked at and left out of the book, kept here so that nobody puts it back unchecked).

Source short names (full addresses are given once here):

- CAT = the repo's route catalog, `supabase/migrations/20261106120000_more_caminos.sql` (row camino-aragones: from Somport to Puente la Reina, 160 km, countries FR and ES, difficulty 3, stage_count empty; Francés row: difficulty 3, 773 km, 33 stages; Invierno row: difficulty 3; Primitivo 4; Inglés 2). There are no stage files for this route, so the book has no "In the app" lines.
- RG = the app's route notes, `mobile/src/data/routeGuide.ts`, entry camino-aragones ("From the French border at Somport over the Pyrenees to Puente la Reina where it joins the Frances"; best: May to September; terrain: mountain start, then rolling hills; tip: quiet route, services are sparse in places).
- WEB = the CaminoPlus website's route list, `tools/build_web.py` (ROUTES, row camino-aragones, "6–7", comment: stage ranges are editorial) and `web/routes.html` ("~160 km", "6–7 stages").
- AD = Gobierno de Aragón, page "Directriz del Camino de Santiago-Camino Francés a su paso por Aragón" (last updated 13/10/2026): https://www.aragon.es/-/directriz-camino-santiago (Spanish).
- AM = the planning study behind that Directriz (approved by Decreto 211/2018, BOA n. 241, 14/12/2018), "Tomo I, Memoria": https://www.aragon.es/documents/20127/122771509/TomoI_Memoria_CS.pdf/bd7f9380-6b60-fc26-17d6-9d4d0c6d79c4?t=1756898953334 (Spanish; the file on the site is a 2025 upload). Its section "Descripción del trazado" describes the path in tramos H-1 to H-20 and Z-1 to Z-8.
- TA = Turismo de Aragón (Gobierno de Aragón), brochure "El Camino de Santiago por Aragón" (Depósito Legal Z-4180/2009; ends with www.turismodearagon.com), read from a copy hosted at https://www.aragoneria.com/turismo-en-aragon/camino-de-santiago-en-aragon.pdf (Spanish). The tourism site turismodearagon.com itself could not be read: curl failed on its certificate chain and WebFetch got 503. The book calls the brochure "a 2009 print".
- VN = Visit Navarre, the Navarre tourist board: page "Camino Francés / Aragonés" https://www.visitnavarra.es/es/camino-santiago-frances-aragones (Spanish) and https://www.visitnavarra.es/en/camino-santiago-frances-aragones (English, a faithful translation); page "Camino de Santiago" https://www.visitnavarra.es/es/te-gusta/camino-de-santiago.
- VNG = Navarre tourist board, printed guide "Camino de Santiago" (fifth edition, November 2023): https://www.visitnavarra.es/documents/8191683/8202055/Camino+de+Santiago.pdf/2344a6c0-eba0-663f-a1a7-36b046fa8396?t=1614844105028 (Spanish; pp. 28 to 32 on the stretch "De Sangüesa a Puente la Reina").
- VNH = Navarre tourist board, leaflet of milestones "Hitos del Camino 2021": https://www.visitnavarra.es/documents/8191683/8202055/20210506+FOLLETO+HITOS+DEL+CAMINO+2021+NAVARRA+ES+web.pdf/53562a49-ef2a-a3cc-07aa-36bb5954a679?t=1621255020225 (Spanish).
- PF = Policía Foral de Navarra, advice leaflet "Consejos Camino de Santiago" 2026 (English, Spanish, Basque): https://www.visitnavarra.es/documents/8191683/59452711/Consejos+para+el+Camino+de+Santiago.+Policia+Foral+2026.pdf/659e0322-decd-3f62-2685-2052724db786?t=1776753119298
- OP = Pilgrim's Reception Office of the Cathedral of Santiago, https://oficinadelperegrino.com/en/the-compostela/ , /en/pilgrimage/the-credencial/ , /en/pilgrimage/certificate-of-distance/ and the home, planning, introduction, pilgrims and after-the-pilgrimage pages. The rule is stated as `books/shared-facts.md` has it.
- CSJ = Confraternity of St James, page "Chemin d'Arles": https://www.csj.org.uk/chemin-arles (the page on the "Arles route" under /planning-your-pilgrimage/ answered 500).
- ER = Fundación Eroski, "Eroski Consumer", Camino de Santiago stage pages "por Somport", read in Spanish at https://caminodesantiago.consumer.es/los-caminos-de-santiago/camino-frances/ followed by etapa-de-somport-a-jaca, etapa-de-jaca-a-arres, etapa-de-arres-a-ruesta, etapa-de-ruesta-a-sanguesa, etapa-de-sanguesa-a-monreal, etapa-de-monreal-a-puente-la-reina-gares (the English pages are machine-translated; for example the Ruesta to Sangüesa page is /en/the-st-james-way/french-way/ruesta-to-sanguesa-stage). A private foundation's guide, not an official source; the pages carry dated notes (2015 to 2017), so practical details may be old. The book never names it in the text: it says "a Spanish consumer foundation's stage guide" and names it in the sources chapter.
- WPS, WPA, WPF, WPW, WPJ, WPY, WPC, WPP = English Wikipedia: Somport; Aragonese Way; French Way; Way of St. James; Jaca; Yesa Reservoir; Canfranc International railway station; Puente la Reina, Navarre (https://en.wikipedia.org/wiki/ followed by the title).
- WPE, WPH = Spanish Wikipedia: "Camino de Santiago Francés en Aragón" (https://es.wikipedia.org/wiki/Camino_de_Santiago_Franc%C3%A9s_en_Arag%C3%B3n) and "Hospital de Santa Cristina de Somport" (https://es.wikipedia.org/wiki/Hospital_de_Santa_Cristina_de_Somport).
- SUN = a standard solar calculation (NOAA equations) for Jaca, latitude 42.57 N, longitude 0.55 W; local time CET in winter, CEST in summer.
- BK = the repo's reflection book `books/songs-of-ascents-readings/book.json` and `books/series.md`; FR = the repo's guide `books/camino-frances-guide`.

## A. The road, its names and its length

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The road runs from Somport to Puente la Reina, ~160 km, countries France and Spain (the catalog lists both because it starts on the border) | ~160 km | CAT | yes |
| Aragonese Way "beginning at the French-Spanish border at the pass of Somport and joining the French Way at Puente la Reina-Gares in Navarre"; "for the most part it follows the River Aragon" | as stated | WPA | yes |
| It is the continuation of the Via Tolosana; it enters Navarre at Sangüesa from the Somport pass; "this second branch of the Camino Francés" | as stated | VN (es: "Este segundo ramal del Camino Francés es la continuación de la Vía Tolosana y entra en Navarra por Sangüesa procedente del puerto de Somport") | yes |
| Aragon's pages call it "Camino Francés a su paso por Aragón"; the brochure says that on Spanish soil the Via Tolosana "no es otro que el Camino Francés a su paso por Aragón aunque muchos lo llaman Camino Aragonés" | as stated | AD; TA | yes |
| The Aragonese brochure: the road descends the Aragón valley to Jaca, crosses the Canal de Berdún and leaves by Undués de Lerda towards Puente la Reina in Navarre | as stated | TA | yes |
| From Somport the River Aragón is "fiel compañero" of the pilgrim as far as Sangüesa | as stated | TA | yes |
| At the pass the brochure says a plain roadside monolith announces the Camino Francés through Aragon and that 858 km remain to Compostela, "casi un centenar" of them in Aragon | about 858 km | TA | yes |
| A stage guide describes a wooden sign and a milestone at Somport with the distance to Santiago (858 km) and to Undués de Lerda (87 km) | 858 km | ER (Somport a Jaca) | yes |
| Aragon's brochure: Somport is at 1,640 m; Wikipedia gives 1,632 m | ~1,640 m; ~1,632 m | TA; WPS (infobox elevation) | yes |
| Somport comes from the Latin Summus portus | as stated | WPS | yes |
| Navarre: 56 km from Sangüesa to Puente la Reina | ~56 km | VN (header "56 kilómetros") | yes |
| Navarre brochure profile: Sangüesa to Monreal marks 11.5 km and 13.5 km; Monreal to Puente la Reina marks 7.5, 4.5, 5, 8 and 6 km; these add to ~25 km and ~31 km, and together to 56 | ~25 km; ~31 km | VNG pp. 28 and 30 (profiles, "Distancias aproximadas") | computed |
| The six day lengths of the stage guide add to 164.4 km (30.5 + 25.0 + 28.7 + 21.8 + 27.3 + 31.1) | ~164 km | ER, six stage pages | computed |
| The seven-day sample sums to ~165 (31 + 25 + 18 + 22 + 11 + 27 + 31) | ~165 km | computed from the rows of section C | computed |
| The Confraternity gives "970 km of which 800 km is in France and 170 km in Spain" for the Arles route | ~170 km | CSJ | yes |
| Spanish Wikipedia's table of km to Santiago: Somport 870, Puente la Reina 692, difference 178; the table's route includes Santa Cruz de la Serós (822) and Lumbier (742) | ~178 km | WPE (table "Ruta principal") | computed |
| In France the road is the Via Tolosana, the Chemin d'Arles, GR 653; in Spain it is waymarked with yellow arrows and red and white bars as GR 65.3 | as stated | CSJ | yes |
| The Camino de Santiago entered the UNESCO World Heritage list in 1993; the Gobierno de Aragón takes the UNESCO route as the reference for its stretch, from the Somport pass to the border with Navarre (UNESCO's own site refuses fetches, so it is attributed to Aragon and Navarre) | 1993 | AD ("tomando como referencia el correspondiente a la Declaración de Patrimonio Mundial por la UNESCO"); AM p. 1; VN (page "Camino de Santiago": "1993 Declaración ... Patrimonio de la Humanidad por la UNESCO") | yes |
| The Aragonese stretch passes through 16 municipalities, 10 in Huesca and 6 in Zaragoza | 16 | AD | removed |
| Aragon's tourism pages describe the Aragonese section as ~95 km "usually proposed in four days" (read only in a search-engine summary; turismodearagon.com refuses every fetch) | ~95 km | not read directly | removed |
| German-language Navarre tourism page: Artieda to Sangüesa 28, Sangüesa to Monreal 26.5, Monreal to Puente la Reina 30.4 km (search summary only; the site's certificate has expired) | various | not read directly | removed |
| A guide-site table: Somport to Jaca 32, Jaca to Arrés 25.4, Arrés to Ruesta 28.4, Ruesta to Sangüesa 22, Sangüesa to Monreal 27.2, Monreal to Puente la Reina 30.4 (search summary only; a commercial directory) | various | not read directly | removed |
| "Aragón Hoy": Jaca to Santa Cilia 15.24 km, Santa Cilia to Puente la Reina de Jaca 6.9 km (search summary only; the page did not load) | various | not read directly | removed |

## B. Where the road joins the French Way

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Navarre: the road joins "the path of the route which enters Spain via Luzaide/Valcarlos in Puente la Reina" | as stated | VN (en) | yes |
| Aragon's brochure: the road goes on "hacia Puente la Reina de Navarra donde se encuentra con el Camino Navarro" | as stated | TA | yes |
| WP table: "Joined by the Aragonese Way just before Puente la Reina" (stage Pamplona to Puente la Reina) | as stated | WPF (table) | yes |
| The Confraternity: the road joins the French Way "at Obanos just before Puente la Reina" | as stated | CSJ | yes |
| The stage guide: in Obanos's Plaza de los Fueros, by the church of San Juan Bautista, the pilgrims from Roncesvalles and those from Somport come together; "se ha especulado mucho" whether it is Obanos or Puente la Reina; the official signs go up to Obanos; some pilgrims turn left on the NA-6064 to Puente la Reina | as stated | ER (Monreal a Puente la Reina-Gares, "Observaciones" and "Obanos") | yes |
| Obanos at km 28.3 and Puente la Reina at km 31.1 of the stage, so Obanos is ~3 km short | ~3 km | ER (Monreal a Puente la Reina-Gares) | computed |
| A pilgrim-shaped monument before Puente la Reina bears the inscription "Y desde aquí todos los Caminos a Santiago se hacen uno solo" (translated in the book as "And from here all the Ways to Santiago become one") | as stated | ER (Monreal a Puente la Reina-Gares, "Observaciones") | yes |
| Puente la Reina is Gares in Basque | as stated | WPA (list "Puente la Reina-Gares"); ER ("Puente la Reina-Gares") | yes |
| The bridge: eleventh-century Romanesque, 7 round arches (the easternmost buried), 110 m long, a Site of Cultural Interest (BIC); Wikipedia counts six arches | ~110 m | VNH; WPP | yes |
| The stage guide says the bridge was built for pilgrims at the order of a queen | as stated | ER (Monreal a Puente la Reina-Gares) | yes |
| Pamplona is 23.5 km before Puente la Reina and Estella 22 km after (French Way table) | ~24 km; ~22 km | WPF (table); FR day 4 and 5 (~24 and ~22 km) | yes |
| Puente la Reina to Santiago: about 700 km (Wikipedia lead; table 700.5 remaining), 692 (Spanish Wikipedia's Aragonese table), 688 (its French Way table); the French Way guide says ~690 | ~690 to ~700 km | WPF; WPE; FR facts.md | yes |

## C. The days

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Day 1 Somport to Jaca: 30.5 km, medium, estimated 8 h 30 min; km marks: Canfranc Estación 6.8, Canfranc 11.2, Villanúa 15.8, Castiello de Jaca 22.6, San Cristóbal 28.3, Jaca 30.5 | ~31 km | ER (Somport a Jaca) | yes |
| Spanish Wikipedia's table: Somport 870, Jaca 838, difference 32 (the other published length for Day 1) | ~32 km | WPE | computed |
| Jaca is at 820 m; the descent from the pass is therefore about 820 m, "about 800 m" in the book | ~820 m; about 800 m | WPJ (infobox elevation_m 820); TA (1,640 m) | computed |
| Day 2 Jaca to Arrés: 25.0 km, medium; Santa Cilia at km 15.3, Puente la Reina de Jaca at km 21.4, the last 3 km climb to Arrés at 700 m | ~25 km | ER (Jaca a Arrés) | yes |
| Day 3 Arrés to Ruesta: 28.7 km, medium; Artieda at km 17.6, Ruesta at 28.7; Artieda at 650 m; "only the last four kilometres give shade" | ~29 km | ER (Arrés a Ruesta) | yes |
| Artieda to Undués: 28.7 − 17.6 = 11.1 km to Ruesta, plus 11.3 km Ruesta to Undués = ~22 km | ~22 km | ER (Arrés a Ruesta; Ruesta a Sangüesa) | computed |
| Day 4 Ruesta to Sangüesa: 21.8 km, medium; Undués de Lerda at km 11.3; the sharp left turn at km 2.7; high point at km 6.4 after ~5 km of forest track | ~22 km | ER (Ruesta a Sangüesa) | yes |
| Undués to Sangüesa: the Aragon brochure counts 11.5 km; the stage guide 21.8 − 11.3 = 10.5 km | ~11.5 km; ~10.5 km | TA; ER | computed |
| Day 5 Sangüesa to Monreal: 27.3 km by Rocaforte, medium; highest point 770 m (Alto de la sierra de Izco, km 15.9); Izco at km 17.8; Monreal at km 27.2 | ~27 km; ~770 m | ER (Sangüesa a Monreal) | yes |
| The Foz de Lumbier variant is about 5 km longer, gentler, with places to eat in Liédena and Lumbier (the book says only "through villages") | ~5 km | ER (Sangüesa a Monreal, "Observaciones") | yes |
| Day 6 Monreal to Puente la Reina: 31.1 km, medium; first 13 km are continual ups and downs on the Sierra de Alaiz; Tiebas at km 13.2; Eunate at km 26; Obanos at km 28.3 | ~31 km | ER (Monreal a Puente la Reina-Gares) | yes |
| Fountains at Yárnoz, Otano and Guerendiáin | as stated | ER (Monreal a Puente la Reina-Gares, "Las dificultades") | yes |
| Monreal at 555 m | ~555 m | VNG p. 28 and p. 30 (profiles) | yes |
| Aragon's brochure divides its stretch into four stages: Somport to Jaca, Jaca to Arrés, Arrés to Artieda, Artieda to Undués de Lerda | as stated | TA (section headings "Cuatro etapas") | yes |
| The CaminoPlus website lists "6–7 stages" for the Camino Aragonés (editorial range) | 6 to 7 | WEB | yes |
| Santa Cilia is ~15 km from Jaca; by San Juan de la Peña it is 29 km | ~15 km; ~29 km | ER (Jaca a Arrés, "Observaciones": "Santa Cilia (29 km desde Jaca)") | yes |
| The two Puentes la Reina are ~110 km apart: 164.4 − 51.9 (30.5 + 21.4) = 112.5 | ~110 km | ER | computed |
| The six days are ~22 to ~31 km | ~22 to ~31 km | ER (21.8 to 31.1) | yes |

## D. Landscape and places

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Somport: customs buildings now obsolete or unused; Candanchú is a ski station | as stated | AM (tramo H-1: "infraestructuras de aduana ... obsoletas o sin uso"); TA (winter stations); WPE | yes |
| Somport to Canfranc: the V-shaped valley with the river constantly present; white limestone emerging among dark conifers | as stated | AM (tramos H-1 and H-3) | yes |
| Near Villanúa the valley opens from a V to a U shape; holm-oak woods near Villanúa "catalogado como el más septentrional de Europa" | as stated | AM (tramo H-7) | yes |
| The path crosses the N-330 three times at the bends of the Rioseta ravine | 3 | AM (tramo H-3) | yes |
| The ruins of the hospital of Santa Cristina are ~800 m below the pass | ~800 m | ER (Somport a Jaca) | yes |
| Santa Cristina: founded in the 11th century and "mencionado ya en el Códice Calixtino"; origin of the historic stage of the Camino Francés by Aragon through the Somport | as stated | VNH | yes |
| Spanish Wikipedia: the Codex Calixtinus (Liber peregrinationis, ch. III) names it one of the three most important hospitals in Christendom with Jerusalem and Mont-Joux (Great St Bernard); pilgrims who had climbed the pass found rest; lodging for three days | as stated | WPH | yes |
| Concrete bunkers built to defend the frontier | as stated | TA | yes |
| Canfranc station opened in 1928 (Wikipedia: 18 July 1928); the rail link with France ended in 1970 (Wikipedia gives 20 March in one article and 27 March in another, so the book gives only the year) | 1928; 1970 | TA; WPC; WPS | yes |
| The road tunnel under Somport, ~8 km, opened in 2003 (the brochure says January, Wikipedia 7 February: the book gives the year) | 2003 | TA; WPS | yes |
| The path passes right in front of the tunnel mouth; pilgrims must take great care there and for the next 500 m | ~500 m | TA | yes |
| Canfranc: "pueblo-calle", medieval bridge rebuilt in 1599 | as stated | TA | yes |
| Jaca: "la primera ciudad del Camino de Santiago, capital del reino de Aragón y sede de los obispos aragoneses"; cathedral begun in the second half of the 11th century | as stated | TA | yes |
| Jaca was the first capital of the Kingdom of Aragon until 1096 | 1096 | WPJ | yes |
| Jaca cathedral: Romanesque, 11th century, built on the initiative of King Sancho Ramírez | as stated | VNH | yes |
| Jaca citadel: a perfect pentagon with walls, bastions and moats, ordered about 1592 by Philip II (Wikipedia: 1592, designed by Spannocchi); its perimeter can be walked along the glacis | ~1592 | TA; WPJ | yes |
| Advice in the brochure: draw cash in Jaca because cash machines are absent until Sangüesa | as stated | TA (2009 print) | yes |
| The Canal de Berdún: a depression of marl and sandstone cut by the river; temperatures keep rising and Mediterranean-type crops appear; flat-topped hills carry the villages; white limestone peaks of the Pyrenees (Aspe, Bisaurín) in the background; Peña Oroel as a landmark behind | as stated | AM (landscape sections for Jaca to Puente la Reina and Puente la Reina to the border) | yes |
| Marl described as grey | as stated | TA ("margas grisáceas") | yes |
| Peña Oroel, 1,769 m | ~1,770 m | TA | yes |
| CSJ: after Jaca the Canal de Berdún, "extensive arable farmland, anticipating the meseta ahead; you pass dramatic rocky moonscapes and the vast reservoir of the Embalse de Yesa" | as stated | CSJ | yes |
| The stretch beyond Puente la Reina de Jaca on the southern line is "ya más inaccesible y con menos servicios" | as stated | AM (tramo H-17) | yes |
| After Puente la Reina de Jaca the study finds "el paisaje más inalterado" of the Aragonese road, with a calm rhythm over the wide valley and no road noise from infrastructure | as stated | AM (Canal de Berdún, section 4 of the landscape chapter) | yes |
| Santa Cilia is a perfect grid of streets | as stated | TA | yes |
| Puente la Reina de Jaca is named for its great stone bridge over the Aragón | as stated | TA | yes |
| The road crossing at Puente la Reina de Jaca is very hard for the walker, with no pedestrian-crossing signs (study approved 2018) | as stated | AM (section "Impactos", Canal de Berdún Jaca to Puente la Reina) | yes |
| Pilgrims have built "montones escultóricos" of stones by the river at Puente la Reina de Jaca | as stated | TA; ER (Jaca a Arrés) | yes |
| Arrés: a royal town, castle ruins on a rocky crest above the Canal de Berdún | as stated | TA | yes |
| Santa Cruz de la Serós is 4 km up the A-1603 from the N-240; its Romanesque church of Santa María is "único vestigio del Monasterio Real femenino que fundó Ramiro I de Aragón" | ~4 km | ER (Jaca a Arrés); VNH | yes |
| San Juan de la Peña is 22 km from Jaca; old monastery under a great rock, begun in the 10th century; Ramiro I, the first king of Aragon, chose it as royal pantheon; the Romanesque cloister is the only one in the world sheltered under a rock (the book does not repeat this last claim) | ~22 km | TA | yes |
| A branch of the GR 65.3 (GR 65.3.2) climbs to San Juan de la Peña by Atarés and returns by Santa Cruz de la Serós | as stated | AM (tramo H-13) | yes |
| The stage guide: the climb to San Juan de la Peña from the road is "terriblemente exigente"; the visit can be made on foot or by taxi | as stated | ER (Jaca a Arrés, "Observaciones") | yes |
| Cabañeras are the broad droving tracks (cañadas de ganado) of Aragon; they wear the soles and can cause tendinitis, so the guide recommends light trail shoes over heavy high boots; cross the N-240 with maximum caution | as stated | ER (Jaca a Arrés, "Las dificultades") | yes |
| Day 3: stony path with box bushes; "badlands"; footbridges over two ravines built in 2010; Artieda the only place to eat; a 18 km alternative to Artieda; 11 km without a village after it | as stated | ER (Arrés a Ruesta) | yes |
| Mianos is a village on a hill | as stated | TA | yes |
| After Artieda the path follows the A-1601, passes through an oak wood (first real shade) and the ruined Romanesque chapel of San Juan | as stated | ER (Arrés a Ruesta) | yes |
| The Yesa reservoir: dammed in 1959 according to the stage guide and Aragon's brochure, inaugurated 1960 according to Wikipedia; flooded 2,400 hectares; the people of three villages, among them Ruesta, had to leave | ~1960 | ER (Arrés a Ruesta); TA; WPY | yes |
| In 1988 the Ebro water authority gave Ruesta over to be recovered; ruined castle with two slender towers | 1988 | TA; ER (Arrés a Ruesta) | yes |
| At the end of summer the level of Yesa falls and the ruins of the drowned village surface | as stated | TA | yes |
| Works to enlarge the Yesa reservoir would affect ~2.8 km of the path between Artieda and Ruesta and ~500 m after Ruesta; the Ebro water authority proposed a restitution line (the present state is not known: the book says to check) | ~2.8 km; ~500 m | AM (tramos Z-5 and Z-7) | yes |
| Ruesta: Romanesque hermitage of Santiago on the river Regal, begun at the start of the 11th century; its second phase was to house a pilgrim hostel | as stated | VNH | yes |
| Day 4: wooden walkway over the Regal; hermitage "abandonada a su suerte" (the book says "abandoned"); views over the reservoir, the abandoned village of Tiermas and the ridge of Leyre | as stated | ER (Ruesta a Sangüesa) | yes |
| Undués de Lerda is the last Aragonese village; a large marker stone ("gran mojón") shows the boundary between Aragon and Navarre | as stated | TA; ER | yes |
| In Aragon wooden posts (GR 65.3) mark the path; in Navarre they are replaced by stone markers with a shell and a yellow arrow | as stated | ER (Ruesta a Sangüesa, "Observaciones") | yes |
| The stage guide advises carrying enough water, above all in summer | as stated | ER (Ruesta a Sangüesa) | yes |
| Sangüesa: Santa María la Real is a Site of Cultural Interest, an example of the transition from Romanesque to Gothic, its doorway "una de las obras cumbre del románico en España"; streets with palaces, churches and convents | as stated | VN | yes |
| Rocaforte was the original nucleus of Sangüesa; Sancho Ramírez gave it the fuero of Jaca in 1090 ("a finales del siglo XI"); Alfonso I extended it to the new burgh in 1122 | late 11th century | ER (Ruesta a Sangüesa and Sangüesa a Monreal, "Qué ver") | yes |
| Sangüesa is, after Jaca, the second town of the road by population (over 5,000) | as stated | ER (Ruesta a Sangüesa) | yes |
| Navarre brochure: two ways from Sangüesa to Monreal; the Rocaforte way is harder but almost without asphalt; the Foz de Lumbier way is easier; the climb to Rocaforte is the hardest part, so carry water | as stated | VNG p. 28 | yes |
| The way passes cereal, vines and olives, under a wind farm, to the Alto de Aibar; then "una docena de kilómetros entre valles y pinares" to Izco | ~12 km | VNG pp. 28 and 29 | yes |
| No village between Rocaforte and Izco for 15 km, and only a couple of springs | ~15 km | ER (Sangüesa a Monreal, "Las dificultades") | yes |
| Foz de Lumbier: a reserve natural, a greenway (Vía Verde) along the old Irati railway; Navarre says it is 14 km from Sangüesa (wall heights of 150 m and 300 m are given by two Navarre texts, so the book gives none) | as stated | VN; VNG p. 29; ER | yes |
| Monreal: a former hunting residence of the kings of Navarre; a Gothic bridge leads in | as stated | VNG p. 29 | yes |
| Navarre: "kilómetros de paisajes ondulantes ricos en cereal, molinos de viento, extensas pinadas y unas hoces de belleza salvaje" | as stated | VN | yes |
| Monreal to Puente la Reina "puede resultar dura debido a los desniveles que hay en sus primeros kilómetros" | as stated | VNG p. 30 | yes |
| Tiebas: ruined castle of the 13th century, a residence of the kings of Navarre | 13th century | ER (Monreal a Puente la Reina-Gares); VNG p. 31 | yes |
| After Tiebas the path follows the AP-15 fence, passes under it and under a railway, through Muruarte de Reta and Olcoz, past Enériz | as stated | ER (Monreal a Puente la Reina-Gares) | yes |
| Eunate: octagonal Romanesque church of the second half of the 12th century (in Muruzábal), 33 arches in its portico, Templar origins feed myths | 12th century | VN | yes |
| Eunate: built in 1170; its purpose is uncertain, the Templars or a funeral chapel | as stated | ER (Monreal a Puente la Reina-Gares) | yes |
| A kilometre after Eunate the path climbs to Obanos | ~1 km | ER | yes |
| Leyre: 12 km from Sangüesa; Romanesque; 11th-century crypt; the Porta Speciosa; Gregorian chants; pilgrims on foot do not pass it | ~12 km | VN; VNG p. 29 | yes |
| Javier: 8.5 km from the Camino from Sangüesa; birthplace of St Francis Xavier, patron of Navarre; the Javieradas in March | ~8.5 km | VN | yes |
| Two lines after Puente la Reina de Jaca: the southern (main) line by Arrés, Martes, Mianos, Artieda; a northern line by the N-240, Berdún, Sigüés, Escó, Tiermas, with no signs along much of it and part of its old line under the reservoir | as stated | AM (Canal de Berdún section; tramos H-17, H-18, H-20, Z-8) | yes |
| Spanish Wikipedia's "Alternativa por Sigüés": Puente la Reina de Jaca, Berdún, Sigüés, Escó, Tiermas, Yesa, Javier, Sangüesa | as stated | WPE | yes |
| Aragon's brochure: the first crossing into Aragon used a Roman road over the Palo pass and down the Echo valley; the Somport route was promoted later | as stated | TA ("Los otros caminos hacia Santiago") | yes |
| Wikipedia: the Somport was arguably the most popular Pyrenean pass for pilgrims until the Roncesvalles road became safer in the 12th century | as stated | WPS | yes |
| The Holy Grail "stayed" at San Juan de la Peña from 1071 to 1399 (a Navarre leaflet states it as fact) | as stated | VNH | removed |
| The Aragonese stretch "ramal Norte-Sur" and population of its villages | as stated | AM | removed |

## E. History, the Codex and the numbers of pilgrims

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Codex Calixtinus (12th century) lists four routes that start in France and converge at Puente la Reina | as stated | WPW ("Four pilgrimage routes listed in the codex originate in France and converge at Puente la Reina") | yes |
| The Arles route is one of the four medieval pilgrim routes described by Picaud in his 12th-century Pilgrim's Guide | as stated | CSJ | yes |
| Spanish Wikipedia: use of the road is very minor; of those who received the Compostela in 2018, 404 started at Somport, 29 at Canfranc, 116 at Jaca (citing the Office; Arles 164) | 404; 116 | WPE (lead) | yes |
| CSJ: "a solitary but very rewarding route with relatively few pilgrims, although the number is increasing year by year" | as stated | CSJ | yes |
| The French Way is the most popular route (Wikipedia) | as stated | WPF (lead) | yes |
| The Office's statistics page is rendered by script and could not be read | as stated | OP (statistics-2) | removed |

## F. Seasons, weather, daylight and difficulty

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CSJ: walkable throughout the year; spring (long daylight hours, beautiful flowers) and autumn are best; summer is too hot; winter journeys over the Col du Somport in snow or mist are not advised except possibly for experienced mountain walkers; Aragón "can be very chilly and windy, even in summer"; the Col du Somport is snow-covered in winter | as stated | CSJ | yes |
| The app's route notes: best May to September | May to September | RG | yes |
| Jaca climate (Wikipedia, WMO figures 1981 to 2010): January mean daily high 9.5 °C, low −0.8 °C; April high 16.2; May high 20.5; July high 29.4, low 13.7; October high 19.0, low 7.3; about 768 mm of rain a year; submediterranean climate; no real dry season, autumn and spring rainiest; frost common; snow common from late November to early March | about 10 °C; about −1 °C; about 16 °C; about 21 °C; about 29 °C; about 14 °C; about 19 °C; about 7 °C; about 770 mm | WPJ ("Climate" section and Weather box) | yes |
| Daylight at Jaca: 21 Dec 9.05 h; 15 Mar 11.85 h; 15 Sep 12.56 h; 21 Jun 15.31 h (sunrise 06:24, sunset 21:42 CEST); 15 Oct sunset 19:21 CEST | about 9; about 12; about 12.5; about 15 hours; about 06:25; about 21:40; about 19:20 | SUN | computed |
| CaminoPlus catalog difficulty: Camino Aragonés 3, French Way 3, Winter Way 3 | 3 | CAT | yes |
| The stage guide rates each of the six days "Media" (medium) | medium | ER (six pages) | yes |
| The app's notes: "Quiet route. Services are sparse in places." | as stated | RG | yes |
| Between Somport and Berdún the path keeps close to the N-330 and N-240 (the study describes many crossings) | as stated | AM (tramos H-1 to H-18) | yes |
| Some small albergues keep only a season: volunteer hosts "de marzo a octubre" in one village; the campsite near Ruesta opens in summer | March to October | ER (Jaca a Arrés, "Observaciones"); TA | yes |
| The stage guide notes at the exit of Obanos "una hilera de peregrinos bastante más numerosa que de costumbre" | as stated | ER (Monreal a Puente la Reina-Gares) | yes |

## G. Before you go, sleeping and safety

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The official credencial is a cardboard card of sixteen concertina-folded pages; it can be requested at the Office or at institutions authorised by the cathedral (parish churches, Associations of Friends of the Way of St. James, pilgrim hostels, confraternities and others); a digital credential exists as an app for Android and iOS; the credencial "does not generate any rights"; two uses: access to hostels, and proof for the Compostela; stamps are normally collected where pilgrims sleep but also in parish churches, monasteries, town halls and other places | as stated | OP (the-credencial) | yes |
| Hostels that receive no subsidies are maintained with contributions from pilgrims | as stated | OP (the-credencial) | yes |
| The credencial is for pilgrims "who wish to make the pilgrimage with a Christian sentiment, even if it is only with an attitude of search" | as stated | OP (the-credencial); books/shared-facts.md | yes |
| The Confraternity: train and bus service over the Pyrenees between Oloron-Sainte-Marie and Jaca; "possible to walk virtually the whole route using only pilgrim accommodation, gîtes d'étape in France and albergues in Spain" | as stated | CSJ | yes |
| Wikipedia: Canfranc station served by two daily trains to and from Zaragoza in the 2010s (the book says only that it "has been served by trains from Zaragoza", and gives no times) | as stated | WPC | yes |
| Navarre's page lists a bus line from Pamplona to Sangüesa | as stated | VN (page "Camino de Santiago", "Punto de partida") | yes |
| Navarre's tourism pages: the lighter the luggage the better | as stated | VN (page "Camino de Santiago") | yes |
| Navarre's tourism pages point to the European Health Insurance Card ("Tarjeta Sanitaria Europea") and list SOS 112 | as stated | VN (page "Camino de Santiago") | yes |
| AEMET is the Spanish state weather service (Agencia Estatal de Meteorología) and publishes forecasts | as stated | https://www.aemet.es/en/portada ("State Meteorological Agency - AEMET - Spanish Government") | yes |
| Policía Foral de Navarra (2026): on roads walk on the left, facing traffic, and use the shoulder if available; in a group, move in single file; at night or in low visibility use lights or reflective gear; in emergency call 112 | as stated | PF (English section) | yes |
| In Navarre the official signs also give Basque names: Sangüesa/Zangoza, Monreal/Elo, Puente la Reina/Gares | as stated | WPA (list of locations) | yes |
| Some stretches had no signs at all in the Aragonese study (Puente la Reina de Jaca to Berdún; Berdún to Sigüés; Sigüés to Navarre on the northern line) | as stated | AM (tramos H-18, H-20, Z-8) | yes |
| The yellow arrow is the main sign of all branches in Navarre, with stone markers (hitos) | as stated | VN (page "Camino de Santiago", "Señalización") | yes |
| Volunteer hosts in one village usually run its albergue from March to October; a communal dinner is paid for by donations | as stated | ER (Jaca a Arrés, "Observaciones") | yes |
| Sangüesa has "todos los servicios que hubiera podido echar en falta desde Jaca" | as stated | ER (Ruesta a Sangüesa) | yes |
| The Office: "devotionis affectu, voti vel pietatis", the Compostela in modern times limited to those who come for religious and/or spiritual reasons on foot, bicycle or horseback; at least the last 100 km on foot or horseback or 200 km by bicycle; 100 continuous km on the same recognised route, final stage including the last one into the cathedral; stages in order; stamps at the start and end of each stage; 70 km in Spain for those who walked a recognised route outside Spain; Cabildo's right in exceptional cases | as stated | OP (the-compostela); books/shared-facts.md | yes |
| The Office also offers a Certificate of Distance, issued by the Chapter of the Cathedral, certifying the kilometres "whatever the starting point of their pilgrimage" (its price is not given in the book) | as stated | OP (certificate-of-distance) | yes |
| The Office's pages read for this book do not mention the Aragonese Way or list the routes it "recognizes" (zero hits for "Arag" on its home, Compostela, credencial, certificate, planning, introduction, pilgrims and after-the-pilgrimage pages, 2026-11-08) | as stated | OP | yes |
| The Pilgrim's Office describes the pilgrimage as the standard purpose sentence of the series | as stated | books/shared-facts.md | yes |
| The welcome carries the standard sentence about AI assistance | as stated | books/shared-facts.md | yes |
| The Library has a reflection book "Songs for the Climb" for the Camino Aragonés: eight days with the Psalms of Ascent | 8 days | BK | yes |
| *The French Way* is the first book of the series | as stated | BK (series.md) | yes |
| The app: CaminoPlus is the offline-first companion app for the Camino de Santiago, with offline maps, stays and cafes, a pilgrim passport with stamps, a journal and friends; the paid plan is Pilgrim Plus; the book makes no claim about what the app holds for this route | as stated | the voice file; README | yes |
