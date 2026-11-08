import { memo } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { role } from '@/theme';
import type { Item } from './reading';
import { splitMarker } from './reading';
import type { ReaderType } from './readerType';

// The words of a chapter, block after block, in the four roles of the brand: Inter for the running text and the points, Fraunces for a heading inside the
// chapter, JetBrains Mono for nothing here (it is for numbers), Caveat for nothing here (the note is at the end of the chapter, once).
//  - a paragraph: Inter, the size of the step chosen, a line 1.6 times it, the space of 0.8 line after it. A very long paragraph is several pieces that follow each
//    other with no space (reading.ts layoutBlocks), so no one text view is taller than a few screens.
//  - a heading: Fraunces, larger, with room above it and a little under it; a heading for a screen reader.
//  - a quotation, a prayer or a poem: indented, with a rule of the page's border colour at its left, a little smaller; a new line where the text has one.
//  - a numbered or bulleted point: the number or bullet hangs at the left, in a column of its own, and the words wrap under the words, not under the number.
//  - a break: a short rule in the middle, for the eye only.
// The whole chapter is drawn once and never again while it scrolls: the screen hands in the same items and the same type, and every block is memoised.

const RULE = 2;
const INDENT = 18;

const Paragraph = memo(function Paragraph({ item, t }: { item: Item; t: ReaderType }) {
  return (
    <AppText maxFontSizeMultiplier={t.body.maxMultiplier} style={{ fontSize: t.body.size, lineHeight: t.body.lineHeight, marginBottom: item.end ? t.gap : 0 }}>{item.t}</AppText>
  );
});

const Heading = memo(function Heading({ item, t }: { item: Item; t: ReaderType }) {
  return (
    <AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier={t.heading.maxMultiplier} style={{ fontSize: t.heading.size, lineHeight: t.heading.lineHeight, marginTop: Math.round(t.gap * 0.6), marginBottom: Math.round(t.gap * 0.5) }}>{item.t}</AppText>
  );
});

const Quotation = memo(function Quotation({ item, t }: { item: Item; t: ReaderType }) {
  return (
    <View style={{ marginLeft: 2, marginBottom: t.gap, paddingLeft: INDENT, borderLeftWidth: RULE, borderLeftColor: role.borderStrong }}>
      <AppText maxFontSizeMultiplier={t.quote.maxMultiplier} style={{ fontSize: t.quote.size, lineHeight: t.quote.lineHeight }}>{item.t}</AppText>
    </View>
  );
});

const Point = memo(function Point({ item, t }: { item: Item; t: ReaderType }) {
  const { marker, rest } = splitMarker(item.t);
  return (
    <View style={{ flexDirection: 'row', marginBottom: Math.round(t.gap * 0.5), paddingLeft: 4 }}>
      {marker ? <AppText maxFontSizeMultiplier={t.body.maxMultiplier} muted style={{ width: Math.round(t.body.size * 1.9), fontSize: t.body.size, lineHeight: t.body.lineHeight }}>{marker}</AppText> : <View style={{ width: INDENT }} />}
      <AppText maxFontSizeMultiplier={t.body.maxMultiplier} style={{ flex: 1, minWidth: 0, fontSize: t.body.size, lineHeight: t.body.lineHeight }}>{rest}</AppText>
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
    case 'li': return <Point item={item} t={t} />;
    case 'hr': return <Break t={t} />;
  }
});

/** The words of one chapter. */
export const ReaderBlocks = memo(function ReaderBlocks({ items, t }: { items: readonly Item[]; t: ReaderType }) {
  return <>{items.map((item) => <Block key={item.key} item={item} t={t} />)}</>;
});
