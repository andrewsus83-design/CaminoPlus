# Fact ledger: To the End of the Earth (camino-finisterre-muxia-guide)

Working file, not published. One row per hard fact in the book. "Checked" says how: `yes` = the page or file was read in full or in the relevant part on 2026-11-08 (the date of writing); `yes (repo)` = read in this repository; `computed` = calculated by the author of the book from other rows, not looked up (flagged for the owner); `advice` = a piece of prudent advice, not a fact; `removed` = taken out of the book, kept here so that nobody puts it back unchecked.

Source short names (full addresses are given in each row):

- XR = Xunta de Galicia, official Camino portal, page "The Fisterra and Muxia Way": https://www.caminodesantiago.gal/en/make-plans/the-ways/the-fisterra-and-muxia-way
- XS1..XS5, XSM, XSR = the Xunta's stage pages under https://www.caminodesantiago.gal/en/make-plans/the-ways/ (XS1 the-fisterra-and-muxia-way/stage-santiago-negreira?vid=V1; XS2 fisterra-and-muxia-way/stage-negreira-olveiroa?vid=V1; XS3 the-fisterra-and-muxia-way/stage-olveiroa-corcubion?vid=V2; XS4 the-fisterra-and-muxia-way/stage-corcubion-fisterra?vid=V2; XS5 the-fisterra-and-muxia-way/stage-fisterra-muxia?vid=V2; XSM the-fisterra-and-muxia-way/stage-olveiroa-muxia?vid=V1, Olveiroa to Muxia direct; XSR the-fisterra-and-muxia-way/stage-muxia-fisterra?vid=V1, Muxia to Fisterra)
- XG = Xunta Camino portal, "Get ready" pages: https://www.caminodesantiago.gal/en/get-ready (and /what-you-cannot-leave-at-home, /physical-and-mental-preparation/recommendations-for-keeping-fit-and-healthy)
- XMEM = Xunta de Galicia heritage report (in Galician), "Delimitacion do trazado e o ambito vinculado aos Caminos de Santiago de Fisterra, Portugues, Ruta da Prata e Camino Norte da Costa no Concello de Santiago de Compostela", separata, PDF dated January to April 2013, section 1.2 "O Camino de Fisterra": https://ficheiros-web.xunta.gal/patrimonio/memoria/01_CAM_COMPOSTELA_MEMORIA.pdf (translations in the book are the author's own)
- XBUS = Xunta news item (Galician) on a new Santiago to Fisterra bus line: https://www.xunta.gal/hemeroteca/-/nova/124122/xunta-activa-hoxe-unha-nova-lina-autobus-entre-santiago-fisterra-con-parada-demanda
- CF = Concello de Fisterra, "Portal Fin do Camino" (Galician): https://www.concellofisterra.gal/fin_camino/presentacion_fin_camino/gl , .../etapas/gl , .../ritos/gl , .../fisterrana/gl (the portal has a weather page "O tempo" and a tides page "Mareas")
- CM = Concello de Muxia (English): https://concellomuxia.com/en/item/santuario-da-virxe-da-barca/ ; https://concellomuxia.com/en/item/santiago-muxia/ ; https://concellomuxia.com/en/turismo/historia/
- TG = Turismo de Galicia: https://www.turismo.gal/que-facer/top-ten-dez-lugares-unicos/cabo-fisterra?langId=en_US (Cape Finisterre) and https://blog.turismo.gal/muxia-tradition-sculpted-in-the-heart-of-the-costa-da-morte/ (Muxia, 24 September 2019)
- SI = spain.info, "Spain's official tourism website": https://www.spain.info/en/camino-santiago/camino-santiago-fisterra-muxia/
- OP = Oficina del Peregrino (Pilgrim's Reception Office of the Cathedral of Santiago), oficinadelperegrino.com
- WP = Wikipedia (English unless stated)
- AG = one travel agency's route page (not named in the book): https://viajecaminodesantiago.com/en/finisterre-muxia-way/
- GP = Galicia Press, 19 October 2022: https://www.galiciapress.es/articulo/cultura/2022-10-19/3933236-campana-busca-erradicar-falso-ritual-quemar-botas-peregrinos-fisterra
- ED = El Debate, 10 June 2024: https://www.eldebate.com/espana/galicia/la-coruna/20240610/finisterre-llena-basura-empeno-peregrinos-depositar-recuerdos-camino_202714.html
- VC = Vive Camino (pilgrim news site, undated): https://vivecamino.com/en/burning-the-boots-at-the-end-of-the-camino-why-avoid-this-ritual-no-808/

## A. Route, distances and stages

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Route in the app catalog: Camino to Finisterre and Muxia, start Santiago de Compostela, end Finisterre, distance 90, stage_count empty; no stage files exist for this route, so the book has no "In the app: stage N" lines | ~90 km | supabase/migrations/20261106120000_more_caminos.sql (row camino-finisterre-muxia); tools/offline-maps has stage files only for Frances, Portugues and Ingles | yes (repo) |
| The route "originates in the city of Santiago" and its goals are Cape Fisterra and the Sanctuary of the Virxe da Barca in Muxia | as stated | XR | yes |
| Fisterra is 89 km from Santiago and Muxia 87 km (Xunta body text) | ~89 km; ~87 km | XR | yes |
| Whole route Fisterra to Muxia 118.8 km, Muxia to Fisterra 119.9 km; difficulty Medium in both directions | ~118.8 km; ~119.9 km | XR | yes |
| Pilgrims, after Santiago, walk "at least, four or five days more" (Xunta introduction); "this end of the world"; the route is "the most faithful realisation" of the cry Ultreia ("Let us go farther beyond!") answered by Et suseia ("And higher!") | as stated | XR | yes |
| Santiago to Negreira: 20.9 km, difficulty High, estimated 4 h 20 min; first section Santiago to Alto do Vento 8.9 km, Medium-High, 1 h 45 min | ~20.9 km; ~8.9 km; ~4 h 20 min | XS1 | yes |
| Negreira to Olveiroa: 34.3 km, Medium, estimated 7 h 45 min | ~34.3 km; ~7 h 45 min | XS2 | yes |
| Olveiroa to Corcubion: 20.7 km, Medium-High, estimated 4 h 25 min; the first section Olveiroa to Hospital is 5 km | ~20.7 km; ~4 h 25 min | XS3 | yes |
| Corcubion to Fisterra: 14.2 km, High, estimated 3 h; "a short 14 km stage, but with a high level of difficulty culminating in the ... lighthouse" | ~14.2 km; ~3 h | XS4 | yes |
| Fisterra to Muxia: 28.7 km, High, estimated 7 h 15 min; the first section Fisterra to Castrexe is 8.6 km, Medium | ~28.7 km; ~8.6 km; ~7 h 15 min | XS5 | yes |
| Olveiroa to Muxia direct: 32.7 km, High, estimated 8 h 15 min | ~32.7 km; ~8 h 15 min | XSM | yes |
| Muxia to Fisterra: 32 km, Medium-High, estimated 8 h 05 min | ~32 km | XSR | yes |
| The Xunta's four stages to the lighthouse add up to about 90 km: 20.9 + 34.3 + 20.7 + 14.2 = 90.1 | ~90 km | computed from XS1 to XS4 | computed (the Xunta's text says ~89 km to Fisterra; within a kilometre) |
| 20.9 + 34.3 + 20.7 + 14.2 + 28.7 = 118.8, which equals the Xunta's total for Fisterra then Muxia; 20.9 + 34.3 + 32.7 = 87.9 for Santiago to Muxia direct; 20.9 + 34.3 + 32.7 + 32 = 120, and the Xunta's own Muxia-first total is 119.9 (its stages are rounded) | ~118.8 km; ~87.9 km | computed from the stage rows above | computed |
| Olveiroa to Corcubion plus Corcubion to Fisterra: 20.7 + 14.2 = 34.9 | ~34.9 km | computed from XS3, XS4 | computed |
| Concello de Fisterra: three stages, Santiago to Negreira 22 km, Negreira to Olveiroa 33 km, Olveiroa to Fisterra 33 km | ~22 km; ~33 km; ~33 km | CF /etapas/gl | yes |
| The three Concello stages add up to 88 km | ~88 km | computed from CF | computed |
| Spain's official tourism website: 120 km, five stages ("five comfortable stages with no significant gradients"), Negreira 20 km, Olveiroa 34 km (longest stage, "gentle slopes"), Corcubion 20 km, Fisterra 14 km, Muxia 29 km | ~120 km; ~20; ~34; ~20; ~14; ~29 km | SI | yes |
| One travel agency's route page: 119.6 km in five stages: Santiago to Negreira 20.6 km, Negreira to A Picota 31 km, A Picota to Cee 21 km, Cee to Fisterra 16 km, Fisterra to Muxia 31 km; A Picota is "just over a kilometre off the route" | ~119.6 km; ~20.6; ~31; ~21; ~16; ~31 km; ~1 km | AG | yes (single commercial source, attributed in the text and not named) |
| Concello de Muxia: Santiago to Muxia 86.5 km, via Santiago, Negreira, Olveiroa, Muxia; difficulty Medium-High; duration "16 hours, more or less" | ~86.5 km; ~16 hours | CM /item/santiago-muxia/ | yes |
| High points named in the Xunta's text: Mount Aro 556 m (Negreira to Olveiroa); Cruceiro da Armada 247 m (Olveiroa to Corcubion); As Aferroas 289 m (Fisterra to Muxia) | ~556 m; ~247 m; ~289 m | XS2; XS3; XS5 | yes |
| The Camino Ingles from Ferrol is about 113 km | ~113 km | XUNTA English Way page https://www.caminodesantiago.gal/en/make-plans/the-ways/english-way (112.4 km; 112,5 km in the body text); caminoingles.gal gives 113 km | yes |
| The Camino Ingles has six stages in the app (book says "six days") | 6 | supabase/migrations/20261113010000_camino_ingles_stages.sql; books/camino-ingles-guide/facts.md | yes (repo) |
| ~~Wikipedia: Fisterra is 98 km from Santiago~~ not used: the measure is not stated and it disagrees with the Xunta | n/a | WP https://en.wikipedia.org/wiki/Fisterra | removed |
| ~~Commercial pages: Olveiroa to Cee 17.9 km, Cee to Finisterre 12.1 km~~ read only in a search summary, not on the page | n/a | n/a | removed |

