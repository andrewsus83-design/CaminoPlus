// The Daily reading has no real content yet. Which readings and reflections we may include (a public-domain reading plan with
// the references only, or a lectionary we hold a licence for) is not decided, so every day shows the same example, and the screen
// says so (DAILY_NOTICE). Nothing here depends on the date: there is no reading, feast or saint that belongs to a day, because none
// has been chosen. Nothing is fetched, so the screen works without a signal.
//
// The one real piece of scripture is Psalm 121, verses 1 to 4, in the World English Bible, which is in the public domain
// (ebible.org/eng-web/copyright.htm). It is quoted word for word: the name World English Bible is only for the unchanged text. The
// same four verses are in the Catholic edition of the WEB (the one we expect to ship) and in its Updated edition; they were read
// against the text of bible.helloao.org on 8 November 2026. "A Song of Ascents" is the title the WEB gives the psalm: the songs of
// ascents are the pilgrim psalms, sung on the way up to Jerusalem. The reflection is written for this preview and is not from anyone.
import type { Ymd } from './calendar';

/** The Preview notice over the reading, in the words the person reads. */
export const DAILY_NOTICE =
  'This is a sample. Daily readings and reflections are not in the app yet; every day shows the same example while we choose texts we are allowed to include.';

export type Verse = { n: number; text: string };

export type SampleReading = {
  /** "Psalm 121:1–4". */
  reference: string;
  translation: string;
  licence: string;
  /** What the translation calls the psalm. */
  title: string;
  verses: readonly Verse[];
};

export const SAMPLE_READING: SampleReading = {
  reference: 'Psalm 121:1–4',
  translation: 'World English Bible',
  licence: 'public domain',
  title: 'A Song of Ascents.',
  verses: [
    { n: 1, text: 'I will lift up my eyes to the hills. Where does my help come from?' },
    { n: 2, text: 'My help comes from the LORD, who made heaven and earth.' },
    { n: 3, text: 'He will not allow your foot to be moved. He who keeps you will not slumber.' },
    { n: 4, text: 'Behold, he who keeps Israel will neither slumber nor sleep.' },
  ],
};

export type SampleReflection = { title: string; label: string; text: string };

/** Written for this preview, for people on foot: short, kind, and the same on every day. */
export const SAMPLE_REFLECTION: SampleReflection = {
  title: 'Reflection',
  label: 'Sample reflection',
  text: 'Some days the whole Camino feels like the next hill. For a moment, lift your eyes: to the sky, to the road ahead, to the pilgrims walking near you. You do not have to be fast or strong to walk well. Rest when your body asks, drink some water, and take the next step when you are ready.',
};

/** The reading of a day. It is the same for every day, on purpose (see the top of this file). */
export const readingFor = (_day: Ymd): { reading: SampleReading; reflection: SampleReflection } => ({ reading: SAMPLE_READING, reflection: SAMPLE_REFLECTION });
