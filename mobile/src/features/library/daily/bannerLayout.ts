// Where the gold pill of the daily banner goes, as a pure function, so a node test can check it for every phone width and text size (npm run test:library).
//
// On a phone wide enough the title "Daily reading" and the pill "Read today" share a row, the pill at the right edge: that keeps the card short. On a phone too narrow, or with text
// turned up so far that the two would not fit, the pill goes under the last line instead, so that neither is ever squeezed or cut. The widths are those of the title (Fraunces 24: 157 as
// the web export draws it, 160 here) and the pill (Inter 17 semibold with 16 on each side: 124 drawn, 127 here) at the normal text size, each with a little room for the way a phone draws a
// letter; they grow with the phone's text size, which the banner stops following at `maxScale`. So the pill is beside the title from 363 wide up (a phone of 375 or 390), under the last line on
// a phone of 360 or less, and under it on a phone of 390 once the text is 1.1 times its size.

/** The side margin of the screens (layout.screenMargin) and the padding of the card, each side. */
export const OUTSIDE = 16;
export const INSIDE = 16;
/** The title and the pill at the normal text size, and the gap between them. */
export const TITLE_WIDTH = 160;
export const PILL_WIDTH = 127;
export const ROW_GAP = 12;

/** Do the title and the pill fit in one row on a window `width` wide with the phone's text at `fontScale` (the banner follows it up to `maxScale`)? */
export function pillBesideTitle(width: number, fontScale: number, maxScale: number): boolean {
  const scale = Math.min(fontScale, maxScale);
  const room = width - 2 * OUTSIDE - 2 * INSIDE;
  return room >= (TITLE_WIDTH + PILL_WIDTH) * scale + ROW_GAP;
}
