import { Linking, Platform, Text, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { BOLD_ITALIC_FACE, ITALIC_FACE } from '@/components/ItalicFaces';
import { c, fonts, role } from '@/theme';
import type { Block, Span } from './books';

// A book's text as it is read: the blocks of the bundle (books.ts Block) drawn with plain Text, no HTML and no WebView. Headings, paragraphs,
// lists, quotes with their attribution and breaks; in a span italic, bold and links. A comfortable size for long reading (19 on 30, a little
// more line than the app's body text), and every colour read while drawing, so dark mode follows. Nothing here can throw on a block it does not
// know: it draws nothing for it.

// A very long word (an address, a link) must break rather than push the page wider than the screen. Web only: native rejects the value.
const breakAnywhere = (Platform.OS === 'web' ? { overflowWrap: 'anywhere' } : null) as object | null;

/** The size of the words of a book: the app's body size with room between the lines. */
export const READING = { fontSize: 19, lineHeight: 30 } as const;

function spanStyle(s: Span, italicReady: boolean) {
  if (s.b && s.i) return italicReady ? { fontFamily: BOLD_ITALIC_FACE } : { fontFamily: fonts.bodyBold, fontStyle: 'italic' as const };
  if (s.b) return { fontFamily: fonts.bodyBold };
  if (s.i) return italicReady ? { fontFamily: ITALIC_FACE } : { fontStyle: 'italic' as const };
  return null;
}

/** A link opens in the phone's browser. Nothing is said when it cannot (no signal, no browser): the text is still there. */
const open = (href: string) => { void Linking.openURL(href).catch(() => undefined); };

/** The spans of a piece of text, as nested Text. */
export function Spans({ spans, italicReady }: { spans: readonly Span[]; italicReady: boolean }) {
  return (
    <>
      {spans.map((s, i) => {
        if (s.href) {
          return (
            <Text key={i} accessibilityRole="link" onPress={() => open(s.href as string)} style={[spanStyle(s, italicReady), { color: role.action, textDecorationLine: 'underline' }]}>
              {s.t}
            </Text>
          );
        }
        const style = spanStyle(s, italicReady);
        return style ? <Text key={i} style={style}>{s.t}</Text> : s.t;
      })}
    </>
  );
}

/** True when a block has a link in it (a screen reader then reads it as separate pieces, so the links stay reachable). */
export const hasLink = (b: Block): boolean => {
  switch (b.t) {
    case 'h':
    case 'p':
      return b.spans.some((s) => !!s.href);
    case 'ul':
    case 'ol':
      return b.items.some((it) => it.some((s) => !!s.href));
    case 'quote':
      return b.paras.some((p) => p.some((s) => !!s.href)) || !!b.cite?.some((s) => !!s.href);
    default:
      return false;
  }
};

/** One block, drawn: the words only, with no margin of its own at the sides (the reader puts the gutter beside it). */
export function BlockBody({ block, italicReady }: { block: Block; italicReady: boolean }) {
  switch (block.t) {
    case 'h':
      return block.level <= 2
        ? <AppText variant="h4" accessibilityRole="header" style={[{ marginTop: 10 }, breakAnywhere]}><Spans spans={block.spans} italicReady={italicReady} /></AppText>
        : <AppText variant="label" accessibilityRole="header" style={[{ marginTop: 2, fontSize: 19, lineHeight: 26 }, breakAnywhere]}><Spans spans={block.spans} italicReady={italicReady} /></AppText>;
    case 'p':
      return <AppText style={[READING, breakAnywhere]}><Spans spans={block.spans} italicReady={italicReady} /></AppText>;
    case 'ul':
    case 'ol':
      return (
        <View style={{ gap: 10 }}>
          {block.items.map((item, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
              <AppText color={role.accentText} style={[READING, { width: block.t === 'ol' ? 26 : 14, textAlign: block.t === 'ol' ? 'right' : 'center' }]} importantForAccessibility="no" accessibilityElementsHidden>
                {block.t === 'ol' ? `${i + 1}.` : '•'}
              </AppText>
              <AppText style={[READING, { flex: 1 }, breakAnywhere]}><Spans spans={item} italicReady={italicReady} /></AppText>
            </View>
          ))}
        </View>
      );
    case 'quote':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: c.gold, paddingLeft: 16, gap: 12 }}>
          {block.paras.map((p, i) => (
            <AppText key={i} style={[READING, breakAnywhere]}><Spans spans={p} italicReady={italicReady} /></AppText>
          ))}
          {!!block.cite && block.cite.length > 0 && (
            <AppText variant="small" muted style={breakAnywhere}><Spans spans={block.cite} italicReady={italicReady} /></AppText>
          )}
        </View>
      );
    case 'hr':
      return <View accessibilityElementsHidden importantForAccessibility="no" style={{ height: 1, backgroundColor: role.border, marginVertical: 4 }} />;
    default:
      return null;
  }
}
