// What a chapter's blocks offer to notes: which blocks can carry one, the quote a note keeps of a block, and the questions at the end of
// a day of a reflection book. Pure (no React, no React Native): plain node tests cover it (npm run test:notes).
import { blockText, spansText, type Block, type Span } from '../library/books';
import { norm } from '../me/text';
import { clipQuote } from './notes';

/** A block a note or a bookmark can be anchored to: text a pilgrim reads and might answer (a paragraph, a quote, a list). Headings and breaks are not. */
export const isNotable = (block: Block | undefined): boolean => !!block && (block.t === 'p' || block.t === 'quote' || block.t === 'ul' || block.t === 'ol') && blockText(block).length > 0;

/** The quote a note keeps of a block: its words on one line, cut short. Empty for a block that has none. */
export const quoteOf = (block: Block | undefined): string => (block ? clipQuote(blockText(block)) : '');

/** The heading of the part of a day that holds the questions (reflection.md in the book-writer skill requires it, once, in every day). */
export const END_OF_DAY = 'At the end of the day';

export type ReflectionPrompt = {
  /** The block index of the heading "At the end of the day". */
  headingIndex: number;
  /** The block index of the list of questions (the last list of the part), or null when the part has none. */
  listIndex: number | null;
  /** The questions, as the book wrote them. */
  questions: Span[][];
};

/**
 * The reflection prompt of a day: the part "At the end of the day" and its list of questions. Null for a chapter that has no such part
 * (a guide, the introduction of a reflection book): only a day of a reflection book ends with questions. Read from the blocks, not from the
 * name of the chapter, so a book that names its days differently still works.
 */
export function reflectionPrompt(blocks: readonly Block[]): ReflectionPrompt | null {
  const want = norm(END_OF_DAY);
  const headingIndex = blocks.findIndex((b) => b.t === 'h' && b.level === 2 && norm(spansText(b.spans)) === want);
  if (headingIndex < 0) return null;
  let end = blocks.length;
  for (let i = headingIndex + 1; i < blocks.length; i++) if (blocks[i].t === 'h' && (blocks[i] as { level: number }).level <= 2) { end = i; break; }
  let listIndex: number | null = null;
  for (let i = headingIndex + 1; i < end; i++) if (blocks[i].t === 'ul' || blocks[i].t === 'ol') listIndex = i;
  const list = listIndex === null ? null : (blocks[listIndex] as { items: Span[][] });
  return { headingIndex, listIndex, questions: list ? list.items : [] };
}

/** The questions as plain lines (a screen reader label, the sheet that shows them while the pilgrim writes). */
export const questionLines = (p: ReflectionPrompt): string[] => p.questions.map((q) => spansText(q).replace(/\s+/g, ' ').trim()).filter(Boolean);
