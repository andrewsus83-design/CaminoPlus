// The sums behind the two grids of the Bible side: the books (three square tiles in a row) and the chapters of a book (square tiles, as many in
// a row as fit). Pure: no React, no React Native (plain node tests cover it, npm run test:library). A screen gives its width and draws what comes back.

/** The space at the sides of every screen of the app (layout.screenMargin in tokens.json; a test checks they are the same). */
export const SIDE = 16;

/** Under this width (the same as the search field's and the Library's other narrow rules) the gaps and the padding of a tile are smaller. */
export const NARROW_UNDER = 352;

export type BookGrid = {
  columns: 3;
  /** Between two tiles, across and down. */
  gap: number;
  /** The side of a square tile. */
  tile: number;
  /** Between the edge of a tile (its border is 1) and its words: across, where the name needs every pixel it can get, and down, where the corners are round (radius 20). */
  padX: number;
  padY: number;
  /** How wide the words of a tile may be, and how high. */
  innerWidth: number;
  innerHeight: number;
};

/**
 * The book tiles for a screen `width` wide: three in a row between the side margins, square, with 12 between them (8 under NARROW_UNDER, where every pixel is a
 * letter). The name is the hero of a tile, so the padding across is as small as the round corners allow: 3 (2 under NARROW_UNDER), and 6 (5) down.
 */
export function bookGrid(width: number): BookGrid {
  const narrow = width < NARROW_UNDER;
  const gap = narrow ? 8 : 12;
  const padX = narrow ? 2 : 3;
  const padY = narrow ? 5 : 6;
  const tile = Math.floor((width - 2 * SIDE - 2 * gap) / 3);
  return { columns: 3, gap, tile, padX, padY, innerWidth: tile - 2 * (padX + 1), innerHeight: tile - 2 * (padY + 1) };
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
