import tokens from '@/theme/tokens.json';

// Colours for surfaces that do NOT change with light / dark mode: Discover's page and story cards, the cream circles of the
// action rail, the scrims over a photo. The theme colours (c.blue, c.red, c.white ...) flip in dark mode, so on a surface
// that stays light or stays dark they would flip the text and icons into the same tone as the surface (the blue icons on the
// cream circles became 1.9:1). Everything here is read straight from the LIGHT token values in tokens.json and never flips.
//
// The rule of thumb: if the surface behind a colour does not change in dark mode, the colour on it must not change either.
// Each colour is named once, here. A screen that sits on such a surface imports FIXED instead of using c.* or its own number
// (src/lib/__tests__/railStandard.test.ts fails when explore.tsx or the rail bring a flipping token back).
const t = tokens.color;

const rgba = (hex: string, alpha: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
};

export const FIXED = {
  /** Icons, counts and captions on the cream circles and on the pastel story cards. */
  blue: t.blue,
  /** Discover's page, and the text on its pastel story cards. */
  blue900: t.blue900,
  /** The heart. */
  red: t.red,
  /** Paper white: text on Discover's dark page. */
  white: t.white,
  parchment: t.parchment,
  goldInk: t.goldInk,
  goldSoft: t.goldSoft,

  /** The four circles of the action rail (the paper white token at 85 %). */
  railCircle: rgba(t.white, 0.85),
  /** Discover's "Sample stories" pill. */
  pill: rgba(t.white, 0.92),
  /** Over Discover: the swipe tutorial, and the dimmed page behind the comments sheet. */
  tutorialScrim: rgba(t.blue900, 0.6),
  sheetScrim: rgba(t.blue900, 0.5),
  /** Discover's top tabs, the empty-state icon and the shadow under the tab names. */
  tabOff: 'rgba(255,255,255,0.65)',
  emptyIcon: 'rgba(255,255,255,0.8)',
  tabShadow: 'rgba(0,0,0,0.35)',

  /** White text and icons on a photo or a dark scrim (the journey viewer and the tiles). */
  onPhoto: '#FFFFFF',
  black: '#000000',
  /** Dark chips on a photo that carry a picture or an icon: the close button, the clip badge. */
  photoChip: 'rgba(0,0,0,0.45)',
  /** The dark band under the caption in the full-screen viewer. */
  photoScrim: 'rgba(0,0,0,0.35)',
  /**
   * The dark band under the place name on a grid tile of Me, and the slide count on it: 60 % black. White words of the caption size over it keep 4.5 : 1 over ANY picture,
   * the whitest one included (a pure white pixel under it comes out at 5.7 : 1), and over every flat colour of the text cards (at 28 % black the gold tile gave 2.5 : 1).
   * features/me/__tests__/tabs.test.ts mixes the colours and fails when this number is lowered.
   */
  tileScrim: 'rgba(0,0,0,0.6)',
} as const;
