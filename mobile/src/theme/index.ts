import tokens from './tokens.json';

// Design tokens come from ../design/tokens.json (copied here; keep in sync).
// `c` and `role` are read while a screen renders (no StyleSheet.create anywhere), so dark mode swaps
// their values in place with applyScheme() and remounts the screens (see lib/theme.tsx). Gold stays gold.
export type Scheme = 'light' | 'dark';

const LIGHT = { ...tokens.color };
const DARK: Partial<typeof LIGHT> = {
  parchment: '#0F1A2B', white: '#17263B',
  sand100: '#0F1A2B', sand200: '#1E3047', sand300: '#2B405C', sand400: '#44607F',
  stone500: '#8D9BB0', stone600: '#A9B6C8',
  ink: '#F6EFE2', inkStrong: '#FFFDF8',
  blue: '#8FB3E0', blue900: '#C5D8EF', blue700: '#7FA6D8', blue100: '#22395A', blue50: '#16263D',
  goldInk: '#E8B53A', goldWash: '#2A2413', goldSoft: '#5A4915',
  red: '#D8695A', red700: '#E8978B', red100: '#3A1F1B',
  success: '#6FBF98', successWash: '#173326',
};

export const c = { ...LIGHT };

const roleFor = (k: typeof c) => ({
  bg: k.parchment,
  surface: k.white,
  sunken: k.sand200,
  border: k.sand300,
  text: k.ink,
  muted: k.stone600,
  action: k.blue,
  onAction: k.parchment,
  highlight: k.gold,
  accentText: k.goldInk,
  danger: k.red,
});

export const role = roleFor(c);

export function applyScheme(scheme: Scheme) {
  Object.assign(c, LIGHT, scheme === 'dark' ? DARK : {});
  Object.assign(role, roleFor(c));
}

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
