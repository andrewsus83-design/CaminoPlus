import tokens from './tokens.json';

// Design tokens come from ../design/tokens.json (copied here; keep in sync). Both the light and the dark palette
// are in that file ("color", "role" and the "dark" section); nothing about dark mode is defined in this file.
// `c` and `role` are read while a screen renders (no StyleSheet.create anywhere), so dark mode swaps
// their values in place with applyScheme() and remounts the screens (see lib/theme.tsx). Gold stays gold.
//
// Which one to use (the design page, section Dark mode, has the full rules):
//   role.*   what a thing MEANS: page, card, text, muted text, link, button, error, hero card, text on gold.
//            Use a role whenever one fits; roles keep their contrast in both modes.
//   c.*      a palette color, only where its meaning is the same in both modes (a status wash, a progress bar).
//            c.blue is NOT "the dark card": in dark mode it is light blue. A hero card is role.inverse.
//   fixed.*  the light palette, never swapped. For a surface that does not change with the mode (a photo, a
//            pastel story card, a cream round button on a photo): what is drawn on it must not change either.
export type Scheme = 'light' | 'dark';

const LIGHT = { ...tokens.color };
type Palette = typeof LIGHT;
const DARK: Partial<Palette> = tokens.dark.color;
const DARK_ROLE: Record<string, string> = tokens.dark.role;

export const c = { ...LIGHT };

/** The light palette. It is never swapped, so it can be read at any time (also in module scope). */
export const fixed: Readonly<Palette> = Object.freeze({ ...LIGHT });

const ROLE: Record<string, string> = tokens.role;

/** One role of tokens.json for a scheme: a literal of the dark section, or the color the role names. */
const pick = (name: string, k: Palette, scheme: Scheme): string => {
  const literal = scheme === 'dark' ? DARK_ROLE[name] : undefined;
  if (literal) return literal.startsWith('#') ? literal : k[literal as keyof Palette];
  return k[ROLE[name] as keyof Palette];
};

const roleFor = (k: Palette, scheme: Scheme) => ({
  bg: pick('bg', k, scheme),
  surface: pick('surface', k, scheme),
  sunken: pick('surfaceSunken', k, scheme),
  border: pick('border', k, scheme),
  borderStrong: pick('borderStrong', k, scheme),
  text: pick('text', k, scheme),
  muted: pick('textMuted', k, scheme),
  placeholder: pick('textPlaceholder', k, scheme),
  action: pick('action', k, scheme),
  onAction: pick('onAction', k, scheme),
  highlight: pick('highlight', k, scheme),
  /** Text and icons on gold (badges, the gold button): navy in both modes, because gold does not change. */
  onHighlight: pick('onHighlight', k, scheme),
  accentText: pick('textAccent', k, scheme),
  danger: pick('danger', k, scheme),
  onDanger: pick('onDanger', k, scheme),
  /** The hero card (journey card, Connect your smartwatch, promo banners): dark blue in light mode, a lighter blue in dark mode. */
  inverse: pick('surfaceInverse', k, scheme),
  /** Text on a hero card: cream in both modes. */
  onInverse: pick('textInverse', k, scheme),
  /** Pale gold text on a hero card. */
  onInverseAccent: pick('textInverseAccent', k, scheme),
  /** The active tab of the bottom tab bar (icon and label): the brand blue in light mode, white in dark mode. Only the tab bar uses it. */
  tabActive: pick('tabActive', k, scheme),
  /** The inactive tabs (icon and label): stone in light mode, in dark mode a little lighter than muted text so they stay easy to see. Only the tab bar uses it. */
  tabInactive: pick('tabInactive', k, scheme),
});

export const role = roleFor(c, 'light');

export function applyScheme(scheme: Scheme) {
  Object.assign(c, LIGHT, scheme === 'dark' ? DARK : {});
  Object.assign(role, roleFor(c, scheme));
}

/** The dimming behind a sheet or a dialog. Navy at 45% over either mode's screen; it does not change with the mode. */
export const scrim = 'rgba(20,54,93,0.45)';

export const space = tokens.space;
export const radius = tokens.radius;
export const layout = tokens.layout;
export const shadow = tokens.shadow;

export const fonts = {
  title: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodyBold: 'Inter_600SemiBold',
  mono: 'JetBrainsMono_400Regular',
  accent: 'Caveat_700Bold',
} as const;

export type TextVariant = 'display' | 'h1' | 'h2' | 'h3' | 'h4' | 'lead' | 'body' | 'small' | 'label' | 'caption' | 'mono' | 'accent';

const family: Record<string, string> = { title: fonts.title, body: fonts.body, mono: fonts.mono, accent: fonts.accent };

export function textStyle(v: TextVariant) {
  const t = tokens.text[v] as { size: number; lineHeight: number; letterSpacing?: number; font: string; weight: string };
  const fontFamily = t.font === 'body' && t.weight === '600' ? fonts.bodyBold : t.font === 'body' && t.weight === '500' ? fonts.bodyMedium : family[t.font];
  return { fontSize: t.size, lineHeight: t.lineHeight, letterSpacing: t.letterSpacing ?? 0, fontFamily };
}

export function shadowStyle(k: keyof typeof shadow) {
  const s = shadow[k];
  return { shadowColor: s.color, shadowOpacity: s.opacity, shadowOffset: { width: 0, height: s.offsetY }, shadowRadius: s.radius, elevation: s.elevation };
}
