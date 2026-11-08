// What the Daily reading says about a day, and the ONE function the screens ask for it: dayContent(dateKey) for the screen, dayBrief(dateKey) for the banner (the same, without the
// words of the readings, so the Library tab never has to open a book of the Bible). Pure: no React, no network; the readings and the Bible come in as parameters (makeContent),
// and dayData.ts hands in the real ones, so plain node tests can run all of it against the real files (npm run test:library).
//
// WHAT A DAY IS CALLED. liturgy.ts works the day out on the phone from the General Roman Calendar and leaves out the memorials of the saints. When the day it computes is a weekday and
// the readings file names a celebration for the date (a saint's memorial, a feast), THAT name is the title of the day and the day of the cycle ("Wednesday of the 19th Week in
// Ordinary Time") goes under it. Every other day keeps the title of liturgy.ts: a Sunday, a solemnity and a feast of the Lord are never renamed. A memorial is not kept on a
// weekday that is privileged (17 to 24 December, the days of the Christmas octave, Lent and Holy Week) unless the source says the day IS that celebration (Saint Stephen).
//
// WHERE THE READINGS COME FROM. From the files of assets/library/daily (readingsCore.ts): the references of the Roman Lectionary for each day we have, and nothing else. The words are
// read from the Bible inside the app (reference.ts readPassage), when the reference can be shown with confidence; otherwise the reference stands alone. A day with no file has no
// readings: the screen says "The readings for this day are not in the app yet" and shows the day of the calendar. Nothing here is an example, and nothing is guessed.
import type { TextSource } from '../bible/verseRows';
import { parseDateKey } from './datekey';
import { liturgicalDayOf, type LiturgicalDay } from './liturgy';
import type { DayRecord, ReadingsLookup } from './readingsCore';
import { formatReference, parseReference, psalmOfText, readPassage, shortReference, type PassageText, type Reference } from './reference';

export type ReadingKind = 'first' | 'psalm' | 'second' | 'gospel';

/** The places of DayRecord.refs, in the order the readings are read. */
export const READING_KINDS: readonly ReadingKind[] = ['first', 'psalm', 'second', 'gospel'];

/** What each reading is called on the screen. The psalm is the responsorial psalm of the Mass; on a few days it is a canticle of another book, and still has this name. */
export const READING_TITLES: Record<ReadingKind, string> = { first: 'First Reading', psalm: 'Responsorial Psalm', second: 'Second Reading', gospel: 'Gospel' };

/** What the screen says for a day it has no readings for. */
export const NO_READINGS = 'The readings for this day are not in the app yet.';

/** The small print under the readings: where the readings come from and where the words come from. */
export const READINGS_SOURCE = 'Readings: the Roman Lectionary (general calendar; your country may differ). Words: World English Bible, Catholic edition, not the lectionary translation.';

/** Under a psalm that is shown whole although the reference names some of its verses. */
export const WHOLE_PSALM_NOTE = 'This is the whole psalm. Mass uses only the verses named above.';

/** One reading of a day, without its words: what the banner needs. */
export type ReadingRef = {
  kind: ReadingKind;
  title: string;
  /** The reference said one plain way ("Genesis 3:9-15, 20"); a reference that is not one of the known forms is shown as the source has it. */
  reference: string;
  /** The same for a line with little room: a psalm is its number alone. */
  short: string;
};

/** One reading of a day with its words (null when the reference cannot be shown with confidence: the reference stands alone). */
export type Reading = ReadingRef & { text: PassageText | null };

export type DayBrief = {
  dateKey: string;
  /** What the day is called: the memorial or feast the readings file names, else the title of the calendar. Empty for a text that is not a day. */
  title: string;
  /** The day of the calendar under a memorial ("Wednesday of the 19th Week in Ordinary Time"); null when the title is the day of the calendar itself. */
  under: string | null;
  /** The readings in the order they are read, or null when we have none for the day. */
  readings: readonly ReadingRef[] | null;
};

