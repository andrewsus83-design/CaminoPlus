// Where a line of poetry breaks, so that a line that is too long for the phone goes on in the line under it a little further in (a hanging indent).
// Pure: no React, no React Native, no fonts to load (plain node tests cover it, npm run test:library).
//
// React Native has no hanging indent for a text: a long line of a psalm that wraps would come back to the left margin, where it looks like a line of
// its own at the first level. So the reader breaks the lines itself. How wide a line of the words of the Bible is drawn is known exactly: the width of each
// letter below is the advance width of the font file the app ships (@expo-google-fonts/inter, 400Regular, in em), and the test reads that file again and
// fails if one of them differs. A line is cut at the last space that keeps it inside the width of the page, and the rest goes on in the next line, one em
// further in than the line it belongs to. Nothing is cut inside a word, and a no-break space is never a place to cut. The sums are in em of the body text, so
// the size of the text and the text size of the phone enter only as the width of the page measured in them.
import type { PoemLine } from './blocks';

/** Inter Regular, the advance width of each character the text of the Bible has (and the rest of the printable ASCII), in em. */
export const INTER_400: Readonly<Record<string, number>> = {
  ' ': 0.2812, '!': 0.2876, '"': 0.4658, '#': 0.6333, '$': 0.6416, '%': 0.9819, '&': 0.644, "'": 0.2998,
  '(': 0.3647, ')': 0.3647, '*': 0.501, '+': 0.6616, ',': 0.2881, '-': 0.46, '.': 0.2881, '/': 0.3604,
  '0': 0.6309, '1': 0.4067, '2': 0.6099, '3': 0.6177, '4': 0.646, '5': 0.5933, '6': 0.6201, '7': 0.5659,
  '8': 0.6187, '9': 0.6201, ':': 0.2881, ';': 0.3018, '<': 0.6616, '=': 0.6616, '>': 0.6616, '?': 0.5112,
  '@': 0.9658, 'A': 0.6899, 'B': 0.6543, 'C': 0.7305, 'D': 0.7217, 'E': 0.6011, 'F': 0.5903, 'G': 0.7461,
  'H': 0.7432, 'I': 0.2686, 'J': 0.5708, 'K': 0.6719, 'L': 0.5654, 'M': 0.9033, 'N': 0.7534, 'O': 0.7646,
  'P': 0.6387, 'Q': 0.7646, 'R': 0.6436, 'S': 0.6416, 'T': 0.6455, 'U': 0.7441, 'V': 0.6899, 'W': 0.9854,
  'X': 0.6821, 'Y': 0.6787, 'Z': 0.6289, '[': 0.3647, '\\': 0.3604, ']': 0.3647, '^': 0.4712, '_': 0.4561,
  '`': 0.3228, 'a': 0.5615, 'b': 0.6123, 'c': 0.5713, 'd': 0.6123, 'e': 0.583, 'f': 0.3701, 'g': 0.6133,
  'h': 0.5913, 'i': 0.2422, 'j': 0.2422, 'k': 0.5488, 'l': 0.2422, 'm': 0.876, 'n': 0.5908, 'o': 0.5996,
  'p': 0.6123, 'q': 0.6123, 'r': 0.3765, 's': 0.5278, 't': 0.3271, 'u': 0.5913, 'v': 0.562, 'w': 0.8184,
  'x': 0.5459, 'y': 0.562, 'z': 0.5522, '{': 0.4263, '|': 0.3325, '}': 0.4263, '~': 0.6616, '\u00a0': 0.2812,
  '\u2013': 0.5, '\u2014': 1.0, '\u2018': 0.2607, '\u2019': 0.2607, '\u201c': 0.4404, '\u201d': 0.4404, '\u2026': 0.8643, '\u2003': 1.0,
};

/** A character that is not in the table counts as this wide (em), so that a surprise is never too narrow. */
export const UNKNOWN_WIDTH = 0.7;
/** A line is taken to be this much wider than the sum of its letters, for what the phone adds (it never adds much: the kerning of the font takes away). */
export const WRAP_SAFETY = 1.01;
/** How much further in than its own line the rest of a line that is cut goes, in em. */
export const HANG_EM = 1;
/** JetBrains Mono, the font of the verse numbers, is 0.6 em wide in every letter. */
export const MONO_ADVANCE = 0.6;
/** The thin space between the number of a verse and its words, in em of Inter. */
export const THIN_SPACE_EM = 0.182;

/** The width of a text in em of the body text. */
export const textWidth = (text: string): number => [...text].reduce((sum, ch) => sum + (INTER_400[ch] ?? UNKNOWN_WIDTH), 0);

/**
 * The lines a text breaks into at spaces, the first with `first` em of room and the others with `rest`. A word that is wider than the room stands alone; text
 * with no words gives none. The words are those between single spaces (the text of the Bible has no other kind).
 */
export function wrapWords(text: string, first: number, rest: number): string[] {
  const words = text.split(' ').filter((w) => w.length > 0);
  const space = INTER_400[' '];
  const lines: string[] = [];
  let line = '';
  let width = 0;
  for (const word of words) {
    const w = textWidth(word);
    const room = lines.length === 0 ? first : rest;
    if (line === '') {
      line = word;
      width = w;
    } else if ((width + space + w) * WRAP_SAFETY > room) {
      lines.push(line);
      line = word;
      width = w;
    } else {
      line = `${line} ${word}`;
      width += space + w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A line of poetry as it is drawn: a line of the verse, gone in `indent` em (one more than its verse's own for the lines a long one is cut into). */
export type DrawnLine = { verse: string; n: string | null; indent: number; text: string; /** This is a part of a line that was cut, not the start of a line. */ cont: boolean };

export type WrapSizes = {
  /** The width of the words of the page in px (the screen less its two margins). */
  width: number;
  /** The size of the body text in px, and how much the phone's own text size makes it (held to what the text is held to). */
  size: number;
  scale: number;
  /** The size of the number of a verse in px (JetBrains Mono), and the number as it is printed (superscript digits), by label. */
  numberSize: number;
  numberOf: (label: string) => string;
};

/**
 * The lines a stanza is drawn in: each line of the stanza is cut where it has to be, and the parts after the first go in one em further than the line. The
 * number of a verse is on the first part of the first line of its verse, and takes room there. Every part fits the width of the page by the real widths of the
 * letters; a stanza whose lines all fit comes back as it is.
 */
export function wrapPoem(lines: readonly PoemLine[], sizes: WrapSizes): DrawnLine[] {
  const em = sizes.size * sizes.scale; // px of one em of the body text, as drawn
  const total = sizes.width / em; // the page as wide as that, in em
  const out: DrawnLine[] = [];
  for (const line of lines) {
    const numberEm = line.n === null ? 0 : ([...sizes.numberOf(line.n)].length * MONO_ADVANCE * sizes.numberSize) / sizes.size + THIN_SPACE_EM;
    const parts = wrapWords(line.text, total - line.indent - numberEm, total - line.indent - HANG_EM);
    if (parts.length === 0) continue;
    parts.forEach((text, k) => out.push({ verse: line.verse, n: k === 0 ? line.n : null, indent: k === 0 ? line.indent : line.indent + HANG_EM, text, cont: k > 0 }));
  }
  return out;
}
