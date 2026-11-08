// Plain-node checks of the week strip of the Daily reading screen and of what stands behind it: the days of a week, their words, the arrows that move a
// week, the `date` of a bookmark, the readings provider and the bookmark key of a day. No React, no network. Run: npm run test:library (daily.test.ts runs
// this file, so no script has to name it).
import assert from 'node:assert/strict';
import { addDays, rangeAround, weekdayIndex, type Ymd } from '../daily/calendar';
import { dailyDaysOf, dailyKey, dayOfDailyKey } from '../daily/bookmarks';
import { READING_TITLES, SAMPLE_CITATION, dayContent, readingKinds } from '../daily/content';
import { dateKey, parseDateKey } from '../daily/datekey';
import { liturgicalDay } from '../daily/liturgy';
import { SAMPLE_READING, SAMPLE_REFLECTION } from '../daily/sample';
import { arrows, dailyReducer, initDaily, weekArrows } from '../daily/state';
import { WEEKDAY_LETTERS, canMoveWeek, dayCellLabel, nextWeekLabel, previousWeekLabel, weekDays, weekSpoken, weekStart, weekTitle } from '../daily/week';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };
const day = (y: number, m: number, d: number): Ymd => ({ y, m, d });
const nov8 = day(2026, 11, 8);

check('a day as text: "2026-11-08" both ways, and anything that is not a real day of the Gregorian calendar reads as nothing', () => {
  assert.equal(dateKey(nov8), '2026-11-08');
  assert.equal(dateKey(day(1999, 1, 5)), '1999-01-05');
  assert.deepEqual(parseDateKey('2026-11-08'), nov8);
  assert.deepEqual(parseDateKey('2028-02-29'), day(2028, 2, 29));
  for (const bad of ['2026-02-30', '2027-02-29', '2026-13-01', '2026-00-10', '2026-1-5', '2026-11-8', '26-11-08', '2026-11-08x', ' 2026-11-08', '', '1582-12-31', '0999-01-01', 'today', null, undefined, 20261108, {}, ['2026-11-08']]) {
    assert.equal(parseDateKey(bad), null, String(bad));
  }
  for (const [y, m, d] of [[1583, 1, 1], [2026, 11, 8], [2031, 12, 31], [9999, 12, 31]]) assert.deepEqual(parseDateKey(dateKey(day(y, m, d))), day(y, m, d));
});

