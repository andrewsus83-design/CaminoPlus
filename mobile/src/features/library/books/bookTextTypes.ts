// The text of one book of the Books tab as the reader reads it. Plain types: no React, no React Native. Each text is public domain,
// taken from a named edition and cleaned by tools/books/ (see tools/books/README.md); the screens never see the source format.
// `loadBookText` (bookText.ts) is the only way to reach it. Nothing here is fetched: it is all in the app.

/** One block of a chapter. */
export type BookBlock =
  | { k: 'p'; t: string }   // a paragraph: one string, no line breaks
  | { k: 'h'; t: string }   // a heading inside a chapter (a sub-section)
  | { k: 'q'; t: string }   // a quotation, a prayer or a poem: "\n" starts a new line
  | { k: 'li'; t: string }  // a numbered or bulleted point; the number or bullet stays in the text when the book has one
  | { k: 'hr' };            // a break between sections

export type BookChapter = {
  /** Stable inside the book: "c1", "c2", ... in reading order. */
  id: string;
  /** The title as the edition gives it ("Chapter I. Of the Imitation of Christ"), or a plain "Chapter 1" when it has none. */
  title: string;
  /** The part, book or mansion this chapter belongs to ("Book One", "The Third Mansion"), when the work has them: the reader groups its table of contents by it. */
  part?: string;
  blocks: BookBlock[];
};

export type BookText = {
  /** The id of books/catalog.ts, for example "confessions". */
  id: string;
  title: string;
  author: string;
  /** The translator of the edition, when there is one. */
  translator?: string;
  /** The line the reader prints at the end of the book and the licences screen prints: edition, translator, year, source, licence. */
  credit: string;
  chapters: BookChapter[];
};

export type BookTextIndexEntry = { id: string; chapters: number; words: number };