## B. Places on the way

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Santiago: the route leaves the Praza do Obradoiro by the line of the vanished Porta do Peregrino or Porta da Trindade, down the Costa do Cristo and the Rua das Hortas, past the church of San Frutuoso; carballeira (oak grove) of San Lourenzo with centenarian oaks; verse of Rosalia de Castro from Follas novas (1880) | as stated; 1880 | XS1 | yes |
| A document of 1536 already names the Porta da Trindade to Rua das Hortas as the route to Fisterra | 1536 | XMEM p. 4 ("Ruta a Fisterra sinalada en documento de 1536") | yes |
| River Sarela with the ruins of tanneries; Santiago's leather industry thrived until the last thirty years of the 19th century | as stated | XS1 | yes |
| After Sarela de Abaixo a stony path with a strong final climb, "from which the towers of the Cathedral are seen for the last time" | as stated | XMEM section 2.1 ("O Camino de Fisterra") | yes |
| Villestro, Roxos, Alto do Vento (municipality of Ames); Augapesada with a medieval bridge with a semicircular arch; hard climb to Mar de Ovellas with views over the valley of A Maia | as stated | XS1 | yes |
| Ponte Maceira over the Tambre is "the most outstanding bridge of this Camino" | as stated | XS1 | yes |
| Ponte Maceira built at some point in the 15th century, with ferries at about the same spot before | 15th century | XMEM p. 5 ("construida nalgun momento do sec. XV e, antes, por barcas") | yes |
| Ponte Maceira village: old mill, dam, chapel of San Blas, Pazo de Baladron (19th century); "one of the most beautiful villages in Spain" | 19th century | SI | yes |
| Negreira: "the largest town with over 2,000 inhabitants" the pilgrim crosses before the coast; entrance with the pazo of A Chancela whose coat of arms shows the bridge destroyed (Codex Calixtinus, Book III) to stop the soldiers pursuing the disciples of Santiago; chapel of San Mauro; pazo do Coton; Hemingway refers to Negreira in For Whom the Bell Tolls | as stated | XS1; SI (Hemingway, San Mauro, Pazo do Coton) | yes |
| Negreira to Olveiroa: several stretches coincide with the old Camino Real to Fisterra (place names Camino Real, Portocamino); leaves Negreira over the River Barcala to Negreiroa, "the original population nucleus of Negreira"; O Cornado is the last town of Negreira municipality, then Mazaricos in the region of Xallas | as stated | XS2 | yes |
| Gorse, cornfields, pine and eucalyptus; hórreos such as those of As Maroñas; Romanesque church of Santa Marina | as stated | XS2 | yes |
| Mount Aro: views over Terra de Xallas, known for basketry and women's straw hats | as stated | XS2 | yes |
| Corzon viewpoint; Mollon; bridge over the River Xallas, the boundary of Mazaricos and Dumbria; A Ponte Olveira; Olveiroa | as stated | XS2 | yes |
| The old royal road's obligatory, repeatedly documented stops: Santiago, Augapesada, Ponte Maceira, As Maroñas, Bo Xesus, Ponte Olveira, Olveiroa, Hospital de Logoso, A Fonte Santa, hermitage of Nosa Señora das Neves, San Pedro Martir, Cee, Corcubion | as stated | XMEM p. 5 | yes |
| Travellers whose accounts the report lists: Erich Lassota (1580 to 1584), Domenico Laffi (1673) | 1580-84; 1673 | XMEM p. 5 | yes |
| Olveiroa to Corcubion: Xallas "boxed in by leafy vegetation"; River Hospital; O Logoso; the hamlet of Hospital, which had a modest pilgrims' hospital, now gone; a roundabout "which is the fork of the ways to Fisterra and Muxia" | as stated | XS3; XSM | yes |
| Sanctuary of Nosa Señora das Neves, Mount Ousado, hermitage of San Pedro Martir in the parish of A Pereiriña; Cruceiro da Armada (247 m) from where Cape Fisterra is seen for the first time, "although still far off" | ~247 m | XS3 | yes |
| Steep descent to Cee, "the first town of the region reached by the pilgrim"; Cee "the largest municipality on the Costa da Morte", notable commercial activity | as stated | XS3 | yes |
| Corcubion: old quarter declared a historical-artistic complex; church of San Marcos, Maritime Gothic, end of the 15th century; image of the patron made in northern Italy at the end of the 15th or beginning of the 16th century | 15th-16th century | XS3 | yes |
| Corcubion is "the most important town and port of that stretch of coast"; the royal road ran Santiago to Corcubion; from Corcubion to Fisterra, "an insignificant port", there seems to have been no royal road | as stated | XMEM p. 4 to 5 | yes |
| Corcubion to Fisterra: steep climb from the Campo do Rollo to the Campo de San Roque and the hamlet of O Vilar; A Amarela, Estorde; Sardiñeiro on stretches of the Camino Real; "one of the most beautiful shorelines in the Iberian Peninsula"; "a very rough sea which has left hundreds of stories and legends of shipwrecks"; Cala do Talon; Calcova; beach of A Lagosteira; Fisterra "like an island"; the path runs between dunes but many pilgrims choose the beach; entry by the district of San Roque, the cruceiro of Baixar, Rua Santa Catarina and Rua Real | as stated | XS4 | yes |
| The road up to the lighthouse passes the church of Santa Maria das Areas, where the Santo Cristo of Fisterra is kept; the lighthouse is "km0 of the Way of Saint James" | as stated | XS4; XSR | yes |
| Fisterra is an ancient port and fishing village; church of Santa Maria das Areas late 12th century | 12th century | WP https://en.wikipedia.org/wiki/Fisterra | yes |
| Fisterra to Muxia: exit of Fisterra can be confusing, yellow arrows point in opposite directions; Langosteira, Cruz de Baixar, San Martino de Duio, the church "possibly refers to the now disappeared Roman city of Dugium, mentioned in Book III of the Codex Calixtinus" | as stated | XS5 | yes |
| Beach of O Rostro among pine trees; narrow quiet roads; Padris; woods towards Lires, "the end of the stage"; ria of Lires with "important ornithological riches"; Romanesque churches of Frixe and Morquintian | as stated | XS5 | yes |
| After Lires the River Castro is crossed; Vaosilveiro, Frixe, Morquintian; asphalt and rural roads; the climb to As Aferroas (289 m) and Mount Facho de Lourido; beach of Lourido; Xurarantes; entry by Rua Campo das Pinas | ~289 m | XS5 | yes |
| Bridge over the River Castro inaugurated in 2011, "made this ford easier for pilgrims" | 2011 | XSR | yes |
| Facho de Lourido: "old vantage point where the locals lit bonfires to warn of dangers around these coasts" | as stated | XSR | yes |
| Olveiroa to Muxia direct: Dumbria ("the municipal capital"), Trasufre, Senande, San Martino de Ozon; asphalted and rural roadways alternate; Romanesque church of San Xulian de Moraime near the sea; ends at the sanctuary | as stated | XSM | yes |

