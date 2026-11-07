// Layout maths of the My journey grid (mobile/src/features/me/JourneyGrid.tsx), kept pure so it can be tested
// without React Native. The look is the TikTok / Reels profile grid: two even columns, square corners, no gaps
// except a 1 px line, rows aligned (no staggered "masonry" columns).

export const GRID_COLUMNS = 2;
/** The only space between tiles, in logical px. It shows the page background, so it reads as a thin line. */
export const GRID_LINE = 1;
/** Tiles are portrait 9:16, like a video frame. */
export const TILE_RATIO = 16 / 9;

export type GridMetrics = {
  /** Width of the whole grid. */
  width: number;
  /** Width of one tile. Rounded DOWN to a whole device pixel, so two tiles and the line never overflow `width`. */
  colW: number;
  tileH: number;
  line: number;
};

/**
 * @param windowWidth width of the screen in logical px
 * @param bleed true = edge to edge (the screen's side padding is cancelled), false = inside the side padding `margin`
 * @param pixelRatio device pixel ratio (PixelRatio.get() on a phone), used to land tile edges on whole device pixels
 */
export function gridMetrics(windowWidth: number, opts: { bleed: boolean; margin: number; pixelRatio?: number }): GridMetrics {
  const ratio = opts.pixelRatio && opts.pixelRatio > 0 ? opts.pixelRatio : 1;
  const floorToPixel = (v: number) => Math.floor(v * ratio + 1e-9) / ratio;
  const width = opts.bleed ? windowWidth : windowWidth - opts.margin * 2;
  const colW = floorToPixel((width - GRID_LINE * (GRID_COLUMNS - 1)) / GRID_COLUMNS);
  return { width, colW, tileH: floorToPixel(colW * TILE_RATIO), line: GRID_LINE };
}

/** Post indexes grouped into rows of GRID_COLUMNS, in reading order (left to right, then down). */
export function gridRows(count: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < count; i += GRID_COLUMNS) {
    rows.push(Array.from({ length: Math.min(GRID_COLUMNS, count - i) }, (_, k) => i + k));
  }
  return rows;
}
