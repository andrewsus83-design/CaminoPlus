// What the Daily reading says about a day, and the ONE function the screens ask for it: dayContent(dateKey) for the screen, dayBrief(dateKey) for the banner (the same, without the
// words of the readings, so the Library tab never has to open a book of the Bible). Pure: no React, no network; the readings and the Bible come in as parameters (makeContent),
// and dayData.ts hands in the real ones, so plain node tests can run all of it against the real files (npm run test:library).
//
// WHAT A DAY IS CALLED. liturgy.ts works the day out on the phone from the General Roman Calendar and leaves out the memorials of the saints. When the day it computes is a weekday and
// the readings file names a celebration for the date (a saint's memorial, a feast), THAT name is the title of the day and the day of the cycle ("Wednesday of the 19th Week in
// Ordinary Time") goes under it. Every other day keeps the title of liturgy.ts: a Sunday, a solemnity and a feast of the Lord are never renamed. A memorial is not kept on a
// weekday that is privileged (17 to 24 December, the days of the Christmas octave, Lent and Holy Week); only the feasts of the General Calendar that fall on such a day take it, and
// only on their own date (FEASTS_ON_PRIVILEGED_DAYS: Saint Stephen, Saint John, the Holy Innocents, the Chair of Saint Peter), when the source says the day IS that celebration.
//
// WHERE THE READINGS COME FROM. From the files of assets/library/daily (readingsCore.ts): the references of the Lectionary for Mass used in the United States for each day we have, and
// nothing else. A few days of the source are not the readings of the General Roman Calendar for that date (Thanksgiving, Our Lady of Guadalupe, the two days of Corpus Christi): the files
// leave them out and list them, and the screen says that the readings of such a day differ from country to country. The words are read from the Bible inside the app (reference.ts
// readPassage), when the reference can be shown with confidence; otherwise the reference stands alone and says why there are no words. A day with no file has no readings: the screen
// says "The readings for this day are not in the app yet" and shows the day of the calendar. A day that the importer marked says which Mass its readings are of (24 and 25 December: the
// source has one set for the day, and the day has more than one Mass), and a psalm whose verses the source wrote in a form nobody reads is shown whole, with a note that says the list of
// verses is not clear. Nothing here is an example, and nothing is guessed.
import type { TextSource } from '../bible/verseRows';
import type { Ymd } from './calendar';
import { parseDateKey } from './datekey';
import { liturgicalDayOf, type LiturgicalDay } from './liturgy';
import type { DayRecord, ReadingsLookup } from './readingsCore';
import { formatReference, parseReference, psalmOfText, readPassage, shortReference, spokenReference, spokenShort, type PassageNote, type PassageText, type Reference } from './reference';

export type ReadingKind = 'first' | 'psalm' | 'second' | 'gospel';

/** The places of DayRecord.refs, in the order the readings are read. */
export const READING_KINDS: readonly ReadingKind[] = ['first', 'psalm', 'second', 'gospel'];

/** What each reading is called on the screen. The psalm is the responsorial psalm of the Mass; on a few days it is a canticle of another book, and still has this name. */
export const READING_TITLES: Record<ReadingKind, string> = { first: 'First Reading', psalm: 'Responsorial Psalm', second: 'Second Reading', gospel: 'Gospel' };

/** What the screen says for a day it has no readings for. */
export const NO_READINGS = 'The readings for this day are not in the app yet.';

/** What the screen says for a day whose readings in the source are those of one country, not of the General Roman Calendar (the source is the lectionary of the United States). */
export const READINGS_DIFFER = 'The readings for this day differ from country to country and are not in the app yet.';

/** The small print under the readings: where the readings come from and where the words come from. */
export const READINGS_SOURCE = 'Readings: the Lectionary for Mass used in the United States. Words: World English Bible, Catholic edition, not the lectionary translation.';

/** Above a psalm that is shown whole although the reference names some of its verses. */
export const WHOLE_PSALM_NOTE = 'This is the whole psalm. Mass uses only the verses named above.';

/** Above a psalm that is shown whole because the source names the psalm and no verses. */
export const PSALM_ONLY_NOTE = 'The source names the psalm only, not the verses Mass uses: this is the whole psalm.';

/** Above words where the reference has a letter after a verse (4b): the verse is shown whole. */
export const PART_VERSE_NOTE = 'A verse with a letter after its number is shown whole; the reading uses only part of it.';

/** Above a psalm that is shown whole because the source wrote the verses of the day in a form nobody reads (the importer kept the psalm alone and marked the day). */
export const UNCLEAR_PSALM_NOTE = "The source's list of verses for this day is not clear, so the whole psalm is shown.";

/** What each note of a passage (PassageText.note) says. */
export const PASSAGE_NOTES: Record<Exclude<PassageNote, null>, string> = { whole: WHOLE_PSALM_NOTE, psalm: PSALM_ONLY_NOTE, part: PART_VERSE_NOTE, unclear: UNCLEAR_PSALM_NOTE };

