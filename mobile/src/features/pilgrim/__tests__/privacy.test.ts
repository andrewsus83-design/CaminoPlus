// Source-level checks of what the profile of another pilgrim may touch, in the style of src/features/diary/__tests__/wiring.test.ts. They read the files; nothing is run.
// The rule (the owner's): a pilgrim's NOTES stay private, and so do their plan (and the story of each of its days) and their health. What is on their profile is what
// they PUBLISHED: a card, and the posts the database lets this viewer see. If a change of the profile or of the journey view reaches for anything else, this fails.
// Run: npm run test:social
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');
/** The code of a file without its comments (a comment may say "notes" to explain that they are not read; the code may not name them). */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const FEATURE = 'src/features/pilgrim';
const featureFiles = fs.readdirSync(path.join(root, FEATURE)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${FEATURE}/${f}`);
const SCREEN = 'app/pilgrim/[id].tsx';
/** What is new, and wholly about another pilgrim: the screen and the feature folder. */
const PROFILE_FILES = [SCREEN, ...featureFiles];
/** What the profile shares with Me's own journey: the grid and its viewer, the rail behind it, the pictures, the comments sheet. */
const SHARED_FILES = ['src/features/me/JourneyGrid.tsx', 'src/features/me/usePostRail.ts', 'src/features/me/usePostMedia.ts', 'src/components/CommentsSheet.tsx', 'src/components/ActionRail.tsx'];

const importsOf = (src: string): string[] => [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g), ...src.matchAll(/\bimport\s+['"]([^'"]+)['"]/g), ...src.matchAll(/\brequire\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1]);

check('the scan sees every file of the profile', () => {
  for (const f of PROFILE_FILES) assert.ok(fs.existsSync(path.join(root, f)), `${f} exists`);
  for (const f of ['api.ts', 'logic.ts', 'usePilgrim.ts', 'PilgrimHeader.tsx', 'JourneyPanel.tsx']) assert.ok(featureFiles.includes(`${FEATURE}/${f}`), `${f} is scanned`);
  assert.ok(PROFILE_FILES.length >= 6, PROFILE_FILES.join(', '));
});

check('NOTES: nothing of the profile or its journey view imports the diary, the notes, the plan, the health tab or the data of Me: they are not loaded here at all', () => {
  const forbidden = [
    /features\/diary/, /features\/notes/, /(^|\/)diary(\/|$)/, /(^|\/)notes(\/|$)/, /useDiary/, /diaryStore|diary\/store/, /useMeData/, /me\/Health/, /me\/plan(['"/]|$)/, /me\/Highlights/, /me\/highlights/, /me\/AllPlaces/, /me\/SampleJourney/,
    /lib\/localStore/, /expo-file-system/, /expo-clipboard/,
  ];
  for (const f of [...PROFILE_FILES, ...SHARED_FILES]) {
    for (const spec of importsOf(code(read(f)))) {
      for (const re of forbidden) assert.doesNotMatch(spec, re, `${f} imports ${spec}: another pilgrim's profile never touches the diary, the notes, the plan or the health of anybody`);
    }
  }
  // the one thing the grid takes from the Me module of tabs is the place the write card goes to, and the profile has no write card
  assert.deepEqual(importsOf(code(read('src/features/me/JourneyGrid.tsx'))).filter((s) => /\.\/tabs$/.test(s)), ['./tabs']);
  assert.match(code(read('src/features/me/JourneyGrid.tsx')), /import \{ JOURNEY_WRITE \} from '\.\/tabs';/, 'only JOURNEY_WRITE, never the list of tabs');
  for (const f of PROFILE_FILES) assert.doesNotMatch(code(read(f)), /\bJOURNEY_WRITE\b|\bME_TABS\b|\bWriteCard\b/, `${f}: no tabs of Me and no write card`);
});

