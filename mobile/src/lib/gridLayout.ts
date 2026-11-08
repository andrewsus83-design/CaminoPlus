// Layout maths of the My journey grid (mobile/src/features/me/JourneyGrid.tsx), kept pure so it can be tested
// without React Native. The look is the TikTok / Reels profile grid: two even columns, square corners, rows aligned
// (no staggered "masonry" columns), a 2 px gap between tiles in both directions and a 2 px inset from the left and
// right edge of the screen. The page background shows through the gaps.
//
// The first cell of the grid, top left, is the "Write a journey post" card (features/me/WriteCard.tsx). It is a cell like the posts (the same size, the same
// columns, the same gaps and edges) but it is NOT a post: the viewer, the action rail, the destination filter and the likes work on the posts alone. So the
// rows hold one cell more than there are posts, and the post that sits in cell k is post k - 1 (gridCellRows, cellOfPost, postOfCell below).

export const GRID_COLUMNS = 2;
/** The space between tiles, sideways and downwards, in logical px. It shows the page background, so it reads as a thin line. */
export const GRID_GAP = 2;
/** The space between the grid and the left and right edge of the screen, in logical px. */
export const GRID_EDGE = 2;
/** Tiles are portrait 9:16, like a video frame. */
export const TILE_RATIO = 16 / 9;

export type GridMetrics = {
  /** Width the grid may use: the screen minus the two edges. */
  width: number;
  /** Width of one tile. Rounded DOWN to a whole device pixel, so two tiles and the gap never overflow `width`. */
  colW: number;
  tileH: number;
  /** Space between tiles (both directions). 2 px, or the nearest whole device pixel where 2 px is not one (2.625x phones). */
  gap: number;
  /** Space between the grid and the left and right screen edge. Same rule as `gap`. */
  edge: number;
  /** Side margin that puts the grid `edge` from the screen edge inside a screen that pads its content by `margin` (negative). */
  marginHorizontal: number;
};

/**
 * @param windowWidth width of the screen in logical px
 * @param margin the side padding of the screen the grid sits in (layout.screenMargin on the Me tab)
 * @param pixelRatio device pixel ratio (PixelRatio.get() on a phone), used to land every tile edge on a whole device pixel
 *
 * The left edge of the grid is always exactly `edge`. Because tiles are whole device pixels, at most one device pixel
 * of the width is left over, and it falls on the right.
 */
export function gridMetrics(windowWidth: number, opts: { margin: number; pixelRatio?: number }): GridMetrics {
  const ratio = opts.pixelRatio && opts.pixelRatio > 0 ? opts.pixelRatio : 1;
  const floorToPixel = (v: number) => Math.floor(v * ratio + 1e-9) / ratio;
  const roundToPixel = (v: number) => Math.round(v * ratio + 1e-9) / ratio;
  const gap = roundToPixel(GRID_GAP);
  const edge = roundToPixel(GRID_EDGE);
  const width = windowWidth - edge * 2;
  const colW = floorToPixel((width - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  return { width, colW, tileH: floorToPixel(colW * TILE_RATIO), gap, edge, marginHorizontal: edge - opts.margin };
}

/** Cell indexes (0, 1, 2 ...) grouped into rows of GRID_COLUMNS, in reading order (left to right, then down). The last row may hold a single cell. */
export function gridRows(count: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += GRID_COLUMNS) {
    rows.push(Array.from({ length: Math.min(GRID_COLUMNS, count - i) }, (_, k) => i + k));
  }
  return rows;
}

/* ------------------------------------------------------------------------------------------------ the card in front of the posts */

/** The cells in front of the posts: the "Write a journey post" card is cell 0, top left. */
export const LEADING_CELLS = 1;

/** One cell of the grid: the card that writes a post, or a post by its index among the posts that are shown (the viewer opens at that index). */
export type GridCell = { kind: 'write' } | { kind: 'post'; post: number };

/** The cell a post sits in: the card comes first, so post k is in cell k + 1. */
export const cellOfPost = (post: number): number => post + LEADING_CELLS;

/** The post in a cell, or null for the card. */
export const postOfCell = (cell: number): number | null => (cell < LEADING_CELLS ? null : cell - LEADING_CELLS);

/**
 * The cells of the grid in rows of GRID_COLUMNS, reading order: the card, then the posts. The card makes one cell more than there are posts, so the last
 * row holds a single cell when the posts are an even number (0, 2, 4 ...) and is full when they are odd. With no post at all (a destination whose posts
 * are gone) the grid is the card alone, in a row of one.
 */
export function gridCellRows(postCount: number): GridCell[][] {
  const posts = typeof postCount === 'number' && Number.isFinite(postCount) ? Math.max(0, Math.floor(postCount)) : 0;
  return gridRows(posts + LEADING_CELLS).map((row) => row.map((cell): GridCell => {
    const post = postOfCell(cell);
    return post === null ? { kind: 'write' } : { kind: 'post', post };
  }));
}

/** The posts the grid shows: all of them, or only the ones whose id is in `only` (the destination picked in the highlights), in their own order. */
export function shownPosts<T extends { id: string }>(posts: readonly T[], only?: ReadonlySet<string> | null): readonly T[] {
  return only ? posts.filter((p) => only.has(p.id)) : posts;
}
