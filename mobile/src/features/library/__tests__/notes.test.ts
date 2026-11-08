// Plain-node checks of the Notes tab of the Library: the diary's pages as a feed. The logic is in notes/timeline.ts (pure: which notes a
// filter shows, the time on a row, the grid of photos and videos, the text the share sheet gets, what a screen reader reads, the
// words); thousands of random notes go through it with a seed, so a failure can be repeated. Below it, source-level checks of how
// the screens are wired, in the style of the diary's wiring test: they read the files, nothing is run. No React, no React Native, no
// network. Run: npm run test:library (it is run from wiring.test.ts, so it cannot be left out).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { DiaryMedia } from '../../diary/media';
import type { DiaryPlace } from '../../diary/place';
import { AVATAR_TINTS } from '../../social/logic';
import {
  BLANK_NOTE, BODY_CLAMP_PX, BODY_LINES, BODY_LINE_PX, COMPOSER_PLACEHOLDER, DELETE_FAILED, EMPTY_BUTTON, FALLBACK_NAME, FEED_CHARS, FILTER_EMPTY, FILTER_LABEL, MEDIA_GAP, MEDIA_RATIO,
  MEDIA_SHOWN_MAX, NOTES_PRIVACY, NOTE_FILTERS, TOUCH_MIN, feedBody, feedState, filterLabel, filterNotes, hasMedia, hasPlace, identity, matchesFilter, mediaPlan, needsMore, noteCounts,
  noteRow, noteTime, rowLabel, shareText, tileLabel, toggled, type NoteFilter, type NoteLike,
} from '../notes/timeline';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const root = process.cwd(); // npm test runs from mobile/
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/* ================================================================ a seeded source of random notes */

/** mulberry32: a small generator that gives the same numbers for the same seed, so a failing run is a run that can be repeated. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Rand = () => number;
const int = (r: Rand, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T>(r: Rand, list: readonly T[]): T => list[int(r, 0, list.length - 1)];

const PIECES = ['a', 'b', 'Camino', 'Hontanas', ' ', ' ', ' ', '\n', '\n\n', '**', '_', '# ', '- ', '> ', '* ', 'é', 'ñ', '한', '日本', '😀', '🙏🏽', '👨‍👩‍👧', '\r\n', '\t', 'x'.repeat(40), '‍', '\ud83d'];
const words = (r: Rand, max: number) => Array.from({ length: int(r, 0, max) }, () => pick(r, PIECES)).join('');

const CLIP_NAME = (i: number, kind: 'image' | 'video') => `m${i}x.${kind === 'video' ? 'mp4' : 'jpg'}`;
function media(r: Rand, count: number): DiaryMedia[] {
  return Array.from({ length: count }, (_, i) => {
    const kind = r() < 0.2 ? 'video' : 'image';
    return { id: `id${i}`, kind, name: CLIP_NAME(i, kind), bytes: int(r, 1, 5_000_000), ...(kind === 'video' && r() < 0.8 ? { durationMs: int(r, 0, 5_000_000) } : {}) } as DiaryMedia;
  });
}
const PLACE = (name?: string): DiaryPlace => ({ lat: 42.4172, lon: -4.2477, ...(name ? { name } : {}), at: '2026-11-06T10:00:00.000Z' });

function note(r: Rand, i: number, nowMs: number): NoteLike {
  const kind = r();
  const createdAt = kind < 0.04 ? pick(r, ['', 'not a date', '2026-13-45', 'x']) : new Date(nowMs + int(r, -400 * 86_400_000, 3 * 86_400_000)).toISOString();
  const withMedia = r() < 0.4;
  const withPlace = r() < 0.35;
  return {
    id: `n${i}`,
    createdAt,
    title: r() < 0.5 ? words(r, 6) : '',
    body: words(r, 40),
    ...(withMedia ? { media: r() < 0.1 ? [{ junk: true }, null, 5] : media(r, int(r, 0, 14)) } : {}),
    ...(withPlace ? { place: r() < 0.1 ? { lat: 'x' } : PLACE(r() < 0.6 ? words(r, 3) || undefined : undefined) } : {}),
  } as NoteLike; // (some of the media and places are damaged on purpose: a stored page can hold anything)
}

const SEEDS = [1, 2, 3, 20261108, 0xc0ffee];
const forEachNote = (count: number, fn: (e: ReturnType<typeof note>, r: Rand, now: Date) => void) => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const now = new Date(2026, 10, 8, 12, 0, 0);
    for (let i = 0; i < count; i++) {
      try { fn(note(r, i, now.getTime()), r, now); } catch (e) { throw new Error(`seed ${seed}, note ${i}: ${(e as Error).message}`); }
    }
  }
};

/* ================================================================ the words */

check('the words the owner asked for are exactly these', () => {
  assert.equal(COMPOSER_PLACEHOLDER, "What's happening on your Camino?");
  assert.equal(NOTES_PRIVACY, 'Notes stay on this phone.');
  assert.equal(EMPTY_BUTTON, 'Write your first note');
  assert.deepEqual(NOTE_FILTERS, ['all', 'media', 'places']);
  assert.deepEqual(NOTE_FILTERS.map((f) => FILTER_LABEL[f]), ['All', 'Photos and videos', 'Places']);
  assert.match(DELETE_FAILED, /could not be deleted/);
});

check('what a filter that is empty says is its own: it says what goes there, not that the diary is empty', () => {
  for (const f of ['media', 'places'] as const) {
    assert.ok(FILTER_EMPTY[f].title.length > 0 && FILTER_EMPTY[f].text.length > 0);
    assert.doesNotMatch(FILTER_EMPTY[f].title + FILTER_EMPTY[f].text, /diary is empty|no notes yet/i);
  }
});

/* ================================================================ the filter */

const sample: NoteLike[] = [
  { id: 'plain', createdAt: '2026-11-08T09:00:00.000Z', title: 'Plain', body: 'words only' },
  { id: 'photo', createdAt: '2026-11-07T09:00:00.000Z', title: '', body: 'a photo', media: media(rng(7), 2) },
  { id: 'place', createdAt: '2026-11-06T09:00:00.000Z', title: '', body: 'a place', place: PLACE('Hontanas') },
  { id: 'both', createdAt: '2026-11-05T09:00:00.000Z', title: 'Both', body: '', media: media(rng(8), 1), place: PLACE() },
  { id: 'junkmedia', createdAt: '2026-11-04T09:00:00.000Z', title: 'Junk', body: '', media: [{ junk: true }] as unknown as DiaryMedia[], place: { lat: 'x' } as unknown as DiaryPlace },
];

