// The plan: what gets checked. A route nobody checks, or a mode nobody runs, would be a hole in the safety net.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPECTED_REDIRECTS, SCHEMES, buildTasks, redirectAllowed } from '../plan.mjs';
import { discoverRoutes } from '../routes.mjs';
import { SCENARIOS } from '../scenarios.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const route = (pattern, personas) => ({ pattern, url: pattern, files: [pattern], personas });

test('every route is checked in every account state that reaches it, in light and dark, online and offline, with a full account', () => {
  const tasks = buildTasks({ routes: [route('/', ['out', 'in']), route('/me', ['in'])], scenarios: [] }).filter((t) => t.data === 'full');
  const combos = tasks.map((t) => `${t.route.pattern}|${t.persona}|${t.scheme}|${t.offline ? 'offline' : 'online'}`).sort();
  const want = [];
  for (const [p, personas] of [['/', ['out', 'in']], ['/me', ['in']]]) for (const persona of personas) for (const s of SCHEMES) for (const m of ['online', 'offline']) want.push(`${p}|${persona}|${s}|${m}`);
  assert.deepEqual(combos, want.sort());
});

test('signed-in states are also checked with an empty account (light, online and offline); a signed-out visitor has no account to empty', () => {
  const tasks = buildTasks({ routes: [route('/', ['out', 'new', 'in'])], scenarios: [] }).filter((t) => t.data === 'empty');
  assert.deepEqual(tasks.map((t) => `${t.persona}|${t.scheme}|${t.offline ? 'offline' : 'online'}`).sort(), ['in|light|offline', 'in|light|online', 'new|light|offline', 'new|light|online']);
});

test('a check is named by its route, scheme, mode and account state', () => {
  const tasks = buildTasks({ routes: [route('/settings', ['in'])], scenarios: [] });
  assert.equal(tasks.find((x) => x.scheme === 'dark' && x.offline).label, '/settings  [dark, offline, signed in, with a journey]');
  assert.equal(tasks.find((x) => x.data === 'empty' && !x.offline).label, '/settings  [light, online, signed in, with a journey, empty account]');
});

test('scenarios run in light and dark unless they say otherwise; --only narrows by name', () => {
  const sc = [{ name: 'both', persona: 'in' }, { name: 'light only', persona: 'in', schemes: ['light'], offline: true }];
  const tasks = buildTasks({ routes: [], scenarios: sc });
  assert.deepEqual(tasks.map((t) => `${t.scenario.name}:${t.scheme}:${t.offline}`), ['both:light:false', 'both:dark:false', 'light only:light:true']);
  assert.equal(buildTasks({ routes: [], scenarios: sc, only: 'LIGHT ONLY' }).length, 1);
});

test('the real plan: all routes, all modes, and the scenarios the owner asked for', async () => {
  const { routes } = await discoverRoutes(join(here, '..', '..', '..', 'mobile', 'app'));
  const tasks = buildTasks({ routes, scenarios: SCENARIOS });
  const loads = tasks.filter((t) => t.type === 'route');
  const full = routes.reduce((n, r) => n + r.personas.length, 0) * SCHEMES.length * 2;
  const empty = routes.reduce((n, r) => n + r.personas.filter((p) => p !== 'out').length, 0) * 2;
  assert.equal(loads.length, full + empty);
  for (const mode of [true, false]) for (const scheme of SCHEMES) assert.ok(loads.some((t) => t.offline === mode && t.scheme === scheme), `no page load with offline=${mode} in ${scheme}`);
  for (const persona of ['out', 'new', 'in']) assert.ok(loads.some((t) => t.persona === persona), `no page load signed ${persona}`);
  const names = SCENARIOS.map((s) => s.name).join('\n');
  for (const must of [
    /Tab bar/, /gear on Me opens Settings/, /switching light and dark/i, /Library: the tabs Bible and Books/, /Me: the strip is Notes, Journey, Plan, Health/,
    // Me: the Notes feed starts with ONE card and has no filter tabs; the header is the gear alone; the chat button on every sub-tab opens the inbox where something waits, says the
    // number, and says just "Inbox" with no signal; the first tile of Journey is the card that writes a post (in the sample journey too); the Library has neither
    /Me: Notes is the first sub-tab and its feed starts with ONE card/, /top right of the header is the gear alone/, /chat button opens the inbox where something waits/,
    /Me, with no signal: the chat button is just "Inbox"/, /Me, Journey: the first tile of the grid is the card/, /Me, Journey with no post yet: the sample journey has the card too/,
    /Library: the chat button and the cards are Me's/,
    /three choices under the banner/, /banner of the Bible tab opens \/library\/daily/, /bookmarks kept before the tabs changed/,
    // the Bible: the grid of books, the chapters, the reader, Next and Previous across a boundary, a verse bookmarked, a link to a verse, the search of verses
    /daily reading banner is compact/, /73 book names fits its square tile/, /a tile opens the numbers of the chapters/, /Next and Previous cross the books/, /touching a verse chooses it/,
    /a link to a verse/, /verses are found after the keystroke/, /leads nowhere/,
    // the Continue reading bar above the tab bar: where it sits and what it opens, closing it and bringing it back, the most recent place of the Bible and the books (a long title is cut, the chapter is not),
    // a stored mark that does not read, a book that is not in the Library
    /bar "Continue reading" floats above the tab bar/, /bar "Continue reading" continues the most recent place/, /closed bar is told apart by the place and its time/, /place that no longer exists gives no bar/,
    // the Books: the covers, A5 in two columns on a shelf for each kind, a cover opens its page with the notice of its kind, every kind has its notice, the reader (Next and Previous),
    // the place and the size of the text kept, links, the ribbon bookmark with Bookmarks and the search, and all of it with no signal
    /covers, A5 in two columns, on a shelf for each kind of book/, /cover opens the book page/, /every kind of book has its notice on its page/, /reader opens at the first chapter, Next and Previous/, /remembers where you stopped/,
    /links go where they say/, /ribbon of a cover bookmarks the book/, /Books with no signal/,
  ]) assert.match(names, must);
});

test('a scenario may ask for the empty account (a new pilgrim\'s Me); the others run on the full one', () => {
  const sc = [{ name: 'full', persona: 'in' }, { name: 'empty', persona: 'in', data: 'empty', schemes: ['light'] }];
  const tasks = buildTasks({ routes: [], scenarios: sc });
  assert.deepEqual(tasks.map((t) => `${t.scenario.name}:${t.data ?? 'full'}:${t.scheme}`), ['full:full:light', 'full:full:dark', 'empty:empty:light']);
  const real = buildTasks({ routes: [], scenarios: SCENARIOS }).filter((t) => t.data === 'empty').map((t) => t.scenario.name);
  assert.ok(real.some((n) => /sample journey has the card too/.test(n)), 'the sample journey is walked with the account that has no post');
});

test('redirects on purpose are listed with a reason, and only for the account states named', () => {
  for (const r of EXPECTED_REDIRECTS) assert.ok(r.reason && r.reason.length > 20, `${r.route} needs a reason`);
  assert.equal(redirectAllowed('/', 'out'), true);
  assert.equal(redirectAllowed('/auth-callback', 'in'), true);
  assert.equal(redirectAllowed('/auth-callback', 'out'), false);
  assert.equal(redirectAllowed('/settings', 'in'), false);
});
