import { memo } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { fixed, shadowStyle } from '@/theme';
import { bookmarkLabel } from '../BookmarkToggle';
import type { CatalogBook } from './catalog';
import { coverLabel, coverText, a5Height, withAlpha, type CoverMetrics } from './cover';

// A book of the Books tab, drawn as a book: an A5 page, portrait (cover.ts says how big, and how its words are made to fit), with a spine on the left (a
// darker band and a groove), the edges of the pages on the right (a thin pale strip), a small corner radius, a soft shadow under it, the glyph of the book in
// a ring at the top, the title typeset like a cover (Fraunces), the author in small spaced capitals (Inter), the era in JetBrains Mono, a mark that says "Free"
// or "Soon", and a ribbon hanging from the top right that is the bookmark button.
//
// The colours are the six pale ones of the catalog, taken from the FIXED palette: a cover is paper and does not change with light and dark, so what is
// printed on it (the navy of the brand) does not change either. Every shade (the spine, the page edges, the groove) is one of those colours with an alpha
// (cover.ts withAlpha), never a colour of its own. Text on a cover is never larger with the phone's text size: the cover has the size of a page, and the same
// words, larger, are on the book page.
//
// With `onOpen` the whole cover is ONE button for a screen reader, labelled "The Way of a Pilgrim, Anonymous, free" (or "soon"). The ribbon is another button
// next to it, not inside it (a button inside a button is not one a screen reader can use): "Bookmark: The Way of a Pilgrim". Nothing on the cover says anything
// the label does not.

const INK = fixed.blue;
const PAPER = fixed.parchment;

/** The glyph in its ring, at the top of the cover. */
function Medallion({ icon, m }: { icon: CatalogBook['icon']; m: CoverMetrics }) {
  return (
    <View style={{ width: m.medallion, height: m.medallion, borderRadius: m.medallion / 2, borderWidth: 1, borderColor: withAlpha(INK, 0.45), alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} color={INK} size={m.glyph} strokeWidth={1.5} />
    </View>
  );
}

/** "Free" (filled, cream letters) or "Soon" (empty, a ring): different in shape as well as in word, so it is not the colour that tells them apart. */
function Mark({ free, m }: { free: boolean; m: CoverMetrics }) {
  return (
    <View style={{ height: m.chip.height, paddingHorizontal: m.chip.padX, borderRadius: m.chip.height / 2, justifyContent: 'center', backgroundColor: free ? INK : 'transparent', borderWidth: 1, borderColor: INK }}>
      <AppText variant="mono" maxFontSizeMultiplier={1} color={free ? PAPER : INK} style={{ fontSize: m.chip.size, lineHeight: m.chip.size + 4, letterSpacing: m.chip.spacing }}>{free ? 'FREE' : 'SOON'}</AppText>
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
        <Icon name="bookmark" color={on ? fixed.goldBright : PAPER} size={Math.round(width * 0.68)} strokeWidth={1.75} filled={on} />
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
  /** The book has a text in the app (bookText.ts): "Free", else "Soon". */
  hasText: boolean;
  /** Makes the cover a button that opens the book (`onOpen` is given the id of the book, so that one function serves the twelve). */
  onOpen?: (id: string) => void;
  /** Hangs the ribbon (the bookmark button) on the cover: filled when the book is bookmarked. Nothing is hung without `onBookmark`. */
  bookmarked?: boolean;
  onBookmark?: (id: string) => void;
  /** A small cover for a list: the spine, the page edges and the glyph, no words, no ribbon. Never a button of its own. */
  thumb?: boolean;
};

/** The cover of one book. Drawn again only when something it shows changes (the grid holds twelve), as long as the functions it is given stay the same. */
export const BookCover = memo(function BookCover({ book, width, hasText, onOpen, bookmarked, onBookmark, thumb }: Props) {
  const height = a5Height(width);
  const text = coverText(book, width);
  const m = text.m;
  const body = (
    <View style={{ flex: 1, borderRadius: m.radius, overflow: 'hidden', backgroundColor: fixed[book.cover], borderWidth: 1, borderColor: withAlpha(INK, 0.14) }}>
      {/* the spine: a darker band, and the groove next to it (one dark line, one light line) */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: m.spine, backgroundColor: withAlpha(INK, 0.16) }} />
      <View style={{ position: 'absolute', left: m.spine, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(INK, 0.28) }} />
      <View style={{ position: 'absolute', left: m.spine + 1, top: 0, bottom: 0, width: 1, backgroundColor: withAlpha(fixed.white, 0.6) }} />
      {/* the edges of the pages: a thin pale strip, with a line where the cover ends */}
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: m.edge, backgroundColor: withAlpha(fixed.white, 0.85), borderLeftWidth: 1, borderLeftColor: withAlpha(INK, 0.2) }} />
      {thumb ? (
        <View style={{ position: 'absolute', left: m.spine + 2, right: m.edge, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={book.icon} color={INK} size={Math.round(width * 0.42)} strokeWidth={1.5} />
        </View>
      ) : (
        <View style={{ position: 'absolute', left: m.spine + m.padX, right: m.edge + m.padX, top: m.padTop, bottom: m.padBottom, alignItems: 'center' }}>
          <Medallion icon={book.icon} m={m} />
          <View style={{ flex: 1, justifyContent: 'center', alignSelf: 'stretch' }}>
            {/* The lines are the ones cover.ts worked out, so the title breaks where it was measured; numberOfLines and the scale-down are for a phone that sets a word wider than the table says. */}
            <AppText
              variant="h4" maxFontSizeMultiplier={1} numberOfLines={text.title.lines.length} adjustsFontSizeToFit minimumFontScale={0.8} color={INK}
              style={{ fontSize: text.title.size, lineHeight: text.title.lineHeight, letterSpacing: 0, textAlign: 'center' }}
            >
              {text.title.lines.join('\n')}
            </AppText>
          </View>
          <AppText
            variant="label" maxFontSizeMultiplier={1} numberOfLines={text.author.lines.length} adjustsFontSizeToFit minimumFontScale={0.85} color={INK}
            style={{ fontSize: text.author.size, lineHeight: text.author.lineHeight, letterSpacing: text.author.spacing, textAlign: 'center' }}
          >
            {text.author.lines.join('\n')}
          </AppText>
          <AppText variant="mono" maxFontSizeMultiplier={1} numberOfLines={1} color={INK} style={{ fontSize: m.era.size, lineHeight: m.era.lineHeight, marginTop: 4, textAlign: 'center' }}>{book.era}</AppText>
          <View style={{ marginTop: 6 }}><Mark free={hasText} m={m} /></View>
        </View>
      )}
    </View>
  );
  const cover = onOpen ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={coverLabel(book, hasText)}
      accessibilityHint={hasText ? 'Opens the book' : 'Opens its page, which says it is not in the app yet'}
      onPress={() => onOpen(book.id)}
      style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.985 : 1 }] })}
    >
      {body}
    </Pressable>
  ) : (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1 }}>{body}</View>
  );
  return (
    <View style={{ width, height, borderRadius: m.radius, backgroundColor: fixed[book.cover], ...shadowStyle('md') }}>
      {cover}
      {onBookmark && !thumb && <Ribbon on={!!bookmarked} title={book.title} toggle={() => onBookmark(book.id)} m={m} />}
    </View>
  );
});
