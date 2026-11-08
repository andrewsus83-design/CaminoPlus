// The sums behind the two grids of the Bible side: the books (two compact tiles in a row) and the chapters of a book (square tiles, as many in a row as fit).
// Pure: no React, no React Native (plain node tests cover it, npm run test:library). A screen gives its width and draws what comes back.
//
// Every number of the book tiles is a token of design/tokens.json, read from the file (src/theme/tokens.json is its copy) and not typed again: the side margin is
// layout.screenMargin, the gap between tiles and the padding inside one are steps of the `space` scale, the height of a tile is the height of its words
// (two lines of the h4 title, a gap of space.2 and the mono line of the count), the hairline is border.width. reader.test.ts checks every one against the file.
import tokens from '../../../theme/tokens.json';

/** The space at the sides of every screen of the app (layout.screenMargin). */
export const SIDE: number = tokens.layout.screenMargin;

/** Under this width (the same as the search field's and the Library's other narrow rules) the gap between tiles and the padding inside one are one step of the space scale smaller. */
export const NARROW_UNDER = 352;

/** The hairline around a tile (border.width): the words are this much further from the outline than the padding says. */
export const BORDER: number = tokens.border.width;

const { space } = tokens;

export type BookGrid = {
  columns: 2;
  /** Between two tiles, across and down: space.3 (12), space.2 (8) under NARROW_UNDER. */
  gap: number;
  /** The width of a tile: half of what is left between the side margins once the gap is taken. */
  tile: number;
  /** The height of a tile: its words (two lines of h4, space.2 and the count) between the padding, hairline included. 124 (116 under NARROW_UNDER). */
  height: number;
  /** Between the hairline and the words, on all four sides: space.4 (16), space.3 (12) under NARROW_UNDER. */
  pad: number;
  /** The hairline (border.width). */
  border: number;
  /** How wide the words of a tile may be, and how high. */
  innerWidth: number;
  innerHeight: number;
};

/**
 * The room the words of a tile need, high: the name on two lines of h4 (a numbered book and "Song of Songs" are two lines; the name is never higher than that), a gap of
 * space.2 between it and the count, and the count in mono. A name of one line leaves the difference empty between the name (at the top) and the count (at the bottom).
 */
export const WORDS_HEIGHT: number = 2 * tokens.text.h4.lineHeight + space['2'] + tokens.text.mono.lineHeight;

/**
 * The book tiles for a screen `width` wide: two in a row between the side margins, each as high as its words need and no more (124, or 116 under NARROW_UNDER), with
 * space.3 between them (space.2 under NARROW_UNDER, where every pixel is a letter). The words are space.4 from the hairline on every side (space.3 under NARROW_UNDER):
 * about 17 px from the outline of the card on a phone of 390 and 13 on a phone of 320, where it used to be 4.
 */
export function bookGrid(width: number): BookGrid {
  const narrow = width < NARROW_UNDER;
  const gap = narrow ? space['2'] : space['3'];
  const pad = narrow ? space['3'] : space['4'];
  const tile = Math.floor((width - 2 * SIDE - gap) / 2);
  const edge = 2 * (pad + BORDER);
  return { columns: 2, gap, tile, height: WORDS_HEIGHT + edge, pad, border: BORDER, innerWidth: tile - edge, innerHeight: WORDS_HEIGHT };
}

/** No chapter tile is smaller than this: it is a button, and a person with a thumb has to hit it (44 is the least a target may be; these are bigger). */
export const CHAPTER_TILE_MIN = 56;
export const CHAPTER_GAP = 8;

export type ChapterGrid = { columns: number; gap: number; tile: number };

/** The chapter tiles for a screen `width` wide: as many in a row as keep each at least CHAPTER_TILE_MIN (4 at 320, 5 at 390, 6 at 430), the tiles filling the row. */
export function chapterGrid(width: number): ChapterGrid {
  const content = Math.max(width - 2 * SIDE, CHAPTER_TILE_MIN);
  const columns = Math.max(1, Math.floor((content + CHAPTER_GAP) / (CHAPTER_TILE_MIN + CHAPTER_GAP)));
  return { columns, gap: CHAPTER_GAP, tile: Math.floor((content - CHAPTER_GAP * (columns - 1)) / columns) };
}
