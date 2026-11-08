// Plain-node checks of the liturgical calendar of the Daily reading screen (features/library/daily/liturgy.ts). No React, no network, no dependency.
// Run: npm run test:library (daily.test.ts runs this file, so no script has to name it).
//
// HOW THE MODULE WAS CHECKED. The checks below pin facts that anyone can look up, and rules that must hold in every year. On top of that the module
// was compared once, outside the repository (nothing of it is in the app or in package.json), with romcal 3.0.0-dev.144 and its General Roman
// Calendar plugin, a library that generates the calendar of the Roman Rite, set to the universal dates (Epiphany on 6 January, the Ascension and
// Corpus Christi on the Thursday). For every day romcal gave an id, a rank, the seasons, the colours, the week and the two cycles; the module's id,
// rank, season, colour, week and cycles were compared field by field, the ids being romcal's own. Where romcal's answer for a day is a saint's
// memorial or a saint's feast that the module does not have, the module has to answer with the day of the temporal cycle underneath, and that day
// was read from romcal as well (every definition of its Proper of Time is computed for the year, a day that a memorial covers included).
//   2024 to 2032: 3,288 days, all compared (2,648 against romcal's own answer, 640 against the temporal day under a saint).
//   1990 to 2100: 40,542 days, all compared (32,604 and 7,938).
// They differ on 2 days of 2024 to 2032 and on 26 of 1990 to 2100, always the same four ways, and in all of them romcal leaves out a solemnity:
//   A. 25 March is a Sunday of Lent (1990, 2001, 2007, 2012, 2057, 2063, 2068, 2074, 2085, 2091, 2096): the Annunciation is kept on Monday 26 March
//      (Universal Norms 60: a solemnity that falls on a Sunday of Lent is moved to the Monday); romcal has an ordinary Monday of Lent.
//   B. 24 June is the Sacred Heart (2022, 2033, 2038, 2044): the Nativity of Saint John the Baptist is kept on 23 June, as the Congregation for
//      Divine Worship decided in 2011 and 2022; romcal has no solemnity on those days.
//   C. A Saturday solemnity falls on the memorial of the Immaculate Heart of Mary (24 June 1995, 2006, 2017, 2028, 2090; 29 June 2019, 2030, 2041,
//      2052): a solemnity outranks a memorial, so the memorial is left out; romcal prints the memorial and no solemnity.
//   D. 29 June is the Sacred Heart (2057, 2068): Saints Peter and Paul move to Saturday 30 June, the nearest day that no day of rank 1 to 8 holds;
//      romcal has no such solemnity that year.
// Everything else agrees: the ids, the seasons, the colours (Gaudete and Laetare rose, Palm Sunday and Good Friday red, Pentecost red), the weeks (the
// week skipped in Ordinary Time, Easter weeks, the weeks of Lent after Ash Wednesday), the Sunday cycle, the transfers of Saint Joseph and of the
// Annunciation in Holy Week (2008, 2018, 2024 ...) and of the Immaculate Conception from a Sunday of Advent. romcal gives no colour for Holy
// Saturday (111 days): the module says white, the colour of the Vigil that night. romcal's names are not compared: the titles are this app's words.
// The weekday cycle agrees with romcal on every day too, because both count a liturgical year by the year it ends in (see liturgy.ts).
// To redo it: compile liturgy.ts and calendar.ts, install romcal in an empty folder, and run each day through both. The digest below fingerprints the
// module's answer for 2024 to 2032 as it was compared, so any later change of a rule shows up here, and the oracle has to be run again then.
import assert from 'node:assert/strict';
import { addDays, fromDays, toDays, weekdayIndex, type Ymd } from '../daily/calendar';
import {
  COLOUR_NAMES, FIRST_YEAR, LAST_YEAR, LITURGY_NOTE, RANK_NAMES, SEASON_NAMES, adventStart, easterSunday, liturgicalDay, liturgicalDayOf, ordinal, type LiturgicalDay,
} from '../daily/liturgy';

let n = 0;
const check = (name: string, fn: () => void) => { fn(); n += 1; console.log(`ok   ${name}`); };

const day = (y: number, m: number, d: number): Ymd => ({ y, m, d });
const L = liturgicalDay;
const pad = (v: number) => String(v).padStart(2, '0');
const iso = (x: Ymd) => `${x.y}-${pad(x.m)}-${pad(x.d)}`;
/** Every day of a year, in order. */
const daysOf = (y: number): Ymd[] => { const out: Ymd[] = []; for (let k = toDays(day(y, 1, 1)); k <= toDays(day(y, 12, 31)); k++) out.push(fromDays(k)); return out; };
const sameDay = (a: Ymd, b: Ymd) => a.y === b.y && a.m === b.m && a.d === b.d;

/* ================================================================================================================= Easter */

/** Gauss's rule for Easter in the Gregorian calendar, a second way to the same date (it shares nothing with the module's). */
function gauss(y: number): Ymd {
  const a = y % 19, b = y % 4, c = y % 7;
  const k = Math.floor(y / 100), p = Math.floor((13 + 8 * k) / 25), q = Math.floor(k / 4);
  const M = (15 - p + k - q) % 30, N = (4 + k - q) % 7;
  const d = (19 * a + M) % 30, e = (2 * b + 4 * c + 6 * d + N) % 7;
  let days = 22 + d + e; // days after the end of February
  if (d === 29 && e === 6) days = 50;
  else if (d === 28 && e === 6 && (11 * M + 11) % 30 < 19) days = 49;
  return days > 31 ? day(y, 4, days - 31) : day(y, 3, days);
}

