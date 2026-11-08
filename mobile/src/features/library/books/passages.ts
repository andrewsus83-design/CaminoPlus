// What a pilgrim can keep from a book: one passage (a paragraph, a quotation, a list), the way the Bible keeps one verse. Pure: no React, no React Native, nothing
// stored here (plain node tests cover it, npm run test:library). The bar that holds Bookmark, Copy and Share is PassageActions.tsx; the list of the bookmarks is the
// Library's own (bookmarks.ts, kept only on this phone), and a passage is one more key in it.
//
// The key. "books:<book id>.<chapter>.<block>", for example "books:camino-frances-guide.05-before-you-go.12": the same "books:" as a row of the Books tab
// ("books:confessions-readings"), then where the passage is: the book, the chapter and the index of the block in the chapter (the index in the text the reader draws,
// so a heading or a break before it still counts and the key does not change when the reader draws a long paragraph in several pieces). The chapter is the first
// 24 characters of its id (the id is the name of its file, "05-zamora-granja-de-moreruela-to-rionegro-del-puente", and starts with its number, so the first 24 are
// enough to tell the chapters of a book apart): a key has to fit in the 80 characters a stored bookmark may have. A key that does not read, a book or a chapter the
// text does not have (or one that two chapters answer to), a block that is no longer a passage: left out without a word, as a verse that is not in the Bible's text is.

import { itemKey } from '../search';
import type { Block, BookContent } from './index';
import { blockText, plainText, shortTitle } from './reading';

/** What can be bookmarked: a paragraph, a quotation, a bulleted or numbered list, with some words in it. A heading and a break are not passages. */
export const isPassageBlock = (b: unknown): b is Exclude<Block, { t: 'h' } | { t: 'hr' }> => {
  if (!b || typeof b !== 'object') return false;
  const t = (b as { t?: unknown }).t;
  if (t !== 'p' && t !== 'quote' && t !== 'ul' && t !== 'ol') return false;
  try { return blockText(b as Block).trim().length > 0; } catch { return false; }
};

/** How many characters of the id of a chapter a key keeps. */
export const CHAPTER_KEY_LENGTH = 24;

/** Where a passage is, as a key says it: the book, the first characters of the chapter's id, the index of the block. */
export type PassageRef = { bookId: string; chapter: string; block: number };

/** The part of a chapter's id that a key keeps. */
export const chapterKeyOf = (chapterId: string): string => chapterId.slice(0, CHAPTER_KEY_LENGTH);

/** The key a passage is bookmarked under. Under the 80 characters a bookmark key may have (bookmarks.ts). */
export const passageKey = (bookId: string, chapterId: string, block: number): string => itemKey('Books', `${bookId}.${chapterKeyOf(chapterId)}.${block}`);

const KEY = /^books:([a-z0-9-]{1,40})\.([A-Za-z0-9-]{1,24})\.([0-9]{1,5})$/;

/** The place in a bookmark key, or null when the key is not the key of a passage (the key of a row of the Books tab has no dots). */
export function parsePassageKey(key: string): PassageRef | null {
  const m = KEY.exec(key);
  return m ? { bookId: m[1], chapter: m[2], block: Number(m[3]) } : null;
}

/** The index of the chapter that a key's chapter part names: the one chapter whose id starts with it, or -1 (no chapter, or more than one: a key never guesses). */
export function chapterOfKey(chapters: readonly { id: string }[], chapter: string): number {
  let found = -1;
  for (let i = 0; i < chapters.length; i += 1) {
    if (typeof chapters[i]?.id !== 'string' || !chapters[i].id.startsWith(chapter)) continue;
    if (found >= 0) return -1;
    found = i;
  }
  return found;
}

/** The passage an address names (`?p=12`): the index of a block, a whole number from 0 to 99999, or undefined for anything else. */
export function passageParam(p: unknown): number | undefined {
  if (typeof p !== 'string' || !/^[0-9]{1,5}$/.test(p)) return undefined;
  return Number(p);
}

/** The index of the block that a drawn piece belongs to: the reader's items are keyed "12" and, for a long paragraph, "12.0", "12.1". */
export const blockOfItem = (itemKey: string): number => Number.parseInt(itemKey, 10);

/** Which passage of its chapter a block is, counting from 1 (the third paragraph, quotation or list); 0 when the block is not a passage. */
export function passageNumber(blocks: readonly unknown[], block: number): number {
  if (!isPassageBlock(blocks[block])) return 0;
  let n = 0;
  for (let i = 0; i <= block; i += 1) if (isPassageBlock(blocks[i])) n += 1;
  return n;
}

