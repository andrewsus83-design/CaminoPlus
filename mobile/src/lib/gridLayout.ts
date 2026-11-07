// Layout maths of the My journey grid (mobile/src/features/me/JourneyGrid.tsx), kept pure so it can be tested
// without React Native. The look is the TikTok / Reels profile grid: two even columns, square corners, rows aligned
// (no staggered "masonry" columns), a 2 px gap between tiles in both directions and a 2 px inset from the left and
// right edge of the screen. The page background shows through the gaps.

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

/** Post indexes grouped into rows of GRID_COLUMNS, in reading order (left to right, then down). */
export function gridRows(count: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += GRID_COLUMNS) {
    rows.push(Array.from({ length: Math.min(GRID_COLUMNS, count - i) }, (_, k) => i + k));
  }
  return rows;
}