## C. History and legend

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Finisterre derives from Latin finis terrae, "end of the earth"; in Roman times believed to be an end of the known world | as stated | WP https://en.wikipedia.org/wiki/Cape_Finisterre | yes |
| The idea of a pilgrimage towards the westernmost lands of Europe was already present in Celtic beliefs, tied to the sun's daily journey; the Camino to Fisterra is the only one whose goal is not Santiago but its origin | as stated | CF /presentacion_fin_camino/gl | yes |
| Decimus Junius Brutus believed this was the place where the sun died at dusk; legend of the Phoenician altar Ara Solis; pilgrims followed the route marked out overhead by the Milky Way | as stated | TG (Cape Finisterre page) | yes |
| Brutus's campaign 138 to 136 BC reached southern Gallaecia (rivers Limia, Douro, Minho; the Bracari); the article does not place him at the cape | 138-136 BC | WP https://en.wikipedia.org/wiki/Decimus_Junius_Brutus_Callaicus | yes |
| Origin of the pilgrimage to Finisterre "is not certain" | as stated | WP Cape Finisterre | yes |
| First unequivocal reference to Fisterra as a long-distance pilgrimage place: the bequest of a canon of Santiago, 1283, listing Rocamadour, Roncesvalles, Fisterra, Santa Maria de Eremita, San Paulo and San Lourenzo do Monte Gaudio | 1283 | XMEM p. 4 | yes |
| Oldest news of Muxia 1446: Sebastian Ilsung of Augsburg, "the greatest of the miracles that I have seen on this journey", the stone boat; the stone could be moved by many people and "I also saw it personally" | 1446 | XMEM p. 4 | yes |
| Most accounts show passive, curious and even offhand travellers; Laffi (1673): "we had the whim of reaching Santa Maria de Fisterra" | 1673 | XMEM p. 4 | yes |
| Plenary indulgences at Fisterra and Muxia were not a strong draw since pilgrims already had them from Santiago | not used in the book | XMEM p. 4 | yes (read; not used) |
| Dugium: according to old testimonies a pagan city (today Duio) where the remains of the apostle passed; the disciples asked leave of the queen, Lupa, who sent them to the governor of Dugium; he ordered an ambush; they discovered it and fled; Duio is cited in the Codex Calixtinus Book III in the 12th century | 12th century | CF /presentacion_fin_camino/gl | yes |
| Documents of 1119 about King Alfonso VII and the abbot of San Xian de Moraime and lodging for pilgrims; Jorge Grisaphan 1355; Leon de Rosmithal 1465; Sebaldo Rieter 1462; Erich Lassota 1581; Julian Iñiguez de Medrano 1583 | not used in the book except Lassota's decade | CF /presentacion_fin_camino/gl | yes (read; not used) |
| The Xunta's Santiago stage page speaks of the "disciples of Santiago" pursued by soldiers and the bridge destroyed (Codex Calixtinus, Book III) | as stated | XS1 | yes |
| Three medieval roads from Santiago to the Costa da Morte (Ons bridge; the Maroñas route to Cee and Corcubion, consolidated from the 13th century; the Barcala valley and Brandomil bridge to Camariñas and Muxia, used only occasionally) | not used in the book (cut for length) | XMEM p. 4 | yes (read; not used) |

