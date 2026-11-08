import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon, type IconName } from '@/components/Icon';
import { fixed, shadowStyle } from '@/theme';
import { bookmarkLabel } from '../BookmarkToggle';
import type { CatalogBook } from './catalog';
import { coverLabel, coverText, a5Height, withAlpha, type CoverMetrics } from './cover';

// A book of the Books tab, drawn as a book: an A5 page, portrait (cover.ts says how big, and how its words are made to fit), with a spine on the left (a
// darker band and a groove), the edges of the pages on the right (a thin pale strip), a small corner radius, a soft shadow under it, the glyph of the book in
// a ring at the top, the title typeset like a cover (Fraunces, at a size of the type scale), how long it takes in JetBrains Mono at the mono token (15), and a ribbon
// hanging from the top right that is the bookmark button. The kind of book ("Pilgrim's guide", "Readings for the Way") is not printed on the cover: the book page shows it,
// and the label of the cover says it. Inside the cover the space is 12 at the sides and at the bottom and 16 at the top (cover.ts: space.3 and space.4).
//
// The colour and the glyph are the book's own (catalog.json: one of the six pale colours of the FIXED palette and one of three glyphs). A cover is paper and does not
// change with light and dark, so what is printed on it (the navy of the brand) does not change either. Every shade (the spine, the page edges, the groove) is one of
// those colours with an alpha (cover.ts withAlpha), never a colour of its own. Text on a cover is never larger with the phone's text size: the cover has the size of a
// page, and the same words, larger, are on the book page.
//
// With `onOpen` the whole cover is ONE button for a screen reader, labelled with all it shows: "The French Way, Pilgrim's guide, 51 minutes". The ribbon is another
// button next to it, not inside it (a button inside a button is not one a screen reader can use): "Bookmark: The French Way". Nothing on the cover says anything the
// label does not.

const INK = fixed.blue;

/** The glyphs a cover may carry; a name this app does not know (a newer bundle) is drawn as a book. */
const GLYPHS: readonly IconName[] = ['library', 'book', 'chat'];
const glyphOf = (name: string): IconName => (GLYPHS as readonly string[]).includes(name) ? (name as IconName) : 'book';

/** How dark the cover is, column after column, to the right of the groove: the shadow where the cover bends at the spine, fading out in five points. */
const HINGE = [0.1, 0.07, 0.05, 0.035, 0.02] as const;

/** The glyph in its ring, at the top of the cover. */
function Medallion({ icon, m }: { icon: IconName; m: CoverMetrics }) {
  return (
    <View style={{ width: m.medallion, height: m.medallion, borderRadius: m.medallion / 2, borderWidth: 1, borderColor: withAlpha(INK, 0.45), alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={INK} size={m.glyph} strokeWidth={1.5} />
    </View>
  );
}

/** The ribbon: a strip with a notch at its foot, the bookmark inside. The strip is as wide as `m.ribbon.width`; the button around it is 44 by 44. */
function Ribbon({ on, title, toggle, m }: { on: boolean; title: string; toggle: () => void; m: CoverMetrics }) {
  const { width, height, notch, right, touch } = m.ribbon;
  const half = width / 2;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bookmarkLabel(on, title)}
      onPress={toggle}
      style={({ pressed }) => ({ position: 'absolute', top: 0, right: right - (touch - width) / 2, width: touch, height: touch, alignItems: 'center', opacity: pressed ? 0.8 : 1 })}
    >
      <View style={{ width, height: height - notch, backgroundColor: INK, alignItems: 'center', justifyContent: 'center', paddingBottom: 2 }}>
        <Icon name="bookmark" color={on ? fixed.goldBright : fixed.parchment} size={Math.round(width * 0.68)} strokeWidth={1.75} filled={on} />
      </View>
      {/* the two halves of the notch: each is a triangle made of one thick border, which every phone and the web draw the same */}
      <View style={{ flexDirection: 'row', width }}>
        <View style={{ width: 0, height: 0, borderTopWidth: notch, borderRightWidth: half, borderTopColor: INK, borderRightColor: 'transparent' }} />
        <View style={{ width: 0, height: 0, borderTopWidth: notch, borderLeftWidth: half, borderTopColor: INK, borderLeftColor: 'transparent' }} />
      </View>
    </Pressable>
  );
}

