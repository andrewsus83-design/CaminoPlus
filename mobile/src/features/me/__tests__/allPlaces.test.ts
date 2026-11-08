// Plain-node checks of the "All" view of Me: the points of a route (the stamps), which posts belong to which point, the numbers and words, the way a tap moves
// between the views (all the posts > All > a place > back), and where the row of destinations opens. Run: npm run test:me (it is run from highlights.test.ts).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assignPosts, buildHighlights, rowStartOffset, type DayLike, type PostLike } from '../highlights';
import { ALL_PLACES, POSTS_VIEW, resolveJourney, stepBack, tapAll, tapDestination, tapPlace, type JourneyView } from '../journeyView';
import { allHint, allLabel, buildRoutePlaces, emptyPlaceLine, placesLine, routePoints, stageEnds, stampLabel, visitedCount, type StageLike } from '../routePoints';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

const post = (id: string, place: string | null, at: string | null = null): PostLike => ({ id, place_name: place, published_at: at });
const names = (list: { name: string }[]) => list.map((p) => p.name);

// The 33 stages of the Camino Francés as the database has them (supabase/migrations/20261112000000_camino_frances_stages.sql): stages 1 to 3 with their
// linked places (the seed), stages 4 to 33 with a name and no places yet.
const FRANCES = [
  'Saint-Jean-Pied-de-Port to Roncesvalles', 'Roncesvalles to Zubiri', 'Zubiri to Pamplona', 'Pamplona to Puente la Reina', 'Puente la Reina to Estella', 'Estella to Los Arcos',
  'Los Arcos to Logroño', 'Logroño to Nájera', 'Nájera to Santo Domingo de la Calzada', 'Santo Domingo de la Calzada to Belorado', 'Belorado to San Juan de Ortega',
  'San Juan de Ortega to Burgos', 'Burgos to Hornillos del Camino', 'Hornillos del Camino to Castrojeriz', 'Castrojeriz to Frómista', 'Frómista to Carrión de los Condes',
  'Carrión de los Condes to Terradillos de los Templarios', 'Terradillos de los Templarios to Bercianos del Real Camino', 'Bercianos del Real Camino to Mansilla de las Mulas',
  'Mansilla de las Mulas to León', 'León to Villadangos del Páramo', 'Villadangos del Páramo to Astorga', 'Astorga to Foncebadón', 'Foncebadón to Ponferrada',
  'Ponferrada to Villafranca del Bierzo', 'Villafranca del Bierzo to O Cebreiro', 'O Cebreiro to Triacastela', 'Triacastela to Sarria', 'Sarria to Portomarín',
  'Portomarín to Palas de Rei', 'Palas de Rei to Arzúa', 'Arzúa to O Pedrouzo', 'O Pedrouzo to Santiago de Compostela',
];
const stage = (i: number, linked = i <= 3): StageLike => {
  const [from, to] = FRANCES[i - 1].split(' to ');
  return { stage_number: i, name: FRANCES[i - 1], start: linked ? { name: from } : null, end: linked ? { name: to } : null };
};
const ROUTE: StageLike[] = FRANCES.map((_, i) => stage(i + 1));

check('an empty route has no points, no line and no stamps; stages with no name for their towns give none either', () => {
  assert.deepEqual(routePoints([]), []);
  assert.deepEqual(buildRoutePlaces([], [post('a', 'Burgos')]), [], 'a post cannot make a point: the points are the route\'s');
  assert.equal(placesLine(0, 0), '');
  assert.deepEqual(routePoints([{ name: 'Stage 4' }, { name: '' }, { name: '   ' }]), [], 'no " to " in the name and no linked place: nothing is made up');
  assert.deepEqual(routePoints([{ name: 'Porto', start: null, end: null }]), []);
  assert.equal(visitedCount([]), 0);
});