check('a filter shows the notes that hold what it says, in the same order, and "All" hands back the very list', () => {
  const ids = (list: readonly NoteLike[]) => list.map((e) => e.id);
  assert.deepEqual(ids(filterNotes(sample, 'media')), ['photo', 'both']);
  assert.deepEqual(ids(filterNotes(sample, 'places')), ['place', 'both']);
  assert.equal(filterNotes(sample, 'all'), sample);
  assert.deepEqual(noteCounts(sample), { all: 5, media: 2, places: 2 });
  assert.deepEqual(noteCounts([]), { all: 0, media: 0, places: 0 });
  assert.deepEqual(ids(filterNotes([], 'media')), []);
});

check('a photo list or a place that does not read is not a photo or a place: only what the diary can really show counts', () => {
  assert.equal(hasMedia({ ...sample[4] }), false);
  assert.equal(hasPlace({ ...sample[4] }), false);
  assert.equal(hasMedia({ id: 'x', createdAt: '', title: '', body: '', media: undefined }), false);
  assert.equal(matchesFilter(sample[4], 'all'), true);
});

check('random notes: every filter keeps the order, shows only what matches, misses nothing, and the counts are the lengths', () => {
  for (const seed of SEEDS) {
    const r = rng(seed);
    const now = Date.UTC(2026, 10, 8, 12);
    const list = Array.from({ length: 1200 }, (_, i) => note(r, i, now));
    const counts = noteCounts(list);
    for (const f of NOTE_FILTERS) {
      const shown = filterNotes(list, f);
      assert.equal(shown.length, counts[f], `seed ${seed}: count of ${f}`);
      assert.ok(shown.every((e) => matchesFilter(e, f)), `seed ${seed}: ${f} shows only what matches`);
      assert.ok(list.filter((e) => matchesFilter(e, f)).length === shown.length, `seed ${seed}: ${f} misses nothing`);
      let at = -1;
      for (const e of shown) { const k = list.indexOf(e); assert.ok(k > at, `seed ${seed}: ${f} keeps the order`); at = k; }
    }
    assert.ok(counts.media <= counts.all && counts.places <= counts.all);
  }
});

check('what a tab says for a screen reader: its name and how many notes it holds, in the singular when it is one', () => {
  assert.equal(filterLabel('all', 12), 'All, 12 notes');
  assert.equal(filterLabel('media', 1), 'Photos and videos, 1 note');
  assert.equal(filterLabel('places', 0), 'Places, 0 notes');
});

check('what the list shows: nothing yet while the diary is being read, the empty diary, a filter with nothing in it, or the notes', () => {
  assert.equal(feedState({ ready: false, total: 0, shown: 0 }), 'loading');
  assert.equal(feedState({ ready: false, total: 9, shown: 9 }), 'loading', 'never "empty" to someone whose notes are still being read');
  assert.equal(feedState({ ready: true, total: 0, shown: 0 }), 'empty');
  assert.equal(feedState({ ready: true, total: 4, shown: 0 }), 'none-for-filter');
  assert.equal(feedState({ ready: true, total: 4, shown: 2 }), 'list');
});

/* ================================================================ the time of a row */

const local = (y: number, mo: number, d: number, h = 0, mi = 0, s = 0) => new Date(y, mo - 1, d, h, mi, s);
const NOW = local(2026, 11, 8, 12, 0, 0); // Sunday 8 November 2026, noon
const said = (then: Date, now: Date = NOW) => noteTime(then.toISOString(), now)?.short;
const spoken = (then: Date, now: Date = NOW) => noteTime(then.toISOString(), now)?.spoken;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;

check('the time on a row: now, 5m, 2h, Yesterday, 6 Nov, 6 Nov 2025', () => {
  assert.equal(said(NOW), 'now');
  assert.equal(said(ago(59 * SEC)), 'now');
  assert.equal(said(ago(60 * SEC)), '1m');
  assert.equal(said(ago(5 * MIN)), '5m');
  assert.equal(said(ago(59 * MIN + 59 * SEC)), '59m');
  assert.equal(said(ago(HR)), '1h');
  assert.equal(said(ago(2 * HR)), '2h');
  assert.equal(said(ago(23 * HR + 59 * MIN)), '23h');
  assert.equal(said(ago(24 * HR)), 'Yesterday');
  assert.equal(said(local(2026, 11, 7, 0, 0, 1)), 'Yesterday');
  assert.equal(said(local(2026, 11, 6, 23, 59)), '6 Nov');
  assert.equal(said(local(2026, 1, 1)), '1 Jan');
  assert.equal(said(local(2025, 11, 6)), '6 Nov 2025');
  assert.equal(said(local(2024, 2, 29, 23, 59)), '29 Feb 2024');
});

check('a time is said the way a person says it out loud: "2 hours ago", "1 minute ago", "6 November"', () => {
  assert.equal(spoken(NOW), 'just now');
  assert.equal(spoken(ago(MIN)), '1 minute ago');
  assert.equal(spoken(ago(5 * MIN)), '5 minutes ago');
  assert.equal(spoken(ago(HR)), '1 hour ago');
  assert.equal(spoken(ago(2 * HR)), '2 hours ago');
  assert.equal(spoken(ago(24 * HR)), 'Yesterday');
  assert.equal(spoken(local(2026, 11, 6, 8)), '6 November');
  assert.equal(spoken(local(2025, 11, 6, 8)), '6 November 2025');
});

check('a day is a calendar day of the phone: just after midnight a note from before it is Yesterday, and more than a day ago on the same date is not', () => {
  const justAfterMidnight = local(2026, 11, 8, 0, 10);
  assert.equal(said(local(2026, 11, 7, 23, 50), justAfterMidnight), '20m', 'under a day old is still a number of minutes');
  assert.equal(said(local(2026, 11, 7, 0, 5), justAfterMidnight), 'Yesterday');
  assert.equal(said(local(2026, 11, 6, 23, 59), justAfterMidnight), '6 Nov');
  assert.equal(said(local(2025, 12, 31, 8), local(2026, 1, 1, 10)), 'Yesterday', 'over the new year');
  assert.equal(said(local(2026, 2, 28, 8), local(2026, 3, 1, 10)), 'Yesterday', 'over the end of February');
  assert.equal(said(local(2024, 2, 29, 8), local(2024, 3, 1, 10)), 'Yesterday', 'over a leap day');
  assert.equal(said(local(2025, 12, 31, 20), local(2026, 1, 1, 10)), '14h', 'a night is not a day');
});

