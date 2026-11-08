// What the reader draws, made from the verses of a chapter. Pure: no React, no React Native, no fonts (plain node tests cover it,
// npm run test:library). The reader (Reader.tsx) draws one block after the other; this file decides what the blocks are.
//
// The words of a verse come as the contract of textTypes.ts says: tab characters at the start of a line give the indent of a line of poetry,
// a "\n" starts a new line, `p` begins a paragraph of prose, `b` is a blank line (a break between stanzas) and `h` a heading before the verse.
//   prose        the verses without `p` flow on in the paragraph before them, one after the other, each with its number in front of its words;
//                a "\n" inside a verse of prose is a new paragraph (the verse number is not said again)
//   poetry       every line is a line, as long as the lines are indented; the lines between two breaks are one stanza (one block)
//   a heading    a block of its own; whatever comes after it starts a new block
// A verse with no words (a few verses of Sirach are omitted by the best authorities and are printed as a number only) draws nothing.
import { labelHolds } from './ref';
import type { Chapter, Verse } from './textTypes';

/** How far a line of poetry goes in: the number of tabs at its start, three at most. */
export type Indent = 0 | 1 | 2 | 3;

/** The words of one verse, or of the part of it that is in a paragraph. `n` is the number to print in front of them: only on the first piece of a verse. */
export type Span = { verse: string; n: string | null; text: string };

export type PoemLine = { verse: string; /** The line the number of the verse stands in front of. */ n: string | null; indent: Indent; text: string };

/** The space above a block: none (the first), a paragraph, or a stanza (a blank line, or a heading). */
export type Gap = 'none' | 'paragraph' | 'stanza';

export type HeadingBlock = { kind: 'heading'; key: string; text: string };
export type ProseBlock = { kind: 'prose'; key: string; gap: Gap; spans: Span[] };
export type PoemBlock = { kind: 'poem'; key: string; gap: Gap; lines: PoemLine[] };
export type Block = HeadingBlock | ProseBlock | PoemBlock;

const MAX_INDENT = 3;

/** The tabs at the start of a line, and the rest of it. */
function splitIndent(line: string): { indent: Indent; text: string } {
  let tabs = 0;
  while (tabs < line.length && line[tabs] === '\t') tabs += 1;
  return { indent: Math.min(tabs, MAX_INDENT) as Indent, text: line.slice(tabs).replace(/\t/g, ' ').trim() };
}

/** The blocks of a chapter, in order. A chapter with no verses has none. */
export function buildBlocks(chapter: Chapter): Block[] {
  const blocks: Block[] = [];
  let prose: ProseBlock | null = null; // the paragraph the next piece of prose goes on in, if the last block is one
  let poem: PoemBlock | null = null; // the stanza the next line of poetry goes on in, if the last block is one
  const key = () => `b${blocks.length}`;
  // the space above a block that starts because of this verse: none at the top or under a heading (which has its own), else a paragraph or a stanza
  const gapFor = (v: Verse, first: boolean): Gap => {
    if (blocks.length === 0 || blocks[blocks.length - 1].kind === 'heading') return 'none';
    return first && v.b ? 'stanza' : 'paragraph';
  };

  for (const v of chapter.verses) {
    if (v.h) {
      blocks.push({ kind: 'heading', key: key(), text: v.h });
      prose = null;
      poem = null;
    }
    let numberDone = false;
    v.t.split('\n').forEach((raw, i) => {
      const { indent, text } = splitIndent(raw);
      if (!text) return;
      const first = !numberDone;
      const n = first ? v.n : null;
      numberDone = true;
      const afterBreak = i > 0; // this line follows a "\n" of the verse
      if (indent === 0 && !(poem && !first)) {
        // prose: it goes on in the paragraph above unless something begins a new one (a poem or a heading above, `p`, `b`, a break inside the verse)
        if (!prose || afterBreak || (first && (v.p || v.b))) {
          prose = { kind: 'prose', key: key(), gap: gapFor(v, first), spans: [] };
          blocks.push(prose);
          poem = null;
        }
        prose.spans.push({ verse: v.n, n, text });
      } else {
        // poetry: a line of its own; a stanza goes on until a break, a heading or a paragraph of prose
        if (!poem || (first && (v.b || v.p))) {
          poem = { kind: 'poem', key: key(), gap: gapFor(v, first), lines: [] };
          blocks.push(poem);
          prose = null;
        }
        poem.lines.push({ verse: v.n, n, indent, text });
      }
    });
  }
  return blocks;
}

/** The labels of the verses that have words in them, in order: the verses a person can touch. */
export const verseLabels = (chapter: Chapter): string[] => chapter.verses.filter((v) => /\S/.test(v.t)).map((v) => v.n);

/** The verse with this label in the chapter, if it has words. */
export const findVerse = (chapter: Chapter, label: string): Verse | undefined => chapter.verses.find((v) => v.n === label && /\S/.test(v.t));

/** The label of the printed verse that holds the verse `n` ("15-16" holds 15 and 16), if the chapter has words for it. A link names a number; the page has labels. */
export const labelOfNumber = (chapter: Chapter, n: number): string | null => chapter.verses.find((v) => labelHolds(v.n, n) && /\S/.test(v.t))?.n ?? null;

/** The words of a verse as one line: no tabs, no breaks, one space between the parts. What is copied and shared, and what Bookmarks shows. */
export const verseText = (v: Verse): string => v.t.split('\n').map((l) => l.replace(/\t/g, ' ').trim()).filter(Boolean).join(' ');

/** The indexes of the blocks that hold words of this verse. Only these are drawn again when the verse is chosen. */
export function blocksOfVerse(blocks: readonly Block[], label: string): number[] {
  const out: number[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === 'prose' && b.spans.some((s) => s.verse === label)) out.push(i);
    if (b.kind === 'poem' && b.lines.some((l) => l.verse === label)) out.push(i);
  });
  return out;
}

/**
 * Where the first words of a verse are: the block, and how far into it (0 to 1, by the letters of a paragraph or the lines of a stanza). A long
 * paragraph is taller than the screen sometimes, so the block alone is not a place to scroll to. null for a verse that is not drawn.
 */
export function locateVerse(blocks: readonly Block[], label: string): { block: number; at: number } | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind === 'prose') {
      let before = 0;
      let total = 0;
      let found = -1;
      for (const s of b.spans) {
        if (found < 0 && s.verse === label) found = before;
        const len = s.text.length + (s.n ? s.n.length + 1 : 0) + 1;
        before += len;
        total += len;
      }
      if (found >= 0) return { block: i, at: total > 0 ? found / total : 0 };
    } else if (b.kind === 'poem') {
      const at = b.lines.findIndex((l) => l.verse === label);
      if (at >= 0) return { block: i, at: at / b.lines.length };
    }
  }
  return null;
}

const SUPERSCRIPT: Record<string, string> = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '-': '–' };

/**
 * The number of a verse as it is printed in front of the words: small digits raised above the line. The digits are the superscript characters
 * of Unicode, which JetBrains Mono (the font of the numbers) draws; the dash of a joined label ("15-16") is an en dash, because that font has no
 * raised one. A label that is not made of digits and dashes is returned as it is.
 */
export const superscript = (label: string): string => (/^[0-9-]+$/.test(label) ? label.replace(/[0-9-]/g, (ch) => SUPERSCRIPT[ch]) : label);