## D. The cape and the coast

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Lighthouse built 1853, decision of 1843; octagonal granite tower 17 m; promontory about 120 m above the sea; fog siren built 1888 | 1853; 1843; ~17 m; ~120 m; 1888 | WP (Spanish) https://es.wikipedia.org/wiki/Faro_de_Finisterre | yes |
| Bronze sculpture of a pilgrim's boot at the cape (picture caption) | as stated | WP Cape Finisterre | yes |
| Cape Touriñán is 124 m farther west; Cabo da Roca in Portugal about 16.5 km farther west | ~124 m; ~16.5 km | WP Cape Finisterre | yes |
| Costa da Morte ("Coast of Death") named for its shipwrecks; the name first appeared in a newspaper article of 1904 (El Noroeste); HMS Serpent 1890, 173 of 176 crew dead; MV Prestige sinking 2002, one of the worst oil spills in history; local legend that the wind creates wild nightmares | 1904; 1890; 173 of 176; 2002 | WP https://en.wikipedia.org/wiki/Costa_da_Morte | yes |
| Prestige broke apart off Muxia on 13 November 2002 (footnote in Muxia article); "A Ferida" sculpture | Nov 2002 | WP https://en.wikipedia.org/wiki/Mux%C3%ADa | yes |
| The Concello's page on the old rites names two: the purifying bath at the beach of Langosteira "two kilometres before entering the village" and contemplating the sunset ("the death of the sun in the sea and the resurrection the next day, like the resurrection of the pilgrim in the day-to-day of walking") | ~2 km | CF /ritos/gl | yes |
| Turismo de Galicia: "it's not every day you get to see the sun go down at World's End" (paraphrased); Fisterra first stop the harbour, razor clams and local seafood | as stated | TG (Cape Finisterre page) | yes |
| Spain's official site calls Langosteira beach "a recommended place to take a dip if the weather permits" | as stated | SI | yes |
| The Concello's website has a weather page and a tides page | as stated | https://www.concellofisterra.gal/fin_camino/presentacion_fin_camino/gl (menu "Mareas", "O tempo") | yes |

