// How a book name fits its tile. Pure: no React, no React Native, no fonts to load (plain node tests cover it, npm run test:library).
//
// The Bible tab shows the books as square tiles, three in a row, so a tile is as narrow as 90 on a 320 wide phone and "1 Thessalonians" has to
// fit it without being cut and without being drawn smaller than it can be read. A name is set in Fraunces SemiBold, the title font of the brand;
// how wide a line of it is drawn is known exactly: the width of each letter below is the advance width of the font file the app ships
// (@expo-google-fonts/fraunces, 600SemiBold, in em), and src/features/library/__tests__/bible.test.ts reads that file again and fails if one
// of them differs. From the widths a name gets its lines and the largest size that fits (never above MAX, never under FLOOR), and the same for
// the count under it, which is set in JetBrains Mono (every letter 0.6 em wide).
//
// The name is the hero of the tile: as large as the tile allows, up to NAME_MAX. The short names are all at that size; a long word comes down just
// enough to fit (and never breaks inside the word), and the letters of a name are set a little closer than the font's own spacing (NAME_TRACKING,
// the way a display face is set).
//
// How wide a line is drawn depends on the browser, and the web smoke found it out: a Chromium that hints the glyphs (the runners of CI, or any with full hinting) gives
// every letter a whole number of pixels, and "Corinthians" came out 3 px wider than the font file says and broke into two lines. So the width of a line is counted with every
// letter rounded UP to whole pixels at the size it is drawn (inkPx): never narrower than any layout of this font (measured in Chromium with hinting none, slight, medium and
// full: no line, at any size from 11 to 24, was wider than that by more than 0.02 px), and a phone that does not hint (iOS, Android) draws it narrower, never wider.
//
// The size is for the phone's own text size too: a person who has made the text larger gets names that stay as wide as the tile (the size
// is reduced by what the system adds, up to CAP, which the text itself is held to with maxFontSizeMultiplier) and never under the floor.

/** The largest a name is drawn, and the smallest. Both are the size as drawn, with the phone's text size in it. */
export const NAME_MAX = 24;
export const NAME_FLOOR = 11;
/** What every name reaches from a phone of 390 wide up (only the two Thessalonians come down to it and no further there; everything else is 15 or more); on a phone of 320 a tile is only 90 wide and "Thessalonians" is 11. */
export const NAME_WANTED = 14;
/** The letters of a name are set this much closer than the font spaces them, in em of the size they are drawn at. */
export const NAME_TRACKING = -0.02;
/** The largest the phone's own text size counts for a tile (the text is held to it with maxFontSizeMultiplier). */
export const TEXT_SCALE_CAP = 1.3;
/** A line is taken to be this much wider than the sum of its letters rounded up, for what a phone adds that no table has (kerning goes the other way): a pixel in a hundred. */
export const FIT_SAFETY = 1.01;
/** The count under a name: drawn at most so large, at least so small, in JetBrains Mono, whose letters are all 0.6 em wide. */
export const COUNT_MAX = 12;
export const COUNT_FLOOR = 10;
export const MONO_ADVANCE = 0.6;

/** Fraunces SemiBold, the advance width of each character a book name has, in em. */
export const FRAUNCES_600: Readonly<Record<string, number>> = {
  ' ': 0.2175, '0': 0.675, '1': 0.4685, '2': 0.618, '3': 0.565, '4': 0.6285, '5': 0.5875, '6': 0.6185, '7': 0.5275, '8': 0.617, '9': 0.6215,
  A: 0.7365, B: 0.709, C: 0.704, D: 0.799, E: 0.6605, F: 0.6135, G: 0.7655, H: 0.852, I: 0.4075, J: 0.5125, K: 0.7935, L: 0.6315, M: 0.9265,
  N: 0.7745, O: 0.797, P: 0.698, Q: 0.7975, R: 0.752, S: 0.6085, T: 0.698, U: 0.7505, V: 0.719, W: 1.06, X: 0.7325, Y: 0.6905, Z: 0.644,
  a: 0.5605, b: 0.61, c: 0.5235, d: 0.622, e: 0.533, f: 0.395, g: 0.5775, h: 0.639, i: 0.317, j: 0.317, k: 0.616, l: 0.319, m: 0.9565, n: 0.6385,
  o: 0.5955, p: 0.625, q: 0.6105, r: 0.4785, s: 0.488, t: 0.389, u: 0.6285, v: 0.56, w: 0.835, x: 0.552, y: 0.5705, z: 0.4925,
};

