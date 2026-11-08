// How wide the calendar is, as a pure function, so a node test can check it for every phone width from 320 to 430 (npm run test:library).
//
// A finger needs 44 by 44, and a week is seven days. Seven times 44 is 308, and a 320 phone leaves 288 between its two 16 px margins,
// so on the smallest phones a calendar inside the margins would have days 41 wide. Rather than make the days smaller, the calendar
// card (which then has no side padding) reaches out into the margins until the seven days are 44 wide each; on a 320 phone that
// leaves 6 px on each side of the card. From 340 up the card stays inside the margins, and from 356 up it has its full 8 px of side padding.

/** The columns of the grid: the days of the week. */
export const COLUMNS = 7;
/** The least a day may be, wide and high. */
export const TOUCH = 44;
/** The side padding of the card when there is room for it. */
export const CARD_PAD = 8;
/** The widest the grid gets (on a tablet or in a browser window): the days stop growing at 64. */
export const GRID_MAX = COLUMNS * 64;

export type CalendarMetrics = {
  /** How far the card reaches into each side margin: 0 from a 340 phone up. */
  bleed: number;
  /** The side padding inside the card, 0 to 8. */
  pad: number;
  /** The width of the card. */
  card: number;
  /** The width of the seven days together. */
  grid: number;
  /** The width of one day, 44 or more. */
  cell: number;
};

/** `screen` is the width of the screen and `margin` the side margin of the screens (16). */
export function calendarMetrics(screen: number, margin: number): CalendarMetrics {
  const inside = Math.max(screen - 2 * margin, 0);
  const need = COLUMNS * TOUCH;
  // The card never reaches past the edge of the screen, so under 308 wide it simply fills the screen (those phones do not exist).
  const bleed = Math.min(Math.max(need - inside, 0) / 2, margin);
  const card = inside + 2 * bleed;
  const pad = Math.min(Math.max((card - need) / 2, 0), CARD_PAD);
  const grid = Math.min(card - 2 * pad, GRID_MAX);
  return { bleed, pad, card, grid, cell: grid / COLUMNS };
}