## E. Muxia and the sanctuary

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Xunta's Muxia entry: the tourist office where the "Muxiana" can be obtained; the Camino da Pel ("Way of the Skin") named for a vanished fountain where pilgrims washed, "a symbol of purification and respect"; church of Santa Maria de Muxia, Maritime Gothic, second half of the 14th century; the sanctuary a Baroque church of the 18th century | 14th century; 18th century | XS5 | yes |
| Pilgrims and the sick washed at the fountain of A Pel before the shrine "in order to avoid being infected with leprosy" | as stated | CM /item/santuario-da-virxe-da-barca/ | yes |
| Legend: the Virgin arrived in a stone boat to encourage the apostle James; stones: Pedra de Abalar (swaying stone), Pedra dos Cadris (kidney stone), Pedra dos Namorados (lovers), Pedra do Temon (rudder/helm) | as stated | CM; TG (Muxia blog) | yes |
| Pedra de Abalar a granite mass of 70 tons, swings only intermittently because of a fracture; passing under the Pedra dos Cadris nine times for healing | ~70 tons; nine | TG (Muxia blog) | yes |
| Fire on Christmas Day 2013: altarpiece and roof burnt, exterior walls, pews, confessionals and side altars saved; rebuilt several times ("believed four times"), the last in 2015; more visitors since | 2013; 2015 | CM /item/santuario-da-virxe-da-barca/ | yes |
| The fire was caused by lightning | 25 December 2013 | WP https://en.wikipedia.org/wiki/Mux%C3%ADa | yes |
| A Barca pilgrimage in September, recognised as of National Tourist Interest | September | CM; TG | yes |
| "A Ferida" by the sculptor Alberto Bañuelos-Fournier, tribute to the volunteers of the Prestige | as stated | TG (Muxia blog) | yes |
| Mount Corpiño 68 m (sanctuary page) and 67 m (history page); stone path to the top; view of the town, the sunset, the ria and Cape Vilan | ~67 to ~68 m | CM /item/santuario-da-virxe-da-barca/ ; /turismo/historia/ | yes |
| The Concello: the arrival at the sanctuary is the expected reward for the effort of reaching the end of the Way | as stated | CM | yes |

