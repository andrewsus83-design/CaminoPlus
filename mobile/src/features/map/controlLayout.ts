// How the round controls on the map share the room they have. Plain numbers in, plain numbers out (no React, no theme), so a test can run it
// for every phone from 320 x 568 up to 430 x 932 and for large text.
//
// One family (WalkUi.tsx has the numbers: 56 round buttons with a 28 icon, 12 apart, 16 from the edge, the zoom pair one 56 x 112 capsule).
// A column of them is as tall as its buttons and its gaps. When the room between the banner and the bottom card (Walk view), or between the top
// row and the tab bar (whole route), is less than the whole family needs, the column shows the most important ones, in `rank` order, and the rest are
// FOLDED: they are rows of "Map options" in the route sheet, which the flag button opens.

export type Slot = { id: string; h: number };

/** The height of a column of controls: the controls and the gaps between them. */
export const columnHeight = (heights: number[], gap: number) => heights.reduce((sum, h) => sum + h, 0) + gap * Math.max(0, heights.length - 1);

export type Fit = {
  /** the ids that get a place in the column */
  shown: string[];
  /** the ids that did not: they are in "Map options" (and `pinned`, the way to them, is shown when there is room for it) */
  folded: string[];
  /** a control that must be in the column did not fit: the column keeps all its controls and scrolls inside the room (the last resort, for the largest text on a short phone) */
  scroll: boolean;
};

export type FitOptions = {
  /** the space between two controls */
  gap: number;
  /**
   * The control that is the way to the folded ones (the flag button, "Route details and map options"). When anything folds, it moves up to come right after the
   * first `keep` controls (the zoom pair and the bell, which never give way to it), so it keeps its place whatever its own rank.
   */
  pinned?: string;
  keep?: number;
  /** controls that must not fold (the zoom pair; the help bell where nothing else holds it): if one does not fit, the column scrolls instead of folding it */
  must?: string[];
};

/**
 * `ranked` is every control, the most important first. The column takes them in that order while they fit in `room`, and stops at the first that does not
 * (a less important control never stays when a more important one folded).
 */
export function fitControls(ranked: Slot[], room: number, { gap, pinned, keep = 2, must = [] }: FitOptions): Fit {
  const ids = ranked.map((s) => s.id);
  if (ranked.length === 0) return { shown: [], folded: [], scroll: false };

  const take = (list: Slot[]) => {
    const taken: Slot[] = [];
    for (const s of list) {
      if (columnHeight([...taken.map((t) => t.h), s.h], gap) > room) break;
      taken.push(s);
    }
    return taken.map((s) => s.id);
  };

  const all = take(ranked);
  if (all.length === ranked.length) return { shown: ids, folded: [], scroll: false };

  const pin = ranked.find((s) => s.id === pinned);
  const others = ranked.filter((s) => s.id !== pin?.id);
  const shown = pin ? take([...others.slice(0, keep), pin, ...others.slice(keep)]) : all;
  if (must.some((id) => !shown.includes(id))) return { shown: ids, folded: [], scroll: true };
  return { shown, folded: ids.filter((id) => !shown.includes(id)), scroll: false };
}

/** The room the right-hand column has in the Walk view: from the bottom of the banner (and the chips, when they are open) to one margin above the bottom card. */
export function walkRoom(p: { screenH: number; topInset: number; screenTop: number; aboveH: number; cardH: number; gap: number; edge: number }) {
  const top = p.topInset + p.screenTop + p.aboveH + p.gap; // the banner starts at the top inset plus screenTop, the column a gap under it
  const bottom = p.screenH - p.cardH - p.edge;
  return Math.max(0, Math.floor(bottom - top));
}

/** The room the right-hand column has on the whole route: from the bottom of the top row (switch, status, notices) to one margin above the tab bar. */
export function routeRoom(p: { screenH: number; topInset: number; screenTop: number; topH: number; tabBarH: number; gap: number; edge: number }) {
  const top = p.topInset + p.screenTop + p.topH + p.gap;
  const bottom = p.screenH - p.tabBarH - p.edge;
  return Math.max(0, Math.floor(bottom - top));
}

/** The widest the Re-center pill may be: it sits at the left, the column at the right, and a gap stays between them (a 320 wide phone: 220). */
export function pillMaxWidth(screenW: number, btn: number, gap: number, edge: number) {
  return Math.max(0, screenW - 2 * edge - btn - gap);
}