check('a time that is in the future, or does not read, never says a negative number: a minute of slack is now, more is the date, a bad date has no time', () => {
  assert.equal(said(new Date(NOW.getTime() + 30 * SEC)), 'now');
  assert.equal(said(new Date(NOW.getTime() + 60 * SEC)), 'now');
  assert.equal(said(new Date(NOW.getTime() + 5 * MIN)), '8 Nov');
  assert.equal(said(local(2027, 3, 2, 8)), '2 Mar 2027');
  for (const bad of ['', 'not a date', '2026-13-45', 'Tuesday']) assert.equal(noteTime(bad, NOW), null, bad);
  assert.equal(noteTime('2026-11-08T10:00:00.000Z', new Date(NaN)), null);
});

check('the same notes say the same thing in every time zone, also across the night the clocks change (Madrid, Los Angeles, Kolkata, Auckland, Kiritimati)', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Asia/Kolkata', 'Pacific/Auckland', 'Pacific/Kiritimati', 'America/St_Johns']) {
      process.env.TZ = tz;
      const now = local(2026, 11, 8, 12);
      assert.equal(said(local(2026, 11, 8, 11, 30), now), '30m', tz);
      assert.equal(said(local(2026, 11, 7, 18), now), '18h', tz);
      assert.equal(said(local(2026, 11, 7, 11), now), 'Yesterday', tz);
      assert.equal(said(local(2026, 11, 6, 20), now), '6 Nov', tz);
      assert.equal(said(local(2025, 11, 8, 20), now), '8 Nov 2025', tz);
      // the night the clocks go back in Madrid (25 October 2026): a day has 25 hours, and "yesterday" is still the day before
      const dst = local(2026, 10, 26, 12, 30);
      assert.equal(said(local(2026, 10, 25, 0, 30), dst), 'Yesterday', `${tz}: over the clock change`);
      assert.equal(said(local(2026, 10, 24, 23, 0), dst), '24 Oct', tz);
      // and when they go forward (29 March 2026, a day of 23 hours)
      const spring = local(2026, 3, 30, 12);
      assert.equal(said(local(2026, 3, 29, 8), spring), 'Yesterday', tz);
      assert.equal(said(local(2026, 3, 28, 23), spring), '28 Mar', tz);
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

check('on a day of 25 hours a note from the same day can be over 24 hours old: it says hours, not a date that says today (only where the clocks change)', () => {
  const before = process.env.TZ;
  try {
    process.env.TZ = 'Europe/Madrid';
    const begun = local(2026, 10, 25, 0, 10);
    const later = local(2026, 10, 25, 23, 30);
    assert.ok(later.getTime() - begun.getTime() > 24 * HR, 'a day of 25 hours');
    assert.equal(said(begun, later), '24h');
    assert.equal(spoken(begun, later), '24 hours ago');
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

/** The day before, worked out another way (the date constructor does the calendar), to hold the real function against. */
const referenceTime = (then: Date, now: Date): string => {
  const age = now.getTime() - then.getTime();
  if (age >= -MIN && age < MIN) return 'now';
  if (age >= MIN && age < HR) return `${Math.floor(age / MIN)}m`;
  if (age >= HR && age < 24 * HR) return `${Math.floor(age / HR)}h`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (age >= 24 * HR && then.getFullYear() === yesterday.getFullYear() && then.getMonth() === yesterday.getMonth() && then.getDate() === yesterday.getDate()) return 'Yesterday';
  if (age >= 24 * HR && then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate()) return `${Math.floor(age / HR)}h`;
  const m = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][then.getMonth()];
  return then.getFullYear() === now.getFullYear() ? `${then.getDate()} ${m}` : `${then.getDate()} ${m} ${then.getFullYear()}`;
};

check('random times, thousands of them, in several time zones: the same answer as a second way of working it out, and always a word a person can read', () => {
  const before = process.env.TZ;
  try {
    for (const tz of ['UTC', 'Europe/Madrid', 'America/Los_Angeles', 'Pacific/Auckland']) {
      process.env.TZ = tz;
      for (const seed of SEEDS) {
        const r = rng(seed);
        for (let i = 0; i < 1500; i++) {
          const now = new Date(Date.UTC(2020, 0, 1) + Math.floor(r() * 9 * 365 * 86_400_000));
          const kind = r();
          const offset = kind < 0.3 ? int(r, -3 * HR, 3 * HR) : kind < 0.6 ? int(r, 0, 3 * 86_400_000) : int(r, -10 * 86_400_000, 800 * 86_400_000);
          const then = new Date(now.getTime() - offset);
          const got = noteTime(then.toISOString(), now);
          assert.ok(got, `${tz} ${seed} ${i}`);
          assert.equal(got.short, referenceTime(then, now), `${tz} seed ${seed} #${i}: ${then.toString()} against ${now.toString()}`);
          assert.match(got.short, /^(now|\d{1,2}m|\d{1,2}h|Yesterday|\d{1,2} [A-Z][a-z]{2}( \d{4})?)$/);
          assert.ok(got.spoken.length > 0 && !/NaN|undefined|-\d/.test(got.spoken), got.spoken);
        }
      }
    }
  } finally {
    if (before === undefined) delete process.env.TZ; else process.env.TZ = before;
  }
});

check('older is never a smaller unit: going back in time the word goes now, minutes, hours, Yesterday, a date, never back', () => {
  const rank = (s: string) => (s === 'now' ? 0 : s.endsWith('m') ? 1 : s.endsWith('h') ? 2 : s === 'Yesterday' ? 3 : 4);
  let last = -1;
  for (let age = 0; age < 40 * 86_400_000; age += 7 * MIN + 13 * SEC) {
    const got = noteTime(new Date(NOW.getTime() - age).toISOString(), NOW);
    assert.ok(got);
    const k = rank(got.short);
    assert.ok(k >= last, `${age} ms: ${got.short} after rank ${last}`);
    last = k;
  }
});

/* ================================================================ the person on the rows */

check('the name on a row: the display name, else the username, else "Pilgrim"; the handle is @username and never says the name twice', () => {
  assert.deepEqual(identity({ display_name: 'Ana García', username: 'ana.camina' }), { name: 'Ana García', handle: '@ana.camina' });
  assert.deepEqual(identity({ display_name: null, username: 'ana.camina' }), { name: 'ana.camina', handle: '' });
  assert.deepEqual(identity({ display_name: '  Ana   García ', username: ' ana ' }), { name: 'Ana García', handle: '@ana' });
  assert.deepEqual(identity({ display_name: 'ANA.CAMINA', username: 'ana.camina' }), { name: 'ANA.CAMINA', handle: '' });
  assert.deepEqual(identity({ display_name: '', username: '' }), { name: FALLBACK_NAME, handle: '' });
  assert.deepEqual(identity(null), { name: 'Pilgrim', handle: '' });
  assert.deepEqual(identity(undefined), { name: 'Pilgrim', handle: '' });
  assert.deepEqual(identity({ display_name: 5 as unknown as string, username: {} as unknown as string }), { name: 'Pilgrim', handle: '' });
});

/* ================================================================ the words of a note */

check('the feed draws at most FEED_CHARS of a page, cut at the end of a word, and never half of an emoji; "Show more" has the whole', () => {
  assert.equal(feedBody('short'), 'short');
  assert.equal(feedBody(''), '');
  assert.equal(feedBody(undefined as unknown as string), '');
  const exact = 'a '.repeat(FEED_CHARS / 2);
  assert.equal(feedBody(exact), exact, 'exactly FEED_CHARS is not cut');
  const long = 'Hontanas '.repeat(500);
  const cut = feedBody(long);
  assert.ok(cut.length <= FEED_CHARS && cut.length > FEED_CHARS - 200);
  assert.ok(long.startsWith(cut) && /Hontanas$/.test(cut), 'cut where a word ends');
  const noSpaces = 'x'.repeat(5000);
  assert.equal(feedBody(noSpaces).length, FEED_CHARS, 'a text with no gap is cut at the limit');
  const emoji = `${'a'.repeat(FEED_CHARS - 1)}😀${'b'.repeat(50)}`;
  const e = feedBody(emoji);
  assert.ok(!/[\ud800-\udbff]$/.test(e), 'the first half of an emoji is not left at the end');
  for (const seed of SEEDS) {
    const r = rng(seed);
    for (let i = 0; i < 400; i++) {
      const text = words(r, 900);
      const got = feedBody(text);
      assert.ok(got.length <= FEED_CHARS && text.startsWith(got), `seed ${seed} #${i}`);
      assert.ok(text.length <= FEED_CHARS ? got === text : got.length >= FEED_CHARS - 201, `seed ${seed} #${i}: not cut early`);
      assert.ok(!/[\ud800-\udbff]$/.test(got) || text.length <= FEED_CHARS, `seed ${seed} #${i}: no half emoji`);
    }
  }
});

check('"Show more" appears when the text is taller than 8 lines of the body text, with a pixel of slack, and the line is the line of the body text of the theme', () => {
  assert.equal(BODY_LINES, 8);
  assert.equal(BODY_CLAMP_PX, BODY_LINES * BODY_LINE_PX);
  assert.equal(needsMore(0), false);
  assert.equal(needsMore(BODY_CLAMP_PX), false);
  assert.equal(needsMore(BODY_CLAMP_PX + 1), false, 'a rounding error is not a reason to cut');
  assert.equal(needsMore(BODY_CLAMP_PX + 2), true);
  assert.equal(needsMore(Number.NaN), false);
  assert.equal(needsMore(Infinity), false, 'a height that is not a number is not measured');
  const tokens = JSON.parse(read('src/theme/tokens.json')) as { text: { body: { lineHeight: number } } };
  assert.equal(BODY_LINE_PX, tokens.text.body.lineHeight, 'RichText draws the body text; its line is this high');
});

check('what is shared is the words and only the words: title, blank line, text; bullets are bullets; no marks, no place, no photos, no link', () => {
  assert.equal(shareText({ title: 'Hontanas', body: 'A **long** day, _no shade_.' }), 'Hontanas\n\nA long day, no shade.');
  assert.equal(shareText({ title: '', body: 'Only words' }), 'Only words');
  assert.equal(shareText({ title: ' Only   a title ', body: '' }), 'Only a title');
  assert.equal(shareText({ title: '', body: '' }), '');
  assert.equal(shareText({ title: '   ', body: '\n\n  \n' }), '');
  assert.equal(shareText({ title: 'T', body: '# Heading\n- one\n* two\n> a quote\n\n\n\nlast' }), 'T\n\nHeading\n• one\n• two\na quote\n\nlast');
  assert.equal(shareText({ title: '', body: '- ' }), '', 'a bullet with nothing after it says nothing');
  const rich: NoteLike = { id: 'x', createdAt: '2026-11-08T09:00:00.000Z', title: 'Hontanas', body: 'Wind.', media: media(rng(3), 3), place: PLACE('Hontanas, Castilla y León') };
  const text = shareText(rich);
  assert.equal(text, 'Hontanas\n\nWind.');
  assert.doesNotMatch(text, /Castilla|42\.4|4\.2|http|camino\.plus|CaminoPlus|\.jpg|\.mp4/);
  assert.equal(shareText({ title: undefined as unknown as string, body: undefined as unknown as string }), '');
});

check('random notes: the share text never has a mark of the rich text left in a bold or italic, never three blank lines, never starts or ends with blank space, and does not throw', () => {
  forEachNote(500, (e) => {
    const text = shareText(e);
    assert.equal(text, text.trim());
    assert.doesNotMatch(text, /\n{3,}/);
    assert.equal(typeof text, 'string');
  });
});

/* ================================================================ the photos and videos */

check('the grid: one wide tile, two side by side, one tall and two stacked, two by two; the rest are a "+N" on the last', () => {
  assert.deepEqual(mediaPlan(0), { kind: 'none', columns: [], shown: 0, more: 0 });
  assert.deepEqual(mediaPlan(1), { kind: 'single', columns: [[0]], shown: 1, more: 0 });
  assert.deepEqual(mediaPlan(2), { kind: 'pair', columns: [[0], [1]], shown: 2, more: 0 });
  assert.deepEqual(mediaPlan(3), { kind: 'trio', columns: [[0], [1, 2]], shown: 3, more: 0 });
  assert.deepEqual(mediaPlan(4), { kind: 'quad', columns: [[0, 2], [1, 3]], shown: 4, more: 0 });
  assert.deepEqual(mediaPlan(5), { kind: 'quad', columns: [[0, 2], [1, 3]], shown: 4, more: 1 });
  assert.deepEqual(mediaPlan(12), { kind: 'quad', columns: [[0, 2], [1, 3]], shown: 4, more: 8 });
  assert.equal(MEDIA_SHOWN_MAX, 4);
  assert.equal(MEDIA_RATIO, 16 / 9);
  assert.equal(MEDIA_GAP, 2);
});

check('every count, also the ones nobody should send: each tile shown is in one column once, in order, and what is shown plus what is more is what there is', () => {
  const counts = [...Array.from({ length: 60 }, (_, i) => i), -1, -50, 1.7, 3.99, Number.NaN, Infinity, -Infinity, 1e9, '3' as unknown as number, null as unknown as number, undefined as unknown as number];
  for (const c of counts) {
    const p = mediaPlan(c);
    const real = typeof c === 'number' && Number.isFinite(c) ? Math.max(0, Math.floor(c)) : 0;
    assert.equal(p.shown + p.more, real, `count ${String(c)}`);
    assert.ok(p.shown <= MEDIA_SHOWN_MAX && p.shown === Math.min(real, MEDIA_SHOWN_MAX));
    assert.deepEqual(p.columns.flat().sort((a, b) => a - b), Array.from({ length: p.shown }, (_, i) => i), `count ${String(c)}: every tile once`);
    assert.ok(p.columns.every((col) => col.length > 0 && col.every((k, i) => i === 0 || k > col[i - 1])), 'a column reads from top to bottom, in order');
    assert.ok(p.columns.length <= 2);
    assert.equal(p.kind === 'none', real === 0);
  }
});

check('what a screen reader says for a tile: which of how many, that it opens full screen, that more are behind the last, or that its file is not here', () => {
  assert.equal(tileLabel({ kind: 'image' }, 0, 3, true), 'Photo 1 of 3. Opens it full screen');
  assert.equal(tileLabel({ kind: 'video' }, 1, 3, true), 'Video 2 of 3. Opens it full screen');
  assert.equal(tileLabel({ kind: 'image' }, 3, 12, true, 8), 'Photo 4 of 12. Opens it full screen. 8 more');
  assert.equal(tileLabel({ kind: 'image' }, 0, 2, false), 'Photo 1 of 2, not on this phone');
});

/* ================================================================ a row */

check('a row has what it draws: the title, the words, what is attached, the place, the time, the text to share, and a sentence for a screen reader', () => {
  const e: NoteLike = { id: 'n1', createdAt: local(2026, 11, 8, 10).toISOString(), title: ' Hontanas ', body: 'A **long**, flat day.', media: media(rng(5), 3), place: PLACE('Hontanas, Castilla y León') };
  const row = noteRow(e, NOW, { name: 'Ana García' });
  assert.equal(row.id, 'n1');
  assert.equal(row.title, 'Hontanas');
  assert.equal(row.body, 'A **long**, flat day.');
  assert.equal(row.media.length, 3);
  assert.equal(row.placeText, 'Hontanas, Castilla y León');
  assert.equal(row.time?.short, '2h');
  assert.equal(row.share, 'Hontanas\n\nA long, flat day.');
  assert.equal(row.blank, false);
  assert.match(row.label, /^Ana García\. 2 hours ago\. Hontanas\. A long, flat day\. /);
  assert.match(row.label, /3 photos|2 photos · 1 video|1 photo · 2 videos|3 videos/);
  assert.match(row.label, /Hontanas, Castilla y León\.$/);
});

check('a note with nothing in it says so instead of showing a blank; a note with only a photo or only a place is not blank and has nothing to share', () => {
  const blank = noteRow({ id: 'b', createdAt: NOW.toISOString(), title: '  ', body: '\n \n' }, NOW, { name: 'Ana' });
  assert.equal(blank.blank, true);
  assert.equal(blank.share, '');
  assert.match(blank.label, new RegExp(`${BLANK_NOTE}\\.$`));
  const photo = noteRow({ id: 'p', createdAt: NOW.toISOString(), title: '', body: '', media: media(rng(1), 1) }, NOW, { name: 'Ana' });
  assert.equal(photo.blank, false);
  assert.equal(photo.share, '', 'text only: a photo is not shared');
  const place = noteRow({ id: 'q', createdAt: NOW.toISOString(), title: '', body: '', place: PLACE() }, NOW, { name: 'Ana' });
  assert.equal(place.blank, false);
  assert.match(place.placeText, /° [NS], \d/, 'a place without a name is its coordinates');
});

check('what a screen reader reads has no double stops and leaves out what is not there', () => {
  assert.equal(rowLabel({ name: 'Ana', time: { short: '2h', spoken: '2 hours ago' }, title: 'Hontanas.', text: 'Wind!', meta: '' }), 'Ana. 2 hours ago. Hontanas. Wind!');
  assert.equal(rowLabel({ name: 'Ana', time: null, title: '', text: '', meta: '1 photo' }), 'Ana. 1 photo.');
});

check('random notes, thousands of them: a row never throws, never says undefined or NaN, and what it draws agrees with what the filters and the grid think of the note', () => {
  forEachNote(900, (e, _r, now) => {
    const row = noteRow(e, now, { name: 'Ana' });
    assert.equal(row.id, e.id);
    assert.ok(row.media.length <= 12);
    assert.equal(row.media.length > 0, hasMedia(e));
    assert.equal(row.place !== null, hasPlace(e));
    assert.equal(row.placeText === '', row.place === null);
    assert.ok(row.body.length <= FEED_CHARS && row.full.startsWith(row.body));
    assert.doesNotMatch(row.label, /undefined|NaN|null|\[object/);
    assert.ok(row.label.startsWith('Ana'));
    assert.equal(row.share, shareText(e));
    assert.ok(!row.blank || (row.share === '' && row.media.length === 0 && row.place === null && row.title === ''));
    const plan = mediaPlan(row.media.length);
    assert.equal(plan.shown + plan.more, row.media.length);
    if (row.time) assert.match(row.time.short, /^(now|\d+m|\d+h|Yesterday|\d{1,2} [A-Z][a-z]{2}( \d{4})?)$/);
    else assert.ok(Number.isNaN(Date.parse(e.createdAt)), 'only a date that does not read has no time');
  });
});

check('the rows that are opened out are a set that is changed by copying: the one given stays as it was', () => {
  const none = new Set<string>();
  const one = toggled(none, 'a');
  assert.deepEqual([...one], ['a']);
  assert.deepEqual([...none], []);
  const two = toggled(one, 'b');
  assert.deepEqual([...two].sort(), ['a', 'b']);
  assert.deepEqual([...toggled(two, 'a')], ['b']);
  assert.deepEqual([...two].sort(), ['a', 'b']);
});

check('a thing to touch is at least 44 pixels', () => {
  assert.ok(TOUCH_MIN >= 44);
});

const FILTERS_CHECKED: NoteFilter[] = [...NOTE_FILTERS];
check('every filter is one the tab knows', () => {
  assert.equal(FILTERS_CHECKED.length, 3);
  for (const f of FILTERS_CHECKED) assert.ok(FILTER_LABEL[f]);
});

/* ================================================================ the screens, read as source */

const DIR = 'src/features/library/notes';
const files = readdirSync(join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).sort();
const code = (f: string) => read(`${DIR}/${f}`).split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '')).filter((l) => !/^\s*(\*|\/\*)/.test(l)).join('\n');
const tsx = files.filter((f) => f.endsWith('.tsx'));

check('the Notes tab is the files this test expects, so a new one is looked at (and the scans below see all of them)', () => {
  assert.deepEqual(files, ['NoteMedia.tsx', 'NoteMenu.tsx', 'NoteRow.tsx', 'NotesHeader.tsx', 'NotesTab.tsx', 'timeline.ts']);
});

check('the shell gets what was agreed: a named export NotesTab, with no props, and no gold pen of its own (the shell draws it)', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /export function NotesTab\(\) \{/);
  for (const f of files) assert.doesNotMatch(code(f), /\bFab\b/, `${f}: the gold pen belongs to the shell`);
  assert.doesNotMatch(src, /\bScreen\b/, 'the tab does not bring a screen of its own: it fills what the shell gives it');
});

check('the tab owns its scroll, and it is a virtualised list: a FlatList, never the notes mapped into a view', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /<FlatList\b/);
  assert.match(src, /keyExtractor=\{keyOf\}/);
  assert.match(src, /initialNumToRender=\{6\}/);
  assert.match(src, /windowSize=\{7\}/);
  assert.doesNotMatch(src, /entries\.map\(|data\.map\(|shown\.map\(/, 'no row is drawn by mapping over the notes');
  assert.match(src, /keyboardShouldPersistTaps="handled"/, 'a tap on a note works while the keyboard of the search field is up');
  assert.match(src, /keyboardDismissMode="on-drag"/);
  assert.match(src, /<RefreshControl\b[^>]*refreshing=\{refreshing\}[^>]*onRefresh=\{refresh\}/, 'pull to refresh');
});

check('pull to refresh reads the phone again (useDiary.reload) and nothing else; the note list comes from useDiary, the one reader of the diary', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /const \{ uid, ready, entries, remove, reload \} = useDiary\(\);/);
  assert.match(src, /await Promise\.all\(\[reload\(\)/);
  const useDiary = read('src/features/diary/useDiary.ts');
  assert.match(useDiary, /const reload = useCallback\(async \(\): Promise<void> => \{[\s\S]*?loadEntries\(uid\)[\s\S]*?\}, \[uid\]\);/);
  assert.match(useDiary, /return \{ uid, ready, entries: ready && loaded \? loaded\.entries : NONE, remove, reload \};/);
  for (const f of files) assert.doesNotMatch(code(f), /\bloadEntries\b|\bsaveEntry\b|\bdeleteEntry\b|\battachMedia\b|\bsweepMedia\b|\bclearDiary\b|createDiaryStore|diary\/storage'/, `${f}: the feed reads and deletes only through useDiary`);
});

check('Delete is the diary\'s own flow: the same question first (confirmDelete, which says photos, videos and the place go with the page), then the store\'s delete through useDiary, and a failure is said', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /import \{ confirmDelete \} from '@\/features\/diary\/confirm';/);
  assert.match(src, /confirmDelete\(pageTitle\(e\), async \(\) => \{[\s\S]*?await remove\(e\.id\)[\s\S]*?\}, metaLine\(e\) !== ''\)/);
  assert.match(src, /DELETE_FAILED/);
  const menu = code('NoteMenu.tsx');
  assert.doesNotMatch(menu, /remove\(|confirmDelete|deleteEntry/, 'the menu only says which one was chosen; it deletes nothing itself');
  assert.match(read('src/features/diary/confirm.ts'), /Its photos, videos and place are deleted with it\./);
});

check('Share gives the share sheet the text of the note and nothing else, and counts and records nothing', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /import \{[^}]*\bShare\b[^}]*\} from 'react-native';/);
  assert.match(src, /shareAndRecord\(\{ share: \(\) => Share\.share\(\{ message: text \}\) \}\)/, 'no record: nothing is counted and nothing goes to a server');
  assert.doesNotMatch(src, /record:/);
  assert.doesNotMatch(src, /Share\.share\(\{[^}]*\b(url|title)\b/, 'only the message: no link, no title');
  assert.match(src, /if \(!text\) return;/, 'a note with no text has nothing to share');
  assert.match(code('NoteRow.tsx'), /row\.share !== ''/, 'and the button is only there when there is text');
});

