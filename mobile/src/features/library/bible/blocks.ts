// What the reader draws, made from the verses of a chapter. Pure: no React, no React Native, no fonts (plain node tests cover it,
// npm run test:library). The reader (Reader.tsx) draws one block after the other; this file decides what the blocks are.
//
// The words of a verse come as the contract of textTypes.ts says (tools/bible/README.md, "How a reader draws it"): tab characters at the start of a line
// give the indent of a line of poetry, a "\n" ends a line, `p` begins a paragraph of prose, `b` is a blank line (a break between stanzas) and `h` a
// heading before the verse. A verse is drawn after the one before it, with its number in front of its first words:
//   goes on     a verse with neither `p` nor a tab at the start of its text (nor `b` nor `h`) goes on in the line or the paragraph before it: in prose it is
//               the next words of the paragraph; in poetry it is the rest of a line that two verses share (Psalm 55:2 ends "and moan", and 55:3 goes on
//               "because of the voice of the enemy," on the same line), so a line of poetry is a list of parts, one for each verse in it
//   prose       a "\n" followed by a line with no tabs is a new paragraph inside the verse (John 8:11): the number is not said again
//   poetry      a line that starts with tabs is a line of its own, as far in as its tabs; the lines between two breaks are one stanza (one block)
//   a blank     an empty line inside a verse is a blank line: the next line starts a block of its own, with a blank line above it (like `b`)
//   a heading   a block of its own; whatever comes after it starts a new block; `b` and `h` on one verse give the space first and the heading under it
// A verse with no words (a few verses of Sirach are omitted by the best authorities and are printed as a number only) draws nothing, and if it begins a
// paragraph (Acts 8:37) the next verse does.
import { labelHolds } from './ref';
import type { Chapter, Verse } from './textTypes';

/** How far a line of poetry goes in: the number of tabs at its start, one to three (a line of poetry has at least one; a line of prose has none and is not poetry). */
export type Indent = 1 | 2 | 3;

/** The words of one verse, or of the part of it that is in a paragraph. `n` is the number to print in front of them: only on the first piece of a verse. */
export type Span = { verse: string; n: string | null; text: string };

/** The words of one verse that stand in a line of poetry (the same as a Span, in a line). */
export type PoemPart = Span;

/** A line of poetry: how far it goes in, and the words in it. Nearly always the words of one verse; a line that two verses share has a part for each. */
export type PoemLine = { indent: Indent; parts: PoemPart[] };

/** The space above a block: none (the first), a paragraph, or a stanza (a blank line, or a heading). */
export type Gap = 'none' | 'paragraph' | 'stanza';

export type HeadingBlock = { kind: 'heading'; key: string; text: string };
export type ProseBlock = { kind: 'prose'; key: string; gap: Gap; spans: Span[] };
export type PoemBlock = { kind: 'poem'; key: string; gap: Gap; lines: PoemLine[] };
export type Block = HeadingBlock | ProseBlock | PoemBlock;

const MAX_INDENT = 3;

/** The tabs at the start of a line (none for a line of prose), and the rest of it. */
function splitIndent(line: string): { indent: 0 | Indent; text: string } {
  let tabs = 0;
  while (tabs < line.length && line[tabs] === '\t') tabs += 1;
  return { indent: Math.min(tabs, MAX_INDENT) as 0 | Indent, text: line.slice(tabs).replace(/\t/g, ' ').trim() };
}

/** Whether a verse has words to draw. */
const hasWords = (v: Verse): boolean => /\S/.test(v.t);