check('Easter Sunday of 2024 to 2030 is the date the books give', () => {
  const dates: [number, number, number][] = [[2024, 3, 31], [2025, 4, 20], [2026, 4, 5], [2027, 3, 28], [2028, 4, 16], [2029, 4, 1], [2030, 4, 21]];
  for (const [y, m, d] of dates) assert.deepEqual(easterSunday(y), day(y, m, d), String(y));
  // some others that are known: the earliest and the latest Easter there can be, and a few that were in the news
  for (const [y, m, d] of [[1818, 3, 22], [2285, 3, 22], [1886, 4, 25], [1943, 4, 25], [2038, 4, 25], [2000, 4, 23], [2019, 4, 21], [2021, 4, 4], [2022, 4, 17], [2023, 4, 9]]) assert.deepEqual(easterSunday(y), day(y, m, d), String(y));
});

check('Easter is the date Gauss\'s rule gives, a Sunday by Date.UTC, from 22 March to 25 April, in every year from 1583 to 4099', () => {
  for (let y = FIRST_YEAR; y <= 4099; y++) {
    const e = easterSunday(y);
    assert.deepEqual(e, gauss(y), String(y));
    assert.equal(new Date(Date.UTC(e.y, e.m - 1, e.d)).getUTCDay(), 0, `${y} is a Sunday`);
    const dayOfYear = toDays(e) - toDays(day(y, 3, 21));
    assert.ok(dayOfYear >= 1 && dayOfYear <= 35, `${y}: 22 March to 25 April`);
  }
});

/* ================================================================================================================ Advent */

check('Advent begins on the Sunday from 27 November to 3 December, four Sundays before Christmas Day: 2025, 2026 and 2027, and every year from 1583 to 2400', () => {
  assert.deepEqual(adventStart(2025), day(2025, 11, 30));
  assert.deepEqual(adventStart(2026), day(2026, 11, 29));
  assert.deepEqual(adventStart(2027), day(2027, 11, 28));
  for (let y = FIRST_YEAR; y <= 2400; y++) {
    const a = adventStart(y);
    assert.equal(weekdayIndex(a), 6, `${y}: a Sunday`);
    assert.ok((a.m === 11 && a.d >= 27) || (a.m === 12 && a.d <= 3), `${y}: ${iso(a)}`);
    const fourth = addDays(a, 21);
    assert.ok(fourth.m === 12 && fourth.d >= 18 && fourth.d <= 24, `${y}: the fourth Sunday of Advent is ${iso(fourth)}`);
    assert.equal(L(y, 12, 24).id.startsWith('advent_'), true, `${y}: 24 December is still Advent`);
  }
});

/* =========================================================================================================== the cycles */

const cycleOfYear = (y: number) => (['A', 'B', 'C'] as const)[y % 3];

check('the Sunday cycle: the liturgical year that begins with Advent 2025 is Year A, the one that begins 29 November 2026 is Year B, and 2027 is Year C', () => {
  assert.equal(L(2025, 11, 30).sundayCycle, 'A');
  assert.equal(L(2026, 11, 8).sundayCycle, 'A');
  assert.equal(L(2026, 11, 28).sundayCycle, 'A', 'the Saturday before Advent is the last day of the old year');
  assert.equal(L(2026, 11, 29).sundayCycle, 'B');
  assert.equal(L(2026, 12, 25).sundayCycle, 'B');
  assert.equal(L(2027, 1, 1).sundayCycle, 'B');
  assert.equal(L(2027, 11, 27).sundayCycle, 'B');
  assert.equal(L(2027, 11, 28).sundayCycle, 'C');
  assert.equal(L(2028, 11, 26).sundayCycle, 'C');
  assert.equal(L(2028, 12, 3).sundayCycle, 'A', 'Advent 2028 begins Year A again: 2028 is divisible by 3');
  for (let y = 1900; y <= 2300; y++) {
    const first = adventStart(y);
    assert.equal(liturgicalDayOf(first).sundayCycle, cycleOfYear(y), `Advent ${y}`);
    assert.equal(liturgicalDayOf(addDays(first, -1)).sundayCycle, cycleOfYear(y - 1), `the day before Advent ${y}`);
    assert.equal(L(y, 12, 31).sundayCycle, cycleOfYear(y), `31 December ${y}`);
    assert.equal(L(y, 1, 1).sundayCycle, cycleOfYear(y - 1), `1 January ${y}`);
  }
});

check('the weekday cycle is Year I in the odd years and Year II in the even ones, and a liturgical year is named by the year it ends in: Advent 2026 is already Year I', () => {
  assert.equal(L(2026, 11, 8).weekdayCycle, 'II', '2026 is even');
  assert.equal(L(2026, 11, 28).weekdayCycle, 'II');
  assert.equal(L(2026, 11, 29).weekdayCycle, 'I', 'Advent 2026 begins the liturgical year that ends in 2027');
  assert.equal(L(2026, 12, 25).weekdayCycle, 'I');
  assert.equal(L(2027, 1, 1).weekdayCycle, 'I');
  assert.equal(L(2027, 7, 1).weekdayCycle, 'I', '2027 is odd');
  assert.equal(L(2027, 11, 27).weekdayCycle, 'I');
  assert.equal(L(2027, 11, 28).weekdayCycle, 'II');
  assert.equal(L(2028, 3, 1).weekdayCycle, 'II');
  assert.equal(L(2025, 6, 15).weekdayCycle, 'I');
  for (let y = 1900; y <= 2300; y++) {
    const oddYear = y % 2 === 1;
    for (const x of daysOf(y)) {
      const inAdvent = toDays(x) >= toDays(adventStart(y));
      assert.equal(L(x.y, x.m, x.d).weekdayCycle, (inAdvent ? !oddYear : oddYear) ? 'I' : 'II', iso(x));
    }
  }
});

