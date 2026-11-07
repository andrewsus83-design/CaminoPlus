// Plain-node checks of the highlights per destination on Me: which highlights there are, which posts belong to which, and
// the guards that keep the My Camino card where it is. Run: npm run test:me
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  MAX_HIGHLIGHTS, buildHighlights, coverUrl, destinationName, firstLetter, highlightLabel, nextHighlightIndex, parseSeen, placeMatch,
  type DayLike, type PostLike,
} from '../highlights';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const code = (src: string) => src.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n'); // without comment lines

const day = (id: string, to: string | null, stage: string | null = null, status = 'planned'): DayLike => ({ id, to_name: to, stage: stage ? { name: stage } : null, status });
const post = (id: string, place: string | null, at: string | null = null): PostLike => ({ id, place_name: place, published_at: at });
const names = (list: { name: string }[]) => list.map((h) => h.name);

check('a destination is the day\'s to_name, else what follows the last " to " in the stage name, else the day has none', () => {
  assert.equal(destinationName(day('1', 'Hontanas')), 'Hontanas');
  assert.equal(destinationName(day('1', '  Hontanas  ')), 'Hontanas', 'trimmed');
  assert.equal(destinationName(day('2', 'Zubiri', 'Roncesvalles to Larrasoaña')), 'Zubiri', 'to_name wins over the stage name');
  assert.equal(destinationName(day('3', null, 'Pamplona to Puente la Reina')), 'Puente la Reina');
  assert.equal(destinationName(day('3', '', 'Estella to Los Arcos')), 'Los Arcos', 'an empty to_name is no name');
  assert.equal(destinationName(day('3', '   ', 'Estella TO Los Arcos')), 'Los Arcos', 'blank, and any case of "to"');
  assert.equal(destinationName(day('3', null, 'Saint-Jean-Pied-de-Port to Roncesvalles')), 'Roncesvalles');
  assert.equal(destinationName(day('3', null, 'Villafranca to Triacastela to Sarria')), 'Sarria', 'the last one');
  assert.equal(destinationName(day('4', null, 'Stage 12')), null, 'no " to ": no destination');
  assert.equal(destinationName(day('4', null, 'Porto')), null, '"to" inside a word is not " to "');
  assert.equal(destinationName(day('4', null, 'Burgos to ')), null, 'nothing after it');
  assert.equal(destinationName(day('4', null, null)), null);
  assert.equal(destinationName({ id: '5' }), null, 'a day with neither field');
});

check('a day without a destination is skipped, and the others keep the plan\'s order', () => {
  const days = [day('d1', 'Zubiri'), day('d2', null, 'Stage 2'), day('d3', null, 'Zubiri to Pamplona'), day('d4', null), day('d5', 'Cizur Menor')];
  const list = buildHighlights(days, []);
  assert.deepEqual(names(list), ['Zubiri', 'Pamplona', 'Cizur Menor']);
  assert.deepEqual(list.map((h) => h.dayId), ['d1', 'd3', 'd5']);
  assert.deepEqual(list.map((h) => h.key), ['d1', 'd3', 'd5'], 'the key is the day, unique and the same after a reload');
});

check('accents and case never matter: Nájera, najera and NÁJERA are one place', () => {
  const list = buildHighlights([day('d1', 'Nájera')], [post('a', 'najera'), post('b', 'NÁJERA'), post('c', 'Nájera'), post('d', ' nájera ')]);
  assert.equal(list[0].posts.length, 4);
  const other = buildHighlights([day('d1', 'najera')], [post('a', 'Nájera')]);
  assert.equal(other[0].state, 'visited', 'the other way round too');
  assert.equal(placeMatch('Ñandú', 'nandu'), 3);
  assert.equal(placeMatch('Logroño', 'LOGRONO'), 3);
});

