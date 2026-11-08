import { memo, useMemo } from 'react';
import { Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
import { AppText } from '@/components/AppText';
import { c, role } from '@/theme';
import { blocksOfVerse, superscript, type Block, type Gap, type PoemBlock, type ProseBlock } from './blocks';
import { SIDE } from './gridMath';
import { wrapPoem } from './wrap';

/** The most the phone's own text size may enlarge the words of the Bible: a person who needs it large gets it large, up to this. */
export const READER_MAX_FONT_SCALE = 1.6;

/** The words of the Bible: Inter 19 with 32 between the lines (generous: the line is 1.7 times the letter). */
export const BODY_SIZE = 19;
export const BODY_LINE = 32;

/** The number of a verse is drawn at this size: the raised digits of JetBrains Mono are 0.43 of it high (7.3 here), as small as a number can be and still be read. */
export const NUMBER_SIZE = 17;

/**
 * JetBrains Mono is monospaced, so the raised digits of a number of two or three figures stand far apart ("1 0"). Each digit gives back this much of its advance
 * (10.2 of them at this size). The reader (wrap.ts) still counts the whole advance of a digit when it decides where a line is cut, so a line is never cut too late.
 */
export const NUMBER_TRACKING = -3;

/** A line of poetry goes in by an em space for each tab at its start (Inter has one: 19 wide at this size). */
export const INDENT = '\u2003';

/** The space above a block of each kind of gap. A heading keeps 28 above it (none at the top of the chapter) and 6 under it. */
export const GAP: Record<Gap, number> = { none: 0, paragraph: 16, stanza: 26 };
export const HEADING_ABOVE = 28;
export const HEADING_BELOW = 6;

/** What a verse that is chosen looks like: a pale gold ground and an underline, so that it is not the colour alone that says so. */
const chosen = () => ({ backgroundColor: c.goldSoft, textDecorationLine: 'underline' as const });

/**
 * The number of a verse, in front of its words: small digits raised above the line, JetBrains Mono, muted (the colour of the text when the verse is chosen).
 * The digits are the superscript characters of Unicode (blocks.ts superscript), which that font draws. Its line height is the line of the words, so that
 * the number never makes a line taller.
 */
function VerseNumber({ label, on }: { label: string; on: boolean }) {
  return (
    <>
      <AppText variant="mono" maxFontSizeMultiplier={READER_MAX_FONT_SCALE} color={on ? role.text : role.muted} style={{ fontSize: NUMBER_SIZE, lineHeight: BODY_LINE, letterSpacing: NUMBER_TRACKING }}>{superscript(label)}</AppText>
      {'\u2009'}
    </>
  );
}

/** A touch on a verse: which one, and how far down the screen it was (the reader keeps the verse above the bar of actions, actionBar.ts). */
type Select = (verse: string, pageY?: number) => void;

/** The words of one verse (or of the part of it that is in this block), a text of its own that a touch chooses. A link for a screen reader (its rotor lists the verses). */
function Words({ verse, number, text, on, onSelect }: { verse: string; number: string | null; text: string; on: boolean; onSelect: Select }) {
  return (
    <Text accessibilityRole="link" onPress={(e) => onSelect(verse, e.nativeEvent.pageY)} style={on ? chosen() : undefined}>
      {number !== null && <VerseNumber label={number} on={on} />}
      {text}
    </Text>
  );
}

function Prose({ block, selected, onSelect }: { block: ProseBlock; selected: string | null; onSelect: Select }) {
  return (
    <AppText maxFontSizeMultiplier={READER_MAX_FONT_SCALE} style={{ fontSize: BODY_SIZE, lineHeight: BODY_LINE }}>
      {block.spans.map((s, k) => (
        <Text key={k}>
          <Words verse={s.verse} number={s.n} text={s.text} on={s.verse === selected} onSelect={onSelect} />
          {k < block.spans.length - 1 ? ' ' : ''}
        </Text>
      ))}
    </AppText>
  );
}

/**
 * A stanza is ONE text, a line after the other: a screen reader reads it as it reads a paragraph, and a Psalm of 176 verses is 22 texts, not 350. A line that is
 * too long for the phone is cut by the reader (wrap.ts) and its rest goes in one em further than the line itself: a hanging indent, which React Native does not
 * have, so that a long line of a psalm never comes back to the margin looking like a line of its own. A line that two verses share (Psalm 55:2 and 55:3) is
 * one line with a part for each verse: each part is a text of its own that a touch chooses, the second with its number in the middle of the line.
 */
function Poem({ block, selected, onSelect }: { block: PoemBlock; selected: string | null; onSelect: Select }) {
  const { width, fontScale } = useWindowDimensions();
  const scale = Math.min(fontScale, READER_MAX_FONT_SCALE);
  const lines = useMemo(() => wrapPoem(block.lines, { width: width - 2 * SIDE, size: BODY_SIZE, scale, numberSize: NUMBER_SIZE, numberOf: superscript }), [block, width, scale]);
  return (
    <AppText maxFontSizeMultiplier={READER_MAX_FONT_SCALE} style={{ fontSize: BODY_SIZE, lineHeight: BODY_LINE }}>
      {lines.map((l, k) => (
        <Text key={k}>
          {INDENT.repeat(l.indent)}
          {l.parts.map((p, j) => (
            <Text key={j}>
              {j > 0 ? ' ' : ''}
              <Words verse={p.verse} number={p.n} text={p.text} on={p.verse === selected} onSelect={onSelect} />
            </Text>
          ))}
          {k < lines.length - 1 ? '\n' : ''}
        </Text>
      ))}
    </AppText>
  );
}

type ViewProps = { index: number; block: Block; selected: string | null; onSelect: Select; onBlockLayout: (index: number, y: number, height: number) => void };

/** One block, drawn again only when its own block or whether it holds the chosen verse changes. */
const BlockView = memo(function BlockView({ index, block, selected, onSelect, onBlockLayout }: ViewProps) {
  const onLayout = (e: LayoutChangeEvent) => onBlockLayout(index, e.nativeEvent.layout.y, e.nativeEvent.layout.height);
  if (block.kind === 'heading') {
    return (
      <View onLayout={onLayout} style={{ marginTop: index === 0 ? 0 : HEADING_ABOVE, marginBottom: HEADING_BELOW }}>
        <AppText variant="h4" accessibilityRole="header" maxFontSizeMultiplier={READER_MAX_FONT_SCALE} style={{ fontSize: 22, lineHeight: 28 }}>{block.text}</AppText>
      </View>
    );
  }
  return (
    <View onLayout={onLayout} style={{ marginTop: GAP[block.gap] }}>
      {block.kind === 'prose' ? <Prose block={block} selected={selected} onSelect={onSelect} /> : <Poem block={block} selected={selected} onSelect={onSelect} />}
    </View>
  );
});

/**
 * The words of a chapter, block after block. Prose is paragraphs (the verses without a new paragraph flow on in one text, each with its small raised number);
 * poetry is stanzas, a line after the other, each line gone in by its tabs; a heading is a heading for a screen reader and Fraunces for the eye. Touching the words of
 * a verse chooses it (`onSelect` with its label); only the blocks that hold the chosen verse, and the one that held it, are drawn again.
 */
export function ReaderText({ blocks, selected, onSelect, onBlockLayout }: { blocks: readonly Block[]; selected: string | null; onSelect: Select; onBlockLayout: ViewProps['onBlockLayout'] }) {
  const holding = useMemo(() => new Set(selected ? blocksOfVerse(blocks, selected) : []), [blocks, selected]);
  return (
    <>
      {blocks.map((b, i) => <BlockView key={b.key} index={i} block={b} selected={holding.has(i) ? selected : null} onSelect={onSelect} onBlockLayout={onBlockLayout} />)}
    </>
  );
}