/* ======================================================================================================== the named days */

type Row = [date: string, title: string, id: string, season: string, colour: string, rank: string, week: number | null];

// Looked up by hand in the books (and found again in romcal). The titles are this app's words.
const ROWS: Row[] = [
  ['2026-11-08', '32nd Sunday in Ordinary Time', 'ordinary_time_32_sunday', 'ordinary', 'green', 'sunday', 32],
  ['2026-11-07', 'Saturday of the 31st Week in Ordinary Time', 'ordinary_time_31_saturday', 'ordinary', 'green', 'weekday', 31],
  ['2026-11-01', 'All Saints', 'all_saints', 'ordinary', 'white', 'solemnity', 31],
  ['2026-11-02', 'The Commemoration of All the Faithful Departed (All Souls)', 'commemoration_of_all_the_faithful_departed', 'ordinary', 'violet', 'solemnity', 31],
  ['2026-11-22', 'Our Lord Jesus Christ, King of the Universe', 'our_lord_jesus_christ_king_of_the_universe', 'ordinary', 'white', 'solemnity', 34],
  ['2026-11-23', 'Monday of the 34th Week in Ordinary Time', 'ordinary_time_34_monday', 'ordinary', 'green', 'weekday', 34],
  ['2026-11-29', 'First Sunday of Advent', 'advent_1_sunday', 'advent', 'violet', 'sunday', 1],
  ['2026-11-30', 'Monday of the 1st Week of Advent', 'advent_1_monday', 'advent', 'violet', 'weekday', 1],
  ['2026-12-08', 'The Immaculate Conception of the Blessed Virgin Mary', 'immaculate_conception_of_the_blessed_virgin_mary', 'advent', 'white', 'solemnity', 2],
  ['2026-12-13', 'Third Sunday of Advent', 'advent_3_sunday', 'advent', 'rose', 'sunday', 3],
  ['2026-12-17', 'Advent weekday, 17 December', 'advent_december_17', 'advent', 'violet', 'weekday', 3],
  ['2026-12-20', 'Fourth Sunday of Advent', 'advent_4_sunday', 'advent', 'violet', 'sunday', 4],
  ['2026-12-24', 'Advent weekday, 24 December', 'advent_december_24', 'advent', 'violet', 'weekday', 4],
  ['2026-12-25', 'The Nativity of the Lord (Christmas Day)', 'nativity_of_the_lord', 'christmas', 'white', 'solemnity', null],
  ['2026-12-26', 'Second Day in the Octave of Christmas', 'christmas_octave_day_2', 'christmas', 'white', 'weekday', null],
  ['2026-12-27', 'The Holy Family of Jesus, Mary and Joseph', 'holy_family_of_jesus_mary_and_joseph', 'christmas', 'white', 'feast', null],
  ['2026-12-31', 'Seventh Day in the Octave of Christmas', 'christmas_octave_day_7', 'christmas', 'white', 'weekday', null],
  ['2027-01-01', 'Mary, the Holy Mother of God', 'mary_mother_of_god', 'christmas', 'white', 'solemnity', null],
  ['2027-01-02', 'Weekday of Christmas, 2 January', 'christmas_time_january_2', 'christmas', 'white', 'weekday', null],
  ['2027-01-03', 'Second Sunday after Christmas', 'second_sunday_after_christmas', 'christmas', 'white', 'sunday', null],
  ['2027-01-06', 'The Epiphany of the Lord', 'epiphany_of_the_lord', 'christmas', 'white', 'solemnity', null],
  ['2027-01-07', 'Thursday after the Epiphany', 'thursday_after_epiphany', 'christmas', 'white', 'weekday', null],
  ['2027-01-10', 'The Baptism of the Lord', 'baptism_of_the_lord', 'christmas', 'white', 'feast', null],
  ['2027-01-11', 'Monday of the 1st Week in Ordinary Time', 'ordinary_time_1_monday', 'ordinary', 'green', 'weekday', 1],
  ['2027-01-17', '2nd Sunday in Ordinary Time', 'ordinary_time_2_sunday', 'ordinary', 'green', 'sunday', 2],
  ['2026-02-02', 'The Presentation of the Lord', 'presentation_of_the_lord', 'ordinary', 'white', 'feast', 4],
  ['2026-02-18', 'Ash Wednesday', 'ash_wednesday', 'lent', 'violet', 'weekday', null],
  ['2026-02-19', 'Thursday after Ash Wednesday', 'thursday_after_ash_wednesday', 'lent', 'violet', 'weekday', null],
  ['2026-02-22', 'First Sunday of Lent', 'lent_1_sunday', 'lent', 'violet', 'sunday', 1],
  ['2026-02-27', 'Friday of the 1st Week of Lent', 'lent_1_friday', 'lent', 'violet', 'weekday', 1],
  ['2027-03-05', 'Friday of the 3rd Week of Lent', 'lent_3_friday', 'lent', 'violet', 'weekday', 3],
  ['2026-03-06', 'Friday of the 2nd Week of Lent', 'lent_2_friday', 'lent', 'violet', 'weekday', 2],
  ['2026-03-15', 'Fourth Sunday of Lent', 'lent_4_sunday', 'lent', 'rose', 'sunday', 4],
  ['2026-03-19', 'Saint Joseph, Spouse of the Blessed Virgin Mary', 'joseph_spouse_of_mary', 'lent', 'white', 'solemnity', 4],
  ['2026-03-25', 'The Annunciation of the Lord', 'annunciation_of_the_lord', 'lent', 'white', 'solemnity', 5],
  ['2026-03-29', 'Palm Sunday of the Passion of the Lord', 'palm_sunday_of_the_passion_of_the_lord', 'lent', 'red', 'sunday', 6],
  ['2026-03-30', 'Monday of Holy Week', 'holy_monday', 'lent', 'violet', 'weekday', 6],
  ['2026-04-01', 'Wednesday of Holy Week', 'holy_wednesday', 'lent', 'violet', 'weekday', 6],
  ['2026-04-02', "Holy Thursday, the Lord's Supper", 'thursday_of_the_lords_supper', 'triduum', 'white', 'triduum', null],
  ['2026-04-03', 'Good Friday, the Passion of the Lord', 'friday_of_the_passion_of_the_lord', 'triduum', 'red', 'triduum', null],
  ['2026-04-04', 'Holy Saturday, the Easter Vigil', 'holy_saturday', 'triduum', 'white', 'triduum', null],
  ['2026-04-05', 'Easter Sunday, the Resurrection of the Lord', 'easter_sunday', 'easter', 'white', 'solemnity', 1],
  ['2026-04-07', 'Tuesday in the Octave of Easter', 'easter_tuesday', 'easter', 'white', 'solemnity', 1],
  ['2026-04-12', 'Second Sunday of Easter (Divine Mercy Sunday)', 'divine_mercy_sunday', 'easter', 'white', 'sunday', 2],
  ['2026-04-13', 'Monday of the 2nd Week of Easter', 'easter_time_2_monday', 'easter', 'white', 'weekday', 2],
  ['2026-04-19', 'Third Sunday of Easter', 'easter_time_3_sunday', 'easter', 'white', 'sunday', 3],
  ['2026-05-14', 'The Ascension of the Lord', 'ascension_of_the_lord', 'easter', 'white', 'solemnity', 6],
  ['2026-05-17', 'Seventh Sunday of Easter', 'easter_time_7_sunday', 'easter', 'white', 'sunday', 7],
  ['2026-05-24', 'Pentecost Sunday', 'pentecost_sunday', 'easter', 'red', 'solemnity', 8],
  ['2026-05-25', 'Monday of the 8th Week in Ordinary Time', 'ordinary_time_8_monday', 'ordinary', 'green', 'weekday', 8],
  ['2026-05-31', 'The Most Holy Trinity', 'most_holy_trinity', 'ordinary', 'white', 'solemnity', 9],
  ['2026-06-04', 'The Most Holy Body and Blood of Christ (Corpus Christi)', 'most_holy_body_and_blood_of_christ', 'ordinary', 'white', 'solemnity', 9],
  ['2026-06-12', 'The Most Sacred Heart of Jesus', 'most_sacred_heart_of_jesus', 'ordinary', 'white', 'solemnity', 10],
  ['2026-06-24', 'The Nativity of Saint John the Baptist', 'nativity_of_john_the_baptist', 'ordinary', 'white', 'solemnity', 12],
  ['2026-06-29', 'Saints Peter and Paul, Apostles', 'peter_and_paul_apostles', 'ordinary', 'red', 'solemnity', 13],
  ['2026-07-25', 'Saint James, Apostle', 'james_apostle', 'ordinary', 'red', 'feast', 16],
  ['2026-08-06', 'The Transfiguration of the Lord', 'transfiguration_of_the_lord', 'ordinary', 'white', 'feast', 18],
  ['2026-08-15', 'The Assumption of the Blessed Virgin Mary', 'assumption_of_the_blessed_virgin_mary', 'ordinary', 'white', 'solemnity', 19],
  ['2026-09-14', 'The Exaltation of the Holy Cross', 'exaltation_of_the_holy_cross', 'ordinary', 'red', 'feast', 24],
  ['2026-11-09', 'The Dedication of the Lateran Basilica', 'dedication_of_the_lateran_basilica', 'ordinary', 'white', 'feast', 32],
];

