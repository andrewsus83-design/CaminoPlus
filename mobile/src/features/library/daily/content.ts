// What the Daily reading screen shows under the liturgical day, and the ONE function it asks for it: dayContent(dateKey). The screen draws
// whatever this returns and nothing else, so a real source (a lectionary, a reading plan, a book of reflections) is plugged in by changing this
// file and nothing the screen does. Pure: no React, no network.
//
// TODAY IT IS A SAMPLE. Which readings and reflections we may include is not decided, so dayContent answers every day with the same examples
// (sample.ts) and says so (`sample: true`): the screen then puts the Preview notice over them and a "Sample" label on every card. Nothing here
// is the real lectionary, and no citation here is given as the reading of a day. Only the shape is real: which readings a day has (a second
// reading on Sundays and solemnities), in which order, and what a reading and a reflection are made of.
import { parseDateKey } from './datekey';
import { liturgicalDayOf, type LiturgicalDay } from './liturgy';
import { SAMPLE_READING, SAMPLE_REFLECTION } from './sample';

export type ReadingKind = 'first' | 'psalm' | 'second' | 'acclamation' | 'gospel';

/** What each reading is called on the screen. */
export const READING_TITLES: Record<ReadingKind, string> = { first: 'First reading', psalm: 'Psalm', second: 'Second reading', acclamation: 'Gospel acclamation', gospel: 'Gospel' };

/** One line of a text: a verse with its number, or a paragraph without. */
export type Line = { n?: number; text: string };

export type Passage = {
  kind: ReadingKind;
  /** "Isaiah 25:6–10a". null when the source has no citation for it yet. */
  citation: string | null;
  lines: readonly Line[];
  /** Where the words come from, and under what licence: one quiet line under them. */
  credit?: string;
};

export type Reflection = { title: string; /** the small line over it ("Sample reflection") */ label: string; paragraphs: readonly string[]; /** who wrote it, or that nobody did */ source: string };

export type DayContent = {
  dateKey: string;
  /** The readings and reflections are examples, not the real ones of the day. */
  sample: boolean;
  passages: readonly Passage[];
  reflections: readonly Reflection[];
};

/** The readings a day has, in the order they are read: a second reading on Sundays and solemnities only. */
export function readingKinds(day: LiturgicalDay): ReadingKind[] {
  const second = day.rank === 'sunday' || day.rank === 'solemnity';
  return second ? ['first', 'psalm', 'second', 'acclamation', 'gospel'] : ['first', 'psalm', 'acclamation', 'gospel'];
}

/** What the rows that have no text say when they are opened. */
export const SAMPLE_PASSAGE_TEXT = 'Sample text. The words of this reading will be here once we choose where the readings come from.';
/** What the rows that have no citation say in its place. */
export const SAMPLE_CITATION = 'Sample citation';

/** The sample reflection as short paragraphs (its four sentences, in the same words). */
const REFLECTION_PARAGRAPHS: readonly string[] = (() => {
  const sentences = SAMPLE_REFLECTION.text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return [sentences.slice(0, 2).join(' '), sentences[2], sentences.slice(3).join(' ')].filter(Boolean);
})();

function samplePassage(kind: ReadingKind): Passage {
  if (kind === 'psalm') {
    return {
      kind,
      citation: SAMPLE_READING.reference,
      lines: SAMPLE_READING.verses.map((v) => ({ n: v.n, text: v.text })),
      credit: `${SAMPLE_READING.translation} · ${SAMPLE_READING.licence} · an example, not the psalm of this day`,
    };
  }
  return { kind, citation: null, lines: [{ text: SAMPLE_PASSAGE_TEXT }] };
}

/** The readings and the reflections of a day, given as "YYYY-MM-DD". A text that is not a day has none. */
export function dayContent(dateKey: string): DayContent {
  const day = parseDateKey(dateKey);
  if (!day) return { dateKey, sample: true, passages: [], reflections: [] };
  return {
    dateKey,
    sample: true,
    passages: readingKinds(liturgicalDayOf(day)).map(samplePassage),
    reflections: [{ title: SAMPLE_REFLECTION.title, label: SAMPLE_REFLECTION.label, paragraphs: REFLECTION_PARAGRAPHS, source: 'Written for this preview, not by a real author' }],
  };
}