type Props = {
  book: CatalogBook;
  /** The width of the cover; it is as high as an A5 page that wide. */
  width: number;
  /** Makes the cover a button that opens the book (`onOpen` is given the id of the book, so that one function serves them all). */
  onOpen?: (id: string) => void;
  /** Hangs the ribbon (the bookmark button) on the cover: filled when the book is bookmarked. Nothing is hung without `onBookmark`. */
  bookmarked?: boolean;
  onBookmark?: (id: string) => void;
  /** A small cover for a list: the spine, the page edges and the glyph, no words, no ribbon. Never a button of its own. */
  thumb?: boolean;
};

/** The cover of one book. Drawn again only when something it shows changes (the grid holds many), as long as the functions it is given stay the same. */
export const BookCover = memo(function BookCover({ book, width, onOpen, bookmarked, onBookmark, thumb }: Props) {
  const height = a5Height(width);
  const text = coverText(book, width);
  const m = text.m;
  const paper = fixed[book.cover.colour] ?? fixed.parchment;
  const glyph = glyphOf(book.cover.icon);
  const body = (
    <View style={{ flex: 1, borderRadius: m.radius, overflow: 'hidden', backgroundColor: paper, borderWidth: 1, borderColor: withAlpha(INK, 0.14) }}>
      {/* the spine: a darker band, and the groove next to it (one dark line, one light line) */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: m.spine, backgroundColor: withAlpha(INK, 0.16) }} />
      <View style={{ position: 'absolute', left: m.spine, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(INK, 0.28) }} />
      <View style={{ position: 'absolute', left: m.spine + 1, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(fixed.white, 0.6) }} />
      {HINGE.map((a, i) => <View key={a} style={{ position: 'absolute', left: m.spine + 2 + i, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(INK, a) }} />)}
      {/* the edges of the pages: a thin pale strip, with a line where the cover ends */}
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: m.edge, backgroundColor: withAlpha(fixed.white, 0.9), borderLeftWidth: 1, borderLeftColor: withAlpha(INK, 0.22) }} />
      <View style={{ position: 'absolute', right: 1, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(INK, 0.1) }} />
      {thumb ? (
        <View style={{ position: 'absolute', left: m.spine + 2, right: m.edge, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={glyph} color={INK} size={Math.round(width * 0.42)} strokeWidth={1.5} />
        </View>
      ) : (
        <View style={{ position: 'absolute', left: m.spine + m.padX, right: m.edge + m.padX, top: m.padTop, bottom: m.padBottom, alignItems: 'center' }}>
          <Medallion icon={glyph} m={m} />
          <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch' }}>
            {/* The lines are the ones cover.ts worked out, so the title breaks where it was measured; numberOfLines and the scale-down are for a phone that sets a word wider than the table says. */}
            <AppText
              variant="h4" maxFontSizeMultiplier={1} numberOfLines={text.title.lines.length} adjustsFontSizeToFit minimumFontScale={0.8} color={INK}
              style={{ fontSize: text.title.size, lineHeight: text.title.lineHeight, letterSpacing: 0, textAlign: 'center' }}
            >
              {text.title.lines.join('\n')}
            </AppText>
          </View>
          <AppText variant="mono" maxFontSizeMultiplier={1} numberOfLines={1} color={INK} style={{ textAlign: 'center' }}>{text.time}</AppText>
        </View>
      )}
    </View>
  );
  const cover = onOpen ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={coverLabel(book)}
      accessibilityHint="Opens the book"
      onPress={() => onOpen(book.id)}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      {body}
    </Pressable>
  ) : (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>{body}</View>
  );
  return (
    <View style={{ width, height, borderRadius: m.radius, backgroundColor: paper, ...shadowStyle('md') }}>
      {cover}
      {onBookmark && !thumb && <Ribbon on={!!bookmarked} title={book.title} toggle={() => onBookmark(book.id)} m={m} />}
    </View>
  );
});