check('the days the brief and the books name: title, id, season, colour, rank and week of each', () => {
  for (const [date, title, id, season, colour, rank, week] of ROWS) {
    const [y, m, d] = date.split('-').map(Number);
    const x = L(y, m, d);
    assert.deepEqual({ title: x.title, id: x.id, season: x.season, colour: x.colour, rank: x.rank, week: x.week }, { title, id, season, colour, rank, week }, date);
  }
});

check('2026-11-08 is the 32nd Sunday in Ordinary Time, Sunday Year A, weekday Year II; Christ the King of 2026 is 22 November', () => {
  assert.deepEqual(L(2026, 11, 8), {
    id: 'ordinary_time_32_sunday', title: '32nd Sunday in Ordinary Time', season: 'ordinary', colour: 'green', rank: 'sunday', week: 32, sundayCycle: 'A', weekdayCycle: 'II',
  });
  assert.equal(L(2026, 11, 22).title, 'Our Lord Jesus Christ, King of the Universe');
  for (let y = 1900; y <= 2300; y++) {
    const king = addDays(adventStart(y), -7);
    assert.equal(liturgicalDayOf(king).id, 'our_lord_jesus_christ_king_of_the_universe', String(y));
    assert.equal(weekdayIndex(king), 6);
    assert.ok(king.m === 11 && king.d >= 20 && king.d <= 26, `${y}: ${iso(king)}`);
    assert.equal(liturgicalDayOf(addDays(king, -7)).week, 33, `${y}: the Sunday before is the 33rd`);
  }
});