/** Over the readings of a day that has more than one Mass with readings of its own, when the source's row is those of one of them (the importer marks the day, after checking the Gospel of the row). */
export const MASS_LINES = {
  morning: 'These are the readings of the Mass of the morning. The evening Mass has other readings.',
  day: 'These are the readings of the Mass during the Day. The other Masses of Christmas have other readings.',
} as const;

/** Under the readings of a Sunday or a solemnity whose second reading the source does not list. */
export const NO_SECOND_READING = 'The source lists no second reading for this day.';

/** Why a reference has no words under it: the numbers of this Bible are not those of the lectionary, the source names a chapter and no verses, or the reference is in a form we do not read. */
export type NoWords = 'numbering' | 'chapter' | 'form';

/** Under a reference with no words. */
export const NO_WORDS: Record<NoWords, string> = {
  numbering: 'Words not shown: this Bible may number these verses differently.',
  chapter: 'Words not shown: the source names the chapter and no verses.',
  form: 'Words not shown: this reference could not be read.',
};

/** One reading of a day, without its words: what the banner needs. */
export type ReadingRef = {
  kind: ReadingKind;
  title: string;
  /** The reference said one plain way ("Genesis 3:9-15, 20"); a reference that is not one of the known forms is shown as the source has it (a psalm whose verses cannot be read is its number alone). */
  reference: string;
  /** The same for a line with little room: a psalm is its number alone. */
  short: string;
  /** What a screen reader says for the reference ("Genesis, chapter 3, verses 9 to 15 and 20"): the written one is read as a time or a sum by some voices. */
  spoken: string;
  /** The same for a line with little room: a psalm is its number alone. */
  spokenShort: string;
};

/** One reading of a day with its words (null when the reference cannot be shown with confidence: the reference stands alone and `noWords` says why). */
export type Reading = ReadingRef & { text: PassageText | null; noWords: NoWords | null };

export type DayBrief = {
  dateKey: string;
  /** What the day is called: the memorial or feast the readings file names, else the title of the calendar. Empty for a text that is not a day. */
  title: string;
  /** The day of the calendar under a memorial ("Wednesday of the 19th Week in Ordinary Time"); null when the title is the day of the calendar itself. */
  under: string | null;
  /** The readings in the order they are read, or null when we have none for the day. */
  readings: readonly ReadingRef[] | null;
  /** The honest line for a day with no readings (NO_READINGS, or READINGS_DIFFER); null when there are readings. */
  unavailable: string | null;
};

export type DayContent = Omit<DayBrief, 'readings'> & {
  readings: readonly Reading[] | null;
  /** True on a Sunday or a solemnity that has readings and no second reading in the source, where the lectionary has one: the screen says so. */
  noSecond: boolean;
  /** The line over the readings that says which Mass of the day they are of (MASS_LINES), or null when the day has one set of readings. */
  mass: string | null;
};

/** The days on which an optional memorial is not kept: the weekdays of 17 to 24 December, of the Christmas octave and of Lent, Ash Wednesday and Holy Week. */
const NO_MEMORIAL = /^(advent_december_|christmas_octave_day_|lent_|holy_|ash_wednesday$|.*_after_ash_wednesday$)/;

/**
 * Of those days, the ones that a feast of the General Calendar takes over (a feast is above the privileged weekdays; Ash Wednesday and Holy Week are above every feast): the weekdays of
 * Advent from 17 December, the octave of Christmas, and the weekdays of Lent.
 */
const FEAST_MAY_TAKE = /^(advent_december_|christmas_octave_day_|lent_|.*_after_ash_wednesday$)/;

/**
 * The feasts of the General Calendar that fall on those days, by month and day (no zero in front): Saint Stephen, Saint John and the Holy Innocents in the octave of Christmas, and the Chair
 * of Saint Peter in Lent. Saint Joseph and the Annunciation are not here: they are solemnities, liturgy.ts has them (and moves them when they are in the way), and the source, which does not
 * move them, must not put them back.
 */
export const FEASTS_ON_PRIVILEGED_DAYS: ReadonlySet<string> = new Set(['12-26', '12-27', '12-28', '2-22']);

/**
 * The title of a day and what goes under it (see the top of this file). `day` is the date, for the feasts that are kept on a privileged weekday: a memorial the source marks as the day itself
 * (`own`) is not enough there, because the source calls an obligatory memorial by its name as well.
 */
export function celebrationOf(lit: LiturgicalDay, record: DayRecord | null, day: Pick<Ymd, 'm' | 'd'>): { title: string; under: string | null } {
  const plain = { title: lit.title, under: null };
  if (lit.rank !== 'weekday' || !record?.name) return plain;
  const named = { title: record.name, under: lit.title };
  if (!NO_MEMORIAL.test(lit.id)) return named;
  return record.own && FEAST_MAY_TAKE.test(lit.id) && FEASTS_ON_PRIVILEGED_DAYS.has(`${day.m}-${day.d}`) ? named : plain;
}