check('the rule: same words, same first part before a comma, or one contains the other as whole words with 3 letters or more', () => {
  const cases: [place: string | null, destination: string, want: number][] = [
    ['najera', 'Nájera', 3],
    ['Puente-la-Reina', 'Puente la Reina', 3],
    ['  Hontanas.  ', 'Hontanas', 3],
    ['Hontanas, Burgos', 'Hontanas', 2],
    ['Burgos, Spain', 'Burgos', 2],
    ['Albergue San Anton, Castrojeriz', 'Castrojeriz', 1],
    ['Albergue municipal de Hontanas', 'Hontanas', 1],
    ['Pamplona/Iruña', 'Pamplona', 1],
    ['Burgos Cathedral', 'Burgos', 1],
    ['Santo Domingo', 'Santo Domingo de la Calzada', 1],
    ['Hontanas', 'Hontanas, Burgos', 2],
    // not the same place
    ['San', 'Santo Domingo de la Calzada', 0],  // a piece of a word is not a word
    ['Sarri', 'Sarria', 0],
    ['Estellas', 'Estella', 0],
    ['O', 'O Cebreiro', 0],                     // whole word, but under 3 letters
    ['Le', 'Leon', 0],
    ['Logroño', 'Navarrete', 0],
    ['', 'Burgos', 0],
    ['   ', 'Burgos', 0],
    [null, 'Burgos', 0],
    ['Burgos', '', 0],
    ['Burgos', '---', 0],
  ];
  for (const [place, destination, want] of cases) assert.equal(placeMatch(place, destination), want, `${JSON.stringify(place)} against ${JSON.stringify(destination)}`);
  // other alphabets: their letters count, and their marks stay inside the word
  assert.equal(placeMatch('팜플로나', '팜플로나'), 3);
  assert.equal(placeMatch('मुंबई', 'मुंबई'), 3);
});

check('a post belongs to ONE destination, the one it matches best, and a post that matches nothing is in no highlight', () => {
  const days = [day('d1', 'Burgos'), day('d2', 'Hontanas'), day('d3', 'Castrojeriz')];
  const list = buildHighlights(days, [
    post('p1', 'Hontanas, Burgos'),   // Burgos comes first in the plan, but this is Hontanas
    post('p2', 'Burgos'),
    post('p3', 'Somewhere else'),
    post('p4', null),
    post('p5', 'Castrojeriz'),
  ]);
  const ids = (h: { posts: PostLike[] }) => h.posts.map((p) => p.id).sort();
  assert.deepEqual(ids(list[0]), ['p2']);
  assert.deepEqual(ids(list[1]), ['p1']);
  assert.deepEqual(ids(list[2]), ['p5']);
  const shown = list.flatMap((h) => h.posts.map((p) => p.id));
  assert.equal(new Set(shown).size, shown.length, 'no post under two names');
  assert.ok(!shown.includes('p3') && !shown.includes('p4'), 'no place, or another place: not shown in the row');
  // equally good for two destinations: the earlier day
  const tie = buildHighlights([day('d1', 'Villafranca Montes de Oca'), day('d2', 'Villafranca del Bierzo')], [post('v', 'Villafranca')]);
  assert.deepEqual(tie.map((h) => h.posts.length), [1, 0]);
});

check('visited has at least one post, ahead has none, and the state follows the posts and nothing else', () => {
  const days = [day('d1', 'Burgos', null, 'done'), day('d2', 'Hontanas', null, 'planned'), day('d3', 'Castrojeriz', null, 'planned')];
  const list = buildHighlights(days, [post('p1', 'Hontanas')]);
  assert.deepEqual(list.map((h) => h.state), ['ahead', 'visited', 'ahead'], 'a walked day with no post is still ahead: nothing to show');
  assert.deepEqual(list.map((h) => h.posts.length), [0, 1, 0]);
  assert.ok(buildHighlights(days, []).every((h) => h.state === 'ahead'), 'no posts at all (the sample journey): every destination is ahead');
});

check('the order is the plan\'s, not the posts\' and not alphabetical', () => {
  const days = [day('d1', 'Zubiri'), day('d2', 'Pamplona'), day('d3', 'Estella'), day('d4', 'Burgos')];
  const list = buildHighlights(days, [post('a', 'Burgos', '2026-11-05T10:00:00Z'), post('b', 'Zubiri', '2026-11-01T10:00:00Z')]);
  assert.deepEqual(names(list), ['Zubiri', 'Pamplona', 'Estella', 'Burgos']);
});

check('the row is capped at 40, in the plan\'s order, and a post of a destination beyond it is shown nowhere', () => {
  assert.equal(MAX_HIGHLIGHTS, 40);
  const days = Array.from({ length: 45 }, (_, i) => day(`d${i}`, `Pueblo ${String.fromCharCode(65 + (i % 26))}${i}`));
  const list = buildHighlights(days, [post('late', 'Pueblo S44'), post('early', 'Pueblo A0')]);
  assert.equal(list.length, 40);
  assert.deepEqual(list.map((h) => h.dayId), days.slice(0, 40).map((d) => d.id));
  assert.deepEqual(list[0].posts.map((p) => p.id), ['early']);
  assert.ok(!list.some((h) => h.posts.some((p) => p.id === 'late')));
  assert.equal(buildHighlights(days.slice(0, 40), []).length, 40);
  assert.equal(buildHighlights(days.slice(0, 39), []).length, 39);
});

