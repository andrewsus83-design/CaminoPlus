import { memo } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { role } from '@/theme';
import type { Span } from './index';
import type { Item } from './reading';
import type { Face, ReaderType } from './readerType';

// The words of a chapter, block after block, in the four roles of the brand: Inter for the running text and the points, Fraunces for a heading inside the
// chapter, JetBrains Mono for nothing here (it is for numbers), Caveat for nothing here (the note is at the end of the chapter, once).
//  - a paragraph: Inter, the size of the step chosen, a line 1.6 times it, the space of 0.8 line after it. A very long paragraph is several pieces that follow each
//    other with no space (reading.ts layoutBlocks), so no one text view is taller than a few screens. Words in **bold** are Inter SemiBold, words in *italic* are slanted
//    (a phone draws the slant itself: the app has no italic face).
//  - a heading: Fraunces, larger, with room above it and a little under it; a heading for a screen reader. A heading of a lower level is Fraunces at the size of the text.
//  - a quotation (the passage of a book of readings is one): indented, with a rule of the page's border colour at its left, a little smaller; under it, muted, the line that
//    says whose words they are.
//  - a bulleted or numbered list: the bullet or the number hangs at the left, in a column of its own, and the words wrap under the words, not under the number.
//  - a break: a short rule in the middle, for the eye only.
// The whole chapter is drawn once and never again while it scrolls: the screen hands in the same items and the same type, and every block is memoised.

const RULE = 2;
const INDENT = 18;

/** The words of some spans, with bold and italic where the book has them. A plain span is just its text, so most of a chapter is one text view with no nesting. */
function Inline({ spans, face }: { spans: readonly Span[]; face: Face }) {
  return (
    <>
      {spans.map((x, i) => (x.b || x.i ? (
        <AppText key={i} variant={x.b ? 'label' : 'body'} maxFontSizeMultiplier={face.maxMultiplier} style={{ fontSize: face.size, lineHeight: face.lineHeight, fontStyle: x.i ? 'italic' : 'normal' }}>{x.t}</AppText>
      ) : x.t))}
    </>
  );
}

const Paragraph = memo(function Paragraph({ item, t }: { item: Extract<Item, { k: 'p' }>; t: ReaderType }) {
  return (
    <AppText maxFontSizeMultiplier={t.body.maxMultiplier} style={{ fontSize: t.body.size, lineHeight: t.body.lineHeight, marginBottom: item.end ? t.gap : 0 }}><Inline spans={item.spans} face={t.body} /></AppText>
  );
});

const Heading = memo(function Heading({ item, t }: { item: Extract<Item, { k: 'h' }>; t: ReaderType }) {
  const face = item.level <= 2 ? t.heading : t.body;
  return (
    <AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier={face.maxMultiplier} style={{ fontSize: face.size, lineHeight: face.lineHeight, marginTop: Math.round(t.gap * 0.6), marginBottom: Math.round(t.gap * 0.5) }}>
      {item.spans.map((x) => x.t).join('')}
    </AppText>
  );
});

const Quotation = memo(function Quotation({ item, t }: { item: Extract<Item, { k: 'q' }>; t: ReaderType }) {
  return (
    <View style={{ marginLeft: 2, marginBottom: t.gap, paddingLeft: INDENT, borderLeftWidth: RULE, borderLeftColor: role.borderStrong, gap: Math.round(t.gap * 0.5) }}>
      {item.paras.map((spans, i) => (
        <AppText key={i} maxFontSizeMultiplier={t.quote.maxMultiplier} style={{ fontSize: t.quote.size, lineHeight: t.quote.lineHeight }}><Inline spans={spans} face={t.quote} /></AppText>
      ))}
      {!!item.cite && <AppText muted maxFontSizeMultiplier={t.quote.maxMultiplier} style={{ fontSize: t.quote.size, lineHeight: t.quote.lineHeight }}><Inline spans={item.cite} face={t.quote} /></AppText>}
    </View>
  );
});

const List = memo(function List({ item, t }: { item: Extract<Item, { k: 'list' }>; t: ReaderType }) {
  const column = Math.round(t.body.size * (item.ordered ? 1.9 : 1.2));
  return (
    <View style={{ marginBottom: t.gap, gap: Math.round(t.gap * 0.5), paddingLeft: 4 }}>
      {item.items.map((spans, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <AppText maxFontSizeMultiplier={t.body.maxMultiplier} muted style={{ width: column, fontSize: t.body.size, lineHeight: t.body.lineHeight }}>{item.ordered ? `${i + 1}.` : '•'}</AppText>
          <AppText maxFontSizeMultiplier={t.body.maxMultiplier} style={{ flex: 1, minWidth: 0, fontSize: t.body.size, lineHeight: t.body.lineHeight }}><Inline spans={spans} face={t.body} /></AppText>
        </View>
      ))}
    </View>
  );
});

const Break = memo(function Break({ t }: { t: ReaderType }) {
  return <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'center', width: 48, height: 1, backgroundColor: role.borderStrong, marginTop: Math.round(t.gap * 0.4), marginBottom: Math.round(t.gap * 1.2) }} />;
});

const Block = memo(function Block({ item, t }: { item: Item; t: ReaderType }) {
  switch (item.k) {
    case 'p': return <Paragraph item={item} t={t} />;
    case 'h': return <Heading item={item} t={t} />;
    case 'q': return <Quotation item={item} t={t} />;
    case 'list': return <List item={item} t={t} />;
    case 'hr': return <Break t={t} />;
  }
});

/** The words of one chapter. */
export const ReaderBlocks = memo(function ReaderBlocks({ items, t }: { items: readonly Item[]; t: ReaderType }) {
  return <>{items.map((item) => <Block key={item.key} item={item} t={t} />)}</>;
});
