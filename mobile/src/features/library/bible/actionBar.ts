// The bar of actions that comes up when a verse is chosen (Bookmark, Copy, Share): how big it is, and how the reader keeps the chosen verse above it. Pure: no
// React, no React Native (plain node tests cover it, npm run test:library). VerseActions.tsx draws the bar from these numbers, Reader.tsx makes room for it.
//
// It is made to be hit with a thumb, on a phone as narrow as 320: the glyph is 30, the word under it 16 (Inter SemiBold), each action is at least 88 wide and
// 68 high (and a third of the bar, or half when Copy is not there), and the reference ("Psalm 121:3", JetBrains Mono) is 17.

export const ACTION_ICON = 30;
export const ACTION_LABEL = 16;
export const ACTION_LABEL_LINE = 20;
export const ACTION_MIN_WIDTH = 88;
export const ACTION_MIN_HEIGHT = 68;
/** Between the actions, across. */
export const ACTION_GAP = 8;
/** The reference of the chosen verse, and the line it stands in; the row it is in is as high as its close button (48). */
export const PLACE_SIZE = 17;
export const PLACE_LINE = 24;
export const BAR_HEADER = 48;
/** From the sides of the screen, and above the bottom edge (over the safe area, which the bar adds). */
export const BAR_SIDE = 12;
export const BAR_BOTTOM = 12;
/** Between the edge of the bar (its border is 1) and what is in it: across, and up and down. */
export const BAR_PAD_X = 6;
export const BAR_PAD_Y = 8;
export const BAR_BORDER = 1;
/** Between the row of the reference and the row of the actions. */
export const BAR_ROW_GAP = 4;

/** How high the bar is at the normal text size: its padding, the row of the reference, the gap, the actions, its border. */
export const BAR_HEIGHT = 2 * BAR_PAD_Y + BAR_HEADER + BAR_ROW_GAP + ACTION_MIN_HEIGHT + 2 * BAR_BORDER;

/** How wide each of `count` actions is on a screen `width` wide (they share the bar equally). 88.7 at 320 with three. */
export const actionWidth = (width: number, count: number): number =>
  (width - 2 * BAR_SIDE - 2 * BAR_BORDER - 2 * BAR_PAD_X - (count - 1) * ACTION_GAP) / count;

/** How much of the bottom of the screen the bar covers while it is up: its height, what is under it, and the safe area. */
export const barCovers = (insetBottom: number): number => BAR_HEIGHT + BAR_BOTTOM + insetBottom;

/** The room kept under the last words while the bar is up, so that the end of the chapter can be scrolled above it. */
export const roomUnder = (insetBottom: number): number => barCovers(insetBottom) + 24;

/** A verse touched this many lines above the bar, or lower, is brought up (a verse is a few lines, and the touch is on its first). */
export const ZONE_LINES = 3;
/** Where it comes to rest: this far down the part of the screen that is above the bar. */
export const ANCHOR = 0.4;

/**
 * How far to scroll down, in px, so that the verse touched at `pageY` (from the top of the screen) is not under the bar: 0 when it is high enough already
 * (more than ZONE_LINES lines above the bar), otherwise as much as puts the touched line ANCHOR of the way down the part of the screen above the bar, which
 * leaves the rest of the verse room below it. The scroll is the reader's own and stops at the end of the chapter, which has room for it (roomUnder).
 */
export function scrollForBar(pageY: number, windowHeight: number, covered: number, lineHeight: number): number {
  const visible = windowHeight - covered;
  if (!(visible > 0) || !Number.isFinite(pageY)) return 0;
  if (pageY <= visible - ZONE_LINES * lineHeight) return 0;
  return Math.round(pageY - ANCHOR * visible);
}