check('a destination that two days end in is one highlight, at the first of them, and its posts count once', () => {
  const days = [day('d1', 'Burgos'), day('d2', 'Hontanas'), day('d3', 'burgos'), day('d4', null, 'Hontanas to BURGOS'), day('d5', 'Castrojeriz')];
  const list = buildHighlights(days, [post('p1', 'Burgos'), post('p2', 'Hontanas')]);
  assert.deepEqual(names(list), ['Burgos', 'Hontanas', 'Castrojeriz']);
  assert.deepEqual(list.map((h) => h.dayId), ['d1', 'd2', 'd5']);
  assert.deepEqual(list[0].posts.map((p) => p.id), ['p1']);
});

check('no days, or days without a destination, give an empty list; no posts give all ahead', () => {
  assert.deepEqual(buildHighlights([], []), []);
  assert.deepEqual(buildHighlights([], [post('a', 'Burgos')]), []);
  assert.deepEqual(buildHighlights([day('d1', null), day('d2', null, 'Stage 2')], [post('a', 'Burgos')]), []);
  assert.equal(buildHighlights([day('d1', 'Burgos')], []).length, 1);
});

check('posts are newest first, a post with no date is last, equal times keep their order, and the input is not changed', () => {
  const input = [
    post('old', 'Hontanas', '2026-11-01T08:00:00Z'),
    post('none', 'Hontanas', null),
    post('new', 'Hontanas', '2026-11-03T08:00:00Z'),
    post('mid-a', 'Hontanas', '2026-11-02T08:00:00Z'),
    post('mid-b', 'Hontanas', '2026-11-02T08:00:00Z'),
    post('junk', 'Hontanas', 'not a date'),
  ];
  const copy = input.map((p) => p.id);
  const [h] = buildHighlights([day('d1', 'Hontanas')], input);
  assert.deepEqual(h.posts.map((p) => p.id), ['new', 'mid-a', 'mid-b', 'old', 'none', 'junk']);
  assert.deepEqual(input.map((p) => p.id), copy, 'the posts it was given are in the order they were');
});

check('the cover is the first photo of the newest post that has one: a clip is not a picture, and nothing is made up', () => {
  const posts = [post('new', 'X'), post('mid', 'X'), post('old', 'X')];
  const media = {
    new: [{ type: 'video' as const, url: 'https://x/new.mp4' }],
    mid: [{ type: 'video' as const, url: 'https://x/mid.mp4' }, { type: 'image' as const, url: 'https://x/mid-2.jpg' }, { type: 'image' as const, url: 'https://x/mid-3.jpg' }],
    old: [{ type: 'image' as const, url: 'https://x/old.jpg' }],
    other: [{ type: 'image' as const, url: 'https://x/other.jpg' }],
  };
  assert.equal(coverUrl(posts, media), 'https://x/mid-2.jpg');
  assert.equal(coverUrl([posts[0]], media), null, 'only a clip: the letter, not a made up picture');
  assert.equal(coverUrl(posts, {}), null, 'nothing fetched (offline): the letter');
  assert.equal(coverUrl([], media), null);
  assert.equal(coverUrl([posts[2]], { old: [{ type: 'image', url: '' }] }), null, 'an empty link is no picture');
  assert.equal(coverUrl([post('zzz', 'X')], media), null, 'the pictures of other posts are never borrowed');
});

check('the letter is the first character of the name, in capitals', () => {
  assert.equal(firstLetter('Hontanas'), 'H');
  assert.equal(firstLetter('  ñandú'), 'Ñ');
  assert.equal(firstLetter('O Cebreiro'), 'O');
  assert.equal(firstLetter(''), '');
  assert.equal(firstLetter('🐚 Shell'), '🐚', 'a whole character, not half of one');
});

check('what a screen reader says: the name, how many posts and what a tap does', () => {
  const two = { name: 'Hontanas', posts: [1, 2], state: 'visited' as const };
  assert.equal(highlightLabel(two), 'Hontanas, 2 posts, show them');
  assert.equal(highlightLabel({ ...two, posts: [1] }), 'Hontanas, 1 post, show it');
  assert.equal(highlightLabel(two, true), 'Hontanas, 2 posts, showing them, tap to show all posts');
  assert.equal(highlightLabel({ name: 'Estella', posts: [], state: 'ahead' }), 'Estella, no posts yet, open the day plan');
});

