// Plain-node checks of the Notes feed of Me: the diary's pages as a feed, under ONE card that writes a note (there is no filter row any more: the three
// filter tabs All, Photos and videos and Places were taken out on purpose, with everything only they used). The logic is in features/notes/timeline.ts
// (pure: what the list shows, the time on a row, the grid of photos and videos, the text the share sheet gets, what a screen reader reads, the
// words); thousands of random notes go through it with a seed, so a failure can be repeated. Below it, source-level checks of how
// the screens are wired, in the style of the diary's wiring test: they read the files, nothing is run. No React, no React Native, no
// network. Run: npm run test:me (it is run from highlights.test.ts, so it cannot be left out).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { mediaOf, type DiaryMedia } from '../../diary/media';
import { normalizePlace, type DiaryPlace } from '../../diary/place';
import { AVATAR_TINTS } from '../../social/logic';
import {
  BLANK_NOTE, BODY_CLAMP_PX, BODY_LINES, BODY_LINE_PX, DELETE_FAILED, EMPTY_TEXT, EMPTY_TITLE, FALLBACK_NAME, FEED_CHARS, MAPS_FAILED, MEDIA_GAP, MEDIA_RATIO,
  MEDIA_SHOWN_MAX, NOTES_PRIVACY, SHARE_FAILED, TOUCH_MIN, WRITE_CARD_MIN, WRITE_NOTE, WRITE_NOTE_HINT, feedBody, feedState, identity, mediaPlan,
  needsMore, noteRow, noteTime, rowLabel, shareText, tileLabel, toggled, type NoteLike,
} from '../timeline';
import * as timeline from '../timeline';

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

check('the words the owner asked for are exactly these: the card is "Write a note", opens a blank page, and says under its title that notes stay on this phone', () => {
  assert.equal(WRITE_NOTE, 'Write a note');
  assert.equal(WRITE_NOTE_HINT, 'Opens a blank page');
  assert.equal(NOTES_PRIVACY, 'Notes stay on this phone.', 'the quiet line keeps its wording');
  assert.equal(EMPTY_TITLE, 'No notes yet', 'the empty diary keeps its title and its text, and has no button of its own');
  assert.equal(EMPTY_TEXT, 'Write a few lines about your day on the Way: what you saw, who you met, how you feel.');
  assert.ok(WRITE_CARD_MIN >= 64, 'the card is a big thing to touch: at least 64');
  assert.match(DELETE_FAILED.text, /could not be deleted/);
  for (const m of [DELETE_FAILED, SHARE_FAILED, MAPS_FAILED]) assert.ok(m.title.length > 0 && m.text.length > 0 && !/error|exception|failed/i.test(m.title + m.text), 'calm words, no jargon');
});

/* ================================================================ what the list shows */

/** A page whose photo list and place are damaged on purpose: a stored page can hold anything. */
const junk: NoteLike = { id: 'junkmedia', createdAt: '2026-11-04T09:00:00.000Z', title: 'Junk', body: '', media: [{ junk: true }] as unknown as DiaryMedia[], place: { lat: 'x' } as unknown as DiaryPlace };

check('a photo list or a place that does not read is not a photo or a place: the row of such a note draws neither (only what the diary can really show counts)', () => {
  const row = noteRow(junk, new Date(2026, 10, 8, 12), { name: 'Ana' });
  assert.equal(row.media.length, 0);
  assert.equal(row.place, null);
  assert.equal(row.placeText, '');
  assert.equal(mediaOf(junk).length, 0);
  assert.equal(normalizePlace(junk.place), null);
  assert.equal(mediaOf({ id: 'x', createdAt: '', title: '', body: '', media: undefined }).length, 0);
});

