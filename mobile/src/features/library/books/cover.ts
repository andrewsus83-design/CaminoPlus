// How the covers of the Books tab are sized and typeset, as pure functions: no React, no React Native (plain node tests cover it for every
// phone width from 320 to 430, npm run test:library). BookCover.tsx draws what this says.
//
// A cover is an A5 page (148 by 210 mm), portrait, so it is as high as 210/148 times its width. The tab shows them two in a row: with
// the 16 px margins of the screens and 12 px between them a 390 phone gets covers 173 wide and 245 high, a 320 phone 138 by 196, a 430 phone
// 193 by 274. On a tablet or a browser window the covers stop growing at 232 and the pair is centred.
//
// A cover has a fixed size, so its text is made to fit before it is drawn (typeMetrics.ts says how wide a text is): the title is set as large
// as it can be in at most four lines, without ever cutting a word, at one of the sizes of the type scale (24, 22, 19, 17 or 15, never between them and never under 15).
// Under it is how long the book takes, in JetBrains Mono at the mono token (15). The kind of book ("Pilgrim's guide") is not on the cover (the book page shows it, and a
// screen reader still hears it in the label of the cover). A title that cannot be made to fit at the smallest size is reported (`fits: false`) so that a test fails, instead
// of a phone cutting it off.
//
// The space inside a cover is the space scale of design/tokens.json, read from the file: 12 (space.3) at the sides and at the bottom, 16 (space.4) at the top.
import tokens from '../../../theme/tokens.json';
import { kindName } from './copy';
import { formatMinutes, spokenMinutes } from './reading';
import { textWidth, wrap } from './typeMetrics';

/** A5, in millimetres. */
export const A5_WIDTH_MM = 148;
export const A5_HEIGHT_MM = 210;
/** Width over height of an A5 page, portrait. */
export const A5_RATIO = A5_WIDTH_MM / A5_HEIGHT_MM;

const { space } = tokens;

/** The sizes of the type scale (design/tokens.json "text"), each once, largest first: 64 48 36 30 28 24 22 19 17 15. A title on a cover is set at one of them. */
export const SCALE_SIZES: readonly number[] = [...new Set(Object.values(tokens.text).map((t) => t.size))].sort((a, b) => b - a);
/** The smallest a title is set: the smallest size of the scale. */
export const TITLE_MIN: number = SCALE_SIZES[SCALE_SIZES.length - 1];

export const GRID_COLUMNS = 2;
/** The widest a cover gets. */
export const TILE_MAX = 232;
/** Between two covers across: space.3. */
export const GRID_GAP: number = space['3'];

export type CoverGrid = {
  columns: typeof GRID_COLUMNS;
  /** The width of a cover. */
  tile: number;
  /** Its height: an A5 page. */
  height: number;
  gap: number;
  /** The width of a pair side by side, which is the width of the grid. */
  width: number;
};

/** The height of an A5 page that is this wide, in whole points. */
export const a5Height = (width: number): number => Math.round(width / A5_RATIO);

/** `screen` is the width of the screen and `margin` the side margin of the screens (16). */
export function coverGrid(screen: number, margin: number, gap: number = GRID_GAP, max: number = TILE_MAX): CoverGrid {
  const inside = Math.max((Number.isFinite(screen) ? screen : 0) - 2 * margin, 0);
  const tile = Math.max(Math.min(Math.floor((inside - gap) / GRID_COLUMNS), max), 0);
  return { columns: GRID_COLUMNS, tile, height: a5Height(tile), gap, width: GRID_COLUMNS * tile + gap };
}

/** The same colour with an alpha, as an rgba() text: for the shades of a cover (the dark of a spine, the pale of a page), made from the colours of the palette. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), hi);

export type CoverMetrics = {
  width: number;
  height: number;
  radius: number;
  /** The narrow darker band on the left, and the pale strip of page edges on the right. */
  spine: number;
  edge: number;
  /** The space inside the text area, at the sides, at the top and at the bottom: space.3, space.4 and space.3 (12, 16, 12), the same on every cover. */
  padX: number;
  padTop: number;
  padBottom: number;
  /** The width of the text area. */
  text: number;
  /** The glyph and the ring around it. */
  glyph: number;
  medallion: number;
  /** The gap between the ring and the title, and between the title and the time under it: the same, so the title sits in the middle between them (space.2 on a small cover, space.3 on the others). */
  gapTop: number;
  gapTitle: number;
  /** The ribbon: its width, the notch at its foot, and its distance from the right edge. It is 44 high, and its button is 44 by 44. */
  ribbon: { width: number; height: number; notch: number; right: number; touch: number };
  /** The largest and the smallest size a title is set at: sizes of the type scale, the largest that is no more than an eighth of the width, and 15. */
  title: { max: number; min: number };
  /** The reading time under the title (JetBrains Mono, one line): the mono token, 15 on a line of 22, on every cover. */
  time: { size: number; lineHeight: number };
  /** The height the title may use: what is left between the ring and the lines under it. */
  titleBox: number;
};

