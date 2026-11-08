// How the covers of the Books tab are sized and typeset, as pure functions: no React, no React Native (plain node tests cover it for every
// phone width from 320 to 430, npm run test:library). BookCover.tsx draws what this says.
//
// A cover is an A5 page (148 by 210 mm), portrait, so it is as high as 210/148 times its width. The tab shows them two in a row: with
// the 16 px margins of the screens and 12 px between them a 390 phone gets covers 173 wide and 245 high, a 320 phone 138 by 196, a 430 phone
// 193 by 274. On a tablet or a browser window the covers stop growing at 232 and the pair is centred.
//
// A cover has a fixed size, so its text is made to fit before it is drawn (typeMetrics.ts says how wide a text is): the title is set as large
// as it can be in at most four lines, without ever cutting a word, and the author in at most two. A title that cannot be made to fit at the
// smallest size is reported (`fits: false`) so that a test fails, instead of a phone cutting it off.
import { textWidth, wrap } from './typeMetrics';

/** A5, in millimetres. */
export const A5_WIDTH_MM = 148;
export const A5_HEIGHT_MM = 210;
/** Width over height of an A5 page, portrait. */
export const A5_RATIO = A5_WIDTH_MM / A5_HEIGHT_MM;

export const GRID_COLUMNS = 2;
/** The widest a cover gets. */
export const TILE_MAX = 232;
export const GRID_GAP = 12;

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
  /** The space inside the text area, at the sides, at the top and at the bottom. */
  padX: number;
  padTop: number;
  padBottom: number;
  /** The width of the text area. */
  text: number;
  /** The glyph and the ring around it. */
  glyph: number;
  medallion: number;
  /** The gap between the ring and the title, and between the title and the lines under it. */
  gapTop: number;
  gapTitle: number;
  /** The ribbon: its width, the notch at its foot, and its distance from the right edge. It is 44 high, and its button is 44 by 44. */
  ribbon: { width: number; height: number; notch: number; right: number; touch: number };
  title: { max: number; min: number };
  author: { size: number; lineHeight: number; spacing: number; maxLines: number };
  era: { size: number; lineHeight: number };
  chip: { height: number; size: number; padX: number; spacing: number };
  /** The height the title may use: what is left between the ring and the lines under it. */
  titleBox: number;
};

/** All the numbers of a cover that is `width` wide, in points. */
export function coverMetrics(width: number): CoverMetrics {
  const w = Math.max(width, 0);
  const small = w < 150;
  const spine = clamp(Math.round(w * 0.07), 8, 16);
  const edge = small ? 3 : 4;
  const padX = Math.round(w * 0.075);
  const padTop = Math.round(w * 0.09);
  const padBottom = Math.round(w * 0.07);
  const glyph = Math.round(w * 0.14);
  const medallion = glyph + 12;
  const gapTop = small ? 8 : 10;
  const authorSize = clamp(Math.round(w * 0.06 * 2) / 2, 9.5, 11);
  const author = { size: authorSize, lineHeight: Math.round(authorSize * 1.3), spacing: small ? 0.8 : 1, maxLines: 2 };
  const eraSize = clamp(Math.round(w * 0.064), 10, 12);
  const era = { size: eraSize, lineHeight: Math.round(eraSize * 1.35) };
  const chip = { height: small ? 18 : 20, size: small ? 9 : 10, padX: small ? 8 : 10, spacing: 1 };
  const gapAuthor = small ? 3 : 4;
  const gapChip = small ? 5 : 6;
  const gapTitle = small ? 6 : 8;
  const height = a5Height(w);
  const bottom = padBottom + chip.height + gapChip + era.lineHeight + gapAuthor + author.maxLines * author.lineHeight;
  const top = padTop + medallion + gapTop;
  const ribbonWidth = clamp(Math.round(w * 0.16), 22, 30);
  return {
    width: w, height, radius: small ? 3 : 4, spine, edge, padX, padTop, padBottom,
    text: w - spine - edge - 2 * padX,
    glyph, medallion, gapTop, gapTitle,
    ribbon: { width: ribbonWidth, height: 44, notch: 8, right: edge + 10, touch: 44 },
    title: { max: clamp(Math.round(w * 0.125), 14, 26), min: 11 },
    author, era, chip,
    titleBox: height - top - bottom - gapTitle,
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
 * size down to its minimum. Every candidate has at most four lines, no word cut, and lines that together fit the height. The largest size wins,
 * unless fewer lines are possible at a size within 15 % of it, because a title in two or three balanced lines looks like a cover and one in four
 * short ones looks like a list. The cover draws the title at that size, in those lines. When nothing fits, `fits` is false (a test fails on it).
 */
export function fitTitle(title: string, width: number, height: number, max: number, min: number): TitleFit {
  const best: (TitleFit | null)[] = [];
  let last: TitleFit | null = null;
  for (let limit = 1; limit <= TITLE_MAX_LINES; limit += 1) {
    best[limit] = null;
    for (let size = max; size >= min; size -= 1) {
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

export type AuthorFit = { text: string; size: number; lineHeight: number; spacing: number; lines: string[]; fits: boolean };

/** The author in capitals, as large as the cover's size for it allows, and smaller (to 8.5) if it needs more than two lines. */
export function fitAuthor(author: string, width: number, m: CoverMetrics): AuthorFit {
  const text = author.toUpperCase();
  let last: AuthorFit | null = null;
  for (let size = m.author.size; size >= 8.5; size -= 0.5) {
    const { lines, fits } = wrap('inter', text, width, size, m.author.spacing);
    last = { text, size, lineHeight: Math.round(size * 1.3), spacing: m.author.spacing, lines, fits: fits && lines.length <= m.author.maxLines };
    if (last.fits) return last;
  }
  return last ?? { text, size: 8.5, lineHeight: 11, spacing: m.author.spacing, lines: [text], fits: false };
}

/** The era line must be one line: "1522 to 1524" in mono at this size is this wide. */
export const eraWidth = (era: string, m: CoverMetrics): number => textWidth('mono', era, m.era.size);

/** Everything the text of one cover is drawn with, at this width. */
export function coverText(book: { title: string; author: string; era: string }, width: number) {
  const m = coverMetrics(width);
  return { m, title: fitTitle(book.title, m.text, m.titleBox, m.title.max, m.title.min), author: fitAuthor(book.author, m.text, m), eraFits: eraWidth(book.era, m) <= m.text };
}

/** What a screen reader says for a cover: "The Way of a Pilgrim, Anonymous, free", or "…, soon" for a book that has no text yet. */
export const coverLabel = (b: { title: string; author: string }, hasText: boolean): string => `${b.title}, ${b.author}, ${hasText ? 'free' : 'soon'}`;