check('the strip is the seven days of the week that holds the picked day, Monday first, each the next of the one before', () => {
  assert.deepEqual(weekDays(nov8).map((x) => x.d), [2, 3, 4, 5, 6, 7, 8], 'a Sunday is the last day of its week');
  assert.deepEqual(weekStart(nov8), day(2026, 11, 2));
  assert.deepEqual(weekDays(day(2026, 11, 2)).map((x) => x.d), [2, 3, 4, 5, 6, 7, 8], 'a Monday is the first');
  assert.deepEqual(weekDays(day(2026, 12, 2)).map((x) => `${x.m}-${x.d}`), ['11-30', '12-1', '12-2', '12-3', '12-4', '12-5', '12-6'], 'across the end of a month');
  assert.deepEqual(weekDays(day(2026, 12, 30)).map((x) => `${x.y}-${x.m}-${x.d}`), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-1-1', '2027-1-2', '2027-1-3'], 'and of a year');
  for (let k = 0; k < 800; k++) {
    const x = addDays(day(2000, 1, 1), k * 11);
    const w = weekDays(x);
    assert.equal(w.length, 7);
    assert.equal(weekdayIndex(w[0]), 0, 'Monday first');
    assert.ok(w.some((y) => y.y === x.y && y.m === x.m && y.d === x.d), 'it holds the day');
    for (let i = 1; i < 7; i++) assert.deepEqual(w[i], addDays(w[i - 1], 1));
  }
  assert.deepEqual([...WEEKDAY_LETTERS], ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
});

check('the words: the title of the week, said aloud, and what a screen reader says for each day (its date, its liturgical name, and "today")', () => {
  assert.equal(weekTitle(weekDays(nov8)), '2–8 Nov 2026');
  assert.equal(weekTitle(weekDays(day(2026, 12, 2))), '30 Nov – 6 Dec 2026');
  assert.equal(weekTitle(weekDays(day(2026, 12, 30))), '28 Dec 2026 – 3 Jan 2027');
  assert.equal(weekSpoken(weekDays(nov8)), '2 to 8 November 2026');
  assert.equal(weekSpoken(weekDays(day(2026, 12, 2))), '30 November to 6 December 2026');
  assert.equal(weekSpoken(weekDays(day(2026, 12, 30))), '28 December 2026 to 3 January 2027');
  assert.equal(dayCellLabel(nov8, true), 'Sunday 8 November, 32nd Sunday in Ordinary Time, today');
  assert.equal(dayCellLabel(nov8, false), 'Sunday 8 November, 32nd Sunday in Ordinary Time');
  assert.equal(dayCellLabel(day(2026, 11, 7), false), 'Saturday 7 November, Saturday of the 31st Week in Ordinary Time');
  assert.equal(dayCellLabel(day(2026, 11, 1), false), 'Sunday 1 November, All Saints');
  for (const x of weekDays(nov8)) assert.equal(dayCellLabel(x, false), `${['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][weekdayIndex(x)]} ${x.d} November, ${liturgicalDay(x.y, x.m, x.d).title}`);
});

check('the arrows move the picked day a week at a time, to the same weekday, and stop at the limits of the calendar (five years back and ahead)', () => {
  const s = initDaily(nov8);
  const next = dailyReducer(s, { type: 'week', by: 1 });
  assert.deepEqual(next.selected, day(2026, 11, 15));
  assert.deepEqual(weekDays(next.selected).map((x) => x.d), [9, 10, 11, 12, 13, 14, 15]);
  assert.deepEqual(dailyReducer(s, { type: 'week', by: -1 }).selected, day(2026, 11, 1));
  assert.deepEqual(dailyReducer(dailyReducer(s, { type: 'week', by: 4 }), { type: 'week', by: -4 }).selected, nov8);
  assert.deepEqual(dailyReducer(s, { type: 'week', by: 3 }).selected, day(2026, 11, 29), 'across the end of a month the month on show follows');
  assert.deepEqual(dailyReducer(s, { type: 'week', by: 4 }).shown, { y: 2026, m: 12 });
  let t = s;
  let steps = 0;
  while (weekArrows(t).forward) { t = dailyReducer(t, { type: 'week', by: 1 }); steps += 1; assert.ok(steps < 600, 'it ends'); }
  assert.deepEqual(t.shown, { y: 2031, m: 11 }, 'the last month of the calendar');
  assert.equal(dailyReducer(t, { type: 'week', by: 1 }), t, 'one more is not taken: the state itself comes back');
  assert.equal(weekArrows(t).back, true);
  assert.equal(canMoveWeek(t.selected, 1, t.range), false);
  assert.equal(nextWeekLabel(t.selected, t.range), 'Next week');
  assert.equal(previousWeekLabel(nov8, rangeAround(nov8)), 'Previous week, 26 October to 1 November 2026');
  assert.equal(nextWeekLabel(nov8, rangeAround(nov8)), 'Next week, 9 to 15 November 2026');
  while (weekArrows(t).back) t = dailyReducer(t, { type: 'week', by: -1 });
  assert.deepEqual(t.shown, { y: 2021, m: 11 });
  assert.equal(previousWeekLabel(t.selected, t.range), 'Previous week');
  assert.deepEqual(arrows(initDaily(nov8)), { back: true, forward: true }, 'the arrows of the calendar sheet are the same as before');
});

check('picking a day moves the strip to its week; Today brings the strip back; the calendar sheet opens on the month of the picked day', () => {
  const s = dailyReducer(initDaily(nov8), { type: 'select', day: day(2026, 12, 25) });
  assert.deepEqual(weekDays(s.selected).map((x) => `${x.m}-${x.d}`), ['12-21', '12-22', '12-23', '12-24', '12-25', '12-26', '12-27']);
  const back = dailyReducer(s, { type: 'today', today: nov8 });
  assert.deepEqual(back.selected, nov8);
  assert.deepEqual(back.shown, { y: 2026, m: 11 });
  const away = dailyReducer(dailyReducer(s, { type: 'month', by: 7 }), { type: 'show', day: s.selected });
  assert.deepEqual(away.shown, { y: 2026, m: 12 }, 'opened again, the sheet is on the month of the picked day');
  assert.deepEqual(dailyReducer(initDaily(nov8), { type: 'select', day: day(2040, 1, 1) }).selected, nov8, 'past the limits is not taken');
});

check('the screen opens on the day it was asked for (the date of a bookmark), also a day far outside the five years, and on today for anything else', () => {
  assert.deepEqual(initDaily(nov8, day(2026, 12, 25)).selected, day(2026, 12, 25));
  assert.deepEqual(initDaily(nov8, null).selected, nov8);
  assert.deepEqual(initDaily(nov8, day(2026, 2, 30)).selected, nov8, 'a day that does not exist is today');
  const old = initDaily(nov8, day(2019, 3, 3));
  assert.deepEqual(old.selected, day(2019, 3, 3), 'a bookmark of an old day still opens');
  assert.deepEqual(old.shown, { y: 2019, m: 3 });
  assert.deepEqual(old.range, { min: { y: 2019, m: 3 }, max: { y: 2031, m: 11 } }, 'the calendar grows to hold it and goes on to the usual end');
  assert.deepEqual(initDaily(nov8).range, rangeAround(nov8));
  assert.equal(weekArrows(old).back, false, 'at the first month of its range the arrow is off');
  const late = initDaily(nov8, day(2040, 6, 1));
  assert.deepEqual(late.range.max, { y: 2040, m: 6 });
});

check('the readings provider: the same shape for every day, a second reading on Sundays and solemnities only, and every card says it is a sample', () => {
  const kinds = (y: number, m: number, d: number) => readingKinds(liturgicalDay(y, m, d));
  assert.deepEqual(kinds(2026, 11, 8), ['first', 'psalm', 'second', 'acclamation', 'gospel'], 'a Sunday');
  assert.deepEqual(kinds(2026, 11, 1), ['first', 'psalm', 'second', 'acclamation', 'gospel'], 'All Saints, a solemnity');
  assert.deepEqual(kinds(2026, 11, 7), ['first', 'psalm', 'acclamation', 'gospel'], 'a weekday');
  assert.deepEqual(kinds(2026, 7, 25), ['first', 'psalm', 'acclamation', 'gospel'], 'a feast on a weekday');
  assert.deepEqual(READING_TITLES, { first: 'First reading', psalm: 'Psalm', second: 'Second reading', acclamation: 'Gospel acclamation', gospel: 'Gospel' });
  const sunday = dayContent('2026-11-08');
  assert.equal(sunday.dateKey, '2026-11-08');
  assert.equal(sunday.sample, true, 'the readings are examples');
  assert.deepEqual(sunday.passages.map((p) => p.kind), ['first', 'psalm', 'second', 'acclamation', 'gospel']);
  assert.deepEqual(dayContent('2026-11-07').passages.map((p) => p.kind), ['first', 'psalm', 'acclamation', 'gospel']);
  const psalm = sunday.passages.find((p) => p.kind === 'psalm')!;
  assert.equal(psalm.citation, SAMPLE_READING.reference);
  assert.deepEqual(psalm.lines.map((l) => l.text), SAMPLE_READING.verses.map((v) => v.text));
  assert.deepEqual(psalm.lines.map((l) => l.n), [1, 2, 3, 4]);
  assert.match(psalm.credit ?? '', /World English Bible · public domain · an example, not the psalm of this day/);
  for (const p of sunday.passages.filter((q) => q.kind !== 'psalm')) {
    assert.equal(p.citation, null, `${p.kind} has no citation: none is invented`);
    assert.match(p.lines[0].text, /^Sample text\./);
  }
  assert.equal(SAMPLE_CITATION, 'Sample citation');
  assert.equal(sunday.reflections.length, 1);
  assert.equal(sunday.reflections[0].paragraphs.length, 3, 'a few short paragraphs');
  assert.equal(sunday.reflections[0].paragraphs.join(' '), SAMPLE_REFLECTION.text, 'the same words as the sample');
  assert.equal(sunday.reflections[0].label, 'Sample reflection');
  assert.match(sunday.reflections[0].source, /not by a real author/);
  assert.deepEqual(dayContent('2030-05-05').reflections, sunday.reflections, 'the same for every day');
  assert.deepEqual(dayContent('not a day'), { dateKey: 'not a day', sample: true, passages: [], reflections: [] });
});

check('a day is bookmarked under "daily:YYYY-MM-DD", which never changes for a day, and only keys of real days are days', () => {
  assert.equal(dailyKey(nov8), 'daily:2026-11-08');
  assert.deepEqual(dayOfDailyKey('daily:2026-11-08'), nov8);
  for (const bad of ['daily:', 'daily:2026-13-01', 'daily:2026-02-30', 'daily:today', 'bible:psalms', 'books:confessions', 'music:morning', '2026-11-08']) assert.equal(dayOfDailyKey(bad), null, bad);
  assert.deepEqual(dailyDaysOf(['bible:bible-genesis', 'daily:2026-11-09', 'daily:nonsense', 'daily:2026-11-08', 'daily:2026-11-09', 'books:confessions']), [day(2026, 11, 9), nov8], 'in the order kept, once each, the rest left alone');
  assert.deepEqual(dailyDaysOf([]), []);
  assert.ok(dailyKey(day(1583, 1, 1)).length <= 80 && dailyKey(day(9999, 12, 31)).length <= 80, 'the key fits the Library bookmark list');
});

console.log(`${n} of ${n} passed`);