check('the Camino Francés has 33 stages and 34 points: where the first stage starts and where each one ends, in walking order, Santiago last', () => {
  assert.equal(ROUTE.length, 33);
  const points = routePoints(ROUTE);
  assert.equal(points.length, 34);
  assert.equal(points[0].name, 'Saint-Jean-Pied-de-Port');
  assert.deepEqual(names(points).slice(0, 5), ['Saint-Jean-Pied-de-Port', 'Roncesvalles', 'Zubiri', 'Pamplona', 'Puente la Reina']);
  assert.equal(points[33].name, 'Santiago de Compostela');
  assert.deepEqual(names(points), FRANCES.flatMap((s, i) => (i === 0 ? s.split(' to ') : [s.split(' to ')[1]])), 'the first start, then every end, nothing else and in that order');
  assert.equal(new Set(points.map((p) => p.key)).size, 34, 'keys are unique');
  assert.equal(points[2].key, 'zubiri');
  assert.equal(points[4].key, 'puente la reina');
});

check('the stages the app really holds today: three stages with linked places give 4 points, and a name alone is enough for the others', () => {
  assert.deepEqual(names(routePoints(ROUTE.slice(0, 3))), ['Saint-Jean-Pied-de-Port', 'Roncesvalles', 'Zubiri', 'Pamplona']);
  const unlinked = FRANCES.map((_, i) => stage(i + 1, false));
  assert.deepEqual(names(routePoints(unlinked)), names(routePoints(ROUTE)), 'the stage name gives the same towns as the linked places');
  assert.deepEqual(stageEnds({ name: 'Pamplona to Puente la Reina' }), { from: 'Pamplona', to: 'Puente la Reina' });
  assert.deepEqual(stageEnds({ name: 'Pamplona to Puente la Reina', start: { name: 'Iruña' }, end: null }), { from: 'Iruña', to: 'Puente la Reina' }, 'a linked place wins over the name, half by half');
  assert.deepEqual(stageEnds({ name: 'Stage 9' }), { from: null, to: null });
  assert.deepEqual(stageEnds({ name: 'Burgos TO León' }), { from: 'Burgos', to: 'León' }, 'any case of "to"');
  assert.deepEqual(stageEnds({ name: 'Porto' }), { from: null, to: null }, '"to" inside a word is not " to "');
});

check('the points follow the stage numbers, not the order the stages came in; a town that two stages share, or write alike, is one point at its first place', () => {
  const shuffled = [ROUTE[4], ROUTE[0], ROUTE[2], ROUTE[1], ROUTE[3]];
  assert.deepEqual(names(routePoints(shuffled)), names(routePoints(ROUTE.slice(0, 5))));
  const twice = routePoints([
    { stage_number: 1, name: 'Burgos to Hornillos del Camino' },
    { stage_number: 2, name: 'Hornillos del Camino to Castrojeriz' },
    { stage_number: 3, name: 'Castrojeriz to Hornillos del Camino' }, // back: not a second Hornillos
    { stage_number: 4, name: 'Hornillos del Camino to CASTROJERIZ' },
  ]);
  assert.deepEqual(names(twice), ['Burgos', 'Hornillos del Camino', 'Castrojeriz']);
  assert.deepEqual(names(routePoints([{ stage_number: 1, name: 'A to Nájera' }, { stage_number: 2, name: 'Nájera to najera' }])), ['A', 'Nájera'], 'accents and case');
  assert.deepEqual(names(routePoints([{ name: 'Leon to Astorga' }, { name: 'Astorga to Ponferrada' }])), ['Leon', 'Astorga', 'Ponferrada'], 'no numbers: the order given');
});

check('a point with a post is visited, the others are dashed, and the line says how many of how many: "5 of 33 places"', () => {
  const posts = [post('p1', 'Zubiri'), post('p2', 'Pamplona'), post('p3', 'Burgos'), post('p4', 'León'), post('p5', 'Santiago de Compostela'), post('p6', 'Zubiri')];
  const places = buildRoutePlaces(ROUTE, posts);
  assert.equal(places.length, 34);
  assert.equal(visitedCount(places), 5);
  assert.deepEqual(places.filter((p) => p.posts.length > 0).map((p) => [p.name, p.posts.length]), [['Zubiri', 2], ['Pamplona', 1], ['Burgos', 1], ['León', 1], ['Santiago de Compostela', 1]]);
  assert.equal(placesLine(visitedCount(places), places.length), '5 of 34 places');
  assert.equal(placesLine(0, 33), '0 of 33 places');
  assert.equal(placesLine(33, 33), '33 of 33 places');
  assert.equal(placesLine(1, 1), '1 of 1 place', 'one point is not "places"');
  assert.ok(buildRoutePlaces(ROUTE, []).every((p) => p.posts.length === 0), 'no posts at all (the sample journey): every stamp is a dashed slot');
  assert.equal(visitedCount(buildRoutePlaces(ROUTE, [post('x', null), post('y', 'Somewhere else')])), 0, 'no place, or a place the route does not have: no stamp');
});