## F. Certificates, the Pilgrim's Office, the credencial

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Fisterrana: official certification obtained at the municipal pilgrims' hostel of Fisterra and at the tourist office, certifying arrival at the "end of the world"; the route walked is shown by the Pilgrim's Credencial with stamps or signatures of parishes, hostels and representative places; groups of more than 10 must contact the tourist office or hostel beforehand | 10 | CF /fisterrana/gl | yes |
| The Muxiana: the Xunta says the tourist office in Muxia gives it, calls it "an end of Camino credential which Fisterra also provides called there the 'Fisterrana', which can be stamped in the municipal hostel"; spain.info: "the 'muxiana' (Muxia pilgrim's certificate)" at the town's tourist office | as stated | XS5; SI | yes |
| No page read says how many stamps the Fisterrana or Muxiana need, in what order, or whether the walk must begin in Santiago | n/a | CF /fisterrana/gl; XS5; SI | yes (absence) |
| The Pilgrim's Office pages read (the Compostela, the credencial, introduction, pilgrims, certificate of distance, after the pilgrimage, planning) contain no mention of Fisterra, Finisterre or Muxia (text searched on 2026-11-08) | n/a | https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ and the other pages under /en/pilgrimage/ and /en/preparation/planning/ | yes (absence) |
| The Compostela rule as the book states it (religious and/or spiritual reasons; routes of the Way on foot, bicycle or horseback; at least 100 continuous kilometres on the same route to Santiago recognised by the Office; the final stage must include at least the last one leading into the Cathedral; stamped credencial) | as stated | books/shared-facts.md; OP https://oficinadelperegrino.com/en/pilgrimage/the-compostela/ (re-read 2026-11-08) | yes |
| Credencial: stamps normally collected where pilgrims sleep, but also in parish churches, monasteries, cathedrals, hotels, town halls and other places; official card from confraternities of St James, authorised associations in Spain and worldwide | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/the-credencial/ | yes |
| The Office's statistics page is built by script and shows no text to a plain fetch | n/a | https://oficinadelperegrino.com/en/statistics-2/ | yes |
| Holy Year when 25 July falls on a Sunday; 25 July 2027 is a Sunday, so 2027 is a Holy Year | 2027 | WP https://en.wikipedia.org/wiki/Jacobean_Holy_Year ; weekday computed | yes (weekday computed) |
| 1,245 pilgrims arrived in Santiago in 1985; 272,703 qualified for the Compostela in the 2010 Holy Year; in times of great influx the Compostela cannot be guaranteed on the same day | 1,245; 272,703 | OP https://oficinadelperegrino.com/en/pilgrimage/introduction/ ; the-compostela page ("Notice") and footer | yes |
| The Office's page "After the pilgrimage": some pilgrims want to give back "perhaps as hosts at a hostel"; it suggests talking to a parish priest or joining a local association of St James | as stated | OP https://oficinadelperegrino.com/en/pilgrimage/after-the-pilgrimage/ | yes |
| ~~Commercial and forum claims about how many stamps a day the Fisterrana needs, where exactly the Muxiana is issued, and its fee~~ | n/a | forum and travel pages | removed |

