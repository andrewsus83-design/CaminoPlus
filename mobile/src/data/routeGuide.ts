// Hand-written overview per Camino for the route picker. General knowledge, not live data:
// distances and stage counts come from the database. Check named places against local sources before launch.
export type RouteGuide = {
  summary: string;
  areas: { name: string; note: string }[];
  see: string[];
  best: string;
  terrain: string;
  tip: string;
};

export const ROUTE_GUIDE: Record<string, RouteGuide> = {
  'camino-frances': {
    summary: 'The classic. From the Pyrenees across the whole of northern Spain on the best-served pilgrim route, with an albergue in nearly every village.',
    areas: [
      { name: 'Pyrenees and Navarra', note: 'Climb over the Pyrenees from Saint-Jean, then Roncesvalles, Pamplona and the Alto del Perdon.' },
      { name: 'La Rioja', note: 'Vineyards and red earth around Logrono, Najera and Santo Domingo de la Calzada.' },
      { name: 'Meseta (Burgos to Leon)', note: 'Long, open wheat plains with big skies. Burgos cathedral, Castrojeriz, Fromista, Sahagun.' },
      { name: 'Leon and Bierzo', note: 'Leon cathedral, Astorga, the iron cross at Cruz de Ferro, then green Ponferrada.' },
      { name: 'Galicia', note: 'Climb to O Cebreiro, then forest paths, stone hamlets and Sarria, the last 100 km to Santiago.' },
    ],
    see: ['Roncesvalles abbey', 'Pamplona old town', 'Burgos and Leon cathedrals', 'Cruz de Ferro', 'O Cebreiro', 'Santiago cathedral'],
    best: 'April to June and September to October',
    terrain: 'Mixed. Steep first day, flat but exposed Meseta, hills again in Galicia.',
    tip: 'Busiest from Sarria. Book beds ahead in May, June and September.',
  },
  'camino-portugues-central': {
    summary: 'The Portuguese Way inland from Porto through Barcelos and Ponte de Lima. Gentle, friendly and very popular as the second most walked Camino.',
    areas: [
      { name: 'Porto to Ponte de Lima', note: 'Urban start, then farmland and vine arbours. Barcelos is known for its rooster legend.' },
      { name: 'Valenca and Tui', note: 'Cross the Minho river on the Eiffel-style bridge into Spain.' },
      { name: 'Galicia', note: 'Pontevedra old town, Caldas de Reis hot springs, Padron where Saint James is said to have landed.' },
    ],
    see: ['Porto Ribeira', 'Ponte de Lima Roman bridge', 'Tui fortress cathedral', 'Pontevedra old town', 'Padron'],
    best: 'May to October',
    terrain: 'Mostly easy. Some cobbles and road walking near towns.',
    tip: 'Short enough for about 10 to 12 days.',
  },
  'camino-portugues-costero': {
    summary: 'The Portuguese Coastal Way hugs the Atlantic on boardwalks and beaches before turning inland to Spain.',
    areas: [
      { name: 'Porto to Caminha', note: 'Dunes, fishing villages and long boardwalks such as Vila do Conde and Esposende.' },
      { name: 'A Guarda and Vigo coast', note: 'Cross the Minho by ferry, then Baiona and the Vigo estuary.' },
      { name: 'Variante Espiritual', note: 'Optional sea-and-river route ending at Padron, with a boat leg in Galicia.' },
    ],
    see: ['Atlantic boardwalks', 'Caminha ferry', 'Baiona', 'Vigo estuary'],
    best: 'May to September',
    terrain: 'Flat, sandy and wooden boardwalks. Wind and sun are the main challenge.',
    tip: 'Fewer albergues than the Central way, so plan stops.',
  },
  'camino-del-norte': {
    summary: 'The longest coastal route along the Basque and Cantabrian seas. Spectacular but hilly, with mountains and cliffs all the way.',
    areas: [
      { name: 'Basque Country', note: 'Irun, San Sebastian, Zarautz and Guernica, steep up-and-downs above the sea.' },
      { name: 'Cantabria and Asturias', note: 'Bilbao, Santander, Santillana del Mar and green hillsides of Asturias.' },
      { name: 'Galicia', note: 'Ribadeo, Mondonedo and a gentler finish towards Arzua where it joins the Frances.' },
    ],
    see: ['San Sebastian bay', 'Guggenheim Bilbao', 'Santillana del Mar', 'Asturian coast'],
    best: 'June to September',
    terrain: 'Demanding. Many climbs and descents; weather can be wet.',
    tip: 'Fewer pilgrims, so albergues are more spread out. Carry rain gear.',
  },
  'camino-primitivo': {
    summary: 'The original route walked by King Alfonso II in the 9th century. Short, wild and mountainous, joining the Frances at Melide.',
    areas: [
      { name: 'Oviedo to Grandas de Salime', note: 'Cathedral start, then Asturian mountains and the reservoir of Salime.' },
      { name: 'Hospitales route', note: 'High ridge variant above Fonsagrada with sweeping views.' },
      { name: 'Lugo and Melide', note: 'Walled Roman Lugo, then join the Frances for the last stretch.' },
    ],
    see: ['Oviedo cathedral', 'Salime reservoir', 'Lugo Roman walls', 'Hospitales ridge'],
    best: 'June to September',
    terrain: 'Strenuous. Fewer services, steep climbs.',
    tip: 'Often walked in about 12 days. Start with lighter days.',
  },
  'camino-ingles': {
    summary: 'The English Way from Ferrol (or A Coruna) is the shortest route that still earns a Compostela. Ideal for a first or short Camino.',
    areas: [
      { name: 'Ferrol and Neda', note: 'Start by the ria, then pass through Pontedeume with its medieval castle.' },
      { name: 'Betanzos and Hospital de Bruma', note: 'A historic town, then quiet Galician countryside.' },
      { name: 'Sigueiro', note: 'Final stretch into Santiago from the north.' },
    ],
    see: ['Pontedeume', 'Betanzos old town', 'Santiago arrival'],
    best: 'April to October',
    terrain: 'Moderate, with some road sections.',
    tip: 'About 5 to 6 days. Book ahead, as albergues are few.',
  },
  'via-de-la-plata': {
    summary: 'The long southern route from Sevilla north along old Roman roads, through Extremadura and Castile. Hot, quiet and very historic.',
    areas: [
      { name: 'Andalucia and Extremadura', note: 'Dehesa oak land, Merida Roman theatre and Caceres old town.' },
      { name: 'Salamanca and Zamora', note: 'University city and Romanesque churches of Castile.' },
      { name: 'Galicia', note: 'Ourense and thermal springs, then the final climb to Santiago.' },
    ],
    see: ['Merida Roman ruins', 'Caceres', 'Salamanca', 'Ourense hot springs'],
    best: 'March to May and September to October',
    terrain: 'Long, remote stages with little shade. Heat is the main risk.',
    tip: 'Carry extra water. Some stages exceed 30 km.',
  },
  'camino-finisterre-muxia': {
    summary: 'Walk on from Santiago to the sea. Finisterre was long thought to be the end of the world.',
    areas: [
      { name: 'Santiago to Negreira and Olveiroa', note: 'Galician hills, hórreos and small villages.' },
      { name: 'Fisterra', note: 'Lighthouse at the cape and the zero kilometre marker.' },
      { name: 'Muxia', note: 'Coastal sanctuary of the Virgen de la Barca.' },
    ],
    see: ['Fisterra lighthouse', 'Zero km stone', 'Muxia sanctuary', 'Sunset on the Atlantic'],
    best: 'April to October',
    terrain: 'Moderate, with a few climbs.',
    tip: 'Pilgrims often burn or leave an old item at the cape. Check the local rules.',
  },
  'camino-aragones': {
    summary: 'From the French border at Somport over the Pyrenees to Puente la Reina where it joins the Frances.',
    areas: [
      { name: 'Somport and Jaca', note: 'High Pyrenees pass, then the fortress city of Jaca.' },
      { name: 'Santa Cruz de la Seros', note: 'Romanesque monasteries in Aragon.' },
      { name: 'Sangüesa', note: 'Navarra towns before meeting the Frances.' },
    ],
    see: ['Somport pass', 'Jaca citadel', 'San Juan de la Pena monastery (short detour)'],
    best: 'May to September',
    terrain: 'Mountain start, then rolling hills.',
    tip: 'Quiet route. Services are sparse in places.',
  },
  'camino-de-invierno': {
    summary: 'The Winter Way from Ponferrada avoids the high Galician passes and follows the Sil river through wine country.',
    areas: [
      { name: 'Bierzo and Valdeorras', note: 'Wine villages and Roman gold mines of Las Medulas nearby.' },
      { name: 'Ribeira Sacra', note: 'Terraced vineyards over the Sil canyons.' },
      { name: 'Lalin and Santiago', note: 'Rural Galicia on the way to the cathedral.' },
    ],
    see: ['Las Medulas', 'Ribeira Sacra canyons', 'Monforte de Lemos'],
    best: 'April to October',
    terrain: 'Moderate to demanding in places.',
    tip: 'Few pilgrims. Plan accommodation ahead.',
  },
  'camino-del-salvador': {
    summary: 'A short mountain link from Leon to Oviedo over the Cantabrian range, often combined with the Primitivo.',
    areas: [
      { name: 'Leon to Pajares', note: 'Gradual climb into the mountains.' },
      { name: 'Pajares pass', note: 'High point on the border of Leon and Asturias.' },
      { name: 'Descent to Oviedo', note: 'Green Asturian valleys.' },
    ],
    see: ['Leon cathedral', 'Mountain views', 'Oviedo cathedral'],
    best: 'June to September',
    terrain: 'Mountainous with steep descents.',
    tip: 'Oviedo has the Holy Chamber with relics; check opening times.',
  },
  'camino-sanabres': {
    summary: 'A quiet route that continues from Via de la Plata at Granja de Moreruela through Sanabria lake country to Ourense.',
    areas: [
      { name: 'Zamora province', note: 'Plains and Romanesque churches.' },
      { name: 'Sanabria', note: 'Glacial lake and mountain villages.' },
      { name: 'Ourense and Galicia', note: 'Hot springs and the final stages.' },
    ],
    see: ['Sanabria lake', 'Ourense thermal baths', 'Romanesque churches'],
    best: 'April to June and September',
    terrain: 'Moderate, mostly quiet paths.',
    tip: 'Services are thin; confirm lodging.',
  },
  'camino-de-madrid': {
    summary: 'From Madrid north over the Sierra de Guadarrama to Sahagun, where it joins the Frances.',
    areas: [
      { name: 'Madrid and Sierra', note: 'City start, then Navacerrada pass into Segovia province.' },
      { name: 'Segovia', note: 'Roman aqueduct and Alcazar.' },
      { name: 'Castilla plains', note: 'Flat stages to Sahagun.' },
    ],
    see: ['Segovia aqueduct', 'Sierra de Guadarrama', 'Sahagun'],
    best: 'April to June and September to October',
    terrain: 'Mountain crossing early, then flat and open.',
    tip: 'Lodging is sparse; check municipal albergues.',
  },
  'camino-baztanes': {
    summary: 'From Bayonne through the green Baztan valley in Navarra, joining the Frances at Pamplona.',
    areas: [
      { name: 'Basque Country (France)', note: 'Rolling hills and Pyrenean foothills.' },
      { name: 'Baztan valley', note: 'Whitewashed villages, rivers and beech forests.' },
      { name: 'Pamplona', note: 'Old town and San Fermin streets.' },
    ],
    see: ['Baztan valley', 'Pamplona old town'],
    best: 'May to September',
    terrain: 'Hilly with forest paths. Rain is common.',
    tip: 'Small route, plan stops.',
  },
  'camino-portugues-lisboa': {
    summary: 'The long Portuguese Way from Lisbon along the Tagus to Porto, then on to Santiago.',
    areas: [
      { name: 'Lisbon to Tomar', note: 'Tagus river towns and the Knights Templar convent in Tomar.' },
      { name: 'Coimbra', note: 'Historic university city.' },
      { name: 'Porto to Santiago', note: 'Follows the Central route to Galicia.' },
    ],
    see: ['Tomar Convent of Christ', 'Coimbra university', 'Fatima (nearby)', 'Porto'],
    best: 'March to June and September to October',
    terrain: 'Mostly flat; some road sections.',
    tip: 'Add about two weeks to the Porto start.',
  },
};

export const guideFor = (slug: string | null | undefined): RouteGuide | null => (slug ? ROUTE_GUIDE[slug] ?? null : null);
