// The liturgical day of the General Roman Calendar, as pure functions: no React, no React Native, no dependency, and no Date or Intl. A day
// goes in as three whole numbers (year, month, day) and never as a timestamp, so no time zone and no phone can move it. Everything is worked out
// from the day counting of calendar.ts and from the date of Easter, here, on the phone, so it works with no signal and costs nothing.
// (npm run test:library pins it. It was also checked once, outside the repository, against romcal, a library that is not a dependency of the app,
// for every day of 2024 to 2032 and of 1990 to 2100; what was compared, and the few days where the two differ and why, are written at the top of
// liturgy.test.ts.)
//
// WHAT IS IN IT. The temporal cycle (Advent, Christmas time, Ordinary Time, Lent, the Easter Triduum, Easter time) with its Sundays, weeks and
// weekdays, the movable solemnities of the Lord (Ascension on the Thursday, Pentecost, the Most Holy Trinity, Corpus Christi on the Thursday, the
// Sacred Heart on the Friday, Christ the King), and the fixed solemnities and feasts of the Lord of the universal calendar that decide what a day is
// called: Christmas, the Holy Family, Mary the Mother of God, the Epiphany on 6 January, the Baptism of the Lord, the Presentation (2 February),
// Saint Joseph (19 March), the Annunciation (25 March), the Nativity of Saint John the Baptist (24 June), Saints Peter and Paul (29 June), the
// Transfiguration (6 August), the Assumption (15 August), the Exaltation of the Holy Cross (14 September), All Saints (1 November), All Souls (2
// November), the Dedication of the Lateran Basilica (9 November) and the Immaculate Conception (8 December), and 25 July, Saint James, who is the
// saint of this app (a feast in the universal calendar, a solemnity in Spain: see JAMES below). These are the days that take a Sunday away from the
// Sundays of Ordinary Time or that are moved when another day is in their way, so a "32nd Sunday in Ordinary Time" is never said on the day of
// All Saints.
//
// WHAT IS NOT. The memorials and the feasts of the other saints (Saint Stephen on 26 December, Saint Teresa on 15 October ...): they differ from
// country to country and from diocese to diocese, and they arrive with the readings source, which says which of them a pilgrim keeps. On such a
// day the title here is the day of the temporal cycle underneath ("Saturday of the 31st Week in Ordinary Time"). The universal dates are used for
// the Epiphany (6 January), the Ascension (the Thursday) and Corpus Christi (the Thursday): many countries move them to a Sunday, and the screen
// says so in its small print (LITURGY_NOTE). Local patron saints, proper calendars and the Sunday of the Word of God are not here either.
//
// THE RULES OF PRECEDENCE are those of the Table of Liturgical Days (Universal Norms on the Liturgical Year and the General Calendar, no. 59). The
// days that count here, from the strongest to the weakest (a smaller number wins):
//   1  the Easter Triduum, and Easter Sunday
//   2  Christmas, the Epiphany, the Ascension and Pentecost; the Sundays of Advent, Lent and Easter; Ash Wednesday; Holy Monday to Holy Wednesday;
//      the days of the octave of Easter
//   3  the solemnities of the Lord, of Mary and of the saints, and All Souls
//   5  the feasts of the Lord (the Baptism, the Holy Family, the Presentation, the Transfiguration, the Exaltation of the Cross, the Lateran)
//   6  the Sundays of Christmas time and of Ordinary Time
//   7  the feasts of Mary and of the saints (only Saint James is here)
//   9  the privileged weekdays: 17 to 24 December, the octave of Christmas, the weekdays of Lent
//  13  every other weekday
// A fixed day that is stronger than the day it falls on takes its place. A solemnity that is weaker or as strong (a Sunday of Lent, Holy Week, the
// octave of Easter, another solemnity) moves to the nearest day after it that none of the days 1 to 8 holds; a feast that loses is left out for the
// year. Two exceptions are written out: Saint Joseph, when he would fall from Palm Sunday to the Sunday of Divine Mercy, is kept on the Saturday
// before Palm Sunday, and the Nativity of Saint John the Baptist is kept on 23 June when 24 June is the Sacred Heart (or Corpus Christi).
//
// THE CYCLES. The liturgical year begins on the First Sunday of Advent and carries the Sunday cycle: Year A when the Advent it began with is in a
// year that 3 divides (Advent 2025 began Year A, 2026 Year B, 2027 Year C). The weekday cycle is Year I in the years with an odd number and Year II
// in the even ones, and a liturgical year has the number of the year it ends in: the days from the First Sunday of Advent to 31 December already
// belong to the next year's cycle (Advent 2026 is Year I, because Ordinary Time 2027 is). That only matters for the weekday readings of Ordinary
// Time, which Advent and Christmas have none of, but it is how the lectionary names them and what romcal says.
import { WEEKDAYS, fromDays, isValidDay, toDays, type Ymd } from './calendar';

