import { useMemo } from 'react';
import { Platform, Text, View } from 'react-native';
import { useFonts } from 'expo-font';
import { Inter_400Regular_Italic, Inter_600SemiBold_Italic } from '@expo-google-fonts/inter';
import { AppText } from '@/components/AppText';
import { c, fonts, role } from '@/theme';
import { parseRich, type Block, type Span } from './richtext';

// A page of the diary as it is read: the small Markdown-style subset of richtext.ts drawn with plain Text, no HTML and no WebView.
// Any string draws (parseRich never throws): marks that do not pair up show as typed. Bold is Inter semibold, italic Inter italic;
// the italic faces are part of the font package the app already bundles, and are loaded the first time a page is read (until
// then italic falls back to the system's slant, so a page is never held up by a font).
const ITALIC = 'Inter_400Regular_Italic';
const BOLD_ITALIC = 'Inter_600SemiBold_Italic';

// A very long word (an address, a link) must break rather than push the page wider than the screen. Web only: native rejects the value.
const breakAnywhere = (Platform.OS === 'web' ? { overflowWrap: 'anywhere' } : null) as object | null;

function useItalicFonts(): boolean {
  const [loaded] = useFonts({ Inter_400Regular_Italic, Inter_600SemiBold_Italic });
  return loaded;
}

function spanStyle(s: Span, italicReady: boolean) {
  if (s.bold && s.italic) return italicReady ? { fontFamily: BOLD_ITALIC } : { fontFamily: fonts.bodyBold, fontStyle: 'italic' as const };
  if (s.bold) return { fontFamily: fonts.bodyBold };
  if (s.italic) return italicReady ? { fontFamily: ITALIC } : { fontStyle: 'italic' as const };
  return null;
}

function Spans({ spans, italicReady }: { spans: Span[]; italicReady: boolean }) {
  return <>{spans.map((s, i) => (s.bold || s.italic ? <Text key={i} style={spanStyle(s, italicReady)}>{s.text}</Text> : s.text))}</>;
}

function BlockView({ block, italicReady }: { block: Block; italicReady: boolean }) {
  switch (block.kind) {
    case 'gap':
      return <View style={{ height: 14 }} />;
    case 'h':
      return <AppText variant="h4" accessibilityRole="header" style={[{ marginTop: 8 }, breakAnywhere]}><Spans spans={block.spans} italicReady={italicReady} /></AppText>;
    case 'li':
      return (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <AppText color={role.accentText} style={{ width: 14, textAlign: 'center' }} importantForAccessibility="no" accessibilityElementsHidden>•</AppText>
          <AppText style={[{ flex: 1 }, breakAnywhere]}><Spans spans={block.spans} italicReady={italicReady} /></AppText>
        </View>
      );
    case 'q':
      return (
        <View style={{ borderLeftWidth: 3, borderLeftColor: c.gold, paddingLeft: 14, marginVertical: 2 }}>
          <AppText style={breakAnywhere}><Spans spans={block.spans} italicReady={italicReady} /></AppText>
        </View>
      );
    default:
      return <AppText style={breakAnywhere}><Spans spans={block.spans} italicReady={italicReady} /></AppText>;
  }
}

/** The text of a page, read: bold, italic, a heading, bullets and quotes drawn; nothing else is a mark. */
export function RichText({ text }: { text: string }) {
  const italicReady = useItalicFonts();
  const blocks = useMemo(() => parseRich(text), [text]);
  return (
    <View>
      {blocks.map((b, i) => <BlockView key={i} block={b} italicReady={italicReady} />)}
    </View>
  );
}