check('Easter and the days counted from it: Ash Wednesday, Palm Sunday, the Triduum, the octave, the Sunday of Divine Mercy, the Ascension on the Thursday, Pentecost, the Trinity, Corpus Christi on the Thursday, the Sacred Heart on the Friday', () => {
  const wanted: [number, string, string, string][] = [
    [-46, 'ash_wednesday', 'lent', 'violet'], [-7, 'palm_sunday_of_the_passion_of_the_lord', 'lent', 'red'], [-6, 'holy_monday', 'lent', 'violet'], [-5, 'holy_tuesday', 'lent', 'violet'],
    [-4, 'holy_wednesday', 'lent', 'violet'], [-3, 'thursday_of_the_lords_supper', 'triduum', 'white'], [-2, 'friday_of_the_passion_of_the_lord', 'triduum', 'red'],
    [-1, 'holy_saturday', 'triduum', 'white'], [0, 'easter_sunday', 'easter', 'white'], [1, 'easter_monday', 'easter', 'white'], [6, 'easter_saturday', 'easter', 'white'],
    [7, 'divine_mercy_sunday', 'easter', 'white'], [39, 'ascension_of_the_lord', 'easter', 'white'], [49, 'pentecost_sunday', 'easter', 'red'], [56, 'most_holy_trinity', 'ordinary', 'white'],
    [60, 'most_holy_body_and_blood_of_christ', 'ordinary', 'white'], [68, 'most_sacred_heart_of_jesus', 'ordinary', 'white'],
  ];
  const weekdays: Record<number, number> = { [-46]: 2, [-3]: 3, [-2]: 4, [-1]: 5, 0: 6, 39: 3, 49: 6, 56: 6, 60: 3, 68: 4 }; // 0 Monday ... 6 Sunday
  for (let y = 1900; y <= 2300; y++) {
    const e = toDays(easterSunday(y));
    for (const [offset, id, season, colour] of wanted) {
      const x = liturgicalDayOf(fromDays(e + offset));
      assert.deepEqual({ id: x.id, season: x.season, colour: x.colour }, { id, season, colour }, `${y}, Easter ${offset >= 0 ? '+' : ''}${offset}`);
      if (offset in weekdays) assert.equal(weekdayIndex(fromDays(e + offset)), weekdays[offset], `${y}: the weekday of Easter ${offset}`);
    }
    assert.equal(liturgicalDayOf(fromDays(e + 13)).week, 2, `${y}: the Saturday after the Sunday of Divine Mercy is in week 2`);
    assert.equal(liturgicalDayOf(fromDays(e + 14)).id, 'easter_time_3_sunday');
    assert.equal(liturgicalDayOf(fromDays(e + 42)).id, 'easter_time_7_sunday');
  }
});

check('Christmas time: Christmas Day, the Holy Family (and 30 December when Christmas is a Sunday), Mary on 1 January, the Epiphany on 6 January, the Baptism of the Lord on the Sunday after it', () => {
  for (let y = 1900; y <= 2300; y++) {
    assert.equal(L(y, 12, 25).id, 'nativity_of_the_lord', String(y));
    const holy = daysOf(y).filter((x) => L(x.y, x.m, x.d).id === 'holy_family_of_jesus_mary_and_joseph');
    assert.equal(holy.length, 1, `${y}: one Holy Family`);
    if (weekdayIndex(day(y, 12, 25)) === 6) assert.deepEqual(holy[0], day(y, 12, 30), `${y}: Christmas is a Sunday`);
    else { assert.equal(weekdayIndex(holy[0]), 6); assert.ok(holy[0].m === 12 && holy[0].d >= 26, `${y}: ${iso(holy[0])}`); }
    assert.equal(L(y, 1, 1).id, 'mary_mother_of_god');
    assert.equal(L(y, 1, 6).id, 'epiphany_of_the_lord');
    const baptism = daysOf(y).filter((x) => L(x.y, x.m, x.d).id === 'baptism_of_the_lord');
    assert.equal(baptism.length, 1, `${y}: one Baptism`);
    assert.equal(weekdayIndex(baptism[0]), 6);
    assert.ok(baptism[0].m === 1 && baptism[0].d >= 7 && baptism[0].d <= 13, `${y}: the Baptism is ${iso(baptism[0])}`);
    assert.deepEqual(liturgicalDayOf(addDays(baptism[0], 1)).id, 'ordinary_time_1_monday', `${y}: Ordinary Time begins the day after`);
    // a second Sunday after Christmas only when there is a Sunday from 2 to 5 January
    const second = [2, 3, 4, 5].some((d) => weekdayIndex(day(y, 1, d)) === 6);
    assert.equal(daysOf(y).some((x) => L(x.y, x.m, x.d).id === 'second_sunday_after_christmas'), second, String(y));
  }
});

/* ===================================================================================================== Ordinary Time */