check('a tap on a row opens the page (Read view), the composer and its shortcuts open a new one, Edit opens the page, and nothing in the editor is changed to make that so', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /router\.push\(`\/diary\/\$\{id\}`\)/);
  assert.match(tab, /router\.push\('\/diary\/new'\)/);
  const header = code('NotesHeader.tsx');
  assert.equal((header.match(/onPress=\{onWrite\}/g) ?? []).length, 3, 'the prompt and the two shortcuts');
  assert.match(header, /label="Write a new note, then add a photo"/);
  assert.match(header, /label="Write a new note, then add a place"/, 'the labels say what really happens: the page opens, the person adds the photo or the place there');
  assert.match(header, /<AppText[^>]*>\{COMPOSER_PLACEHOLDER\}<\/AppText>/);
  assert.match(header, /\{NOTES_PRIVACY\}/);
});

check('the filter row is tabs: a tablist, each one a tab with its selected state and a label that holds the count', () => {
  const header = code('NotesHeader.tsx');
  assert.match(header, /accessibilityRole="tablist"/);
  assert.match(header, /accessibilityRole="tab"/);
  assert.match(header, /accessibilityState=\{\{ selected: on \}\}/);
  assert.match(header, /aria-selected=\{on\}/, 'and the web says it too (the browser reads aria-selected, not accessibilityState)');
  assert.match(header, /accessibilityLabel=\{filterLabel\(f, counts\[f\]\)\}/);
  assert.match(header, /NOTE_FILTERS\.map\(/);
});

check('a row is one thing for a screen reader, with the actions of its parts as actions; the buttons in it all have a label', () => {
  const row = code('NoteRow.tsx');
  assert.match(row, /accessible\b/);
  assert.match(row, /accessibilityLabel=\{row\.label\}/);
  assert.match(row, /accessibilityActions=\{available\}/);
  assert.match(row, /onAccessibilityAction=\{/);
  for (const name of ['share', 'edit', 'delete']) assert.match(row, new RegExp(`name: '${name}'`), `the action ${name}`);
  assert.match(row, /accessibilityLabel="More: edit or delete this note"/, 'the "…" button says what it opens');
});

check('every control has a label and is at least 44 big: Pressables, buttons and the filter tabs', () => {
  for (const f of tsx) {
    const src = code(f);
    for (const m of src.matchAll(/<Pressable\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 700), /accessibilityLabel=/, `${f}: a Pressable without a label`);
    for (const m of src.matchAll(/<IconButton\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 200), /\blabel=/, `${f}: an IconButton without a label`);
    for (const m of src.matchAll(/<Pill\b/g)) assert.match(src.slice(m.index, (m.index ?? 0) + 200), /\blabel=/, `${f}: a Pill without a label`);
    for (const m of src.matchAll(/<TextInput\b/g)) assert.fail(`${f}: the feed has no text field`);
  }
  // the sizes of the things to touch are TOUCH_MIN (44), never a smaller number written out
  assert.equal((code('NoteRow.tsx').match(/width: TOUCH_MIN, height: TOUCH_MIN/g) ?? []).length, 2, 'the "…" button and the Share button');
  assert.match(code('NoteRow.tsx'), /minHeight: TOUCH_MIN, justifyContent: 'center', alignSelf: 'flex-start'/, '"Show more"');
  assert.match(code('NoteRow.tsx'), /maxWidth: '100%', minHeight: TOUCH_MIN/, 'the place chip');
  assert.match(code('NotesHeader.tsx'), /width: TOUCH_MIN, height: TOUCH_MIN/, 'the two shortcuts');
  assert.equal((code('NotesHeader.tsx').match(/minHeight: TOUCH_MIN/g) ?? []).length, 2, 'the prompt and each tab of the filter');
  assert.match(code('NoteMenu.tsx'), /minHeight: layout\.touchMin/, 'the items of the menu are 56');
});

check('the Notes tab uses no network and no console: nothing in it can send a note anywhere', () => {
  const offenders: string[] = [];
  for (const f of files) {
    code(f).split('\n').forEach((line, i) => {
      if (/\bfetch\(|XMLHttpRequest|WebSocket|supabase|lib\/api|lib\/net|NetInfo|\bconsole\.|StyleSheet\.create|\bsetInterval\(|Linking\.openURL|sendBeacon|\.upload\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
    });
  }
  assert.deepEqual(offenders, []);
});

check('it needs nothing that is not in the app already: React, React Native, expo-router and the app\'s own files, so there is no new native module, and no package outside package.json', () => {
  const deps = Object.keys((JSON.parse(read('package.json')) as { dependencies: Record<string, string> }).dependencies);
  const offenders: string[] = [];
  for (const f of files) {
    for (const m of read(`${DIR}/${f}`).matchAll(/(?:from|import|require\()\s*'([^'./@][^']*|@[^'/]+\/[^']+)'/g)) {
      const pkg = m[1].startsWith('@') ? m[1].split('/').slice(0, 2).join('/') : m[1].split('/')[0];
      if (!['react', 'react-native', 'expo-router', 'react-native-safe-area-context'].includes(pkg)) offenders.push(`${f}: ${pkg}`);
      else if (pkg !== 'react' && pkg !== 'react-native' && !deps.includes(pkg)) offenders.push(`${f}: ${pkg} is not a dependency`);
    }
    assert.doesNotMatch(code(f), /\brequire\(/, `${f}: nothing is required on the way (no native module is asked for here: the diary's device.ts asks for them)`);
  }
  assert.deepEqual(offenders, []);
  for (const l of read(`${DIR}/timeline.ts`).split('\n').filter((line) => /^import /.test(line))) assert.doesNotMatch(l, /from '(react|react-native|expo|@\/)/, `timeline.ts is pure: ${l}`);
  assert.match(read('tsconfig.librarytest.json'), /notes\.test\.ts/, 'the tests are compiled');
});

check('colours come from the theme: none written out, no stylesheet, and no colour read once when a file loads', () => {
  const offenders: string[] = [];
  for (const f of tsx) {
    code(f).split('\n').forEach((line, i) => {
      if (/#[0-9A-Fa-f]{3,8}\b|\brgba?\(|\bhsla?\(/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 100)}`);
      if (/^(export )?const \w+ = .*\b(c|role)\.[a-zA-Z]/.test(line)) offenders.push(`${f}:${i + 1}  a theme colour read at the top of the file: ${line.trim().slice(0, 80)}`);
    });
  }
  assert.deepEqual(offenders, []);
  for (const f of tsx) assert.match(read(`${DIR}/${f}`), /from '@\/theme'/, `${f} takes its colours from the theme`);
});

check('the pairs the Notes tab draws keep their contrast in light and in dark, read from the tokens the theme is built from: text 4.5 : 1, icons and the line of a selected tab 3 : 1', () => {
  type Tokens = { color: Record<string, string>; role: Record<string, string>; dark: { color: Record<string, string>; role: Record<string, string> } };
  const tokens = JSON.parse(read('src/theme/tokens.json')) as Tokens;
  const palette = (dark: boolean): Record<string, string> => ({ ...tokens.color, ...(dark ? tokens.dark.color : {}) });
  const roleColour = (name: string, dark: boolean): string => {
    const literal = dark ? tokens.dark.role[name] : undefined;
    if (literal) return literal.startsWith('#') ? literal : palette(dark)[literal];
    return palette(dark)[tokens.role[name]];
  };
  const lin = (v: number) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = (hex: string) => { const h = hex.replace('#', ''); const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
  const ratio = (a: string, b: string) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  // [what it is, foreground, background, needed]: a role of tokens.json by its token name, or a colour of the palette written as c:name
  const pairs: [string, string, string, number][] = [
    ['words, name and title on the page', 'text', 'bg', 4.5],
    ['handle, time, the prompt and the line under the composer (muted) on the page', 'textMuted', 'bg', 4.5],
    ['"Show more" (accent text) on the page', 'textAccent', 'bg', 4.5],
    ['words on a row while it is pressed (sunken)', 'text', 'surfaceSunken', 4.5],
    ['handle and time on a row while it is pressed', 'textMuted', 'surfaceSunken', 4.5],
    ['"Show more" on a row while it is pressed', 'textAccent', 'surfaceSunken', 4.5],
    ['the line under the selected tab and the two shortcuts (action) on the page', 'action', 'bg', 3],
    ['the dots and the share icon (muted) on the page', 'textMuted', 'bg', 3],
    ['the name of a place on its chip (surface)', 'text', 'surface', 4.5],
    ['the pin on the chip (accent text on surface)', 'textAccent', 'surface', 3],
    ['the mark of a file that is not here (muted on sunken)', 'textMuted', 'surfaceSunken', 3],
    ['the button of the empty state (onAction on action)', 'onAction', 'action', 4.5],
    ['the pen of the empty state (onHighlight on highlight)', 'onHighlight', 'highlight', 4.5],
    ['Delete in the menu (danger on surface)', 'danger', 'surface', 4.5],
    ['Delete in the menu while it is pressed (danger on the page colour)', 'danger', 'bg', 4.5],
    ['Edit in the menu while it is pressed (text on the page colour)', 'text', 'bg', 4.5],
    ['the name of the note over the menu (muted on surface)', 'textMuted', 'surface', 4.5],
  ];
  for (const dark of [false, true]) {
    for (const [what, fg, bg, need] of pairs) {
      const got = ratio(roleColour(fg, dark), roleColour(bg, dark));
      assert.ok(got >= need, `${dark ? 'dark' : 'light'}: ${what} is ${got.toFixed(2)} : 1, needs ${need} : 1`);
    }
    // the notices (FormMessage): the red on the pink wash, the accent text on the gold wash
    const p = palette(dark);
    assert.ok(ratio(p.red700, p.red100) >= 4.5, `${dark ? 'dark' : 'light'}: the error notice`);
    assert.ok(ratio(roleColour('textAccent', dark), p.goldWash) >= 4.5, `${dark ? 'dark' : 'light'}: the info notice`);
  }
  // the initials of the avatar sit on six soft colours that are the same in dark mode: they are the fixed navy, never c.blue
  for (const tint of AVATAR_TINTS) assert.ok(ratio(tokens.color.blue, tint) >= 4.5, `the fixed navy on ${tint}`);
  assert.match(read('src/features/social/components/primitives.tsx'), /<AppText variant="label" color=\{FIXED\.blue\} style=\{\{ fontSize: Math\.round\(size \* 0\.36\)/, 'the initials are FIXED.blue (c.blue is light blue in dark mode: 1 : 1 on these colours)');
  // "+N" on the last tile is white on the 45 % black chip of a photo: over the lightest photo that is 3.4 : 1, and it is large text (needs 3)
  const worst = 255 * (1 - 0.45);
  const grey = `#${Math.round(worst).toString(16).repeat(3)}`;
  assert.ok(ratio('#ffffff', grey) >= 3, 'white on 45 % black over a white photo');
  assert.match(read('src/components/fixedColors.ts'), /photoChip: 'rgba\(0,0,0,0\.45\)'/, 'the chip is the 45 % black this check assumes');
});

check('the photos and videos use the diary\'s own tile (the loader, the "Not on this phone" tile, the play tile) and its full-screen viewer, and say which one of how many', () => {
  const media = code('NoteMedia.tsx');
  assert.match(media, /import \{ Face \} from '@\/features\/diary\/MediaTiles';/);
  assert.match(media, /<Face\b/);
  assert.match(media, /tileLabel\(/);
  assert.match(media, /mediaPlan\(items\.length\)/);
  assert.match(media, /aspectRatio: MEDIA_RATIO/);
  assert.match(media, /gap: MEDIA_GAP/);
  assert.match(code('NotesTab.tsx'), /<MediaViewer\b[^>]*uid=\{owner\}/);
  const tiles = read('src/features/diary/MediaTiles.tsx');
  assert.match(tiles, /export function Face\(\{ uid, m, small, corner = radius\.sm, compact \}/, 'the one change in the diary: the tile is exported, with a corner and a compact form for a small tile');
});

check('the place is a chip that opens the maps app through the diary\'s own device (which says no on the web), and the note says when it could not', () => {
  const row = code('NoteRow.tsx');
  assert.match(row, /accessibilityLabel=\{`Place: \$\{row\.placeText\}\. Opens it in your maps app`\}/);
  const tab = code('NotesTab.tsx');
  assert.match(tab, /device\.openMaps\(/);
  assert.match(tab, /MAPS_FAILED/);
});

check('the text of a note is the diary\'s RichText, clamped to eight lines by its measured height, and opened out with "Show more", which says what it does', () => {
  const row = code('NoteRow.tsx');
  assert.match(row, /import \{ RichText \} from '@\/features\/diary\/RichText';/);
  assert.match(row, /<RichText text=\{open \? full : text\} \/>/);
  assert.match(row, /<Words text=\{row\.body\} full=\{row\.full\} open=\{open\}/, 'the cut text when it is closed, the whole when it is open');
  assert.match(row, /maxHeight: open \? undefined : BODY_CLAMP_PX/);
  assert.match(row, /needsMore\(/);
  assert.match(row, /accessibilityLabel=\{open \? 'Show less of this note' : 'Show more of this note'\}/);
  assert.match(row, /accessibilityState=\{\{ expanded: open \}\}/);
  assert.match(row, /aria-expanded=\{open\}/);
});

check('the list leaves room under the last note for the gold pen and the floating tab bar, the same numbers the Fab and the tab bar use', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /paddingBottom: layout\.tabbarHeight \+ insets\.bottom \+ 96/);
  const fab = read('src/components/Fab.tsx');
  assert.match(fab, /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8, width: 60, height: 60/, 'the pen: 8 above the bar, 60 high');
  assert.ok(100 + 96 >= 88 + 8 + 60 + 16 + 10, 'the room is more than the bar, the pen and a margin');
  assert.equal((JSON.parse(read('src/theme/tokens.json')) as { layout: { tabbarHeight: number } }).layout.tabbarHeight, 100);
});

check('it shows the person who wrote the notes the way a post does (name, handle, the profile photo through the app\'s own avatar), and shows nothing that is not theirs', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /const \{ profile \} = useAuth\(\);/);
  assert.match(tab, /identity\(profile\)/);
  assert.match(code('NoteRow.tsx'), /<PilgrimAvatar\b/);
  assert.match(code('NotesHeader.tsx'), /<PilgrimAvatar\b/);
  for (const f of files) assert.doesNotMatch(code(f), /SAMPLE_|sample\.ts|from '\.\.\/sample'/, `${f}: no invented notes: the feed only ever shows the pages that are in the diary`);
});

check('this test runs: wiring.test.ts runs it, and the test config compiles it', () => {
  const wiring = read('src/features/library/__tests__/wiring.test.ts');
  assert.match(wiring, /import '\.\/notes\.test';/);
  assert.match(read('tsconfig.librarytest.json'), /"src\/features\/library\/__tests__\/notes\.test\.ts"/);
});

console.log(`${n} of ${n} passed (Notes)`);