check('the next destination in the row: the first day not done, or the first day after it that has a destination', () => {
  const days = [day('d1', 'Roncesvalles', null, 'done'), day('d2', 'Zubiri', null, 'done'), day('d3', null, 'Stage 3', 'planned'), day('d4', 'Pamplona', null, 'planned')];
  const items = buildHighlights(days, []);
  assert.equal(nextHighlightIndex(days, items), 2, 'the day without a destination is passed over');
  assert.equal(nextHighlightIndex(days.map((d) => ({ ...d, status: 'done' })), items), -1, 'everything walked');
  assert.equal(nextHighlightIndex([], []), -1);
  const rest = [day('d1', 'Burgos', null, 'done'), day('d2', 'Hontanas', null, 'done'), day('d3', 'Burgos', null, 'planned')];
  assert.equal(nextHighlightIndex(rest, buildHighlights(rest, [])), 0, 'a place that two days end in is one highlight');
  assert.equal(nextHighlightIndex([day('d1', 'Burgos', null, 'planned')], []), -1, 'not in the row (past the cap)');
});

check('what was saved as seen: the keys of a saved copy, and nothing at all from a file that is not one', () => {
  assert.deepEqual(parseSeen({ v: 1, keys: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(parseSeen({ v: 1, keys: ['a', 3, null, '', 'b'] }), ['a', 'b']);
  for (const junk of [null, undefined, 'text', 7, [], ['a'], {}, { v: 2, keys: ['a'] }, { v: 1 }, { v: 1, keys: 'a' }]) assert.deepEqual(parseSeen(junk), [], JSON.stringify(junk));
});

// ---- the screen: the My Camino card stays, the row sits right under it, and it stays what the owner asked for

check('Me still has the My Camino card, as it was: shell mark in its ring, the title, the route, the gold Change button', () => {
  const me = read('app/(tabs)/me.tsx');
  const line = me.split('\n').find((l) => l.includes('accessibilityLabel="Change Camino"'));
  assert.ok(line, 'the card (a button labelled "Change Camino") is gone: the owner asked for it to stay');
  assert.match(line!, /onPress=\{\(\) => router\.push\('\/change-camino'\)\}/);
  assert.match(line!, /marginTop: 8,.*padding: 14,.*backgroundColor: role\.inverse/, 'the card keeps its size and colour');
  assert.match(me, /<ShellMark size=\{48\} \/>/, 'the shell logo stays');
  assert.match(me, /width: 52, height: 52, borderRadius: radius\.pill, borderWidth: 1\.5/, 'in its 52 px ring');
  assert.match(me, />Change<\/AppText>/, 'the gold Change button');
  assert.match(me, />My Camino<\/AppText>/);
  assert.match(me, />Buen Camino!<\/AppText>/);
  assert.match(me, /\{journey\.start_stage \? `From stage \$\{journey\.start_stage\.stage_number\} · ` : ''\}\{stagesDone\} stages done/);
});

check('the highlights sit directly under the card: after it, before the Journey / Plan / Health tabs, once', () => {
  const me = read('app/(tabs)/me.tsx');
  const card = me.indexOf('accessibilityLabel="Change Camino"');
  const row = me.indexOf('<Highlights');
  const tabs = me.indexOf('<SubTabs');
  assert.ok(card > 0 && row > 0 && tabs > 0, 'the card, the row and the tabs are all there');
  assert.ok(card < row, '<Highlights comes after the My Camino card');
  assert.ok(row < tabs, '<Highlights comes before <SubTabs');
  assert.equal(me.split('<Highlights').length - 1, 1, 'one row');
  // nothing between the card and the row but the "no route" text (that is the card\'s own else branch)
  const between = me.slice(card, row);
  assert.doesNotMatch(between, /<SubTabs|<JourneyGrid|<Fab\b/);
});

check('Me filters the Journey grid to the picked destination, with a bar that clears it, and shares one picture fetch', () => {
  const me = read('app/(tabs)/me.tsx');
  assert.match(me, /<Highlights key=\{session\?\.user\.id \?\? 'none'\} items=\{highlights\} days=\{days \?\? \[\]\} media=\{media\}/);
  assert.match(me, /<JourneyGrid posts=\{posts\} media=\{media\} only=\{onlyIds\} \/>/, 'the grid gets the same pictures and the filter');
  assert.match(me, /<ShowAllBar name=\{active\.name\} onPress=\{\(\) => setFilterKey\(null\)\} \/>/);
  assert.match(me, /if \(tab !== 'Journey'\) \{ setTab\('Journey'\); setFilterKey\(h\.key\); return; \}/, 'from another tab it brings you to the grid');
  assert.match(me, /setFilterKey\(\(k\) => \(k === h\.key \? null : h\.key\)\)/, 'the same highlight again clears the filter');
  assert.match(me, /days && posts \? buildHighlights\(days, posts\) : \[\]/, 'nothing is drawn as "not visited" before the posts are known');
  const grid = code(read('src/features/me/JourneyGrid.tsx'));
  assert.match(grid, /usePostRail\(\{ posts, sample: !!sample \}\)/, 'the rail still works on all the posts, so a filter reads nothing from the network');
  assert.match(grid, /if \(sample \|\| given\) return;/, 'the grid does not fetch the pictures when it was given them');
  assert.match(grid, /<Viewer posts=\{shown\}/);
});

check('the row: 60 px pictures in a 66 px ring, 72 px wide items 16 apart, names at 12 px, the screen\'s margin as padding', () => {
  const src = code(read('src/features/me/Highlights.tsx'));
  assert.match(src, /const RING = 66;/);
  assert.match(src, /const PICTURE = 60;/);
  assert.match(src, /const ITEM_W = 72;/);
  assert.match(src, /const GAP = 16;/);
  assert.match(src, /fontSize: 12, lineHeight: 16/);
  assert.match(src, /marginHorizontal: -layout\.screenMargin/, 'it reaches the screen edges');
  assert.match(src, /paddingHorizontal: layout\.screenMargin/);
  assert.match(src, /showsHorizontalScrollIndicator=\{false\}/);
  assert.match(src, /if \(items\.length === 0\) return null;/, 'no destinations: nothing is drawn, not even the space');
});

check('the row\'s colours are theme roles: gold ring until it is opened, then the strong border; dashed circle and pin when ahead', () => {
  const src = code(read('src/features/me/Highlights.tsx'));
  assert.match(src, /backgroundColor: seen \? role\.borderStrong : c\.gold/);
  assert.match(src, /borderStyle: 'dashed', borderColor: role\.borderStrong/);
  assert.match(src, /<Icon name="pin" color=\{role\.muted\}/);
  assert.match(src, /backgroundColor: role\.sunken/);
  assert.match(src, /fontFamily: fonts\.title/, 'the letter of a destination without a picture');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b|rgba?\(/, 'no colour of its own');
  assert.doesNotMatch(src, /\bc\.blue\b/);
  assert.doesNotMatch(src, /StyleSheet\.create/);
});

check('every highlight is a button with a label, an ahead one opens that day in the planner, the bar is "Show all posts"', () => {
  const src = code(read('src/features/me/Highlights.tsx'));
  assert.match(src, /accessibilityRole="button" accessibilityLabel=\{highlightLabel\(h, active\)\}/);
  assert.match(src, /router\.push\(\{ pathname: '\/planner', params: \{ day: h\.dayId \} \}\)/);
  assert.match(src, /accessibilityRole="button" accessibilityLabel="Show all posts"/);
  assert.match(src, /<AppText variant="label" numberOfLines=\{1\} style=\{\{ flexShrink: 1 \}\}>\{name\}<\/AppText>/, 'a long name gives way ...');
  assert.match(src, /numberOfLines=\{1\} style=\{\{ flexShrink: 0 \}\}>· Show all<\/AppText>/, '... and "Show all" never wraps onto a second line');
});

check('what was opened is kept per person under u.<id>., so signing out clears it, and the row asks the network for nothing', () => {
  const src = code(read('src/features/me/Highlights.tsx'));
  assert.match(src, /const SEEN_NAME = 'highlights\.seen';/);
  assert.match(src, /userKey\(userId, SEEN_NAME\)/);
  assert.match(code(read('src/lib/localStore.ts')), /export const userKey = \(uid: string, name: string\) => `u\.\$\{uid\}\.\$\{name\}`/);
  assert.doesNotMatch(src, /listPostMediaUrls|supabase|\bfetch\(|import \{[^}]*\} from '@\/lib\/api'/, 'it only draws what Me gives it');
  assert.match(src, /import type \{ Post, PostMediaUrl \} from '@\/lib\/api'/, 'types only');
});

check('the logic files import nothing from React, React Native or the app: plain node can load them', () => {
  for (const f of ['src/features/me/highlights.ts', 'src/features/me/text.ts']) {
    const imports = [...read(f).matchAll(/^import .* from '([^']+)'/gm)].map((m) => m[1]);
    for (const i of imports) assert.ok(i.startsWith('./'), `${f} imports ${i}`);
  }
  assert.match(read('src/features/me/shared.tsx'), /export \{ norm \} from '\.\/text';/, 'norm is still exported from shared for the passport');
  assert.match(read('app/passport.tsx'), /import \{ Empty, ProgressBar, norm, shortDate \} from '@\/features\/me\/shared';/);
});

console.log(`${n} of ${n} passed`);