check('a post belongs to ONE point, the one it matches best, and on a tie to the earlier point: never under two names', () => {
  const stages = [{ stage_number: 1, name: 'Villafranca Montes de Oca to Burgos' }, { stage_number: 2, name: 'Burgos to Villafranca del Bierzo' }];
  const places = buildRoutePlaces(stages, [
    post('v', 'Villafranca'),            // contained by both Villafranca names, as whole words: the earlier point
    post('h', 'Burgos, Spain'),          // same first part as Burgos (2), and contained by nothing else
    post('b', 'Burgos'),                 // the same words (3)
    post('c', 'Burgos Cathedral'),       // contains Burgos (1)
  ]);
  const at = (name: string) => places.find((p) => p.name === name)!.posts.map((p) => p.id).sort();
  assert.deepEqual(at('Villafranca Montes de Oca'), ['v']);
  assert.deepEqual(at('Villafranca del Bierzo'), []);
  assert.deepEqual(at('Burgos'), ['b', 'c', 'h']);
  const shown = places.flatMap((p) => p.posts.map((x) => x.id));
  assert.equal(new Set(shown).size, shown.length, 'no post under two names');
  // best, not first: "Hontanas, Burgos" is Hontanas when both are points, although Burgos comes first
  const both = buildRoutePlaces([{ stage_number: 1, name: 'Burgos to Hontanas' }], [post('x', 'Hontanas, Burgos')]);
  assert.deepEqual(both.map((p) => p.posts.length), [0, 1]);
  // the one rule of the row of destinations: the same function, so the two never disagree
  assert.deepEqual(assignPosts(['Burgos', 'Hontanas'], [post('x', 'Hontanas, Burgos')]).map((l) => l.length), [0, 1]);
});

check('accents and case never matter, and the newest post is first', () => {
  const places = buildRoutePlaces(ROUTE, [post('a', 'najera', '2026-11-01T10:00:00Z'), post('b', 'NÁJERA', '2026-11-03T10:00:00Z'), post('c', ' Nájera ', '2026-11-02T10:00:00Z'), post('d', 'logrono'), post('e', 'LOGROÑO, La Rioja')]);
  assert.deepEqual(places.find((p) => p.name === 'Nájera')!.posts.map((p) => p.id), ['b', 'c', 'a']);
  assert.deepEqual(places.find((p) => p.name === 'Logroño')!.posts.map((p) => p.id).sort(), ['d', 'e']);
});

check('a plan with no destinations still has the stamps: the points come from the route, the highlights from the plan', () => {
  const noPlan: DayLike[] = [{ id: 'd1', to_name: null, stage: null }, { id: 'd2', to_name: null, stage: { name: 'Stage 2' } }];
  const posts = [post('a', 'Zubiri')];
  assert.deepEqual(buildHighlights(noPlan, posts), [], 'the row of destinations has nothing');
  assert.equal(visitedCount(buildRoutePlaces(ROUTE, posts)), 1, 'the stamps do');
  // a pilgrim who starts at stage 8 has a short plan, and the stamps are still the whole route
  const late: DayLike[] = [{ id: 'd1', to_name: 'Nájera' }, { id: 'd2', to_name: 'Santo Domingo de la Calzada' }];
  assert.equal(buildHighlights(late, posts).length, 2);
  assert.equal(buildRoutePlaces(ROUTE, posts).length, 34);
  assert.equal(buildHighlights(late, posts).every((h) => h.state === 'ahead'), true, 'a post before the plan starts is in no highlight ...');
  assert.equal(visitedCount(buildRoutePlaces(ROUTE, posts)), 1, '... and is a stamp');
});

