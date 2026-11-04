import tokens from './tokens.json';

// Design tokens come from ../design/tokens.json (copied here; keep in sync).
export const c = tokens.color;
export const space = tokens.space;
export const radius = tokens.radius;
export const layout = tokens.layout;
export const shadow = tokens.shadow;

export const role = {
  bg: c.parchment,
  surface: c.white,
  sunken: c.sand200,
  border: c.sand300,
  text: c.ink,
  muted: c.stone600,
  action: c.blue,
  onAction: c.parchment,
  highlight: c.gold,
  accentText: c.goldInk,
  danger: c.red,
} as const;

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
