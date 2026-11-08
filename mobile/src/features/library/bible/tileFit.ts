// How a book name fits its tile. Pure: no React, no React Native, no fonts to load (plain node tests cover it, npm run test:library).
//
// The Bible tab shows the books as compact tiles, two in a row (gridMath.ts), so a tile is as narrow as 140 on a 320 wide phone and "1 Thessalonians" has to fit it
// without being cut. A name is set in Fraunces SemiBold, the title font of the brand, and only at the sizes of the type scale: 24 (h4), 17 (h5) or 15 (h6), the three
// title tokens of design/tokens.json, whichever is the largest that fits; the letters are not tracked (the tokens have letterSpacing 0), and a name is never drawn under 15.
// How wide a line of it is drawn is known exactly: the width of each letter below is the advance width of the font file the app ships (@expo-google-fonts/fraunces,
// 600SemiBold, in em), and src/features/library/__tests__/reader.test.ts reads that file again and fails if one of them differs. The count under the name ("150 chapters")
// is JetBrains Mono at the mono token (15), every letter 0.6 em wide.
//
// How wide a line is drawn depends on the browser, and the web smoke found it out: a Chromium that hints the glyphs (the runners of CI, or any with full hinting) gives
// every letter a whole number of pixels, and "Corinthians" came out 3 px wider than the font file says and broke into two lines. So the width of a line is counted with every
// letter rounded UP to whole pixels at the size it is drawn (inkPx): never narrower than any layout of this font (measured in Chromium with hinting none, slight, medium and
// full: no line was wider than that by more than 0.02 px), and a phone that does not hint (iOS, Android) draws it narrower, never wider.
//
// The words of a tile do not grow with the phone's text size (the screen gives them maxFontSizeMultiplier 1): a tile is as high as its words and as wide as its half of the
// screen, so a name that has been made larger could not be kept inside it; the smallest name is 15 and the count is 15 already, the size of the body of the app at its least.
import tokens from '../../../theme/tokens.json';

/** The title tokens a name may be drawn with, the largest first: h4 24 / 30, h5 17 / 22, h6 15 / 21 (Fraunces 600, letterSpacing 0). */
export const NAME_VARIANTS = ['h4', 'h5', 'h6'] as const;
export type NameVariant = (typeof NAME_VARIANTS)[number];

export const NAME_SIZES: ReadonlyArray<{ variant: NameVariant; size: number; lineHeight: number; letterSpacing: number }> = NAME_VARIANTS.map((variant) => ({
  variant, size: tokens.text[variant].size, lineHeight: tokens.text[variant].lineHeight, letterSpacing: tokens.text[variant].letterSpacing,
}));

/** The largest and the smallest a name is drawn: 24 and 15. */
export const NAME_MAX: number = NAME_SIZES[0].size;
export const NAME_MIN: number = NAME_SIZES[NAME_SIZES.length - 1].size;

/** The count under a name: JetBrains Mono at the mono token, 15 on a line of 22, whose letters are all 0.6 em wide. */
export const COUNT_SIZE: number = tokens.text.mono.size;
export const COUNT_LINE: number = tokens.text.mono.lineHeight;
export const MONO_ADVANCE = 0.6;

/** A line is taken to be this much wider than the sum of its letters rounded up, for what a phone adds that no table has (kerning goes the other way): a pixel in a hundred. */
export const FIT_SAFETY = 1.01;

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

/** The table above is the font file to a quarter of this much (em; it is rounded to 0.0005 and reader.test.ts reads the file again): a letter is rounded up with it counted in. */
export const TABLE_TOLERANCE = 0.0003;

/** Rounded up to a whole number, with a hair of room for the sums that come out a billionth over a whole number. */
const up = (x: number): number => Math.ceil(x - 1e-9);

/**
 * The width in px of a line of a name drawn at `size`, as a browser that hints the glyphs lays it out: every letter takes a whole number of pixels, rounded up, and `tracking`
 * px (the letterSpacing of the token, 0) between the letters. The unhinted layout of the font file is never wider than this.
 */
export const inkPx = (line: string, size: number, tracking = 0): number => [...line].reduce((sum, ch) => sum + up(((FRAUNCES_600[ch] ?? 0.8) + TABLE_TOLERANCE) * size), 0) + ([...line].length - 1) * tracking;

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

export type NameFit = {
  lines: string[];
  /** The variant of AppText that draws the name: h4, h5 or h6. */
  variant: NameVariant;
  /** Its size and line height, the ones of the token. */
  size: number;
  lineHeight: number;
  /** Whether the widest line is as wide as the room of the tile or narrower once drawn. false only if even h6 is too wide: no name does that on a phone of 320 or more. */
  fits: boolean;
};

/** The lines and the variant of a name in a tile whose words may be `inner` wide: the largest of h4, h5 and h6 that fits, the letters of every line counted as a browser that hints the glyphs sets them. */
export function fitName(name: string, inner: number): NameFit {
  const lines = nameLines(name);
  const widest = (size: number, tracking: number): number => Math.max(...lines.map((line) => inkPx(line, size, tracking))) * FIT_SAFETY;
  for (const { variant, size, lineHeight, letterSpacing } of NAME_SIZES) {
    if (widest(size, letterSpacing) <= inner + 1e-9) return { lines, variant, size, lineHeight, fits: true };
  }
  const { variant, size, lineHeight } = NAME_SIZES[NAME_SIZES.length - 1];
  return { lines, variant, size, lineHeight, fits: false };
}

/** The width in px of the count drawn at `size` in JetBrains Mono: every letter takes a whole number of pixels there too when the browser hints (9 at 15), so letters times the advance rounded up. */
export const countPx = (text: string, size: number = COUNT_SIZE): number => [...text].length * up(MONO_ADVANCE * size) * FIT_SAFETY;

/** Whether the count under a name ("150 chapters") is as wide as the room of the tile or narrower. It is drawn at the mono token and never smaller. */
export const countFits = (text: string, inner: number): boolean => countPx(text) <= inner + 1e-9;