/** All the numbers of a cover that is `width` wide, in points. */
export function coverMetrics(width: number): CoverMetrics {
  const w = Math.max(width, 0);
  const small = w < 150;
  const spine = clamp(Math.round(w * 0.07), 8, 16);
  const edge = small ? 3 : 4;
  const padX = space['3'];
  const padTop = space['4'];
  const padBottom = space['3'];
  const glyph = Math.round(w * 0.14);
  const medallion = glyph + 12;
  const gapTop = small ? space['2'] : space['3'];
  const gapTitle = gapTop;
  const time = { size: tokens.text.mono.size, lineHeight: tokens.text.mono.lineHeight };
  const height = a5Height(w);
  const bottom = padBottom + time.lineHeight;
  const top = padTop + medallion + gapTop;
  const ribbonWidth = clamp(Math.round(w * 0.16), 22, 30);
  const wanted = clamp(Math.round(w * 0.125), 14, 26);
  return {
    width: w, height, radius: small ? 3 : 4, spine, edge, padX, padTop, padBottom,
    text: w - spine - edge - 2 * padX,
    glyph, medallion, gapTop, gapTitle,
    ribbon: { width: ribbonWidth, height: 44, notch: 8, right: edge + 10, touch: 44 },
    title: { max: Math.max(TITLE_MIN, SCALE_SIZES.find((s) => s <= wanted) ?? TITLE_MIN), min: TITLE_MIN },
    time,
    // the hairline round the cover (border.width) is inside the height, on both sides
    titleBox: height - 2 * tokens.border.width - top - bottom - gapTitle,
  };
}

export type TitleFit = {
  size: number;
  lineHeight: number;
  lines: string[];
  /** Every word is whole on its line, there are at most four lines and they are no higher than the room for the title. */
  fits: boolean;
};

/** The height of a line of a title, as the ratio the cover draws it with. */
export const TITLE_LINE_RATIO = 1.16;
export const TITLE_MAX_LINES = 4;

/** A title is set in fewer lines when that costs no more than this share of the size it could have at four ("The Interior / Castle" and not "The / Interior / Castle"). */
export const FEWER_LINES_COST = 0.85;

/**
 * The size of a title and the lines it is broken in, for a text area `width` wide and at most `height` high, from the cover's own maximum
 * size down to its minimum, over the sizes of the type scale only (never a size between two of them). Every candidate has at most four lines, no word cut, and lines
 * that together fit the height. The largest size wins, unless fewer lines are possible at a size within 15 % of it, because a title in two or three balanced lines looks
 * like a cover and one in four short ones looks like a list. The cover draws the title at that size, in those lines. When nothing fits, `fits` is false (a test fails on it).
 */
export function fitTitle(title: string, width: number, height: number, max: number, min: number): TitleFit {
  const best: (TitleFit | null)[] = [];
  let last: TitleFit | null = null;
  for (let limit = 1; limit <= TITLE_MAX_LINES; limit += 1) {
    best[limit] = null;
    for (const size of SCALE_SIZES) {
      if (size > max || size < min) continue;
      const { lines, fits } = wrap('fraunces', title, width, size);
      const lineHeight = Math.round(size * TITLE_LINE_RATIO);
      last = { size, lineHeight, lines, fits: fits && lines.length <= limit && lines.length * lineHeight <= height };
      if (last.fits) { best[limit] = last; break; }
    }
  }
  const largest = best[TITLE_MAX_LINES];
  if (!largest) return last ?? { size: min, lineHeight: Math.round(min * TITLE_LINE_RATIO), lines: [title], fits: false };
  for (let limit = 1; limit < TITLE_MAX_LINES; limit += 1) {
    const c = best[limit];
    if (c && c.size >= largest.size * FEWER_LINES_COST) return c;
  }
  return largest;
}

/** The time line must be one line: "2 h 29 min" in mono at this size is this wide. */
export const timeWidth = (time: string, m: CoverMetrics): number => textWidth('mono', time, m.time.size);

/** Everything the text of one cover is drawn with, at this width: the title in its lines and its size, and the time. (The kind of book is not drawn: coverLabel says it.) */
export function coverText(book: { title: string; kind: string; minutes: number }, width: number) {
  const m = coverMetrics(width);
  const time = formatMinutes(book.minutes);
  return { m, title: fitTitle(book.title, m.text, m.titleBox, m.title.max, m.title.min), time, timeFits: timeWidth(time, m) <= m.text };
}

/** What a screen reader says for a cover: "The French Way, Pilgrim's guide, 51 minutes". It says all that the cover shows, and the kind of book, which the cover leaves to the book page. */
export const coverLabel = (b: { title: string; kind: string; minutes: number }): string => `${b.title}, ${kindName(b.kind)}, ${spokenMinutes(b.minutes)}`;