check('Ordinary Time is 33 or 34 weeks: counted up from the Baptism before Lent and down from the 34th Sunday after Pentecost, one week skipped when they would meet, and every week holds Monday to Saturday under its Sunday', () => {
  for (let y = 1900; y <= 2300; y++) {
    const seen = new Set<number>();
    let previousSunday = 0;
    for (const x of daysOf(y)) {
      const l = L(x.y, x.m, x.d);
      if (l.season !== 'ordinary' || l.week === null) continue;
      seen.add(l.week);
      if (l.id.startsWith('ordinary_time_')) {
        assert.ok(l.id.startsWith(`ordinary_time_${l.week}_`), `${iso(x)}: ${l.id} is in week ${l.week}`);
        assert.equal(l.title.includes(ordinal(l.week)), true, `${iso(x)}: ${l.title}`);
        assert.equal(l.id.endsWith('_sunday'), weekdayIndex(x) === 6, `${iso(x)}`);
      }
      if (weekdayIndex(x) === 6) { assert.ok(l.week >= previousSunday, `${iso(x)}: the weeks of the Sundays never go back`); previousSunday = l.week; }
    }
    assert.ok(seen.has(34), `${y}: the 34th week`);
    assert.ok(Math.min(...seen) === 1, `${y}: the 1st week`);
    assert.ok(seen.size === 33 || seen.size === 34, `${y}: ${seen.size} weeks of Ordinary Time are held`);
  }
});

check('the Monday after Pentecost is the Monday of the week that counting back from the 34th Sunday gives, and the weeks of Ordinary Time run on to the Saturday before Advent', () => {
  for (let y = 1900; y <= 2300; y++) {
    const pentecost = addDays(easterSunday(y), 49);
    const monday = liturgicalDayOf(addDays(pentecost, 1));
    const weeks = (toDays(adventStart(y)) - 7 - toDays(pentecost)) / 7; // Pentecost Sunday to Christ the King
    assert.equal(monday.week, 34 - weeks, `${y}`);
    assert.equal(monday.id, `ordinary_time_${34 - weeks}_monday`);
    assert.equal(liturgicalDayOf(addDays(adventStart(y), -1)).id, 'ordinary_time_34_saturday', `${y}`);
  }
});

/* ============================================================================ the fixed solemnities and feasts, and where they go */

const SOLEMNITIES = ['joseph_spouse_of_mary', 'annunciation_of_the_lord', 'nativity_of_john_the_baptist', 'peter_and_paul_apostles', 'assumption_of_the_blessed_virgin_mary', 'all_saints',
  'commemoration_of_all_the_faithful_departed', 'immaculate_conception_of_the_blessed_virgin_mary'];
const FEASTS = ['presentation_of_the_lord', 'transfiguration_of_the_lord', 'exaltation_of_the_holy_cross', 'dedication_of_the_lateran_basilica'];

check('every solemnity is kept once a year, on a day no stronger day holds; every feast of the Lord once; Saint James once, except when 25 July is a Sunday and the Sunday wins', () => {
  for (let y = FIRST_YEAR; y <= 2400; y++) {
    const all = daysOf(y).map((x) => ({ x, l: L(x.y, x.m, x.d) }));
    const easter = toDays(easterSunday(y));
    for (const id of [...SOLEMNITIES, ...FEASTS]) {
      const where = all.filter((c) => c.l.id === id);
      assert.equal(where.length, 1, `${y}: ${id} is kept ${where.length} times`);
      const at = toDays(where[0].x);
      assert.ok(at < easter - 7 || at > easter + 7, `${y}: ${id} on ${iso(where[0].x)} is between Palm Sunday and the Sunday of Divine Mercy`);
      if (where[0].l.season === 'advent' || where[0].l.season === 'lent' || where[0].l.season === 'easter') assert.notEqual(weekdayIndex(where[0].x), 6, `${y}: ${id} on a Sunday of ${where[0].l.season}`);
      assert.equal(where[0].l.rank, SOLEMNITIES.includes(id) ? 'solemnity' : 'feast');
    }
    const james = all.filter((c) => c.l.id === 'james_apostle');
    assert.equal(james.length, weekdayIndex(day(y, 7, 25)) === 6 ? 0 : 1, `${y}: Saint James`);
    if (james.length === 1) assert.deepEqual(james[0].x, day(y, 7, 25));
    // a Sunday of Ordinary Time is lost only to the days of the Lord, of Mary and of All Saints: any other id on one is a mistake
    for (const c of all) {
      if (weekdayIndex(c.x) !== 6 || c.l.season !== 'ordinary') continue;
      const ok = /^ordinary_time_\d+_sunday$/.test(c.l.id) || [...SOLEMNITIES, ...FEASTS, 'most_holy_trinity', 'our_lord_jesus_christ_king_of_the_universe'].includes(c.l.id);
      assert.ok(ok, `${y}: ${iso(c.x)} ${c.l.id}`);
    }
  }
});