check('what a screen reader says: the All item gives the counts, a stamp its place and its journeys', () => {
  assert.equal(allLabel(5, 33), 'All places, 5 of 33 with journeys');
  assert.equal(allLabel(0, 34), 'All places, 0 of 34 with journeys');
  assert.match(allHint(false), /Shows every place/);
  assert.match(allHint(true), /go back to your journey posts/);
  assert.equal(stampLabel({ name: 'Zubiri', posts: [1, 2, 3] }), 'Zubiri, 3 journeys');
  assert.equal(stampLabel({ name: 'Zubiri', posts: [1] }), 'Zubiri, 1 journey');
  assert.equal(stampLabel({ name: 'Zubiri', posts: [] }), 'Zubiri, no journeys yet');
  assert.equal(emptyPlaceLine('Zubiri'), 'No journeys at Zubiri yet');
});

/* ---------------------------------------------------------------- the way a tap moves between the views */

const day = (id: string, to: string): DayLike => ({ id, to_name: to, stage: null, status: 'planned' });
const HIGHLIGHTS = buildHighlights([day('d1', 'Zubiri'), day('d2', 'Pamplona'), day('d3', 'Estella')], [post('p1', 'Zubiri'), post('p2', 'Zubiri'), post('p3', 'Estella')]);
const PLACES = buildRoutePlaces(ROUTE, [post('p1', 'Zubiri'), post('p2', 'Zubiri'), post('p3', 'Estella'), post('p4', 'Burgos')]);

check('the path: all posts > All > a place > back to All > All again closes it', () => {
  let v: JourneyView = POSTS_VIEW;
  v = tapAll(v, true);
  assert.deepEqual(v, ALL_PLACES, 'a tap on All opens the stamps');
  assert.equal(resolveJourney(v, HIGHLIGHTS, PLACES).kind, 'stamps');
  v = tapPlace('zubiri');
  const place = resolveJourney(v, HIGHLIGHTS, PLACES);
  assert.equal(place.kind, 'place');
  v = stepBack(v);
  assert.deepEqual(v, ALL_PLACES, 'the bar of a place goes back to the stamps, not to all the posts');
  assert.equal(resolveJourney(v, HIGHLIGHTS, PLACES).kind, 'stamps');
  v = tapAll(v, true);
  assert.deepEqual(v, POSTS_VIEW, 'All is the switch of its view: a second tap closes it');
  assert.equal(resolveJourney(v, HIGHLIGHTS, PLACES).kind, 'grid');
  // from a place, All closes the whole view, not one step
  assert.deepEqual(tapAll(tapPlace('zubiri'), true), POSTS_VIEW);
});

check('from Plan, Health or Notes a tap on All always opens the stamps, even when they were open already', () => {
  assert.deepEqual(tapAll(POSTS_VIEW, false), ALL_PLACES);
  assert.deepEqual(tapAll(ALL_PLACES, false), ALL_PLACES, 'it must not close the view of a sub-tab it is not showing');
  assert.deepEqual(tapAll(tapPlace('zubiri'), false), ALL_PLACES);
  assert.deepEqual(tapAll({ view: 'posts', destination: 'd1' }, false), ALL_PLACES);
});

check('a destination of the row filters the grid as before: the same one again clears it, another one replaces it, and it leaves the stamps; the bar goes back to all posts', () => {
  let v: JourneyView = tapDestination(POSTS_VIEW, 'd1', true);
  assert.deepEqual(v, { view: 'posts', destination: 'd1' });
  const shown = resolveJourney(v, HIGHLIGHTS, PLACES);
  assert.equal(shown.kind, 'destination');
  assert.deepEqual([...(shown.kind === 'destination' ? shown.ids : [])].sort(), ['p1', 'p2']);
  assert.deepEqual(tapDestination(v, 'd1', true), POSTS_VIEW, 'the same destination again clears it');
  assert.deepEqual(tapDestination(v, 'd3', true), { view: 'posts', destination: 'd3' }, 'another one replaces it');
  assert.deepEqual(tapDestination(ALL_PLACES, 'd1', true), { view: 'posts', destination: 'd1' }, 'from the stamps it shows that destination');
  assert.deepEqual(tapDestination(tapPlace('zubiri'), 'd1', true), { view: 'posts', destination: 'd1' });
  assert.deepEqual(tapDestination(v, 'd1', false), { view: 'posts', destination: 'd1' }, 'from another sub-tab it shows the destination even when it was the picked one');
  assert.deepEqual(stepBack(v), POSTS_VIEW);
});

