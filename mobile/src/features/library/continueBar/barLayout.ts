// Where the "Continue reading" bar sits, as numbers. Pure: no React, no React Native (plain node tests cover it, npm run test:library).
//
// The bar floats above the floating tab bar, like the gold round button does (components/Fab.tsx), and the two must never touch. The tab bar's own numbers are in
// components/TabBar.tsx: a pill 88 high whose bottom edge is Math.max(insets.bottom - 14, 10) above the bottom of the screen. They are written here once more, and a test
// (continueBarWiring.test.ts) fails when they stop being the tab bar's. The bar keeps the same side margins as the tab bar (layout.screenMargin), is 8 above the pill, about as
// high as a mini player (64) and a pill itself, with the tab bar's shadow.

/** TabBar.tsx: the pill is this high. */
export const TAB_BAR_HEIGHT = 88;

/** TabBar.tsx: how far its bottom edge is above the bottom of the screen, for a phone whose home indicator takes `insetBottom`. */
export const tabBarBottom = (insetBottom: number): number => Math.max(insetBottom - 14, 10);

/** The bar is this high at the phone's normal text size (it grows, a little, when the phone's text is larger). */
export const BAR_HEIGHT = 64;
/** The space between the bar and the tab bar under it. */
export const BAR_GAP = 8;

/** How far the bottom edge of the bar is above the bottom of the screen: the tab bar, its height, and the gap. */
export const barBottom = (insetBottom: number): number => tabBarBottom(insetBottom) + TAB_BAR_HEIGHT + BAR_GAP;

/**
 * What the bar takes from the lists under it, beyond the room they keep for the tab bar: its height and the gap. Added to the end of a list (components/Screen.tsx), so
 * that its last row can be scrolled to a place above the bar, as far from it as it was from the tab bar before.
 */
export const BAR_ROOM = BAR_HEIGHT + BAR_GAP;

/** The button that hides the bar: a square this wide and high, the 48 that is the least a tap target may be. */
export const CLOSE_SIZE = 48;
/** The ends of the bar are half circles of radius 32: the glyph (28 wide) sits 16 in from the left end and the close button (48) 8 in from the right end, which puts the centre of each near the centre of its curve. */
export const BAR_PAD_LEFT = 16;
export const BAR_PAD_RIGHT = 8;