## G. Climate and daylight

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| Santiago, AEMET normals 1991-2020 (provisional), as Wikipedia gives them: January high 12.3 C, low 5.4 C; April high 17.3 C, rain 130.0 mm; May high 19.8 C, rain 109.2 mm; June rain 44.3 mm; July high 24.8 C, low 14.4 C, rain 30.6 mm; August rain 45.2 mm; September high 23.2 C, rain 88.6 mm; October rain 214.0 mm; November 193.6 mm; December 184.4 mm; January 195.8 mm | ~12; ~5; ~17; ~130; ~20; ~109; ~44; ~25; ~14; ~31; ~45; ~23; ~89; ~214; ~194; ~184; ~196 | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela (climate table) | yes |
| AEMET publishes a forecast page for the municipality of Fisterra; MeteoGalicia ("Prediccion do tempo en Galicia") forecasts for Galicia | as stated | https://www.aemet.es/en/eltiempo/prediccion/municipios/fisterra-id15037 ; https://www.meteogalicia.gal/ | yes |
| The app's route guide suggests April to October for this route | April to October | mobile/src/data/routeGuide.ts (camino-finisterre-muxia, best) | yes (repo) |
| Sunrise and sunset at the cape (42.88 N, 9.27 W), local clock: 21 Dec 09:04 and 18:05, 9.0 h; 15 Nov sunset 18:15; 21 Mar sunset 19:49; 15 Apr sunset 21:18; 21 Jun 06:58 and 22:19, 15.3 h; 21 Sep sunset 20:39; 15 Oct sunset 19:56 (CEST until 25 October) | ~09:05; ~18:05; ~18:15; ~19:50; ~21:20; ~07:00; ~22:20; ~20:40; ~19:55; ~9 h; ~15 h | NOAA general solar equations, computed by the author (scratch script); the same method gives Santiago 21 Dec 09:01 to 18:03 and 21 Jun 06:55 to 22:16, in agreement with the pilot guide's ledger | computed (owner to confirm with a sun table) |

## H. Practical advice and general facts

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| A correctly packed rucksack should not exceed 10 kg and should have padded straps; basics: sleeping bag, footwear for rest periods, canteen, high-protection sunscreen, small first-aid kit, phone with charger, documents; a waterproof garment "regardless of the epoch of the year"; caps all year "for the sun and cold" | 10 kg | XG /what-you-cannot-leave-at-home ; /get-ready | yes |
| Footwear must be comfortable and broken in; seamless socks; dry the feet; wash and dry socks at hostels; do not begin with new footwear; take long walks in the weeks before and lengthen them; plan stages by capacity | as stated | XG /get-ready ; /recommendations-for-keeping-fit-and-healthy | yes |
| Carry documentation and credit cards, "it is advisable not to carry much cash" | as stated | XG /what-you-cannot-leave-at-home | yes |
| About two litres of water a day; "the 15 kilometre barrier must never be passed without drinking water" | ~2 litres; ~15 km | XG /recommendations-for-keeping-fit-and-healthy | yes |
| Santiago airport (Santiago-Rosalia de Castro): 12 km east of the city | ~12 km | WP https://en.wikipedia.org/wiki/Santiago_de_Compostela_Airport | yes |
| The Xunta's public transport site bus.gal lists the times of bus lines; its news item announces a line linking Santiago, Bertamirans, Noia, Muros, Cee and Fisterra (the item is undated in its text; its picture path suggests May 2021) | as stated | XBUS | yes (the book says "an older item") |
| No current bus timetable for Fisterra or Muxia was found in an official source | n/a | searches 2026-11-08 | yes (absence) |
| Galicia has two official languages, Galician and Spanish | as stated | WP https://en.wikipedia.org/wiki/Galicia_(Spain) | yes |
| Spanish name of Muxia is Mugia; Spanish name of Fisterra is Finisterre | as stated | WP Muxia; WP Fisterra | yes |
| Galician words: rua (street), praza (square), ponte (bridge), camino (path, way), horreo (slatted granary on stone staddles) | as stated | en.wiktionary.org entries rua, praza, ponte, camino, horreo (Galician) | yes |
| The Xunta portal has a "network of public hostels" and lists hotels, bed and breakfast, lodges, pilgrim hostels on its route and stage pages; the Concello de Fisterra refers to the municipal pilgrims' hostel | as stated | XR and stage pages (menus and filters); CF /fisterrana/gl | yes |
| Spain's official site names caldeiradas (fish and shellfish stews), empanadas, local beef, octopus a feira, the "Santiago sweet pie" (tarta de Santiago) | as stated | SI | yes |
| 112 is the European emergency number | 112 | .claude/skills/book-writer/reference/voice-and-honesty.md | yes (repo) |
| ~~"bos dias" as a greeting~~ removed (no source read) | n/a | n/a | removed |

