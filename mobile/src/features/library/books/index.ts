// The shapes of the books of the Library, as tools/build_books.py writes them (mobile/assets/library/catalog.json and mobile/assets/library/books/<id>.json) and as
// bookBundle.ts, which that tool generates, hands them to the app. Types only: nothing here runs. The tool is the one place that says what the data is
// (tools/book_kit.py is its parser); this file says it to the compiler, and the tests read every file of the bundle against it.
//
// A book is written in Markdown, parsed once by the tool into blocks, and the same blocks are drawn by the reader, the EPUB and the PDF.

/** The two kinds of book: a guide to one Camino, and a book of readings for a Camino (twelve famous books, each paired with a road). */
export type BookKind = 'guide' | 'reflection';

/** The pale colours of a cover: names of the FIXED palette (theme/index.ts `fixed`), the same six that tokens.json has. A cover is paper and does not change with light and dark. */
export type CoverColour = 'goldSoft' | 'blue100' | 'successWash' | 'red100' | 'sand300' | 'goldWash';

/** The glyphs the tool allows on a cover (tools/book_kit.py COVER_ICONS): names of icons of components/Icon.tsx. */
export type CoverIcon = 'library' | 'book' | 'chat';

/** A piece of a line of text: its words, and whether they are bold (b), italic (i) or the text of a link (href: shown as plain words, nothing in a book is a link to follow). */
export type Span = { t: string; b?: 1; i?: 1; href?: string };

/**
 * What a chapter is made of. A heading inside a chapter (level 2 or more: the title of the chapter itself is not a block), a paragraph, a bulleted or numbered
 * list (each item is a line of spans), a quotation (its paragraphs, and the line of attribution that starts with a dash, when it has one), and a break.
 */
export type Block =
  | { t: 'h'; level: number; spans: Span[] }
  | { t: 'p'; spans: Span[] }
  | { t: 'ul' | 'ol'; items: Span[][] }
  | { t: 'quote'; paras: Span[][]; cite: Span[] | null }
  | { t: 'hr' };

/** A chapter in the catalog: enough to list it and say how long it takes without reading the book. `id` is the name of its file, and is what an address and a saved place use. */
export type CatalogChapter = { id: string; title: string; minutes: number };

/** One book in catalog.json. `order` is the order of the shelves; `words` and `minutes` are the tool's count (220 words a minute, rounded up). */
export type CatalogBook = {
  id: string;
  kind: BookKind;
  order: number;
  title: string;
  subtitle: string;
  description: string;
  words: number;
  minutes: number;
  cover: { colour: CoverColour; icon: CoverIcon };
  chapters: CatalogChapter[];
  /** The Camino of the app's catalog this book goes with (a recommendation for a book of readings). */
  route_slug?: string;
};

export type BookChapter = { id: string; title: string; blocks: Block[] };

/** Where the passages of a book of readings come from. The tool keeps these five of the seven fields of book.json (the id and the link are for the Licences screen, sources.ts). */
export type BookSource = { work: string; author: string; translator?: string; year?: string; licence: string };

/** One book in books/<id>.json: its text, chapter by chapter. */
export type BookContent = {
  id: string;
  kind: BookKind;
  title: string;
  subtitle: string;
  author: string | null;
  rights?: string | null;
  ai_disclosure?: string | null;
  chapters: BookChapter[];
  sources?: BookSource[];
  /** One line of credit: the edition the passages were taken from, or who made the book. */
  credit: string;
};