check('where a solemnity is moved to: Saint Joseph before Palm Sunday, the Annunciation after the octave of Easter, the Immaculate Conception to the Monday, John the Baptist to 23 June, Peter and Paul to the Saturday', () => {
  const where = (y: number, id: string): string => { const c = daysOf(y).find((x) => L(x.y, x.m, x.d).id === id); return c ? iso(c) : 'nowhere'; };
  // Saint Joseph, 19 March: from Palm Sunday to the Sunday of Divine Mercy he is kept on the Saturday before Palm Sunday; on a Sunday of Lent, on the Monday
  assert.equal(where(2008, 'joseph_spouse_of_mary'), '2008-03-15', 'Easter was 23 March: 19 March was in Holy Week');
  assert.equal(where(2035, 'joseph_spouse_of_mary'), '2035-03-17', 'Easter 25 March: Holy Monday');
  assert.equal(where(2023, 'joseph_spouse_of_mary'), '2023-03-20', '19 March 2023 was the Fourth Sunday of Lent');
  assert.equal(where(2026, 'joseph_spouse_of_mary'), '2026-03-19');
  // the Annunciation, 25 March: in Holy Week or the octave of Easter, on the Monday after the Sunday of Divine Mercy; on a Sunday of Lent, on the Monday
  assert.equal(where(2008, 'annunciation_of_the_lord'), '2008-03-31', 'Easter 23 March, Divine Mercy 30 March');
  assert.equal(where(2018, 'annunciation_of_the_lord'), '2018-04-09', '25 March 2018 was Palm Sunday');
  assert.equal(where(2024, 'annunciation_of_the_lord'), '2024-04-08', '25 March 2024 was Holy Monday');
  assert.equal(where(2012, 'annunciation_of_the_lord'), '2012-03-26', '25 March 2012 was the Fifth Sunday of Lent');
  assert.equal(where(2026, 'annunciation_of_the_lord'), '2026-03-25');
  // the Immaculate Conception, 8 December: the Monday when 8 December is a Sunday of Advent
  assert.equal(where(2019, 'immaculate_conception_of_the_blessed_virgin_mary'), '2019-12-09');
  assert.equal(where(2024, 'immaculate_conception_of_the_blessed_virgin_mary'), '2024-12-09');
  assert.equal(where(2030, 'immaculate_conception_of_the_blessed_virgin_mary'), '2030-12-09');
  assert.equal(where(2025, 'immaculate_conception_of_the_blessed_virgin_mary'), '2025-12-08');
  assert.equal(where(2026, 'immaculate_conception_of_the_blessed_virgin_mary'), '2026-12-08');
  // John the Baptist, 24 June: 23 June when 24 June is the Sacred Heart; Peter and Paul, 29 June: the next free day when it is
  assert.equal(where(2022, 'nativity_of_john_the_baptist'), '2022-06-23');
  assert.equal(where(2022, 'most_sacred_heart_of_jesus'), '2022-06-24');
  assert.equal(where(2033, 'nativity_of_john_the_baptist'), '2033-06-23');
  assert.equal(where(2027, 'nativity_of_john_the_baptist'), '2027-06-24');
  assert.equal(where(2057, 'most_sacred_heart_of_jesus'), '2057-06-29');
  assert.equal(where(2057, 'peter_and_paul_apostles'), '2057-06-30');
  // the Sundays that a day of the Lord or of Mary takes from Ordinary Time
  for (const [date, id] of [['2026-11-01', 'all_saints'], ['2025-11-02', 'commemoration_of_all_the_faithful_departed'], ['2025-11-09', 'dedication_of_the_lateran_basilica'],
    ['2025-02-02', 'presentation_of_the_lord'], ['2023-08-06', 'transfiguration_of_the_lord'], ['2025-09-14', 'exaltation_of_the_holy_cross'], ['2027-08-15', 'assumption_of_the_blessed_virgin_mary'],
    ['2025-06-29', 'peter_and_paul_apostles']] as const) {
    const [y, m, d] = date.split('-').map(Number);
    assert.equal(weekdayIndex(day(y, m, d)), 6, `${date} is a Sunday`);
    assert.equal(L(y, m, d).id, id, date);
  }
  // Saint James: a feast, so the Sunday keeps its day when 25 July is one (2027 is a Holy Year of Compostela and 25 July is a Sunday)
  assert.equal(L(2027, 7, 25).id, 'ordinary_time_17_sunday');
  assert.equal(L(2028, 7, 25).id, 'james_apostle');
  assert.equal(L(2028, 7, 25).rank, 'feast');
});

check('the saints are not in: a memorial or a feast of a saint leaves the day of the temporal cycle under it', () => {
  assert.equal(L(2026, 11, 4).title, 'Wednesday of the 31st Week in Ordinary Time', 'Saint Charles Borromeo');
  assert.equal(L(2026, 10, 15).title, 'Thursday of the 28th Week in Ordinary Time', 'Saint Teresa of Avila');
  assert.equal(L(2026, 12, 26).title, 'Second Day in the Octave of Christmas', 'Saint Stephen');
  assert.equal(L(2026, 12, 28).id, 'christmas_octave_day_4', 'the Holy Innocents');
  assert.equal(L(2026, 2, 3).title, 'Tuesday of the 4th Week in Ordinary Time', 'Saint Blaise');
  assert.equal(L(2026, 3, 17).title, 'Tuesday of the 4th Week of Lent', 'Saint Patrick');
  assert.equal(L(2026, 6, 13).title, 'Saturday of the 10th Week in Ordinary Time', 'Saint Anthony, and the Immaculate Heart');
  assert.equal(L(2026, 5, 25).title, 'Monday of the 8th Week in Ordinary Time', 'Mary, Mother of the Church');
});

/* =================================================================================================== the rest of the rules */

