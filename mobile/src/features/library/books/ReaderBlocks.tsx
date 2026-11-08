import { memo, type ReactNode } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import { AppText } from '@/components/AppText';
import { c, role } from '@/theme';
import type { Span } from './index';
import { blockOfItem } from './passages';
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
// A touch on the words of a paragraph, a quotation or a list chooses that passage, as a touch on a verse chooses it in the Bible: a pale gold ground and an underline
// (so that it is not the colour alone that says so), and the reader raises the bar of Bookmark, Copy and Share (PassageActions.tsx). The words are a text of their own
// inside the paragraph, a link for a screen reader. A heading and a break cannot be chosen.
// The whole chapter is drawn once and never again while it scrolls: the screen hands in the same items and the same type, and every block is memoised; choosing a
// passage draws only that block again, and the one that was chosen before it.

const RULE = 2;
const INDENT = 18;

/** What a passage that is chosen looks like: the same pale gold ground and underline as a verse of the Bible. */
const chosen = () => ({ backgroundColor: c.goldSoft, textDecorationLine: 'underline' as const });

type Choose = (block: number) => void;
/** Where a passage starts in the column of words (its first piece reports it once, the screen scrolls to it when a link names it). */
type Spot = (block: number, y: number) => void;

/** The words of a passage: a text of its own that a touch chooses. */
function Words({ on, onChoose, children }: { on: boolean; onChoose: () => void; children: ReactNode }) {
  return <Text accessibilityRole="link" onPress={onChoose} style={on ? chosen() : undefined}>{children}</Text>;
}

const reportSpot = (item: Item, spot: Spot) => (e: LayoutChangeEvent) => { if (item.k !== 'p' || !item.cont) spot(blockOfItem(item.key), e.nativeEvent.layout.y); };

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

const Paragraph = memo(function Paragraph({ item, t, on, choose, spot }: { item: Extract<Item, { k: 'p' }>; t: ReaderType; on: boolean; choose: Choose; spot: Spot }) {
  return (
    <AppText onLayout={reportSpot(item, spot)} maxFontSizeMultiplier={t.body.maxMultiplier} style={{ fontSize: t.body.size, lineHeight: t.body.lineHeight, marginBottom: item.end ? t.gap : 0 }}>
      <Words on={on} onChoose={() => choose(blockOfItem(item.key))}><Inline spans={item.spans} face={t.body} /></Words>
    </AppText>
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

const Quotation = memo(function Quotation({ item, t, on, choose, spot }: { item: Extract<Item, { k: 'q' }>; t: ReaderType; on: boolean; choose: Choose; spot: Spot }) {
  return (
    <View onLayout={reportSpot(item, spot)} style={{ marginLeft: 2, marginBottom: t.gap, paddingLeft: INDENT, borderLeftWidth: RULE, borderLeftColor: role.borderStrong, gap: Math.round(t.gap * 0.5) }}>
      {item.paras.map((spans, i) => (
        <AppText key={i} maxFontSizeMultiplier={t.quote.maxMultiplier} style={{ fontSize: t.quote.size, lineHeight: t.quote.lineHeight }}>
          <Words on={on} onChoose={() => choose(blockOfItem(item.key))}><Inline spans={spans} face={t.quote} /></Words>
        </AppText>
      ))}
      {!!item.cite && <AppText muted maxFontSizeMultiplier={t.quote.maxMultiplier} style={{ fontSize: t.quote.size, lineHeight: t.quote.lineHeight }}><Inline spans={item.cite} face={t.quote} /></AppText>}
    </View>
  );
});

const List = memo(function List({ item, t, on, choose, spot }: { item: Extract<Item, { k: 'list' }>; t: ReaderType; on: boolean; choose: Choose; spot: Spot }) {
  const column = Math.round(t.body.size * (item.ordered ? 1.9 : 1.2));
  return (
    <View onLayout={reportSpot(item, spot)} style={{ marginBottom: t.gap, gap: Math.round(t.gap * 0.5), paddingLeft: 4 }}>
      {item.items.map((spans, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <AppText maxFontSizeMultiplier={t.body.maxMultiplier} muted style={{ width: column, fontSize: t.body.size, lineHeight: t.body.lineHeight }}>{item.ordered ? `${i + 1}.` : '•'}</AppText>
          <AppText maxFontSizeMultiplier={t.body.maxMultiplier} style={{ flex: 1, minWidth: 0, fontSize: t.body.size, lineHeight: t.body.lineHeight }}>
            <Words on={on} onChoose={() => choose(blockOfItem(item.key))}><Inline spans={spans} face={t.body} /></Words>
          </AppText>
        </View>
      ))}
    </View>
  );
});

const Break = memo(function Break({ t }: { t: ReaderType }) {
  return <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignSelf: 'center', width: 48, height: 1, backgroundColor: role.borderStrong, marginTop: Math.round(t.gap * 0.4), marginBottom: Math.round(t.gap * 1.2) }} />;
});

const Block = memo(function Block({ item, t, on, choose, spot }: { item: Item; t: ReaderType; on: boolean; choose: Choose; spot: Spot }) {
  switch (item.k) {
    case 'p': return <Paragraph item={item} t={t} on={on} choose={choose} spot={spot} />;
    case 'h': return <Heading item={item} t={t} />;
    case 'q': return <Quotation item={item} t={t} on={on} choose={choose} spot={spot} />;
    case 'list': return <List item={item} t={t} on={on} choose={choose} spot={spot} />;
    case 'hr': return <Break t={t} />;
  }
});

/** The words of one chapter. `selected` is the index of the block that is chosen (or null); every piece of a long paragraph shows it. */
export const ReaderBlocks = memo(function ReaderBlocks({ items, t, selected, choose, spot }: { items: readonly Item[]; t: ReaderType; selected: number | null; choose: Choose; spot: Spot }) {
  return <>{items.map((item) => <Block key={item.key} item={item} t={t} on={selected !== null && blockOfItem(item.key) === selected} choose={choose} spot={spot} />)}</>;
});