export type DayContent = Omit<DayBrief, 'readings'> & { readings: readonly Reading[] | null };

/** The days on which an optional memorial is not kept: the weekdays of 17 to 24 December, of the Christmas octave and of Lent, Ash Wednesday and Holy Week. */
const NO_MEMORIAL = /^(advent_december_|christmas_octave_day_|lent_|holy_|ash_wednesday$|.*_after_ash_wednesday$)/;

/** The title of a day and what goes under it (see the top of this file). */
export function celebrationOf(lit: LiturgicalDay, record: DayRecord | null): { title: string; under: string | null } {
  if (lit.rank !== 'weekday') return { title: lit.title, under: null };
  if (record?.name && (record.own || !NO_MEMORIAL.test(lit.id))) return { title: record.name, under: lit.title };
  return { title: lit.title, under: null };
}

/** The references of a day as a line: "Wisdom 6:12-16 · Psalm 63 · Matthew 25:1-13". */
export const readingsLine = (readings: readonly ReadingRef[]): string => readings.map((r) => r.short).join(' · ');

/** The same for a screen reader: the middle dots are not said, the semicolons make a pause. */
export const readingsSpoken = (readings: readonly ReadingRef[]): string => readings.map((r) => r.reference).join('; ');

export type Content = {
  /** The day and its readings, with their words where they can be shown. */
  dayContent: (dateKey: string) => DayContent;
  /** The day and the references of its readings, without opening a book of the Bible. */
  dayBrief: (dateKey: string) => DayBrief;
};

export function makeContent({ lookup, source }: { lookup: ReadingsLookup; source: TextSource }): Content {
  /**
   * The readings of a record in the order they are read, each with its reference parsed. A reference that is not one of the forms we read is shown as the source has it, with no
   * words under it, except a psalm whose number is clear: that is shown whole.
   */
  const itemsOf = (record: DayRecord): Array<{ ref: ReadingRef; parsed: Reference | null; psalm: number | null }> =>
    READING_KINDS.flatMap((kind, i) => {
      const raw = record.refs[i];
      if (raw === null) return [];
      const parsed = parseReference(raw);
      const psalm = parsed ? null : kind === 'psalm' ? psalmOfText(raw) : null;
      const short = parsed ? shortReference(parsed) : psalm !== null ? `Psalm ${psalm}` : raw;
      const ref: ReadingRef = { kind, title: READING_TITLES[kind], reference: parsed ? formatReference(parsed) : raw, short };
      return [{ ref, parsed, psalm }];
    });

  const headOf = (dateKey: string): { title: string; under: string | null; record: DayRecord | null } | null => {
    const day = parseDateKey(dateKey);
    if (!day) return null;
    const record = lookup.recordFor(dateKey);
    return { ...celebrationOf(liturgicalDayOf(day), record), record };
  };

  const dayBrief = (dateKey: string): DayBrief => {
    const head = headOf(dateKey);
    if (!head) return { dateKey, title: '', under: null, readings: null };
    return { dateKey, title: head.title, under: head.under, readings: head.record ? itemsOf(head.record).map((i) => i.ref) : null };
  };

  const dayContent = (dateKey: string): DayContent => {
    const head = headOf(dateKey);
    if (!head) return { dateKey, title: '', under: null, readings: null };
    const readings = head.record
      ? itemsOf(head.record).map(({ ref, parsed, psalm }): Reading => {
          if (parsed) return { ...ref, text: readPassage(parsed, source) };
          const whole = psalm !== null ? readPassage({ code: 'PSA', segments: [{ c1: psalm, v1: null, l1: '', c2: psalm, v2: null, l2: '' }] }, source) : null;
          return { ...ref, text: whole ? { lines: whole.lines.map((l) => ('gap' in l ? l : { n: '', text: l.text })), whole: true } : null };
        })
      : null;
    return { dateKey, title: head.title, under: head.under, readings };
  };

  return { dayContent, dayBrief };
}
