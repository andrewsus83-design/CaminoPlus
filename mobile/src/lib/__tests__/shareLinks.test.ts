// Share links (src/lib/shareLinks.ts): the four calls against a scripted stand-in of the database, the copy of a note, the words,
// and that a share URL is built in ONE place. Run: npm run test:lib
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  LABEL_MAX, LINKS_MAX, MESSAGES, linkLabel, RPC_COLUMNS, SHARE_LINK_BASE, SHEET, TOKEN, createShareLinks, linkState, linkTitle, messageFor, noteCopy, parseLinks,
  shareText, shareUrl, viewsLine, type Rpc,
} from '../shareLinks';

let n = 0;
const pending: Promise<void>[] = [];
const check = (name: string, fn: () => void | Promise<void>) => {
  pending.push(Promise.resolve().then(fn).then(() => { n += 1; console.log(`ok   ${name}`); }));
};

const GOOD = 'A'.repeat(20) + '_-' + 'b'.repeat(21);
type Call = { fn: string; args?: Record<string, unknown> };
function stand(answer: (c: Call) => { data: unknown; error: { code?: string; message: string } | null }, offline = false) {
  const calls: Call[] = [];
  const rpc: Rpc = async (fn, args) => { calls.push({ fn, args }); return answer({ fn, args }); };
  const api = createShareLinks({ rpc }, {
    assertOnline: async () => { if (offline) { const e = new Error('You are offline.'); e.name = 'OfflineError'; throw e; } },
    isOffline: (e) => e instanceof Error && e.name === 'OfflineError',
  });
  return { api, calls };
}

check('the link: the base, a fragment, the token; a token is 43 base64url characters', () => {
  assert.equal(SHARE_LINK_BASE, 'https://caminoplus-web.vercel.app/s');
  assert.equal(shareUrl(GOOD), `https://caminoplus-web.vercel.app/s#${GOOD}`);
  assert.ok(TOKEN.test(GOOD));
  for (const bad of ['', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(42) + '=', 'A'.repeat(42) + '+', 'A'.repeat(42) + '/']) assert.ok(!TOKEN.test(bad), bad);
  assert.match(shareText('plan', shareUrl(GOOD)), /^My Camino plan on CaminoPlus: https:\/\/caminoplus-web\.vercel\.app\/s#/);
  assert.match(shareText('note', shareUrl(GOOD)), /^A note from my Camino on CaminoPlus: /);
});

check('a share URL is built in ONE place: no other file names the host or writes /s# by hand', () => {
  const root = process.cwd(); // npm test runs from mobile/
  const files: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p); } else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk('app'); walk('src');
  assert.ok(files.length > 50, 'the scan sees the app');
  const offenders = files.filter((f) => f !== 'src/lib/shareLinks.ts').filter((f) => {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    return /caminoplus-web\.vercel\.app|\/s#|\/s\/#|SHARE_LINK_BASE/.test(src);
  });
  assert.deepEqual(offenders, [], 'only shareLinks.ts knows where a link opens');
  const own = fs.readFileSync(path.join(root, 'src/lib/shareLinks.ts'), 'utf8');
  assert.equal((own.match(/SHARE_LINK_BASE/g) ?? []).length, 2, 'declared once and used once, in shareUrl');
  assert.equal((own.match(/caminoplus-web\.vercel\.app/g) ?? []).length, 1);
});