/** The blocks of a chapter, in order. A chapter with no verses has none. */
export function buildBlocks(chapter: Chapter): Block[] {
  const blocks: Block[] = [];
  let prose: ProseBlock | null = null; // the paragraph the next piece of prose goes on in, if the last block is one
  let poem: PoemBlock | null = null; // the stanza the next line of poetry goes on in, if the last block is one
  let carryP = false; // a verse with no words that begins a paragraph, or has a blank line above it, hands that to the next verse that has words
  let carryB = false;
  const key = () => `b${blocks.length}`;
  // the space above a block that starts here: none at the top or under a heading (which has its own), else a paragraph, or a stanza when a blank line is above it
  const gapFor = (blank: boolean): Gap => {
    if (blocks.length === 0 || blocks[blocks.length - 1].kind === 'heading') return 'none';
    return blank ? 'stanza' : 'paragraph';
  };

  for (const v of chapter.verses) {
    if (v.h) {
      blocks.push({ kind: 'heading', key: key(), text: v.h });
      prose = null;
      poem = null;
    }
    const begins: boolean = !!v.p || carryP; // this verse begins a paragraph
    const spaced: boolean = !!v.b || carryB; // this verse has a blank line above it
    if (!hasWords(v)) {
      carryP = begins;
      carryB = spaced;
      continue;
    }
    carryP = false;
    carryB = false;
    let numberDone = false; // the number of the verse is on its first line, and only there
    let blank = false; // an empty line was seen inside the verse: the next line has a blank line above it
    v.t.split('\n').forEach((raw, i) => {
      const { indent, text } = splitIndent(raw);
      if (!text) {
        if (numberDone) blank = true;
        return;
      }
      const first = !numberDone;
      const n = first ? v.n : null;
      numberDone = true;
      const afterBreak = i > 0; // this line follows a "\n" of the verse
      const opens = first && (begins || spaced); // this line begins a paragraph or a stanza of its own, because of the verse
      const stanza = first ? spaced : blank; // with a blank line above it
      if (indent === 0) {
        if (poem && first && !opens) {
          // the verse goes on in the line of poetry before it: a line that two verses share
          poem.lines[poem.lines.length - 1].parts.push({ verse: v.n, n, text });
          blank = false;
          return;
        }
        // prose: it goes on in the paragraph above unless something begins a new one (a poem or a heading above, `p`, `b`, a break or a blank line inside the verse)
        if (!prose || afterBreak || blank || opens) {
          prose = { kind: 'prose', key: key(), gap: gapFor(stanza), spans: [] };
          blocks.push(prose);
          poem = null;
        }
        prose.spans.push({ verse: v.n, n, text });
      } else {
        // poetry: a line of its own; a stanza goes on until a blank line, a heading or a paragraph of prose
        if (!poem || blank || opens) {
          poem = { kind: 'poem', key: key(), gap: gapFor(stanza), lines: [] };
          blocks.push(poem);
          prose = null;
        }
        poem.lines.push({ indent, parts: [{ verse: v.n, n, text }] });
      }
      blank = false;
    });
  }
  return blocks;
}

/** The labels of the verses that have words in them, in order: the verses a person can touch. */
export const verseLabels = (chapter: Chapter): string[] => chapter.verses.filter(hasWords).map((v) => v.n);

/** The verse with this label in the chapter, if it has words. */
export const findVerse = (chapter: Chapter, label: string): Verse | undefined => chapter.verses.find((v) => v.n === label && hasWords(v));

/** The label of the printed verse that holds the verse `n` ("15-16" holds 15 and 16), if the chapter has words for it. A link names a number; the page has labels. */
export const labelOfNumber = (chapter: Chapter, n: number): string | null => chapter.verses.find((v) => labelHolds(v.n, n) && hasWords(v))?.n ?? null;

/** The words of a verse as one line: no tabs, no breaks, one space between the parts. What is copied and shared, and what Bookmarks shows. */
export const verseText = (v: Verse): string => v.t.split('\n').map((l) => l.replace(/\t/g, ' ').trim()).filter(Boolean).join(' ');

/** The indexes of the blocks that hold words of this verse. Only these are drawn again when the verse is chosen. */
export function blocksOfVerse(blocks: readonly Block[], label: string): number[] {
  const out: number[] = [];
  blocks.forEach((b, i) => {
    if (b.kind === 'prose' && b.spans.some((s) => s.verse === label)) out.push(i);
    if (b.kind === 'poem' && b.lines.some((l) => l.parts.some((p) => p.verse === label))) out.push(i);
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
      const at = b.lines.findIndex((l) => l.parts.some((p) => p.verse === label));
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