check('the colours: Ordinary Time green, Advent and Lent violet (rose on the Third Sunday of Advent and the Fourth of Lent, red on Palm Sunday), Christmas and Easter white (Pentecost red)', () => {
  for (const x of daysOf(2026).concat(daysOf(2027), daysOf(2028))) {
    const l = L(x.y, x.m, x.d);
    if (l.rank === 'weekday' || l.rank === 'sunday') {
      const rose = l.id === 'advent_3_sunday' || l.id === 'lent_4_sunday';
      const expected = rose ? 'rose' : l.id === 'palm_sunday_of_the_passion_of_the_lord' ? 'red' : ({ ordinary: 'green', advent: 'violet', lent: 'violet', christmas: 'white', easter: 'white', triduum: l.colour } as const)[l.season];
      assert.equal(l.colour, expected, `${iso(x)} ${l.id}`);
    }
    assert.ok(['green', 'violet', 'white', 'red', 'rose'].includes(l.colour));
  }
  assert.equal(L(2026, 4, 3).colour, 'red', 'Good Friday');
  assert.equal(L(2026, 5, 24).colour, 'red', 'Pentecost');
});

check('every day has a title, an id, a season and a rank that agree, and a week where the season counts weeks', () => {
  const ids = new Set<string>();
  for (const y of [2024, 2025, 2026, 2027, 2028]) {
    for (const x of daysOf(y)) {
      const l = L(x.y, x.m, x.d);
      assert.ok(l.title.length > 4 && l.title === l.title.trim() && !/\s{2}/.test(l.title), `${iso(x)}: "${l.title}"`);
      assert.match(l.id, /^[a-z0-9_]+$/);
      ids.add(l.id);
      assert.ok(l.season in SEASON_NAMES && l.colour in COLOUR_NAMES && l.rank in RANK_NAMES);
      if (l.season === 'christmas' || l.season === 'triduum') assert.equal(l.week, null, iso(x));
      else if (l.season === 'advent') assert.ok(l.week !== null && l.week >= 1 && l.week <= 4, iso(x));
      else if (l.season === 'easter') assert.ok(l.week !== null && l.week >= 1 && l.week <= 8, iso(x));
      else if (l.season === 'ordinary') assert.ok(l.week !== null && l.week >= 1 && l.week <= 34, iso(x));
      else assert.ok(l.week === null || (l.week >= 1 && l.week <= 6), iso(x));
      assert.equal(l.rank === 'triduum', l.season === 'triduum', `${iso(x)}: the three days of the Triduum, and only they`);
      if (weekdayIndex(x) === 6 && ['advent', 'lent', 'easter'].includes(l.season)) assert.ok(l.rank === 'sunday' || l.id === 'easter_sunday' || l.id === 'pentecost_sunday', iso(x));
    }
  }
  assert.ok(ids.size > 330, `${ids.size} different days over five years`);
});

check('the words: 1st 2nd 3rd 4th 11th 12th 13th 21st 22nd 23rd 32nd, the names of the seasons, colours and ranks, and the small print of the screen', () => {
  assert.deepEqual([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 31, 32, 33, 34].map(ordinal), ['1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd', '23rd', '31st', '32nd', '33rd', '34th']);
  assert.deepEqual(SEASON_NAMES, { advent: 'Advent', christmas: 'Christmas Time', ordinary: 'Ordinary Time', lent: 'Lent', triduum: 'Easter Triduum', easter: 'Easter Time' });
  assert.deepEqual(COLOUR_NAMES, { green: 'Green', violet: 'Violet', white: 'White', red: 'Red', rose: 'Rose' });
  assert.deepEqual(RANK_NAMES, { solemnity: 'Solemnity', feast: 'Feast', sunday: 'Sunday', weekday: 'Weekday', triduum: 'Triduum' });
  assert.equal(LITURGY_NOTE, 'General Roman Calendar, computed on this phone; your country may move some feasts to a Sunday');
});

check('a day that does not exist is an error, and so is a year the Gregorian calendar did not have', () => {
  for (const [y, m, d] of [[2026, 2, 30], [2026, 13, 1], [2026, 0, 1], [2026, 4, 31], [2027, 2, 29], [2026.5, 4, 1], [2026, 4, 1.5], [NaN, 1, 1], [FIRST_YEAR - 1, 12, 31], [LAST_YEAR + 1, 1, 1]]) {
    assert.throws(() => L(y, m, d), RangeError, `${y}-${m}-${d}`);
  }
  assert.doesNotThrow(() => L(FIRST_YEAR, 1, 1));
  assert.doesNotThrow(() => L(LAST_YEAR, 12, 31));
  assert.doesNotThrow(() => L(2028, 2, 29));
});

check('the answer is made of numbers only: the same day gives the same answer however often it is asked, and nothing is shared between calls', () => {
  const a = L(2026, 11, 8);
  const b = L(2026, 11, 8);
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
  (a as { title: string }).title = 'changed';
  assert.equal(L(2026, 11, 8).title, '32nd Sunday in Ordinary Time');
  assert.deepEqual(liturgicalDayOf(day(2026, 11, 8)), L(2026, 11, 8));
});

/* ============================================================================================ the digest of the compared years */

/** FNV-1a (32 bits) of a text: a small fingerprint, enough to see that nothing moved. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

check('the module answers for 2024 to 2032 as it did when it was compared with romcal (3,288 days: id, season, colour, rank, week and both cycles of each)', () => {
  const lines: string[] = [];
  for (let y = 2024; y <= 2032; y++) for (const x of daysOf(y)) { const l = L(x.y, x.m, x.d); lines.push(`${iso(x)}|${l.id}|${l.season}|${l.colour}|${l.rank}|${l.week}|${l.sundayCycle}|${l.weekdayCycle}`); }
  assert.equal(lines.length, 3288);
  assert.equal(fnv(lines.join('\n')), 'd3ca9698');
});

console.log(`${n} of ${n} passed`);
