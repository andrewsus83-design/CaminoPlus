// The text of the Bible as the screens read it. Plain types: no React, no React Native. The words come from the World English Bible,
// Catholic edition (eBible.org, public domain), turned into JSON by tools/bible/import_webc.py; the screens never see the source format.
// `loadBook` and `searchVerses` (text.ts, searchText.ts) are the only ways to reach the text. Nothing here is fetched: it is all in the app.

/** One verse as printed. */
export type Verse = {
  /** The label of the verse: "1", "2", ... or a joined pair such as "15-16" (a few verses of Sirach are printed joined). */
  n: string;
  /**
   * The words. A "\n" starts a new line (a line of poetry, or a paragraph that breaks inside a verse). The tab characters at the
   * start of a line say how far it is indented: a first-level line of poetry or a list item has one, a second-level line two, a
   * third-level line three; a line of prose has none. There is no other markup (no verse numbers, no footnotes, no Strong's numbers).
   */
  t: string;
  /** A new paragraph of prose starts with this verse. A verse without it continues the paragraph before it. */
  p?: true;
  /** A blank line (a break between stanzas) comes before this verse. */
  b?: true;
  /** A heading that stands before this verse: a section heading, "BOOK 1" over the first psalm, the speaker in the Song of Songs. */
  h?: string;
};

export type Chapter = {
  /** The number of the chapter. */
  c: number;
  /** The line over the chapter, for example the title of a psalm ("A Song of Ascents."). */
  title?: string;
  verses: Verse[];
};

export type BookText = {
  /** The three-letter code of the source (USFM), for example "PSA". */
  code: string;
  /** The name the translation gives the book. The screens use the names of bible/books.ts. */
  name: string;
  chapters: Chapter[];
};

export type BookIndexEntry = { code: string; name: string; chapters: number; verses: number };

export type TranslationInfo = {
  id: 'eng-web-c';
  /** "World English Bible, Catholic edition" */
  name: string;
  /** "WEB" */
  short: string;
  /** "Public domain" */
  licence: string;
  /** The line that credits the translation, as the licences screen and the footer of a chapter print it. */
  credit: string;
  /** Where it comes from. */
  source: string;
};

/** A verse that matches a search. `marks` are [start, end) offsets into `text` (the words of the verse as one line, without tabs or line breaks) to highlight. */
export type VerseHit = { code: string; chapter: number; verse: string; text: string; marks: Array<[number, number]> };