/** The days that have a second reading in the lectionary: every Sunday and every solemnity, except the weekdays of the octave of Easter (which this calendar ranks as solemnities and which read as weekdays). */
export const hasSecondReading = (lit: LiturgicalDay): boolean => (lit.rank === 'sunday' || lit.rank === 'solemnity') && !/^easter_(monday|tuesday|wednesday|thursday|friday|saturday)$/.test(lit.id);

/**
 * The references of a day as a line: "Wisdom 6:12-16 · Psalm 63 · Matthew 25:1-13". The spaces inside a reference are no-break spaces and the dot stays with the reference before it, so
 * that a line that has to wrap does it between two references, never inside "1 Thessalonians 4:13-18".
 */
export const readingsLine = (readings: readonly ReadingRef[]): string => readings.map((r) => r.short.replace(/ /g, ' ')).join(' · ');

/** The same for a screen reader: each reference said in words ("Wisdom, chapter 6, verses 12 to 16"), a psalm by its number, the semicolons make a pause. */
export const readingsSpoken = (readings: readonly ReadingRef[]): string => readings.map((r) => r.spokenShort).join('; ');

export type Content = {
  /** The day and its readings, with their words where they can be shown. */
  dayContent: (dateKey: string) => DayContent;
  /** The day and the references of its readings, without opening a book of the Bible. */
  dayBrief: (dateKey: string) => DayBrief;
};

/** Why the words of a reference that parsed cannot be shown: the source names a chapter of a book that is not the Psalms, or else the numbers of this Bible do not hold it. */
const noWordsOf = (parsed: Reference): NoWords => (parsed.code !== 'PSA' && parsed.segments.some((s) => s.v1 === null) ? 'chapter' : 'numbering');

export function makeContent({ lookup, source }: { lookup: ReadingsLookup; source: TextSource }): Content {
  /**
   * The readings of a record in the order they are read, each with its reference parsed. A reference that is not one of the forms we read is shown as the source has it, with no
   * words under it, except a psalm whose number is clear: that is shown by its number and whole.
   */
  const itemsOf = (record: DayRecord): Array<{ ref: ReadingRef; parsed: Reference | null; psalm: number | null; place: number }> =>
    READING_KINDS.flatMap((kind, i) => {
      const raw = record.refs[i];
      if (raw === null) return [];
      const parsed = parseReference(raw);
      const psalm = parsed ? null : kind === 'psalm' ? psalmOfText(raw) : null;
      const short = parsed ? shortReference(parsed) : psalm !== null ? `Psalm ${psalm}` : raw;
      const reference = parsed ? formatReference(parsed) : short;
      const ref: ReadingRef = {
        kind,
        title: READING_TITLES[kind],
        reference,
        short,
        spoken: parsed ? spokenReference(parsed) : reference,
        spokenShort: parsed ? spokenShort(parsed) : reference,
      };
      return [{ ref, parsed, psalm, place: i }];
    });

  const headOf = (dateKey: string) => {
    const day = parseDateKey(dateKey);
    if (!day) return null;
    const lit = liturgicalDayOf(day);
    const record = lookup.recordFor(dateKey);
    return {
      ...celebrationOf(lit, record, day),
      record,
      unavailable: record ? null : lookup.differs(dateKey) ? READINGS_DIFFER : NO_READINGS,
      noSecond: !!record && record.refs[2] === null && hasSecondReading(lit),
      mass: record?.mass ? MASS_LINES[record.mass] : null,
    };
  };

  const dayBrief = (dateKey: string): DayBrief => {
    const head = headOf(dateKey);
    if (!head) return { dateKey, title: '', under: null, readings: null, unavailable: NO_READINGS };
    return { dateKey, title: head.title, under: head.under, readings: head.record ? itemsOf(head.record).map((i) => i.ref) : null, unavailable: head.unavailable };
  };

  const dayContent = (dateKey: string): DayContent => {
    const head = headOf(dateKey);
    if (!head) return { dateKey, title: '', under: null, readings: null, unavailable: NO_READINGS, noSecond: false, mass: null };
    const record = head.record;
    const readings = record
      ? itemsOf(record).map(({ ref, parsed, psalm, place }): Reading => {
          if (parsed) {
            const read = readPassage(parsed, source);
            // a psalm that the importer reduced to its number because the source wrote its verses in a form nobody reads: the note says so, in the place of "the source names the psalm only"
            const text = read && read.note === 'psalm' && record.unclear.includes(place) ? { ...read, note: 'unclear' as const } : read;
            return { ...ref, text, noWords: text ? null : noWordsOf(parsed) };
          }
          const whole = psalm !== null ? readPassage({ code: 'PSA', segments: [{ c1: psalm, v1: null, l1: '', c2: psalm, v2: null, l2: '' }] }, source) : null;
          if (!whole) return { ...ref, text: null, noWords: 'form' };
          return { ...ref, text: { lines: whole.lines.map((l) => ('gap' in l ? l : { ...l, n: '' })), note: 'unclear' }, noWords: null };
        })
      : null;
    return { dateKey, title: head.title, under: head.under, readings, unavailable: head.unavailable, noSecond: head.noSecond, mass: head.mass };
  };

  return { dayContent, dayBrief };
}
