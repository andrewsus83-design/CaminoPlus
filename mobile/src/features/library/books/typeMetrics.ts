// How wide a text is drawn in the brand fonts, as pure functions: no React, no React Native (plain node tests cover it, npm run test:library).
//
// A cover has a fixed size (an A5 page), so its title and its author have to be made to fit BEFORE they are drawn: nothing on a phone can
// say how wide a word will be until it is on the screen. These are the advance widths of the printable ASCII characters (32 to 126) of the two
// fonts of the covers, in thousandths of the font size, read from the font files of the app (Fraunces SemiBold, from @expo-google-fonts/fraunces,
// and Inter SemiBold, from @expo-google-fonts/inter). JetBrains Mono is monospaced: every character is 0.6 of the size. Kerning is not counted,
// which can only make a text narrower than the number here, so a text that fits by these numbers fits; SAFETY adds a few percent for the rest
// (hinting, a different text engine). An accented letter counts as its plain letter, which is what the fonts do too; a character that is not in the
// table counts as the widest letter, so an unknown character can only make a title smaller.

const FRAUNCES_600: readonly number[] = [
  218, 320, 373, 660, 604, 782, 977, 178, 364, 364, 624, 560, 281, 410, 270, 497, 675, 468, 618,
  565, 628, 588, 618, 528, 617, 622, 274, 286, 518, 560, 518, 532, 918, 736, 709, 704, 799, 660,
  614, 766, 852, 408, 512, 794, 632, 926, 774, 797, 698, 798, 752, 608, 698, 750, 719, 1060, 732,
  690, 644, 346, 496, 352, 478, 490, 250, 560, 610, 524, 622, 533, 395, 578, 639, 317, 317, 616,
  319, 956, 638, 596, 625, 610, 478, 488, 389, 628, 560, 835, 552, 570, 492, 402, 284, 402, 638,
];

const INTER_600: readonly number[] = [
  252, 321, 523, 644, 650, 1004, 663, 326, 373, 373, 540, 673, 319, 465, 319, 379, 660, 423, 623,
  636, 666, 612, 640, 576, 640, 640, 319, 329, 673, 673, 673, 544, 999, 728, 659, 737, 722, 606,
  588, 749, 746, 277, 580, 703, 565, 922, 759, 769, 645, 773, 652, 650, 660, 736, 728, 1020, 720,
  713, 652, 373, 379, 373, 481, 469, 351, 574, 624, 582, 624, 591, 389, 626, 612, 262, 262, 569,
  262, 900, 612, 609, 624, 624, 397, 549, 353, 612, 587, 839, 569, 588, 566, 455, 359, 455, 673,
];

export type Font = 'fraunces' | 'inter' | 'mono';

const TABLE: Record<Exclude<Font, 'mono'>, readonly number[]> = { fraunces: FRAUNCES_600, inter: INTER_600 };

/** Punctuation outside ASCII that a title can have, in thousandths of the size, for Fraunces and Inter. */
const EXTRA: Record<string, readonly [number, number]> = {
  '·': [291, 319], '–': [534, 500], '—': [842, 1000], '’': [236, 294], '‘': [236, 294], '“': [466, 507], '”': [479, 501], '…': [900, 900],
};

/** A few percent on top of every width, for what the numbers cannot know. */
export const SAFETY = 1.04;

const WIDEST = (font: Exclude<Font, 'mono'>): number => (font === 'fraunces' ? 1060 : 1020);

/** The width of one character at size 1000, in thousandths. */
function advance(font: Exclude<Font, 'mono'>, ch: string): number {
  const code = ch.charCodeAt(0);
  if (code >= 32 && code <= 126) return TABLE[font][code - 32];
  const extra = EXTRA[ch];
  if (extra) return extra[font === 'fraunces' ? 0 : 1];
  const plain = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (plain !== ch && plain.length === 1) return advance(font, plain);
  return WIDEST(font);
}

/** How wide `text` is drawn at `size` (points) with `letterSpacing` after every character: the sum of the advances, times SAFETY. */
export function textWidth(font: Font, text: string, size: number, letterSpacing = 0): number {
  let sum = 0;
  for (const ch of text) sum += font === 'mono' ? 600 : advance(font, ch);
  const chars = Array.from(text).length;
  return (sum / 1000) * size * SAFETY + chars * letterSpacing;
}

/**
 * The words of `text` laid in lines no wider than `width`, as a browser or a phone breaks them (a line is broken at a space, a word is never cut).
 * A word wider than a line has a line of its own, wider than `width`: `fits` is then false so that the caller makes the text smaller.
 */
export function wrap(font: Font, text: string, width: number, size: number, letterSpacing = 0): { lines: string[]; fits: boolean } {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let fits = true;
  let line = '';
  for (const word of words) {
    if (textWidth(font, word, size, letterSpacing) > width) fits = false;
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(font, next, size, letterSpacing) > width) { lines.push(line); line = word; } else line = next;
  }
  if (line) lines.push(line);
  return { lines, fits };
}