const line = (s: string): string => s.replace(/\s+/g, ' ').trim();

/** The words of a passage, as they are copied: one space between words, a line for each paragraph of a quotation (and its attribution) and for each item of a list. */
export function passageWords(b: Block): string {
  switch (b.t) {
    case 'p': return line(plainText(b.spans));
    case 'quote': return [...b.paras.map((p) => line(plainText(p))), ...(b.cite ? [line(plainText(b.cite))] : [])].filter((l) => l.length > 0).join('\n');
    case 'ul': return b.items.map((s) => `• ${line(plainText(s))}`).join('\n');
    case 'ol': return b.items.map((s, i) => `${i + 1}. ${line(plainText(s))}`).join('\n');
    default: return '';
  }
}

/** The chapter in a few words, with plain spaces: "Chapter III" when the edition numbers it, else its title, cut when it is long ("Zamora, Granja de…"). */
export const chapterLabel = (chapter: { title: string }): string => shortTitle(chapter.title).replace(/ /g, ' ');

/** Where a passage is, in words: "Chapter III, passage 4". For the bar of actions (a polite live region), for a screen reader and for the share. */
export const passageLabel = (chapter: { title: string; blocks: readonly unknown[] }, block: number): string => `${chapterLabel(chapter)}, passage ${passageNumber(chapter.blocks, block)}`;

/** The line a screen reader hears when a passage is chosen: where it is, and what can be done with it. */
export const chosenAnnouncement = (label: string): string => `${label} selected. Bookmark, copy or share it.`;

/** The words that are copied or shared for a passage: the passage, then on a line of its own where it is and which book ("Chapter III, passage 4, The French Way"). */
export const passageShareText = (bookTitle: string, chapter: { title: string; blocks: readonly Block[] }, block: number): string => {
  const b = chapter.blocks[block];
  return `${isPassageBlock(b) ? passageWords(b) : ''}\n${passageLabel(chapter, block)}, ${bookTitle}`.trim();
};

/** How much of a passage a row of the Bookmarks screen shows. */
export const EXCERPT_MAX = 160;

/** The first words of a passage on one line, cut at a space with an ellipsis when it is longer than `max`. */
export function excerpt(words: string, max: number = EXCERPT_MAX): string {
  const flat = words.replace(/\s+/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** What the Bookmarks screen draws for a bookmarked passage; `chapterId` is the whole id of the chapter (the address of the reader needs it). */
export type PassageRow = {
  key: string;
  bookId: string;
  chapterId: string;
  block: number;
  bookTitle: string;
  /** "Chapter III, passage 4". */
  label: string;
  /** The first words of the passage. */
  excerpt: string;
};

/** How the rows reach the text of a book (the app gives it safeText, which is null for a book that cannot be read). It never has to throw. */
export type PassageSource = (bookId: string) => BookContent | null;

/**
 * The passages of these bookmark keys (newest first, as they are kept). A key that is not the key of a passage is skipped, a key twice is kept once, and a passage
 * whose book has no text, cannot be read, or has no such chapter or block, or whose block is no longer a passage, is left out: it stays in the saved list and
 * shows nothing, so nothing breaks and nothing wrong shows. A book is read once for all its passages.
 */
export function passageRowsForKeys(keys: readonly string[], texts: PassageSource): PassageRow[] {
  const rows: PassageRow[] = [];
  const seen = new Set<string>();
  const read = new Map<string, BookContent | null>();
  const textOf = (id: string): BookContent | null => {
    if (!read.has(id)) {
      let t: BookContent | null = null;
      try { t = texts(id); } catch { t = null; }
      read.set(id, t && Array.isArray(t.chapters) ? t : null);
    }
    return read.get(id) ?? null;
  };
  for (const key of keys) {
    if (seen.has(key)) continue;
    seen.add(key);
    const ref = parsePassageKey(key);
    if (!ref) continue;
    try {
      const text = textOf(ref.bookId);
      if (!text) continue;
      const at = chapterOfKey(text.chapters, ref.chapter);
      const chapter = at >= 0 ? text.chapters[at] : undefined;
      const b = chapter?.blocks[ref.block];
      if (!chapter || !isPassageBlock(b)) continue;
      rows.push({ key, bookId: ref.bookId, chapterId: chapter.id, block: ref.block, bookTitle: text.title, label: passageLabel(chapter, ref.block), excerpt: excerpt(passageWords(b)) });
    } catch {
      // a damaged chapter shows nothing
    }
  }
  return rows;
}