check('a place shows exactly its posts; a place with none is empty (the line and the card that writes a post); a key that names nothing is no filter', () => {
  const zubiri = resolveJourney(tapPlace('zubiri'), HIGHLIGHTS, PLACES);
  assert.deepEqual(zubiri.kind === 'place' ? [zubiri.name, [...zubiri.ids].sort(), zubiri.empty] : null, ['Zubiri', ['p1', 'p2'], false]);
  const burgos = resolveJourney(tapPlace('burgos'), HIGHLIGHTS, PLACES);
  assert.deepEqual(burgos.kind === 'place' ? [burgos.name, [...burgos.ids], burgos.empty] : null, ['Burgos', ['p4'], false]);
  const leon = resolveJourney(tapPlace('leon'), HIGHLIGHTS, PLACES);
  assert.deepEqual(leon.kind === 'place' ? [leon.name, [...leon.ids], leon.empty] : null, ['León', [], true]);
  assert.equal(resolveJourney(tapPlace('nowhere'), HIGHLIGHTS, PLACES).kind, 'stamps', 'a place that is gone: the stamps');
  assert.equal(resolveJourney({ view: 'posts', destination: 'gone' }, HIGHLIGHTS, PLACES).kind, 'grid', 'a destination that is gone: all posts');
  assert.equal(resolveJourney({ view: 'posts', destination: 'd2' }, HIGHLIGHTS, PLACES).kind, 'grid', 'a destination with no post (ahead) is no filter');
  assert.equal(resolveJourney(ALL_PLACES, HIGHLIGHTS, []).kind, 'grid', 'no points at all: there is nothing to show as stamps');
  assert.equal(resolveJourney(tapPlace('zubiri'), HIGHLIGHTS, []).kind, 'grid');
  assert.equal(resolveJourney(POSTS_VIEW, HIGHLIGHTS, PLACES).kind, 'grid');
});

/* ---------------------------------------------------------------- the row */

check('the row of destinations opens at the next destination, and keeps clear of the All item pinned at its left', () => {
  const o = { width: 390, item: 72, gap: 16, margin: 16 };
  // not pinned (no All item): the same numbers as before
  assert.equal(rowStartOffset({ ...o, nextAt: 0, pinned: false }), 0);
  assert.equal(rowStartOffset({ ...o, nextAt: 3, pinned: false }), 0, 'on the first screen (16 + 3 x 88 + 72 = 352 <= 374)');
  assert.equal(rowStartOffset({ ...o, nextAt: 4, pinned: false }), 4 * 88 - 36, 'off the first screen: half of the one before shows');
  assert.equal(rowStartOffset({ ...o, nextAt: -1, pinned: false }), 0);
  // pinned: the destinations have 390 - 16 - 88 = 286 and no margin on the left
  assert.equal(rowStartOffset({ ...o, nextAt: 2, pinned: true }), 0, '2 x 88 + 72 = 248 <= 270');
  assert.equal(rowStartOffset({ ...o, nextAt: 3, pinned: true }), 3 * 88 - 52, '3 x 88 + 72 = 336 > 270: it scrolls');
  assert.equal(rowStartOffset({ ...o, nextAt: 12, pinned: true }), 12 * 88 - 52);
  // what is shown never starts a destination under the All item: the offset leaves the previous one half visible (36 of 72) at most
  const x = rowStartOffset({ ...o, nextAt: 12, pinned: true });
  assert.equal(12 * 88 - x, 52, 'the next destination is 52 from the left of the scrolling part: half of the one before (36) and a gap (16)');
});

/* ---------------------------------------------------------------- the screen: what the files say */

check('the logic files import nothing from React, React Native or the app: plain node can load them', () => {
  for (const f of ['src/features/me/routePoints.ts', 'src/features/me/journeyView.ts']) {
    const imports = [...read(f).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    assert.ok(imports.length > 0);
    for (const i of imports) assert.ok(i.startsWith('./'), `${f} imports ${i}`);
  }
});

console.log(`${n} of ${n} passed`);