## I. The custom of burning boots

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| The Concello's own "rites" page lists the bath and the sunset, and does not mention burning | as stated | CF /ritos/gl | yes |
| October 2022: the Ayuntamiento de Fisterra called the burning of boots a "false ritual" that makes the site look like a dump and "even is the cause of forest fires"; the campaign "Buen Camino, mejor final", presented on a Friday (21 October); a container at the zero kilometre for boots and belongings, to be managed "in a clean and sustainable way" | 2022 | GP | yes |
| June 2024: the local administration "eradicated" the burning in 2022; a new habit of leaving clothes and objects on the fence of the lighthouse; notices in the hostels, appeals to civic sense, the local authorities fine those caught "in fraganti"; measures judged insufficient; strong wind carries many objects into the sea | 2022; 2024 | ED | yes |
| Fires from bonfires "in recent years"; burning some items releases toxic elements; the council and a footwear association placed a container | as stated | VC | yes (single pilgrim news site, attributed) |
| The text of the local rule, its number and its fines were not found | n/a | searches 2026-11-08 | yes (absence; the book says so) |
| ~~Italian pilgrims arrested for a fire at the cape~~ (a search summary, no date, not read on the page) | n/a | n/a | removed |
| ~~Origin of the custom (Cruz dos Farrapos in Santiago, per forum posts)~~ | n/a | forums | removed |

## J. Brand and repository statements

| Fact in the book | Value | Source (name + URL) | Checked |
|---|---|---|---|
| CaminoPlus: the offline-first companion app for the Camino, with maps that work without signal, stays and cafes, a pilgrim passport with stamps, a journal and friends; the app is in development; the paid plan is Pilgrim Plus | as stated | README.md | yes (repo) |
| The catalog gives no stage count for this route | n/a | supabase/migrations/20261106120000_more_caminos.sql | yes (repo) |

## K. Advice, not facts

A windproof layer and a warm layer for the cape; a head torch; a bag for your boots; arrive at the cape with at least an hour of light; stay on paths and behind fences; do not step on wet rock; swim only where it is clearly safe, never alone, never at dusk; check the tide before using the beach; face traffic on roads; never walk on a road in the dark; do not light fires and obey fire warnings; tell someone where you will sleep; a practice walk of about 20 km with a loaded pack and two long days in a row; carry a little cash; ask where to collect the certificates and how many stamps they want; check bus times before leaving Santiago and the evening before; do not plan a flight for the afternoon of the last walking day; earplugs, head torch and etiquette in a dormitory; bedbug precautions; see a doctor or pharmacist for anything that worries you; write down what you leave behind instead of burning it. Marked `advice`.

## Not verified and left out

- Any coastal climate figure (rainfall, wind speed, fog days) for Fisterra or Muxia: no official table was found; the book gives Santiago's figures, says so, and sends the reader to AEMET, MeteoGalicia and the Concello's pages.
- The number of pilgrims who walk to Fisterra or Muxia, or any share of those who reach Santiago: the Office's statistics page could not be read, and a figure of "10 to 15 percent" on a commercial page was not used.
- The legal basis, text and penalties of any rule against burning at the cape; the book says what the town and two newspapers say, and no more.
- Where the Fisterrana and the Muxiana are issued beyond what the Concello de Fisterra, the Xunta and Spain's official site say; their hours, fees and the number of stamps required.
- Whether the Pilgrim's Office records or certifies this walk in any way: its pages say nothing, and the book tells the reader to ask.
- Any bus, taxi or transfer timetable for Fisterra or Muxia.
- Any hostel name, bed count, price, opening hour, phone number or coordinate: left out by the rules.
- The sub-section lengths of the Xunta's second stage (they are filled by script on the Xunta page and were not readable) and the heights of the cape beyond the lighthouse figure.
- The Xunta's own Fisterra route page gives "Fisterra is 89 kilometres away and Muxia 87" while its stages add up to ~90 km and ~87.9 km; the book says the sources differ by a kilometre or two.
