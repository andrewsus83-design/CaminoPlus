// Where the gold pill of the daily banner goes, as a pure function, so a node test can check it for every phone width and text size (npm run test:library).
//
// On a phone wide enough the title "Daily reading" and the pill "Read today" share a row, the pill at the right edge: that keeps the card short. On a phone too narrow, or with text
// turned up so far that the two would not fit, the pill goes under the last line instead, so that neither is ever squeezed or cut. The widths are those of the title (Fraunces 24, about
// 163) and the pill (Inter 17 semibold with 16 on each side, about 120) at the normal text size; they grow with the phone's text size, which the banner stops following at `maxScale`.

/** The side margin of the screens (layout.screenMargin) and the padding of the card, each side. */
export const OUTSIDE = 16;
export const INSIDE = 16;
/** The title and the pill at the normal text size, and the gap between them. */
export const TITLE_WIDTH = 165;
export const PILL_WIDTH = 120;
export const ROW_GAP = 12;

/** Do the title and the pill fit in one row on a window `width` wide with the phone's text at `fontScale` (the banner follows it up to `maxScale`)? */
export function pillBesideTitle(width: number, fontScale: number, maxScale: number): boolean {
  const scale = Math.min(fontScale, maxScale);
  const room = width - 2 * OUTSIDE - 2 * INSIDE;
  return room >= (TITLE_WIDTH + PILL_WIDTH) * scale + ROW_GAP;
}
