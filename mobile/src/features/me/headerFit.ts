// How tall the header of Me may be: pure numbers, no React and no React Native, so plain node tests cover it (npm run test:me).
//
// WHY. The gold chat button floats at the bottom right (components/Fab.tsx), 8 px above the tab bar (components/TabBar.tsx). The strip of sub-tabs (Notes, Journey,
// Plan, Health) is the LAST thing of the header, and on a short phone the header is as tall as the room above the button: the button sat over "Health", and on a
// shorter one the whole strip sat under the tab bar. The button is the owner's design and must stay at the bottom right, and the strip must stay four tabs, so the one
// thing that can give is the header. When the strip would end below the top edge of the button, the header is drawn COMPACT: a smaller avatar, tighter spacing, the My Camino card
// and the highlights with less air. Nothing is taken out of it; every word and every button stays.
//
// The button's own numbers (the tab bar's 88 and its 14 and 10, the 8 between them, the button's 60) are copied here; src/features/me/__tests__/headerFit.test.ts
// reads components/Fab.tsx and components/TabBar.tsx and fails when they drift apart.

/** The chat button is a circle of 60 (components/Fab.tsx). */
export const FAB_SIZE = 60;
/** The floating tab bar is 88 high (components/TabBar.tsx). */
export const TAB_BAR_HEIGHT = 88;
/** The chat button sits 8 above the tab bar (components/Fab.tsx). */
export const FAB_ABOVE_BAR = 8;

/** Where the top edge of the chat button is, in px from the top of the screen it floats over. Exactly the maths of Fab.tsx: bottom = max(inset - 14, 10) + 88 + 8, height 60. */
export function chatButtonTop(screenHeight: number, bottomInset: number): number {
  return screenHeight - (Math.max(bottomInset - 14, 10) + TAB_BAR_HEIGHT + FAB_ABOVE_BAR) - FAB_SIZE;
}

/** Clear air kept between the bottom of the strip and the top of the button: the button's badge sticks out 4 px, and a circle has no corner to hide behind. */
export const STRIP_AIR = 8;

export type Density = 'roomy' | 'compact';

/**
 * The strip's bottom edge, in px from the top of the content (the 8 of layout.screenTop included, the status bar not), when the header is ROOMY with what a real plan gives it: the row of highlights
 * with a name on two lines, a description of one line. Measured in the browser at 360 and 390 wide: 544 when every name is on one line, 565 when one is on two (a plan of the Camino Francés always has
 * one); at 320 the Change button of the card moves under its words, which makes the card a line taller. A phone whose room is under this (counted from the status bar to the button) gets the compact
 * header; a header that still comes out taller (a long description, 320 wide) is caught after it is drawn (stripOverflows).
 */
export const ROOMY_STRIP_BOTTOM = 568;

export type FitInput = {
  /** The height of the screen the button floats over (the root view of Me; the window's height until it is measured). */
  screenHeight: number;
  /** The safe area: the status bar's height at the top and the home bar's at the bottom. The web has none; a phone has both, and the status bar makes the header end lower. */
  insets: { top: number; bottom: number };
  /** The text size the phone is set to (1 is the normal one). A phone set to larger text draws a taller header, so it goes compact sooner. */
  fontScale?: number;
};

/** How much room there is for the header, counted from the top of the content to `STRIP_AIR` above the button: the strip must end inside it. */
export function headerRoom({ screenHeight, insets }: FitInput): number {
  return chatButtonTop(screenHeight, insets.bottom) - insets.top - STRIP_AIR;
}

/** Roomy when the whole header, with the room the phone's text size takes, ends above the chat button; compact when it would not. */
export function headerDensity(input: FitInput): Density {
  const scale = Math.max(1, input.fontScale ?? 1);
  return headerRoom(input) >= ROOMY_STRIP_BOTTOM * scale ? 'roomy' : 'compact';
}

/**
 * The check after the first draw: the header was measured, and its strip ends lower than the room (a long description, a name that wraps, a larger text size than the phone reported). `stripBottom` is
 * the bottom of the strip in px from the top of the header's own view (the screen's own `screenTop` is added here: the header starts that far, and below the status bar). True means: draw the compact header.
 */
export function stripOverflows(input: FitInput & { stripBottom: number; screenTop: number }): boolean {
  return input.screenTop + input.stripBottom > headerRoom(input);
}

/**
 * What the two headers are made of: every number is a step of the space scale (design/tokens.json), a size of the picture or the gear, or a line count.
 *  afterHeader  the space between the handle row and the avatar row
 *  beforeStrip  the space between the highlights and the strip of sub-tabs
 *  gear         the Settings button, a round button: 52, and 48 (the hard minimum for a touch target) when compact
 *  avatar       the profile picture
 *  avatarGap    between the picture and the three counters
 *  statNumber   the type of the numbers of the counters (the title type), and statLabel the words under them
 *  bioLines     lines of the description before "Read more"
 *  cardLift     the My Camino card's own space above it (on top of the 4 of the name block)
 *  cardGap      between the head of the card and its body
 *  cardRing     the ring round the shell on the card, and the shell inside it (4 less)
 *  hlLift       the highlights' own space above them
 *  hlLabelGap   between a round picture and its name
 *  hlLines      lines for the name under a round: two, and one when compact (a name that needs more ends in "…"; the screen reader and the bar over the grid say it whole)
 */
export type HeaderMetrics = {
  afterHeader: number; beforeStrip: number; gear: number; avatar: number; avatarGap: number; statNumber: 'h3' | 'h4'; statLabel: 'small' | 'caption'; bioLines: number;
  cardLift: number; cardGap: number; cardRing: number; hlLift: number; hlLabelGap: number; hlLines: number;
};

export const DENSITY: Record<Density, HeaderMetrics> = {
  roomy: { afterHeader: 16, beforeStrip: 16, gear: 52, avatar: 92, avatarGap: 20, statNumber: 'h3', statLabel: 'small', bioLines: 4, cardLift: 8, cardGap: 4, cardRing: 52, hlLift: 8, hlLabelGap: 8, hlLines: 2 },
  compact: { afterHeader: 4, beforeStrip: 4, gear: 48, avatar: 56, avatarGap: 16, statNumber: 'h4', statLabel: 'caption', bioLines: 2, cardLift: 4, cardGap: 0, cardRing: 40, hlLift: 0, hlLabelGap: 4, hlLines: 1 },
};

/** The My Camino card puts the Change button at the end of its head when the phone is at least this wide, and at the end of its body (the words beside it wrap) when it is narrower. */
export const CARD_WIDE = 340;