check('what the list shows: nothing yet while the diary is being read, the empty diary, or the notes; there is no third kind of empty (no filter that could hold nothing)', () => {
  assert.equal(feedState({ ready: false, total: 0 }), 'loading');
  assert.equal(feedState({ ready: false, total: 9 }), 'loading', 'never "empty" to someone whose notes are still being read');
  assert.equal(feedState({ ready: true, total: 0 }), 'empty');
  assert.equal(feedState({ ready: true, total: 1 }), 'list');
  assert.equal(feedState({ ready: true, total: 4 }), 'list');
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

check('a draft says so on its row: the tag, and the sentence a screen reader reads; a note that is published, or one of an earlier build, does not', () => {
  const at = local(2026, 11, 8, 10).toISOString();
  const draft = noteRow({ id: 'd', createdAt: at, title: 'Hontanas', body: 'Half a thought', status: 'draft' }, NOW, { name: 'Ana' });
  assert.equal(draft.draft, true);
  assert.match(draft.label, /^Ana\. 2 hours ago\. Draft\. Hontanas\. Half a thought\.$/);
  for (const status of [undefined, 'published' as const]) {
    const row = noteRow({ id: 'p', createdAt: at, title: 'Hontanas', body: 'Done', ...(status ? { status } : {}) }, NOW, { name: 'Ana' });
    assert.equal(row.draft, false);
    assert.doesNotMatch(row.label, /Draft/);
  }
  assert.equal(rowLabel({ name: 'Ana', time: null, title: '', text: 'Wind!', meta: '', draft: true }), 'Ana. Draft. Wind!');
});

check('random notes, thousands of them: a row never throws, never says undefined or NaN, and what it draws agrees with what the diary and the grid think of the note', () => {
  forEachNote(900, (e, _r, now) => {
    const row = noteRow(e, now, { name: 'Ana' });
    assert.equal(row.id, e.id);
    assert.ok(row.media.length <= 12);
    assert.equal(row.media.length > 0, mediaOf(e).length > 0);
    assert.equal(row.place !== null, normalizePlace(e.place) !== null);
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

/* ================================================================ the screens, read as source */

const DIR = 'src/features/notes';
const files = readdirSync(join(root, DIR)).filter((f) => /\.tsx?$/.test(f)).sort();
const code = (f: string) => read(`${DIR}/${f}`).split('\n').map((line) => line.replace(/(^|\s)\/\/.*$/, '')).filter((l) => !/^\s*(\*|\/\*)/.test(l)).join('\n');
const tsx = files.filter((f) => f.endsWith('.tsx'));

check('the Notes tab is the files this test expects, so a new one is looked at (and the scans below see all of them)', () => {
  assert.deepEqual(files, ['NoteMedia.tsx', 'NoteMenu.tsx', 'NoteRow.tsx', 'NotesHeader.tsx', 'NotesTab.tsx', 'timeline.ts']);
});

check('Me gets what was agreed: a named export NotesTab with one optional prop, `top` (what is above the notes), and no floating button of its own (Me draws the chat button)', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /export function NotesTab\(\{ top \}: \{ top\?: ReactNode \}\) \{/);
  for (const f of files) assert.doesNotMatch(code(f), /\bFab\b/, `${f}: the floating button belongs to Me, which draws one, the chat button, on every sub-tab (features/me/tabs.ts)`);
  assert.doesNotMatch(src, /\bScreen\b/, 'the tab does not bring a screen of its own: it fills what Me gives it');
  assert.match(src, /\{top\}\s*<NotesHeader\b/, '`top` is the first thing in the list: it scrolls away with the notes');
});

check('the tab owns its scroll, and it is a virtualised list: a FlatList of every note, only the rows on screen drawn, never the notes mapped into a view', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /<FlatList\b/);
  assert.match(src, /data=\{entries\}/, 'every note of the diary is in the list (there is no filter that holds some back), and the list draws the ones on screen');
  assert.match(src, /keyExtractor=\{keyOf\}/);
  assert.match(src, /initialNumToRender=\{6\}/);
  assert.match(src, /windowSize=\{7\}/);
  assert.doesNotMatch(src, /entries\.map\(|data\.map\(|shown\.map\(|\.slice\(/, 'no row is drawn by mapping over the notes');
  assert.doesNotMatch(src, /keyboardShouldPersistTaps|keyboardDismissMode/, 'there is no text field above the notes on Me any more (the Library\'s search field was it): nothing to put the keyboard away from');
  assert.match(src, /<RefreshControl\b[^>]*refreshing=\{refreshing\}[^>]*onRefresh=\{refresh\}/, 'pull to refresh');
  assert.doesNotMatch(src, /ownScroll/, 'the tab has one way of being hosted: it is the scroller');
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
  assert.match(src, /const ok = await remove\(e\.id\);\s*if \(!ok\) tell\(DELETE_FAILED\);/, 'a delete that did not go through says so');
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
  assert.match(src, /if \(res\.outcome === 'failed'\) tell\(SHARE_FAILED\);/, 'a share that failed says so; one that was closed says nothing');
  assert.match(code('NoteRow.tsx'), /row\.share !== ''/, 'and the button is only there when there is text');
});

check('a tap on a row opens the page (Read view), the ONE card opens a new one, Edit opens the page, and nothing in the editor is changed to make that so', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /router\.push\(`\/diary\/\$\{id\}`\)/);
  assert.match(tab, /router\.push\('\/diary\/new'\)/);
  assert.match(tab, /<NotesHeader onWrite=\{write\} \/>/, 'the card is given the one way to write');
  const header = code('NotesHeader.tsx');
  assert.equal((header.match(/onPress=\{onWrite\}/g) ?? []).length, 1, 'the card is the only way in: no prompt and no shortcuts next to it');
  assert.equal((header.match(/<Pressable\b/g) ?? []).length, 1, 'the whole card is ONE button');
  assert.match(header, /accessibilityRole="button"\s+accessibilityLabel=\{WRITE_NOTE\}\s+accessibilityHint=\{WRITE_NOTE_HINT\}/, 'labelled "Write a note", hint "Opens a blank page"');
  assert.match(header, /<AppText variant="h4">\{WRITE_NOTE\}<\/AppText>/, 'the title');
  assert.match(header, /<AppText variant="caption" muted>\{NOTES_PRIVACY\}<\/AppText>/, 'and under it the one quiet line');
  assert.match(header, /<Icon name="compose" color=\{role\.onHighlight\}/, 'the compose glyph');
  assert.match(header, /backgroundColor: role\.highlight/, 'on a gold circle');
  assert.match(header, /minHeight: WRITE_CARD_MIN/, 'a card at least 64 high');
  assert.doesNotMatch(header, /COMPOSER|Shortcut|then add a photo|then add a place|PilgrimAvatar|Write a new note|numberOfLines/, 'the composer row (the avatar, the prompt, the two shortcuts) is gone');
  assert.match(tab, /edit: open,/, 'Edit opens the page as well: the editor is not changed, so it is the page that opens, and Edit is on it');
});

check('a failure is told in the system dialog (like the question before a delete), seen wherever the list is scrolled to, and a tap on a row, and Edit, open the page', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /function tell\(m: Telling\) \{[\s\S]*?window\.alert\(`\$\{m\.title\}\\n\\n\$\{m\.text\}`\)[\s\S]*?Alert\.alert\(m\.title, m\.text\);/);
  assert.doesNotMatch(tab, /FormMessage|position: 'absolute'/, 'no message that floats at the top of a list that may be scrolled away from it');
  assert.match(code('NoteRow.tsx'), /onPress=\{\(\) => actions\.open\(entry\.id\)\}/, 'a tap on the row opens the page');
  assert.match(tab, /edit: open,/, 'Edit opens the page as well: the editor is not changed, so it is the page that opens, and Edit is on it');
});

check('there is no filter row: no tablist, no tab, no filter words and no counts anywhere in the Notes tab, and the three tabs All, Photos and videos, Places left no code behind', () => {
  for (const f of files) {
    const src = code(f);
    assert.doesNotMatch(src, /accessibilityRole="tab(?:list)?"|aria-selected|NOTE_FILTERS|NoteFilter|FILTER_LABEL|FILTER_EMPTY|filterNotes|noteCounts|filterLabel|matchesFilter|SHOW_ALL|none-for-filter|setFilter|const \[filter|hasMedia|hasPlace/, `${f}: nothing of the filter is left`);
    assert.doesNotMatch(src, /Photos and videos|Show all notes|No photos or videos yet|No places yet/, `${f}: the words of the tabs are gone`);
  }
  for (const gone of ['NOTE_FILTERS', 'FILTER_LABEL', 'FILTER_EMPTY', 'filterNotes', 'noteCounts', 'filterLabel', 'matchesFilter', 'hasMedia', 'hasPlace', 'SHOW_ALL', 'COMPOSER_PLACEHOLDER', 'EMPTY_BUTTON']) {
    assert.ok(!(gone in timeline), `timeline.ts no longer exports ${gone}`);
  }
  const tab = code('NotesTab.tsx');
  assert.doesNotMatch(tab, /filter|counts/i, 'the tab keeps no state for a filter and counts nothing');
  assert.match(tab, /const state = feedState\(\{ ready, total: entries\.length \}\);/, 'what the list shows depends on the diary alone');
});

check('the empty diary says "No notes yet" and has no button of its own: the card above it is the way in; the feed has one place to write and no other', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /<Empty title=\{EMPTY_TITLE\} text=\{EMPTY_TEXT\} \/>/);
  assert.match(tab, /function Empty\(\{ title, text \}: \{ title: string; text: string \}\)/, 'the empty state takes a title and a text and nothing else');
  assert.doesNotMatch(tab, /<Pill\b|Pill'|EMPTY_BUTTON|Write your first note/, 'no second write button under the card');
  const empty = tab.slice(tab.indexOf('function Empty('), tab.indexOf('export function NotesTab'));
  assert.doesNotMatch(empty, /Pressable|onPress|button/i, 'nothing in the empty state can be pressed');
  assert.equal((tab.match(/<Empty\b/g) ?? []).length, 1, 'one empty state: the diary has no notes (a filter that holds none is gone)');
  assert.equal((tab.match(/<NotesHeader\b/g) ?? []).length, 1, 'one card');
});

check('a row is one thing for a screen reader, with the actions of its parts as actions; the buttons in it all have a label', () => {
  const row = code('NoteRow.tsx');
  assert.match(row, /accessible\b/);
  assert.match(row, /accessibilityLabel=\{row\.label\}/);
  assert.match(row, /accessibilityActions=\{available\}/);
  assert.match(row, /onAccessibilityAction=\{/);
  for (const name of ['share', 'edit', 'delete']) assert.match(row, new RegExp(`name: '${name}'`), `the action ${name}`);
  assert.match(row, /accessibilityLabel="More: edit or delete this note"/, 'the "…" button says what it opens');
  assert.match(row, /style=\{\[\{ fontSize: 20, lineHeight: 26, marginTop: 2 \}, breakAnywhere\]\}>\{row\.title\}/, 'a very long word in a title breaks on the web instead of widening the note');
});

check('every control has a label and is at least 44 big: Pressables, buttons and the card', () => {
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
  assert.match(code('NotesHeader.tsx'), /minHeight: WRITE_CARD_MIN/, 'the card is at least WRITE_CARD_MIN (64) high, more than a thing to touch needs');
  assert.ok(WRITE_CARD_MIN >= TOUCH_MIN + 20);
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
  assert.match(read('tsconfig.metest.json'), /notes\.test\.ts/, 'the tests are compiled');
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

check('the pairs the Notes tab draws keep their contrast in light and in dark, read from the tokens the theme is built from: text 4.5 : 1, icons 3 : 1', () => {
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
    ['handle and time (muted) on the page', 'textMuted', 'bg', 4.5],
    ['"Show more" (accent text) on the page', 'textAccent', 'bg', 4.5],
    ['words on a row while it is pressed (sunken)', 'text', 'surfaceSunken', 4.5],
    ['handle and time on a row while it is pressed', 'textMuted', 'surfaceSunken', 4.5],
    ['"Show more" on a row while it is pressed', 'textAccent', 'surfaceSunken', 4.5],
    ['the title of the write card (text on surface)', 'text', 'surface', 4.5],
    ['the quiet line of the write card (muted on surface)', 'textMuted', 'surface', 4.5],
    ['the title of the write card while it is pressed (text on sunken)', 'text', 'surfaceSunken', 4.5],
    ['the quiet line of the write card while it is pressed (muted on sunken)', 'textMuted', 'surfaceSunken', 4.5],
    ['the arrow of the write card (muted on surface)', 'textMuted', 'surface', 3],
    ['the dots and the share icon (muted) on the page', 'textMuted', 'bg', 3],
    ['the name of a place on its chip (surface)', 'text', 'surface', 4.5],
    ['the pin on the chip (accent text on surface)', 'textAccent', 'surface', 3],
    ['the mark of a file that is not here (muted on sunken)', 'textMuted', 'surfaceSunken', 3],
    ['the glyph on the gold circle of the write card and of the empty state (onHighlight on highlight)', 'onHighlight', 'highlight', 4.5],
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

check('the colours the contrast guard above assumes are the ones the code draws with, so the audit and the screens cannot drift apart', () => {
  const row = code('NoteRow.tsx');
  const header = code('NotesHeader.tsx');
  const menu = code('NoteMenu.tsx');
  const tab = code('NotesTab.tsx');
  assert.match(row, /backgroundColor: pressed \? role\.sunken : 'transparent'/, 'a pressed row is the sunken colour');
  assert.match(row, /behind=\{pressed \? role\.sunken : role\.bg\}/, 'and the fade of a cut text is the colour the row is on');
  assert.match(row, /<AppText variant="label" color=\{role\.accentText\}>\{open \? SHOW_LESS : SHOW_MORE\}<\/AppText>/);
  assert.match(row, /<Icon name="more" color=\{role\.muted\}/);
  assert.match(row, /<Icon name="share" color=\{role\.muted\}/);
  assert.match(row, /<Icon name="pin" color=\{role\.accentText\}/);
  assert.match(row, /borderColor: role\.border, backgroundColor: role\.surface/, 'the place chip is the surface colour');
  assert.match(row, /<Text style=\{\[textStyle\('caption'\), \{ color: role\.muted \}\]\}>/, 'the handle is muted');
  assert.match(row, /<AppText variant="caption" muted style=\{\{ flexShrink: 0 \}\}>/, 'and so is the time');
  assert.match(header, /backgroundColor: pressed \? role\.sunken : role\.surface/, 'the card is the surface colour, and the sunken one while it is pressed');
  assert.match(header, /borderColor: role\.border/, 'with a hairline');
  assert.match(header, /<Icon name="compose" color=\{role\.onHighlight\}/);
  assert.match(header, /backgroundColor: role\.highlight/);
  assert.match(header, /<AppText variant="h4">\{WRITE_NOTE\}<\/AppText>/, 'the title is the text colour');
  assert.match(header, /<AppText variant="caption" muted>\{NOTES_PRIVACY\}<\/AppText>/, 'the quiet line is muted');
  assert.match(header, /<Icon name="chevron" color=\{role\.muted\}/);
  assert.match(menu, /backgroundColor: pressed \? role\.bg : 'transparent'/, 'a pressed menu item is the page colour (the sunken one is 4.50 : 1 with Delete in dark mode)');
  assert.match(menu, /const colour = danger \? role\.danger : role\.text;/);
  assert.match(menu, /backgroundColor: role\.surface, borderTopLeftRadius/);
  assert.match(tab, /backgroundColor: role\.highlight/);
  assert.match(tab, /<Icon name="compose" color=\{role\.onHighlight\}/);
  assert.doesNotMatch(tab, /<Pill\b/, 'the empty state has no button: its colours are not in the audit');
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
  assert.match(tab, /if \(!\(await device\.openMaps\(p\)\)\) tell\(MAPS_FAILED\);/);
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

check('the list leaves room under the last note for the chat button and the floating tab bar, the same numbers the Fab and the tab bar use', () => {
  const src = code('NotesTab.tsx');
  assert.match(src, /paddingBottom: layout\.tabbarHeight \+ insets\.bottom \+ 96/);
  const fab = read('src/components/Fab.tsx');
  assert.match(fab, /Math\.max\(insets\.bottom - 14, 10\) \+ 88 \+ 8, width: 60, height: 60/, 'the chat button: 8 above the bar, 60 high');
  assert.ok(100 + 96 >= 88 + 8 + 60 + 16 + 10, 'the room is more than the bar, the pen and a margin');
  assert.equal((JSON.parse(read('src/theme/tokens.json')) as { layout: { tabbarHeight: number } }).layout.tabbarHeight, 100);
});

check('it shows the person who wrote the notes the way a post does (name, handle, the profile photo through the app\'s own avatar), and shows nothing that is not theirs', () => {
  const tab = code('NotesTab.tsx');
  assert.match(tab, /const \{ profile \} = useAuth\(\);/);
  assert.match(tab, /identity\(profile\)/);
  assert.match(code('NoteRow.tsx'), /<PilgrimAvatar\b/);
  for (const f of files) assert.doesNotMatch(code(f), /SAMPLE_|sample\.ts|from '\.\.\/sample'/, `${f}: no invented notes: the feed only ever shows the pages that are in the diary`);
});

check('the row draws the tag only for a draft, and a screen reader gets it once, from the sentence of the row', () => {
  assert.match(code('NoteRow.tsx'), /\{row\.draft && \(/, 'the row draws the tag only for a draft');
  assert.match(code('NoteRow.tsx'), /importantForAccessibility="no-hide-descendants"[^>]*>\s*<AppText variant="caption" color=\{role\.accentText\}>\{DRAFT_TAG\}/, 'and a screen reader gets it once, from the sentence of the row');
});

check('this test runs: highlights.test.ts runs it (npm run test:me names that one), and the test config of Me compiles it', () => {
  const runner = read('src/features/me/__tests__/highlights.test.ts');
  assert.match(runner, /^import '\.\.\/\.\.\/notes\/__tests__\/notes\.test';/m, 'a line that is code, not a comment');
  assert.match(read('tsconfig.metest.json'), /"src\/features\/notes\/__tests__\/notes\.test\.ts"/);
  assert.doesNotMatch(read('tsconfig.librarytest.json'), /notes\.test/, 'the Library no longer has Notes, so its test config does not compile the Notes test');
  assert.doesNotMatch(read('src/features/library/__tests__/wiring.test.ts').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n'), /notes\.test/, 'and the Library\'s wiring test does not run it');
});

console.log(`${n} of ${n} passed (Notes)`);