check('only shareLinks.ts calls the four functions of the database', () => {
  const root = process.cwd();
  const grep = (d: string, out: string[] = []) => {
    for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) {
      const p = `${d}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== '__tests__') grep(p, out); } else if (/\.(ts|tsx)$/.test(e.name) && /\b(create_share_link|list_share_links|revoke_share_link|get_shared)\b/.test(fs.readFileSync(path.join(root, p), 'utf8'))) out.push(p);
    }
    return out;
  };
  assert.deepEqual([...grep('app'), ...grep('src')], ['src/lib/shareLinks.ts']);
  assert.ok(!fs.readFileSync(path.join(root, 'src/lib/shareLinks.ts'), 'utf8').includes("'get_shared'"), 'the app never opens a link itself: the website does');
});

check('a plan link: one call, exactly these arguments, the link built from the token', async () => {
  const { api, calls } = stand(() => ({ data: { id: 'l1', token: GOOD, expires_at: null }, error: null }));
  const r = await api.sharePlan('j1', { stays: true });
  assert.deepEqual(r, { ok: true, id: 'l1', token: GOOD, expires_at: null, url: shareUrl(GOOD) });
  assert.deepEqual(calls, [{ fn: 'create_share_link', args: { p_kind: 'plan', p_journey_id: 'j1', p_options: { stays: true }, p_label: null } }]);
  const again = await api.sharePlan('j1', { stays: 'yes' as unknown as boolean });
  assert.ok(again.ok);
  assert.deepEqual(calls[1].args?.p_options, { stays: false }, 'only a real true shows the stays');
});

check('a note link: a COPY of the title, the words without marks and the date; never the place, the photos or the id', async () => {
  const entry = { id: 'n1', title: '  Day 3 ', body: '# Bells\n**The** bells at _dawn_.\n- rain', createdAt: '2026-12-03T07:15:00.000Z',
    place: { name: 'Zubiri', lat: 42.9, lng: -1.5 }, media: [{ uri: 'file:///x.jpg' }] };
  const copy = noteCopy(entry);
  assert.deepEqual(copy, { title: 'Day 3', body: 'Bells\nThe bells at dawn.\nrain', place: null, written_at: '2026-12-03T07:15:00.000Z' });
  assert.deepEqual(Object.keys(copy!).sort(), ['body', 'place', 'title', 'written_at']);
  assert.equal(noteCopy({ title: ' ', body: '   ' }), null, 'an empty note has no copy');
  assert.equal(noteCopy({ body: 'x'.repeat(25_000) })!.body.length, 20_000, 'the body is cut to what the database takes');
  assert.equal(noteCopy({ body: 'x', createdAt: 'not a date' })!.written_at, null);
  const { api, calls } = stand(() => ({ data: { id: 'l2', token: GOOD, expires_at: null }, error: null }));
  const r = await api.shareNote(copy!);
  assert.ok(r.ok);
  assert.deepEqual(calls, [{ fn: 'create_share_link', args: { p_kind: 'note', p_note: copy, p_label: null } }]);
  assert.ok(!JSON.stringify(calls).includes('Zubiri') && !JSON.stringify(calls).includes('x.jpg') && !JSON.stringify(calls).includes('n1'));
});

check('offline: no call, and the person is told sharing needs a connection', async () => {
  const { api, calls } = stand(() => { throw new Error('must not be called'); }, true);
  for (const r of [await api.sharePlan('j1', { stays: false }), await api.shareNote({ title: 't', body: 'b', place: null, written_at: null }), await api.list(), await api.stop('l1')]) {
    assert.deepEqual(r, { ok: false, message: MESSAGES.offline });
  }
  assert.equal(calls.length, 0);
  assert.match(SHEET.needsNetwork, /needs a connection/);
});

check('the answers of the database, in words', async () => {
  assert.equal(messageFor({ code: '54000', message: 'you have 50 links' }), MESSAGES.tooMany);
  assert.ok(MESSAGES.tooMany.includes(String(LINKS_MAX)));
  assert.equal(messageFor({ code: '42501', message: 'that plan is not yours' }), MESSAGES.notYours);
  assert.equal(messageFor({ code: '22001', message: 'too long' }), MESSAGES.tooLong);
  assert.equal(messageFor({ code: 'PGRST202', message: 'Could not find the function public.create_share_link' }), MESSAGES.notReady, 'before the migration is applied');
  assert.equal(messageFor({ code: '22023', message: 'the note is empty' }), MESSAGES.empty);
  assert.equal(messageFor({ code: 'XX000', message: 'boom' }), MESSAGES.failed);
  assert.equal(messageFor(null), MESSAGES.failed);
  // a token that is not a token is a failure, never a link
  const { api } = stand(() => ({ data: { id: 'l1', token: 'short' }, error: null }));
  assert.deepEqual(await api.sharePlan('j1', { stays: false }), { ok: false, message: MESSAGES.failed });
  const thrown = stand(() => { throw new TypeError('Network request failed'); });
  assert.deepEqual(await thrown.api.list(), { ok: false, message: MESSAGES.failed });
  const empty = stand(() => ({ data: null, error: null }));
  assert.deepEqual(await empty.api.shareNote({ title: null, body: '', place: null, written_at: null }), { ok: false, message: MESSAGES.empty });
  assert.equal(empty.calls.length, 0, 'an empty note is not sent');
});

check('the list: parsed defensively, never a token; stopping one', async () => {
  const rows = [
    { id: 'a', kind: 'plan', label: null, created_at: '2026-11-01T10:00:00Z', expires_at: null, revoked_at: null, last_viewed_at: null, view_count: 3, token: 'x', token_hash: 'y' },
    { id: 'b', kind: 'note', label: 'Bells', created_at: '2026-11-02T10:00:00Z', expires_at: '2026-11-03T10:00:00Z', revoked_at: null, last_viewed_at: null, view_count: 0 },
    { id: 'c', kind: 'diary', created_at: 'x' }, null, 'junk',
  ];
  const links = parseLinks(rows);
  assert.deepEqual(links.map((l) => l.id), ['a', 'b']);
  assert.ok(!('token' in links[0]) && !('token_hash' in links[0]));
  assert.deepEqual([...RPC_COLUMNS.list_share_links].sort(), Object.keys(links[0]).sort(), 'the columns read are the columns listed for the contract check');
  assert.equal(linkTitle(links[0]), 'My plan');
  assert.equal(linkTitle(links[1]), 'Bells');
  assert.equal(linkTitle({ kind: 'note', label: null }), 'A note');
  const now = new Date('2026-11-05T00:00:00Z');
  assert.equal(linkState(links[0], now), 'active');
  assert.equal(linkState(links[1], now), 'expired');
  assert.equal(linkState({ revoked_at: '2026-11-04T00:00:00Z', expires_at: null }, now), 'stopped');
  assert.equal(viewsLine(links[0]), 'Opened 3 times');
  assert.equal(viewsLine(links[1]), 'Not opened yet');
  assert.equal(viewsLine({ view_count: 1 }), 'Opened once');
  const { api, calls } = stand((c) => ({ data: c.fn === 'list_share_links' ? rows : null, error: null }));
  const r = await api.list();
  assert.ok(r.ok && r.links.length === 2);
  assert.deepEqual(await api.stop('a'), { ok: true });
  assert.deepEqual(calls.map((c) => [c.fn, c.args]), [['list_share_links', undefined], ['revoke_share_link', { p_id: 'a' }]]);
});

check('the question before a link says what it shows, what it does not, and who can see it', () => {
  assert.match(SHEET.anyone, /^Anyone who has the link can see it, until you stop sharing it/);
  assert.match(SHEET.plan.hides, /notes of each day, bookings, health, GPS tracks and stamps/);
  assert.match(SHEET.note.hides, /photos, videos, the place, and your other notes\. The note itself stays on this phone\./);
  assert.match(SHEET.plan.live, /If you change the plan, the link changes too/);
  assert.match(SHEET.note.live, /If you change the note later, the link does not change/);
  const words = JSON.stringify(SHEET) + JSON.stringify(MESSAGES);
  assert.doesNotMatch(words, /friends? can|public|everyone|forever/i, 'no word suggests the plan or the note is open to anyone but the holder of the link');
});

check('labels: the route name or the note TITLE, 80 characters at most, never the words of a note', () => {
  assert.equal(LABEL_MAX, 80);
  assert.equal(linkLabel('  Camino   Francés '), 'Camino Francés');
  assert.equal(linkLabel('T'.repeat(120)), 'T'.repeat(80));
  assert.equal(linkLabel(''), null);
  assert.equal(linkLabel('   '), null);
  assert.equal(linkLabel(undefined), null);
  const root = process.cwd();
  const notes = fs.readFileSync(path.join(root, 'src/features/notes/NotesTab.tsx'), 'utf8');
  assert.match(notes, /shareLinks\.shareNote\(copy, \{ label: linkLabel\(linkFor\.title\) \}\)/, 'a note link is labelled by its title');
  assert.doesNotMatch(notes, /linkLabel\([^)]*body/, 'never by its words');
  assert.match(fs.readFileSync(path.join(root, 'app/(tabs)/me.tsx'), 'utf8'), /shareLinks\.sharePlan\(journeyId, \{ stays, label: linkLabel\(routeName\) \}\)/, 'a plan link by its route');
});

check('the sheet never closes silently on a link that exists: closed, failed or no share sheet shows it with Copy', () => {
  const sheet = fs.readFileSync(path.join(process.cwd(), 'src/components/ShareLinkSheet.tsx'), 'utf8');
  assert.match(sheet, /if \(res\.outcome === 'shared'\) \{ onClose\(\); return; \}\s*setReady\(text\);/);
  assert.match(sheet, /typeof Share\?\.share === 'function'/, 'a device with no share sheet');
  assert.match(sheet, /<Pill label=\{SHEET\.copy\} onPress=\{copy\} \/>/);
  assert.equal(SHEET.copy, 'Copy link');
  assert.deepEqual([SHEET.plan.shows[0], SHEET.note.shows[0]], ['Your name', 'Your name'], 'the page says who shared it');
  assert.equal(MESSAGES.tooLong, 'This note is too long to share.');
});

Promise.all(pending).then(() => console.log(`${n} of ${n} passed`), (e) => { console.error(e); process.exit(1); });