/** The width of a line of a name in em. A character that is not in the table counts as a wide one (0.8 em), so that a surprise is never too narrow. */
export const lineWidth = (line: string): number => [...line].reduce((sum, ch) => sum + (FRAUNCES_600[ch] ?? 0.8), 0);

/** The width of the ink of a line of a name in em, with the letters set closer by NAME_TRACKING (between the letters: the gap after the last one is not ink). Unhinted. */
export const inkWidth = (line: string): number => lineWidth(line) + ([...line].length - 1) * NAME_TRACKING;

/** The table above is the font file to a quarter of this much (em; it is rounded to 0.0005 and bible.test.ts reads the file again): a letter is rounded up with it counted in. */
export const TABLE_TOLERANCE = 0.0003;

/** Rounded up to a whole number, with a hair of room for the sums that come out a billionth over a whole number. */
const up = (x: number): number => Math.ceil(x - 1e-9);

/**
 * The width in px of a line of a name drawn at `size` (as drawn), as a browser that hints the glyphs lays it out: every letter takes a whole number of pixels, rounded up, and the
 * letters are set NAME_TRACKING closer (between the letters, as inkWidth). The unhinted layout of the font file is never wider than this.
 */
export const inkPx = (line: string, size: number): number => [...line].reduce((sum, ch) => sum + up(((FRAUNCES_600[ch] ?? 0.8) + TABLE_TOLERANCE) * size), 0) + ([...line].length - 1) * NAME_TRACKING * size;

/**
 * The lines of a name. A name with a number in front ("1 Samuel") breaks after the number, in every numbered book alike, so the number is a
 * line of its own; another name of several words ("Song of Songs") breaks where the longer of the two lines is the shorter; a name of one word is
 * one line.
 */
export function nameLines(name: string): string[] {
  const numbered = /^([1-3]) (.+)$/.exec(name);
  if (numbered) return [numbered[1], numbered[2]];
  const words = name.split(' ');
  if (words.length === 1) return [name];
  let best: string[] = [name];
  let bestWidth = Infinity;
  for (let cut = 1; cut < words.length; cut++) {
    const lines = [words.slice(0, cut).join(' '), words.slice(cut).join(' ')];
    const widest = Math.max(...lines.map(lineWidth));
    if (widest < bestWidth) { best = lines; bestWidth = widest; }
  }
  return best;
}

const held = (fontScale: number): number => Math.min(Math.max(fontScale, 1), TEXT_SCALE_CAP);

export type NameFit = {
  lines: string[];
  /** The fontSize to give the text (the phone multiplies it by its own text size, held to TEXT_SCALE_CAP). */
  size: number;
  lineHeight: number;
  /** The letterSpacing to give the text, in the same px as the size (NAME_TRACKING of it). */
  tracking: number;
  /** Whether the widest line is as wide as the tile or narrower once drawn. false only if the floor is not small enough: no name does that on a phone of 320 or more. */
  fits: boolean;
};

/** The lines and the size of a name in a tile whose text may be `inner` wide, for a phone whose text is `fontScale` times the normal. */
export function fitName(name: string, inner: number, fontScale = 1): NameFit {
  const m = held(fontScale);
  const lines = nameLines(name);
  const widest = (drawn: number): number => Math.max(...lines.map((line) => inkPx(line, drawn))) * FIT_SAFETY;
  // the size as it is drawn, in half pixels: the largest the tile allows (up to NAME_MAX) and never under NAME_FLOOR; the size to give the text is that less what the phone adds
  let drawn = NAME_MAX;
  while (drawn > NAME_FLOOR && widest(drawn) > inner) drawn -= 0.5;
  const size = drawn / m;
  return { lines, size, lineHeight: Math.round(size * 1.2), tracking: NAME_TRACKING * size, fits: widest(drawn) <= inner + 1e-9 };
}

export type CountFit = { size: number; lineHeight: number; fits: boolean };

/**
 * The same for the count under a name ("150 chapters"), which is one line in JetBrains Mono. Every letter takes a whole number of pixels there too when the browser hints
 * (6.6 becomes 7 at 11), so the width is the number of letters times the advance rounded up, as drawn.
 */
export function fitCount(text: string, inner: number, fontScale = 1): CountFit {
  const m = held(fontScale);
  const letters = [...text].length;
  const widest = (drawn: number): number => letters * up(MONO_ADVANCE * drawn) * FIT_SAFETY;
  let drawn = COUNT_MAX;
  while (drawn > COUNT_FLOOR && widest(drawn) > inner) drawn -= 0.5;
  const size = drawn / m;
  return { size, lineHeight: Math.round(size * 1.4), fits: widest(drawn) <= inner + 1e-9 };
}