export type Season = 'advent' | 'christmas' | 'ordinary' | 'lent' | 'triduum' | 'easter';
export type LiturgicalColour = 'green' | 'violet' | 'white' | 'red' | 'rose';
/** Solemnity, feast, Sunday and weekday as the Table of Liturgical Days has them, and the three days of the Easter Triduum, which are none of those. */
export type Rank = 'solemnity' | 'feast' | 'sunday' | 'weekday' | 'triduum';
export type SundayCycle = 'A' | 'B' | 'C';
export type WeekdayCycle = 'I' | 'II';

export type LiturgicalDay = {
  /** A name for the day that does not change (the ids of romcal, so that a bookmark or a readings source can hold on to it): "ordinary_time_32_sunday". */
  id: string;
  season: Season;
  colour: LiturgicalColour;
  /** "32nd Sunday in Ordinary Time", "Saturday of the 31st Week in Ordinary Time", "Ash Wednesday". */
  title: string;
  rank: Rank;
  /** The week of the season, counted the way the books count it; null where the season has no numbered weeks (Christmas time, the Triduum, the days after Ash Wednesday). */
  week: number | null;
  sundayCycle: SundayCycle;
  weekdayCycle: WeekdayCycle;
};

/** Gregorian years only: the calendar began in 1583 in the first countries, and four digits is as far as the screen goes. */
export const FIRST_YEAR = 1583;
export const LAST_YEAR = 9999;

/** The small print of the screen: what the day is worked out from and what it leaves to the country. */
export const LITURGY_NOTE = 'General Roman Calendar, computed on this phone; your country may move some feasts to a Sunday';

export const SEASON_NAMES: Record<Season, string> = { advent: 'Advent', christmas: 'Christmas Time', ordinary: 'Ordinary Time', lent: 'Lent', triduum: 'Easter Triduum', easter: 'Easter Time' };
export const COLOUR_NAMES: Record<LiturgicalColour, string> = { green: 'Green', violet: 'Violet', white: 'White', red: 'Red', rose: 'Rose' };
export const RANK_NAMES: Record<Rank, string> = { solemnity: 'Solemnity', feast: 'Feast', sunday: 'Sunday', weekday: 'Weekday', triduum: 'Triduum' };

/* ------------------------------------------------------------------------------------------------------------- the words */

const WORD = ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh'];