check('NOTES, PLAN, HEALTH: the profile asks for none of their tables or columns, and draws no tab, no label and no control named after them', () => {
  const tables = /\b(journey_days|journey_private|health_daily|health_workouts|wearable_connections|wearable_credentials|user_stamps|credential_number)\b|\.from\('(journeys|tracks|diary)'\)/;
  const names = /\b(useDiary|DiaryEntry|NotesTab|NoteRow|PlanTracker|planProgress|Health|SubTabs|ME_TABS|usePlan|useHealth|wearable\w*)\b/;
  for (const f of PROFILE_FILES) {
    const src = code(read(f));
    assert.doesNotMatch(src, tables, `${f} names a table or a column that is private`);
    assert.doesNotMatch(src, names, `${f} uses something of the diary, the plan or the health`);
    assert.doesNotMatch(src, /['"`](Notes?|Plan|Health|Diary)['"`]/, `${f} has a label or a tab named Notes, Plan, Health or Diary`);
    assert.doesNotMatch(src, />\s*(Notes?|Plan|Health|Diary)\s*</, `${f} has a text named Notes, Plan, Health or Diary`);
  }
  assert.doesNotMatch(code(read(SCREEN)), /\btablist\b|role=["']tab["']|accessibilityRole="tab"/, 'the profile has no strip of tabs: the journey is one section');
});

check('the data: three small reads under the row level security that is already there, and exactly these columns', () => {
  const api = code(read(`${FEATURE}/api.ts`));
  assert.deepEqual([...api.matchAll(/\.from\('(\w+)'\)/g)].map((m) => m[1]).sort(), ['friendships', 'posts', 'profiles'], 'the tables it reads');
  assert.doesNotMatch(api, /\.rpc\(|\.storage\b|\.insert\(|\.update\(|\.upsert\(|\.delete\(/, 'it only reads, and asks no function of the database');
  const cols = (name: string) => new RegExp(`${name} = '([^']+)'`).exec(api)?.[1].split(',').map((c) => c.trim());
  assert.deepEqual(cols('PILGRIM_COLS'), ['id', 'username', 'display_name', 'bio', 'avatar_url', 'is_private', 'km_walked', 'posts_count', 'stamps_count']);
  assert.deepEqual(cols('FRIENDSHIP_COLS'), ['status', 'requested_by']);
  assert.deepEqual(cols('JOURNEY_COLS'), ['id', 'body', 'place_name', 'published_at', 'like_count', 'comment_count', 'media_count']);
  // what a post carries that is not the pilgrim's to show here: where it was written, the day of the plan it belongs to, the health they shared
  for (const secret of ['health_summary', 'location', 'journey_id', 'journey_day_id', 'notes', 'cover_url', 'home_country', 'xp', 'languages', 'followers_count', 'following_count']) {
    for (const list of ['PILGRIM_COLS', 'FRIENDSHIP_COLS', 'JOURNEY_COLS']) assert.ok(!(cols(list) ?? []).includes(secret), `${list} asks for ${secret}`);
  }
  assert.match(api, /\.eq\('user_id', id\)[\s\S]*\.eq\('status', 'published'\)[\s\S]*\.neq\('kind', 'story'\)[\s\S]*\.is\('deleted_at', null\)/, 'published posts of that pilgrim, no stories, none deleted; who may see them is the database\'s answer');
  assert.match(api, /health_summary: null, author_id: id/, 'the health summary of a post is never read, and each post says whose it is');
  assert.doesNotMatch(api, /\bnot_?friends?\b|visibility/, 'the app never decides who may see a post: the policy does');
});

check('nothing is sent: no note, and no word of theirs, leaves the app from the profile', () => {
  for (const f of PROFILE_FILES) {
    const src = code(read(f));
    assert.doesNotMatch(src, /\bShare\b|\bfetch\(|XMLHttpRequest|WebSocket|uploadPostMedia|\.storage\b/, `${f} shares or uploads something`);
  }
  // the share button of the viewer on somebody else's post sends the invitation, never their words, and counts nothing
  const rail = code(read('src/features/me/usePostRail.ts'));
  assert.match(rail, /if \(post\.author_id && post\.author_id !== uid\) \{\s*const sent = await shareAndRecord\(\{ share: \(\) => Share\.share\(\{ message: SHARE_APP \}\) \}\);/, 'the invitation, with no record');
  assert.ok(rail.indexOf('post.author_id') < rail.indexOf('shareMessage(post, sample)'), 'the rule comes before the words of the post are put on the sheet');
  assert.match(code(read(`${FEATURE}/api.ts`)), /author_id: id/);
  assert.match(code(read('src/lib/api.ts')), /author_id\?: string/, 'the post type has the field, and it is optional: your own posts have none');
});

check('the journey view is the grid of Me without the card that writes a post: another pilgrim\'s grid has no write card', () => {
  const grid = code(read('src/features/me/JourneyGrid.tsx'));
  assert.match(grid, /allowWrite = !owner/, 'a grid with an owner has no card, unless it is told otherwise');
  assert.match(grid, /const cells = allowWrite \? rows : withoutCard\(rows\);/);
  assert.doesNotMatch(code(read(`${FEATURE}/JourneyPanel.tsx`)), /allowWrite/, 'the profile never asks for the card');
  assert.match(code(read(`${FEATURE}/JourneyPanel.tsx`)), /<JourneyGrid posts=\{j\.posts\} media=\{media\} owner=\{owner\} onOpenPilgrim=\{onOpenPilgrim\} \/>/);
});

check('every way in goes through the one address, and the screen is a route of the app', () => {
  const logic = code(read(`${FEATURE}/logic.ts`));
  assert.match(logic, /export const pilgrimHref = \(id: string\) => `\/pilgrim\/\$\{id\}`;/);
  const entries = ['app/friends.tsx', 'app/chat/[id].tsx', 'src/features/me/JourneyGrid.tsx', SCREEN];
  for (const f of entries) {
    const src = code(read(f));
    assert.match(src, /import \{[^}]*\bpilgrimHref\b[^}]*\} from '@\/features\/pilgrim\/logic';/, `${f} uses pilgrimHref`);
    assert.doesNotMatch(src, /['"`]\/pilgrim\//, `${f} writes the address by hand`);
  }
  assert.match(code(read('app/_layout.tsx')), /<Stack\.Screen name="pilgrim\/\[id\]" \/>/, 'the route is declared, for signed-in pilgrims with a journey only');
  const protectedBlock = read('app/_layout.tsx').split('<Stack.Protected guard={onboarded}>')[1] ?? '';
  assert.match(protectedBlock, /<Stack\.Screen name="pilgrim\/\[id\]" \/>/, 'inside the guard of the signed-in pilgrim with a journey');
});

check('the entry points: the friends list rows open the profile (the round chat button still opens the chat), the name of a direct chat opens it, a comment author opens it', () => {
  const friends = code(read('app/friends.tsx'));
  assert.equal([...friends.matchAll(/onPress=\{\(\) => openProfile\(/g)].length, 4, 'a friend, a request received, a request sent, a search result');
  assert.match(friends, /<RoundBtn icon="chat" label=\{`Message \$\{name\}`\} onPress=\{\(\) => openChat\(f\.id\)\}/, 'the round button is the way to the chat');
  assert.match(friends, /<MoreBtn name=\{name\} onPress=\{\(\) => friendMenu\(f\)\} \/>/, 'and the three dots stay');
  const chat = code(read('app/chat/[id].tsx'));
  assert.match(chat, /const peerId = conv && !group \? conv\.peer_id : null;/, 'only a direct chat has a pilgrim behind its name');
  assert.match(chat, /onPress=\{\(\) => router\.push\(peerId \? pilgrimHref\(peerId\) : `\/chat\/info\/\$\{id\}`\)\}/, 'a group still opens its info');
  assert.match(chat, /<IconButton name="info" label="Chat info" onPress=\{\(\) => router\.push\(`\/chat\/info\/\$\{id\}`\)\} \/>/, 'the settings of the chat keep their own button');
  const sheet = code(read('src/components/CommentsSheet.tsx'));
  assert.match(sheet, /!!onOpenAuthor && !!cm\.userId && !cm\.mine && !cm\.pending/, 'a name of somebody else, on a comment that knows who wrote it and is not still being sent');
  assert.match(code(read('src/features/me/JourneyGrid.tsx')), /<CommentsSheet \{\.\.\.rail\.sheet\} onOpenAuthor=\{onOpenPilgrim\} \/>/);
  assert.match(code(read('src/lib/postComments.ts')), /userId: c\.user_id/, 'the comment carries who wrote it');
});

console.log(`${n} of ${n} passed`);
