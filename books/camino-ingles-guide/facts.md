# Fact ledger: The English Way (camino-ingles-guide)

Working file, not published. One row per hard fact in the book. "Checked" says how: `read` = the page or file was read in full or in the relevant part on 2026-11-08 (the date of writing); `repo` = read in this repository; `computed` = calculated, not looked up (flagged for the owner); `advice` = a piece of prudent advice, not a fact.

Source short names (full addresses are given in each row):

- CIG = Asociación de Concellos do Camiño Inglés, official site caminoingles.gal
- XUNTA = Xunta de Galicia official portal caminodesantiago.gal
- OP = Oficina del Peregrino (Pilgrim's Reception Office of the Cathedral of Santiago), oficinadelperegrino.com
- CSJ = Confraternity of St James, csj.org.uk
- WP = Wikipedia (English)

## A. Route, distances and stage figures

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route: Ferrol to Santiago de Compostela, six stages in the app | Ferrol to Neda; Neda to Pontedeume; Pontedeume to Betanzos; Betanzos to Hospital de Bruma; Hospital de Bruma to Sigüeiro; Sigüeiro to Santiago de Compostela | supabase/migrations/20261113010000_camino_ingles_stages.sql; tools/offline-maps/stages/camino-ingles-01..06.json | yes (repo) |
| Route start and end in the app catalog | Ferrol to Santiago de Compostela; catalog distance 120 (rounded); stage_count empty | supabase/migrations/20261106120000_more_caminos.sql (row camino-ingles) | yes (repo) |
| The app's ~120 km is a rounded figure; the published length from Ferrol is 112.4 to 113.4 km | ~113 km | supabase/migrations/20261113010000_camino_ingles_stages.sql (comment); Xunta page below | yes (repo) |
| Length of the Ferrol route, official Xunta figure | 112.4 km ("112,5 km" in the body text); difficulty Medium | XUNTA, https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way | yes |
| Length of the Ferrol route, official CIG figure | 113 km | CIG, https://www.caminoingles.gal/en/ and https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ ("From Ferrol (113 km total)") | yes |
| Sum of the six CIG stage figures | 15.4 + 12.9 + 19.9 + 24.1 + 24.2 + 16.5 = 113.0 km | CIG stage pages (rows below) | yes (sum computed) |
| Another figure for the same route: ~119 km | "approximate distance of 119 kilometres" | CIG, https://www.caminoingles.gal/en/compostela-camino-ingles | yes |
| Another figure: ~110 km | 110 km (Wikipedia, citing the Confraternity of St James, 2018) | WP, https://en.wikipedia.org/wiki/English_Way | yes |
| Ferrol to Neda | 15.4 km (CIG); Xunta stage 15.4 km; federation dossier 15.47 km; difficulty Low; estimate 4 h (CIG), 3 h (Xunta stage page) | CIG https://www.caminoingles.gal/en/etapa-ferrol-neda/ ; XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way/stage-ferrol-neda ; other sources as given in tools/offline-maps/catalog/camino-ingles/01.json (notes) | yes |
| Neda to Pontedeume | 12.9 km (CIG); federation dossier 13.21 km; difficulty Low; estimate 4 h. CIG's page Ferrol to Neda says "16 km more to Pontedeume" (its own figures differ) | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ ; tools/offline-maps/catalog/camino-ingles/02.json (notes) | yes |
| Xunta's Neda to Miño stage | 22.1 km, Medium, 5 h 35 min; Neda-Fene 3.6, Fene-Cabanas 7.4 (Cabanas-Pontedeume 1.9 and Pontedeume-Miño 9.2 from the catalog notes) | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way/stage-neda-mino ; tools/offline-maps/catalog/camino-ingles/02.json | yes |
| Pontedeume to Betanzos | 19.9 km (CIG, federation 19.93); difficulty Medium; estimate 6 h | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ ; catalog 03.json | yes |
| Betanzos to Hospital de Bruma | 24.1 km (CIG; federation 23.51; Xunta 13.5 + 10.5 = 24.0); difficulty Medium; estimate 8 h | CIG https://www.caminoingles.gal/en/etapa-betanzos-bruma/ ; catalog 04.json | yes |
| Hospital de Bruma to Sigüeiro | 24.2 km (CIG and Xunta; federation 25.12); difficulty Low; estimate 6 h | CIG https://www.caminoingles.gal/en/etapa-bruma-sigueiro/ ; catalog 05.json | yes |
| Sigüeiro to Santiago de Compostela | 16.5 km (CIG), 16.1 km (Xunta), 16 km (federation); difficulty Low; estimate 4 h 30 min | CIG https://www.caminoingles.gal/en/etapa-sigueiro-santiago-de-compostela/ ; catalog 06.json | yes |
| Sources differ by up to about a kilometre on a stage | as above (largest gap: Bruma-Sigüeiro 24.2 vs 25.12) | tools/offline-maps/catalog/camino-ingles/01..06.json (notes); supabase/migrations/20261113010000_camino_ingles_stages.sql | yes (repo) |
| Ferrol to Neda line is ~7 km straight, for a ~15 km walk, because the route circles the head of the Ría de Ferrol | ~7 km | tools/offline-maps/catalog/camino-ingles/01.json (notes; computed in the catalog from its checked points) | yes (repo) |
| Average day 20 to 25 km; the Ferrol route is 5 or 6 stages, the A Coruña route 3 or 4 | as stated | CIG https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| Route starts at sea level and climbs inland without exceeding 500 metres; main thing to prepare for is rain | ~500 m | CIG https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| Official leaflet splits the long days into nine sections: Pontedeume-Miño ~9.75 and Miño-Betanzos ~10.2; Betanzos-Presedo ~12.0 and Presedo-Bruma ~11.5; Bruma-Poulo ~9.9 and Poulo-Sigüeiro ~15.2 | km as stated, rounded | "De Ferrol a Santiago" leaflet (PDF on caminoingles.gal, 2021), as recorded in tools/offline-maps/catalog/camino-ingles/03.json, 04.json, 05.json (notes) | yes (repo; leaflet itself not re-read) |
| Xunta's own five stages include Miño to Bruma at 34.7 km | ~35 km | tools/offline-maps/catalog/camino-ingles/01.json (notes: Xunta portal figures read 2026-11-07) | yes (repo; Xunta stage page not re-read) |
| Public hostels listed by the official site (read November 2026): Ferrol, Neda, Pontedeume, Betanzos, Bruma (Mesía), Abegondo, Poulo (Ordes), Sergude (Carral) | towns only; no hostel named in the book | CIG https://www.caminoingles.gal/en/ and https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| Public hostels generally first come, first served, generally one night; private ones can be booked | as stated | CIG https://www.caminoingles.gal/en/faq/ | yes |
| Public hostels generally do not allow pets to sleep inside | as stated | CIG https://www.caminoingles.gal/en/faq/ | yes |
| Hostels without subsidies are kept up by pilgrims' contributions | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| The route is clearly signposted along most of its length; yellow arrows on milestones | as stated | CIG https://www.caminoingles.gal/en/faq/ | yes |
| Baggage transport services exist, listed on the official site (no names in the book) | as stated | CIG https://www.caminoingles.gal/en/ (services list) | yes |
| Ferrol has a train station and a bus station; the airport for Ferrol is A Coruña (LCG), Santiago (SCQ) the second option; A Coruña has an airport, train station and bus station | as stated | CIG https://www.caminoingles.gal/en/transportes/ | yes |
| Santiago airport: Santiago-Rosalía de Castro, IATA SCQ, ~12 km from the city, city bus link, flights to Spanish and European cities (London, Dublin, Paris, Frankfurt and others) | ~12 km | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Airport | yes |

## B. The A Coruña variant

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| A Coruña route length, official | 73.7 km (CIG), 72.8 km (Xunta header) and 73 km (Xunta body); 75 km (WP); difficulty Medium (Xunta) | CIG https://www.caminoingles.gal/en/o-camino-ingles-desde-a-coruna/ ; XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way ; WP https://en.wikipedia.org/wiki/English_Way | yes |
| A Coruña route is called Camiño do Faro (the Lighthouse Way); the Tower of Hercules lighthouse | as stated | CIG https://www.caminoingles.gal/en/o-camino-ingles-desde-a-coruna/ | yes |
| A Coruña stages: A Coruña to Sergude 20 km; Sergude to Bruma 13 km (physically very demanding, long climb); then Bruma-Sigüeiro and Sigüeiro-Santiago shared | km as stated | CIG https://www.caminoingles.gal/en/o-camino-ingles-desde-a-coruna/ | yes |
| A Coruña to Bruma in one stage is 33 km | ~33 km | CIG https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| The Ferrol and A Coruña branches meet at the chapel of As Travesas, just over 2 km before the hostel at Bruma | ~2 km | CIG https://www.caminoingles.gal/en/etapa-betanzos-bruma/ ; catalog 04.json (notes: As Travesas, where the A Coruña branch joins) | yes |
| Tower of Hercules: Roman lighthouse, in operation possibly since the 2nd century AD; UNESCO World Heritage Site 29 June 2009 | 2nd century; 2009 | WP https://en.wikipedia.org/wiki/A_Coru%C3%B1a | yes |
| A Coruña is the traditional landing port of the sea pilgrims | as stated | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ | yes |
| Credencial available in A Coruña at the church of Santiago; in Ferrol at the co-cathedral (San Xiao / San Julián) | as stated | CIG https://www.caminoingles.gal/en/faq/ ; https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| In 2024, 96% of pilgrims on the English Way started in Ferrol and 2.2% in A Coruña | 96%; 2.2% | WP https://en.wikipedia.org/wiki/English_Way (citing oficinadelperegrino.com/en/statistics-2/) | yes (Wikipedia; Office page is dynamic and was not readable) |
| Finchale Priory, County Durham, is the official English starting point according to the association; route recognised 2019 (Finchale Priory to Escomb Church via Durham Cathedral) | 2019 | WP https://en.wikipedia.org/wiki/English_Way ; CIG https://www.caminoingles.gal/en/o-camino-ingles-en-gran-bretana/ (cited by Wikipedia) | yes (Wikipedia) |

## C. The Compostela, credencial and the Pilgrim's Office

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Compostela is for pilgrims who come for religious or spiritual reasons, on foot, by bicycle or on horseback, and who have travelled at least the last hundred kilometres on foot or horseback or the last two hundred by bicycle, shown by the stamped credencial | 100 km; 200 km | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| At least 100 continuous kilometres on the same route recognised by the Office's system; the final stage must include at least the last one leading into the Cathedral | 100 km | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| A pilgrim who has already started a recognised route on foot outside Spain needs no less than 70 km in Spain | 70 km | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| The Cabildo (Church Council) reserves the right to grant the Compostela in special and exceptional cases; the Office must be contacted in advance | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| Walkers doing only the minimum must have the credencial stamped at the start and end of each stage, with date | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| The official English Way site recommends at least two stamps a day for the last hundred km; stamps show date, place and issuing body | as stated | CIG https://www.caminoingles.gal/en/compostela-camino-ingles | yes |
| The same page says segments of different Caminos cannot be combined | as stated | CIG https://www.caminoingles.gal/en/compostela-camino-ingles | yes |
| The English Way site gives A Coruña as ~73 km, short of the minimum, and says a prior segment elsewhere can make up the distance | ~73 km | CIG https://www.caminoingles.gal/en/compostela-camino-ingles | yes |
| Since December 2016, the cathedral chapter has allowed the Compostela for pilgrims starting from A Coruña under conditions (Wikipedia: a certified minimum of 25 km on a St James route in the pilgrim's country of origin) | December 2016; 25 km | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ ; WP https://en.wikipedia.org/wiki/English_Way | yes (Wikipedia for the 25 km; the Office page does not state it) |
| The Office page and the 25 km figure agree in effect: 70 km in Spain plus a certified distance abroad | ~70 + ~30 = ~100 km | OP (70 km rule); WP (25 km) | no (my reading; not stated by a source; the book does not state the sum) |
| The credencial: the pilgrim's passport; official model on card; issued by confraternities, authorised associations, parish churches, hostels; purposes are access to the hostels of the Way and proof for the Compostela; "does not generate any rights" | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Stamps usually collected where pilgrims sleep, and in parish churches, monasteries, cathedrals, hotels, town halls and other places | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| The Office describes a digital credential, an app for Android and iOS | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| Compostela is a Latin document; the Latin phrase "devotionis affectu, voti vel pietatis"; issued free of charge; a ticket with a QR code is needed; same-day collection not guaranteed in times of great influx | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| Certificate of distance: a separate document stating start, kilometres, dates and route, for any pilgrim whatever the starting point; a fee (not stated in the book) | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/certificate-of-distance/ | yes |
| CSJ: the Office must be satisfied you walked the last 100 km or cycled the last 200 km; Compostela for "religious" or "spiritual" reason | as stated | CSJ https://www.csj.org.uk/the-compostela/ | yes |
| Hostal dos Reis Católicos: founded by the Catholic Monarchs in the 16th century as the Royal Hospital; hotel since 1954 | 16th century; 1954 | OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ | yes |
| In 1985, 1,245 pilgrims arrived in Santiago; in the 2010 Holy Year, 272,703 qualified for the Compostela | 1,245; 272,703 | OP https://oficinadelperegrino.com/en/pilgrimage/introduction/ | yes |
| About 26,800 pilgrims walked the English Way in 2024 (5.6% of those arriving at the Office); fourth most walked route | ~27,000; 5.6% | WP https://en.wikipedia.org/wiki/English_Way (citing the Office statistics) | yes (Wikipedia) |
| Pilgrims finishing the English Way by month, 2024: January 126, February 173, March 1,130, April 2,520, May 3,564, June 3,156, July 3,539, August 4,706, September 3,738, October 2,517, November 454, December 321 | rounded in the book | WP https://en.wikipedia.org/wiki/English_Way (timeline "Source: oficinadelperegrino.com"); the monthly figures add up to ~25,900, a little below the ~26,800 total: the book rounds and does not add them | yes (Wikipedia) |

## D. History and people

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The pilgrimage began after the discovery of the tomb under King Alfonso II (792 to 842) | 792-842 | OP https://oficinadelperegrino.com/en/pilgrimage/introduction/ | yes |
| The 12th and 13th centuries are considered the golden age; the Renaissance and Reformation led to a decrease in pilgrims | 12th-13th centuries | OP https://oficinadelperegrino.com/en/pilgrimage/introduction/ | yes |
| Pilgrims came from northern Europe, mainly Britain and Ireland, for more than 800 years; sea voyage popular from the 13th to the 16th centuries; ships left at least 30 UK ports; Bristol and Plymouth busiest | 800 years; 13th-16th centuries; 30 ports | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ | yes |
| The English Way fell into oblivion in the 18th century and revived with great vitality in the 1990s | 18th century; 1990s | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ | yes |
| A sea voyage of at least two to four weeks, wind and currents permitting | 2-4 weeks | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ | yes |
| The history of these pilgrimages began in the 12th century; in 1147 a troop of English, German and Flemish crusaders visited the tomb of St James | 12th century; 1147 | XUNTA https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way | yes |
| Hundred Years' War 1337 to 1453: English pilgrims and traders travelled to Galician ports with the permission of the English Crown | 1337-1453 | WP https://en.wikipedia.org/wiki/English_Way | yes (Wikipedia) |
| Pilgrim hospitals with English support included Sigüeiro, San Paio, Pontedeume, Betanzos, Bruma, Neda, Miño and Paderne | as stated | WP https://en.wikipedia.org/wiki/English_Way | yes (Wikipedia; not used for a number) |
| The official history page names Margery Kempe, an English mystic, among travellers | as stated | CIG https://www.caminoingles.gal/en/historia-e-informacion-do-camino-ingles/ | yes |
| Margery Kempe (about 1373 to after 1438), of Bishop's Lynn (King's Lynn), set off for Santiago in 1417 via Bristol and returned in 1418 | 1417; 1418 | WP https://en.wikipedia.org/wiki/Margery_Kempe | yes |
| Ferrol: naval shipbuilding centre for most of its history; Royal Dockyards built 1726 to 1783; historically often described as the best natural port in Europe; ~64,000 people (2024) | 1726-1783 | WP https://en.wikipedia.org/wiki/Ferrol and https://en.wikipedia.org/wiki/Ferrol,_Spain | yes |
| Ferrol is a preferred starting point because of the hundred-kilometre rule | as stated | WP https://en.wikipedia.org/wiki/Ferrol ; OP (rule) | yes |
| Pontedeume: town founded by a charter of Alfonso X the Wise in 1270; arcades, wooden balconies, glass galleries; patron-saint festivities in September (8th and 10th) | 1270; September | WP https://en.wikipedia.org/wiki/Pontedeume | yes |
| Fernán Pérez de Andrade, "o Bóo" ("the good one"), Galician knight, died 1397; credited with the castle of Nogueirosa; sponsored the church of San Francisco in Betanzos | 1397 | WP https://en.wikipedia.org/wiki/Fern%C3%A1n_P%C3%A9rez_de_Andrade | yes |
| Betanzos: church of San Francisco erected 1387 by order of Fernán Pérez de Andrade, his tomb with hunting scenes inside; 15th-century church of Santiago built by the tailors' guild, with an equestrian statue of St James on its portal; one of the best preserved old quarters in Galicia; ~13,000 people (2024); August festival for San Roque with a very large paper balloon, and later decorated boats on the Mandeo to Os Caneiros | 1387; 15th century | WP https://en.wikipedia.org/wiki/Betanzos | yes |
| Santiago de Compostela: old town a UNESCO World Heritage Site, inscribed 1985; ~101,000 people (2025) | 1985 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes |
| Cathedral: construction began 1075; consecrated 1211; Pórtico da Gloria completed by Master Mateo in 1188; Baroque Obradoiro façade by Fernando de Casas Novoa completed 1740; Romanesque with later Gothic and Baroque additions | 1075; 1211; 1188; 1740 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| The Holy Door is opened only in a Jacobean Holy Year; in Holy Years the botafumeiro is used at all Pilgrims' Masses; otherwise on certain important religious holidays | as stated | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Cathedral | yes |
| Jacobean Holy Year occurs when 25 July falls on a Sunday; recent 2021-2022; next 2027, then 2032 | 2027; 2032 | WP https://en.wikipedia.org/wiki/Jacobean_Holy_Year | yes |
| Galician and Spanish are both official languages in Galicia; Santiago is the capital; four provinces | as stated | WP https://en.wikipedia.org/wiki/Galicia_(Spain) | yes |
| Spain uses the euro and the CET/CEST time zone | as stated | WP https://en.wikipedia.org/wiki/Spain | yes |

## E. Places on the way (stage by stage)

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Ferrol: the stage starts at the port of Curuxeiras; the route crosses the city by the Calle Real with the naval-military area on the right; co-cathedral of San Xiao and convent of San Francisco; the sea on the right almost all the way; from one side of the estuary to the other | as stated | CIG https://www.caminoingles.gal/en/etapa-ferrol-neda/ ; catalog 01.json (Curuxeiras, Ferrol Vello) | yes |
| Monastery of San Martiño de Xuvia: formerly a double monastery, three Romanesque apses, a medieval sarcophagus in the atrium in front of an 18th-century tower | as stated | CIG https://www.caminoingles.gal/en/etapa-ferrol-neda/ | yes |
| Royal Flour Factory built in 1775, now a visitor centre (CIMIX), just after leaving Narón towards Neda | 1775 | CIG https://www.caminoingles.gal/en/etapa-ferrol-neda/ | yes |
| Neda: churches of Santa María and Gothic San Nicolás; a footbridge over the River Belelle; arcaded Calle Real; Clock Tower next to the Town Hall; remains of the old pilgrims' hospital "Sancti Spiritos"; one of the oldest crosses in Galicia at San Nicolás | as stated | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ | yes |
| Neda stage: a quiet stage with only one climb, at the exit of Neda, with views of the Ferrol estuary | as stated | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ | yes |
| Fene (services for pilgrims), washing area of Mundín, dirt track up to Cabanas; descent into Cabanas views the mouth of the River Eume; Fragas do Eume Natural Park a few kilometres upstream; the castle of Nogueirosa visible on the mountain ahead | as stated | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ | yes |
| Eume bridge: "only 15 arches nowadays, but there used to be 70" | 15; 70 | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ | yes |
| Pontedeume: the Tower of Andrade (part of the Andrade family's palace), the church of Santiago, the Town Hall and library building, the Augustinian convent | as stated | CIG https://www.caminoingles.gal/en/etapa-neda-pontedeume/ | yes |
| Pontedeume exit: a steep slope of one kilometre; then gentle descent through farmland to sea level at the Baxoi bridge, which pilgrims crossed in the Middle Ages | ~1 km | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ | yes |
| Miño; mouth of the Lambre (Natura 2000 Network); a Gothic bridge; a climb to a viewpoint over the mouth of the Mandeo, which forms the Betanzos estuary | as stated | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ | yes |
| Tiobre: Romanesque church of San Martiño, "an obligatory stop"; vineyards; the wine once famous and sought after by the British Navy | as stated | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ | yes |
| Os Remedios (Nosa Señora do Camiño): a Renaissance temple, "something rare in Galicia" | as stated | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ | yes |
| Betanzos entered by the old bridge over the Mandeo and the A Ponte Vella gate; church of San Francisco with the cenotaph of Fernán Pérez de Andrade | as stated | CIG https://www.caminoingles.gal/en/etapa-pontedeume-betanzos/ | yes |
| Betanzos to Bruma: "the most demanding" stage, "hardest for most pilgrims", yet "does not indicate that it is very difficult"; begins with a climb; leaves Betanzos by the bridge of As Cascas, which survived the war against Napoleon's soldiers; three rural churches: Cos (San Esteban), the Saleta sanctuary at Presedo (about 100 m from the route, hidden by vegetation), Leiro | ~100 m | CIG https://www.caminoingles.gal/en/etapa-betanzos-bruma/ | yes |
| As Travesas chapel with tables and benches; just over 2 km to the hostel at Bruma, part beside the main road (caution); Bruma: chapel of San Lourenzo, remains of a medieval pilgrims' hospital | ~2 km | CIG https://www.caminoingles.gal/en/etapa-betanzos-bruma/ | yes |
| Hospital de Bruma is in the municipality of Mesía; the stage crosses Mesía, Ordes and Oroso | as stated | CIG https://www.caminoingles.gal/en/etapa-betanzos-bruma/ and https://www.caminoingles.gal/en/etapa-bruma-sigueiro/ | yes |
| Bruma to Sigüeiro: a gradual descent; the opposite of the previous stage; three churches in the first two hours (Ardemil, San Paio de Buscás, Calle); San Paio has a polychrome figure of the saint and a Romanesque façade | ~2 h | CIG https://www.caminoingles.gal/en/etapa-bruma-sigueiro/ | yes |
| Woodland; the trail from the village of Os Carrás keeps much of its medieval appearance; Fonte da Santiña, a water point about an hour before Sigüeiro, linked to Father Sarmiento, who stopped there in the 18th century; a medieval path into the Carboeiro park; the Tambre crossed on a historic bridge into Sigüeiro | ~1 h | CIG https://www.caminoingles.gal/en/etapa-bruma-sigueiro/ | yes |
| Sigüeiro to Santiago: starts by crossing the Tambre bridge, which has stood in the same place for almost a millennium; stairs on the left to see the bridge better; small tracks with little traffic parallel to the N-550; pine woods to A Sionlla; a prehistoric castro; the oak forest called the Enchanted Forest; farmland; the centre of Santiago and the Cathedral | ~1000 years | CIG https://www.caminoingles.gal/en/etapa-sigueiro-santiago-de-compostela/ | yes |

## F. Climate and daylight

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Santiago has a temperate oceanic climate; ~1,800 mm of rain a year (article text), 1,526.6 mm in the 1991-2020 table, 1,787 mm at the airport (1981-2010); wettest months October (214 mm), January (196 mm), November (194 mm), December (184 mm) | ~1,500 to ~1,800 mm | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes |
| January mean daily high 12.3 °C, low 5.4 °C; July high 24.8 °C, low 14.4 °C (1991-2020) | ~12 °C; ~5 °C; ~25 °C; ~14 °C | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes |
| Sunshine at the airport: 85 hours in December to 243 in July | ~85 h; ~243 h | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela | yes |
| Less rain from May to September; mild coastal climate, can be walked at any time of year | as stated | CIG https://www.caminoingles.gal/en/faq/ and https://www.caminoingles.gal/en/como-planificar-o-camino-ingles/ | yes |
| Daylight in Santiago: ~9 hours at the December solstice, ~15 hours at the June solstice | ~9 h; ~15 h | sunrise-sunset.org (via web search, 9 h 00 m and 15 h 17 m) and the NOAA solar equations computed for the city (9.0 h and 15.35 h) | yes (two sources; the second is computed) |
| The sun rises close to nine o'clock in midwinter and sets late in June (Galicia is on Spain's CET/CEST clock but far west in the zone) | ~09:00; after 22:00 | computed from the NOAA solar equations for Santiago (21 Dec: 09:01 to 18:02; 21 Jun: 06:55 to 22:15, CEST); owner to confirm with a sun table | computed |

## G. Food (official gastronomy page)

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Betanzos omelette (tortilla de Betanzos); Neda bread; Pontedeume sweets (the page lists proia, costrada, melindres and almendrados, and a Pontedeume cake); Carral bread and empanadas; trout at Oroso; polbo á feira, empanadas, Tarta de Santiago along the route; cheese from Abegondo, Paderne, Mesía and Ordes (some with the Arzúa-Ulloa denomination); Galician wines; queimada | as stated | CIG https://www.caminoingles.gal/en/a-gastronomia-no-camino-ingles/ | yes |

## H. Brand and repository statements

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CaminoPlus: the offline-first companion app for the Camino, with maps that work without signal, stays and cafes, a pilgrim passport with stamps, a journal and friends; the app is in development; the paid plan is Pilgrim Plus | as stated | README.md | yes (repo) |
| Sarria to Santiago is ~115 km | ~115 km | brand/BRAND_GUIDELINE.md section 2 | yes (repo; not checked against a public source) |
| Camino Francés ~773 km; Camino Portugués Central ~240 km; Camino Portugués Costero ~260 km; Camino del Norte ~820 km; Santiago to Finisterre and Muxía ~90 km | as stated | supabase/migrations/20261106120000_more_caminos.sql; books/series.md | yes (repo) |
| 112 is the European emergency number | 112 | .claude/skills/book-writer/reference/voice-and-honesty.md; CIG https://www.caminoingles.gal/en/ (emergency link) | yes |
| Stages of the Camino Inglés are hidden in the app today (is_published = false) | not stated in the book | supabase/migrations/20261113010000_camino_ingles_stages.sql | yes (repo); the book therefore has no "In the app: stage N" lines |

## I. Advice, not facts (no source needed, kept plain)

Boots broken in before you go; two pairs of socks; start early on hot days and carry water; carry food for the long woodland days; keep to the path and not the main road; face traffic where you must walk on a road; tell someone your plan; earplugs and a head torch for dorms; check mattress seams and keep the pack off the bed; see a doctor for anything that worries you. Marked `advice`.

## Not verified and left out

- Total ascent per stage: sources differ widely (figures from 300 m to about 690 m turned up for Betanzos to Bruma), none official. Left out. The only altitude statement is the official "does not exceed 500 metres".
- The highest point of the route (figures of about 454 to 460 m on commercial pages): left out.
- Any hostel name, bed count, price, opening hours, phone number or coordinate: left out by the rules.
- The Pilgrim's Office statistics page (dynamic): not readable; its numbers come through Wikipedia.
- The Xunta stage pages for Miño to Bruma and Bruma to Sigüeiro and the 2021 leaflet were not re-read; their figures come from the repo catalog notes (read 2026-11-07 by the catalog author).
- Whether an app's digital stamps can be used for the Compostela: left out; the book says to carry the paper credencial.
- The "25 km" rule for pilgrims starting in A Coruña is stated by Wikipedia only; the Office page gives a seventy-kilometre rule; the book tells the reader to ask the Office.