/** 1st, 2nd, 3rd, 4th ... 11th, 12th, 13th ... 21st, 22nd, 23rd ... */
export function ordinal(n: number): string {
  const last = n % 100;
  if (last >= 11 && last <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const lower = (text: string): string => text.toLowerCase();

/* -------------------------------------------------------------------------------------------------------------- the dates */

/** The date of Easter Sunday in the Gregorian calendar (the Meeus / Jones / Butcher computation, in whole numbers). */
export function easterSunday(year: number): Ymd {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { y: year, m: month, d: day };
}

/** 0 for Monday to 6 for Sunday, from the number of a day (1 January 1970, number 0, was a Thursday). */
const dow = (n: number): number => (((n + 3) % 7) + 7) % 7;

/** The Sunday on or before a day. */
const sundayOnOrBefore = (n: number): number => n - ((dow(n) + 1) % 7);

/** The first Sunday strictly after a day. */
const sundayAfter = (n: number): number => n + (6 - dow(n) || 7);

/** The First Sunday of Advent that begins in this year: the fourth Sunday before Christmas Day, which is the Sunday between 27 November and 3 December. */
export function adventStart(year: number): Ymd {
  const christmas = toDays({ y: year, m: 12, d: 25 });
  const fourth = christmas - (dow(christmas) === 6 ? 7 : dow(christmas) + 1); // the last Sunday before Christmas
  return fromDays(fourth - 21);
}

type Anchors = {
  easter: number;
  advent: number;
  christmas: number;
  /** The Baptism of the Lord: the Sunday after 6 January. */
  baptism: number;
  /** The Holy Family: the Sunday from 26 to 31 December, and 30 December when Christmas Day is a Sunday. */
  holyFamily: number;
};

const anchorCache = new Map<number, Anchors>();

function anchors(year: number): Anchors {
  let a = anchorCache.get(year);
  if (!a) {
    const christmas = toDays({ y: year, m: 12, d: 25 });
    a = {
      easter: toDays(easterSunday(year)),
      advent: toDays(adventStart(year)),
      christmas,
      baptism: sundayAfter(toDays({ y: year, m: 1, d: 6 })),
      holyFamily: dow(christmas) === 6 ? christmas + 5 : sundayAfter(christmas),
    };
    anchorCache.set(year, a);
  }
  return a;
}

/* ----------------------------------------------------------------------------------------------------- the temporal cycle */

/** What the temporal cycle says a day is, before a fixed solemnity or feast is looked at. `prec` is the number of the Table of Liturgical Days. */
type Day = { id: string; title: string; season: Season; colour: LiturgicalColour; rank: Rank; week: number | null; prec: number };

/** The temporal day of the day number `n`. */
function temporal(n: number): Day {
  const y = fromDays(n).y;
  const a = anchors(y);
  const w = dow(n);
  const weekday = WEEKDAYS[w];
  const sunday = w === 6;
  const day = (id: string, title: string, season: Season, colour: LiturgicalColour, rank: Rank, week: number | null, prec: number): Day => ({ id, title, season, colour, rank, week, prec });
  const plain = (season: Season, colour: LiturgicalColour, week: number, prec: number, name: string, id: string): Day =>
    day(`${id}_${week}_${lower(weekday)}`, `${weekday} of the ${ordinal(week)} Week ${name}`, season, colour, 'weekday', week, prec);
  const ordinary = (week: number): Day =>
    sunday
      ? day(`ordinary_time_${week}_sunday`, `${ordinal(week)} Sunday in Ordinary Time`, 'ordinary', 'green', 'sunday', week, 6)
      : day(`ordinary_time_${week}_${lower(weekday)}`, `${weekday} of the ${ordinal(week)} Week in Ordinary Time`, 'ordinary', 'green', 'weekday', week, 13);

  // From the First Sunday of Advent to the end of the year: Advent, then Christmas Day and the octave.
  if (n >= a.advent) {
    if (n < a.christmas) {
      const week = 1 + (sundayOnOrBefore(n) - a.advent) / 7;
      if (sunday) return day(`advent_${week}_sunday`, `${WORD[week]} Sunday of Advent`, 'advent', week === 3 ? 'rose' : 'violet', 'sunday', week, 2);
      const { m: month, d: dom } = fromDays(n);
      if (month === 12 && dom >= 17) return day(`advent_december_${dom}`, `Advent weekday, ${dom} December`, 'advent', 'violet', 'weekday', week, 9);
      return plain('advent', 'violet', week, 13, 'of Advent', 'advent');
    }
    if (n === a.christmas) return day('nativity_of_the_lord', 'The Nativity of the Lord (Christmas Day)', 'christmas', 'white', 'solemnity', null, 2);
    if (n === a.holyFamily) return day('holy_family_of_jesus_mary_and_joseph', 'The Holy Family of Jesus, Mary and Joseph', 'christmas', 'white', 'feast', null, 5);
    const k = n - a.christmas + 1; // 2 for 26 December ... 7 for 31 December
    return day(`christmas_octave_day_${k}`, `${WORD[k]} Day in the Octave of Christmas`, 'christmas', 'white', 'weekday', null, 9);
  }

  // From 1 January to the Baptism of the Lord: the rest of Christmas time.
  if (n <= a.baptism) {
    const dom = fromDays(n).d;
    if (dom === 1) return day('mary_mother_of_god', 'Mary, the Holy Mother of God', 'christmas', 'white', 'solemnity', null, 3);
    if (n === a.baptism) return day('baptism_of_the_lord', 'The Baptism of the Lord', 'christmas', 'white', 'feast', null, 5);
    if (dom === 6) return day('epiphany_of_the_lord', 'The Epiphany of the Lord', 'christmas', 'white', 'solemnity', null, 2);
    if (dom < 6) {
      if (sunday) return day('second_sunday_after_christmas', 'Second Sunday after Christmas', 'christmas', 'white', 'sunday', null, 6);
      return day(`christmas_time_january_${dom}`, `Weekday of Christmas, ${dom} January`, 'christmas', 'white', 'weekday', null, 13);
    }
    return day(`${lower(weekday)}_after_epiphany`, `${weekday} after the Epiphany`, 'christmas', 'white', 'weekday', null, 13);
  }

  // Ordinary Time before Lent: from the Monday after the Baptism to the Tuesday before Ash Wednesday. Week 1 is the week of the Baptism.
  const ash = a.easter - 46;
  if (n < ash) {
    const week = 1 + (sundayOnOrBefore(n) - a.baptism) / 7;
    return ordinary(week);
  }

  // Lent, Holy Week and the Triduum.
  if (n < a.easter) {
    if (n === ash) return day('ash_wednesday', 'Ash Wednesday', 'lent', 'violet', 'weekday', null, 2);
    if (n < ash + 4) return day(`${lower(weekday)}_after_ash_wednesday`, `${weekday} after Ash Wednesday`, 'lent', 'violet', 'weekday', null, 9);
    if (n === a.easter - 3) return day('thursday_of_the_lords_supper', "Holy Thursday, the Lord's Supper", 'triduum', 'white', 'triduum', null, 1);
    if (n === a.easter - 2) return day('friday_of_the_passion_of_the_lord', 'Good Friday, the Passion of the Lord', 'triduum', 'red', 'triduum', null, 1);
    // No Mass is said by day on Holy Saturday and the books give it no colour; the Vigil that night is white.
    if (n === a.easter - 1) return day('holy_saturday', 'Holy Saturday, the Easter Vigil', 'triduum', 'white', 'triduum', null, 1);
    const week = 1 + (sundayOnOrBefore(n) - (ash + 4)) / 7; // the First Sunday of Lent is four days after Ash Wednesday
    if (n === a.easter - 7) return day('palm_sunday_of_the_passion_of_the_lord', 'Palm Sunday of the Passion of the Lord', 'lent', 'red', 'sunday', 6, 2);
    if (n > a.easter - 7) return day(`holy_${lower(weekday)}`, `${weekday} of Holy Week`, 'lent', 'violet', 'weekday', 6, 2);
    if (sunday) return day(`lent_${week}_sunday`, `${WORD[week]} Sunday of Lent`, 'lent', week === 4 ? 'rose' : 'violet', 'sunday', week, 2);
    return plain('lent', 'violet', week, 9, 'of Lent', 'lent');
  }

  // Easter time: Easter Sunday, the octave, the Sundays and weeks of Easter, the Ascension, and Pentecost, which closes it.
  if (n <= a.easter + 49) {
    const since = n - a.easter;
    if (since === 0) return day('easter_sunday', 'Easter Sunday, the Resurrection of the Lord', 'easter', 'white', 'solemnity', 1, 1);
    if (since < 7) return day(`easter_${lower(weekday)}`, `${weekday} in the Octave of Easter`, 'easter', 'white', 'solemnity', 1, 2);
    if (since === 7) return day('divine_mercy_sunday', 'Second Sunday of Easter (Divine Mercy Sunday)', 'easter', 'white', 'sunday', 2, 2);
    if (since === 39) return day('ascension_of_the_lord', 'The Ascension of the Lord', 'easter', 'white', 'solemnity', 6, 2);
    if (since === 49) return day('pentecost_sunday', 'Pentecost Sunday', 'easter', 'red', 'solemnity', 8, 2);
    const week = 1 + (sundayOnOrBefore(n) - a.easter) / 7;
    if (sunday) return day(`easter_time_${week}_sunday`, `${WORD[week]} Sunday of Easter`, 'easter', 'white', 'sunday', week, 2);
    return plain('easter', 'white', week, 13, 'of Easter', 'easter_time');
  }

  // Ordinary Time after Pentecost, counted back from the 34th Sunday, which is Christ the King, the Sunday before Advent.
  const king = a.advent - 7;
  const week = 34 - (king - sundayOnOrBefore(n)) / 7;
  const since = n - a.easter;
  if (n === king) return day('our_lord_jesus_christ_king_of_the_universe', 'Our Lord Jesus Christ, King of the Universe', 'ordinary', 'white', 'solemnity', 34, 3);
  if (since === 56) return day('most_holy_trinity', 'The Most Holy Trinity', 'ordinary', 'white', 'solemnity', week, 3);
  if (since === 60) return day('most_holy_body_and_blood_of_christ', 'The Most Holy Body and Blood of Christ (Corpus Christi)', 'ordinary', 'white', 'solemnity', week, 3);
  if (since === 68) return day('most_sacred_heart_of_jesus', 'The Most Sacred Heart of Jesus', 'ordinary', 'white', 'solemnity', week, 3);
  return ordinary(week);
}

/* ------------------------------------------------------------------------------------------- the fixed solemnities and feasts */

type Fixed = { id: string; title: string; m: number; d: number; colour: LiturgicalColour; rank: Rank; prec: number };

// The days that are always on the same date and that this module knows. Saint James is a feast (the universal rank) and not a solemnity: his feast
// is left out when it falls on a Sunday, as the calendar of the whole Church has it. In Spain 25 July is a solemnity of the country's patron and the
// Sunday gives way: that is a proper calendar, and proper calendars come with the readings source.
const JAMES: Fixed = { id: 'james_apostle', title: 'Saint James, Apostle', m: 7, d: 25, colour: 'red', rank: 'feast', prec: 7 };

const FIXED: readonly Fixed[] = [
  { id: 'presentation_of_the_lord', title: 'The Presentation of the Lord', m: 2, d: 2, colour: 'white', rank: 'feast', prec: 5 },
  { id: 'joseph_spouse_of_mary', title: 'Saint Joseph, Spouse of the Blessed Virgin Mary', m: 3, d: 19, colour: 'white', rank: 'solemnity', prec: 3 },
  { id: 'annunciation_of_the_lord', title: 'The Annunciation of the Lord', m: 3, d: 25, colour: 'white', rank: 'solemnity', prec: 3 },
  { id: 'nativity_of_john_the_baptist', title: 'The Nativity of Saint John the Baptist', m: 6, d: 24, colour: 'white', rank: 'solemnity', prec: 3 },
  { id: 'peter_and_paul_apostles', title: 'Saints Peter and Paul, Apostles', m: 6, d: 29, colour: 'red', rank: 'solemnity', prec: 3 },
  JAMES,
  { id: 'transfiguration_of_the_lord', title: 'The Transfiguration of the Lord', m: 8, d: 6, colour: 'white', rank: 'feast', prec: 5 },
  { id: 'assumption_of_the_blessed_virgin_mary', title: 'The Assumption of the Blessed Virgin Mary', m: 8, d: 15, colour: 'white', rank: 'solemnity', prec: 3 },
  { id: 'exaltation_of_the_holy_cross', title: 'The Exaltation of the Holy Cross', m: 9, d: 14, colour: 'red', rank: 'feast', prec: 5 },
  { id: 'all_saints', title: 'All Saints', m: 11, d: 1, colour: 'white', rank: 'solemnity', prec: 3 },
  { id: 'commemoration_of_all_the_faithful_departed', title: 'The Commemoration of All the Faithful Departed (All Souls)', m: 11, d: 2, colour: 'violet', rank: 'solemnity', prec: 3 },
  { id: 'dedication_of_the_lateran_basilica', title: 'The Dedication of the Lateran Basilica', m: 11, d: 9, colour: 'white', rank: 'feast', prec: 5 },
  { id: 'immaculate_conception_of_the_blessed_virgin_mary', title: 'The Immaculate Conception of the Blessed Virgin Mary', m: 12, d: 8, colour: 'white', rank: 'solemnity', prec: 3 },
];

/** A day no day of the numbers 1 to 8 holds (an ordinary weekday, or a privileged weekday of 9): where a solemnity that has lost its day can go. */
const isFree = (n: number, placed: ReadonlyMap<number, Fixed>): boolean => temporal(n).prec >= 9 && (placed.get(n)?.prec ?? 13) >= 9;

const placementCache = new Map<number, ReadonlyMap<number, Fixed>>();

/**
 * Where each fixed day of a year really falls: on its own date when it is stronger than the day it meets, moved when it is a solemnity that is
 * not, and nowhere when it is a feast that is not. Worked out once for a year.
 */
function placements(year: number): ReadonlyMap<number, Fixed> {
  const cached = placementCache.get(year);
  if (cached) return cached;
  const a = anchors(year);
  const placed = new Map<number, Fixed>();
  const displaced: { fixed: Fixed; n: number }[] = [];
  for (const fixed of FIXED) {
    const n = toDays({ y: year, m: fixed.m, d: fixed.d });
    if (fixed.prec < temporal(n).prec) placed.set(n, fixed);
    else if (fixed.rank === 'solemnity') displaced.push({ fixed, n });
  }
  for (const { fixed, n } of displaced) {
    let to = n;
    const holyWeek = n >= a.easter - 7 && n <= a.easter + 7; // from Palm Sunday to the Sunday of Divine Mercy
    if (fixed.id === 'joseph_spouse_of_mary' && holyWeek) to = a.easter - 8; // the Saturday before Palm Sunday
    else if (fixed.id === 'nativity_of_john_the_baptist' && temporal(n).prec === 3 && temporal(n).rank === 'solemnity') to = n - 1; // 23 June
    else do { to += 1; } while (!isFree(to, placed));
    placed.set(to, fixed);
  }
  placementCache.set(year, placed);
  return placed;
}

/* ------------------------------------------------------------------------------------------------------------------ the day */

/**
 * The liturgical day of a date of the Gregorian calendar (1583 to 9999). It throws a RangeError for a day that does not exist, so a screen
 * that is given nothing but days it drew never meets it.
 */
export function liturgicalDay(year: number, month: number, day: number): LiturgicalDay {
  const date: Ymd = { y: year, m: month, d: day };
  if (!isValidDay(date) || year < FIRST_YEAR || year > LAST_YEAR) throw new RangeError(`not a day of the Gregorian calendar: ${year}-${month}-${day}`);
  const n = toDays(date);
  const base = temporal(n);
  const fixed = placements(year).get(n);
  const a = anchors(year);
  // the liturgical year the day is in: it began with the First Sunday of Advent of this year, or of the year before
  const began = n >= a.advent ? year : year - 1;
  const common = { sundayCycle: (['A', 'B', 'C'] as const)[began % 3], weekdayCycle: ((began + 1) % 2 === 1 ? 'I' : 'II') as WeekdayCycle };
  if (fixed) return { id: fixed.id, title: fixed.title, season: base.season, colour: fixed.colour, rank: fixed.rank, week: base.week, ...common };
  return { id: base.id, title: base.title, season: base.season, colour: base.colour, rank: base.rank, week: base.week, ...common };
}

/** The same, for a day as the screen holds it. */
export const liturgicalDayOf = (day: Ymd): LiturgicalDay => liturgicalDay(day.y, day.m, day.d);
