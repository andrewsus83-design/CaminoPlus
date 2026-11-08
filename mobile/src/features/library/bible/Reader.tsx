import { ComponentRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Screen } from '@/components/Screen';
import { IconButton } from '@/components/ui';
import { radius, role } from '@/theme';
import { verseKey } from '../search';
import { useLibraryBookmarks } from '../useLibraryBookmarks';
import { barCovers, roomUnder, scrollForBar } from './actionBar';
import { buildBlocks, findVerse, labelOfNumber, locateVerse, verseText } from './blocks';
import { bookByCode } from './books';
import { ChapterNav } from './ChapterNav';
import { creditLines, READER_NOTE } from './credit';
import { bookHref, chapterTitle, readerHref, refLabel, type Place } from './order';
import { ReaderText, BODY_LINE, READER_MAX_FONT_SCALE } from './ReaderText';
import { refOfVerse } from './ref';
import { hasBook, loadBook, TRANSLATION } from './text';
import type { Chapter } from './textTypes';
import { useLastRead } from './useLastRead';
import { VerseActions } from './VerseActions';
import { PlaceMissing, MISSING_CHAPTER } from './PlaceMissing';

/** The chapter of this place in the text, or null when the book or the chapter is not there (or cannot be read): the text of a chapter is never taken for granted. */
function chapterOf(place: Place): Chapter | null {
  try {
    if (!hasBook(place.code)) return null;
    return loadBook(place.code).chapters.find((c) => c.c === place.chapter) ?? null;
  } catch {
    return null;
  }
}

/** How far under the top of the screen a verse that was linked to comes to rest. */
const SCROLL_MARGIN = 90;

/** The small button next to Back that opens the chapters of the book (the grid). */
function ChaptersLink({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="All chapters of this book"
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border })}
    >
      <AppText variant="label" maxFontSizeMultiplier={1.3} style={{ fontSize: 15, lineHeight: 20 }}>All chapters</AppText>
      <Icon name="chevron" color={role.action} size={18} />
    </Pressable>
  );
}

/**
 * The reader: one chapter of a book, as a good Bible app shows it. At the top Back and the way to all the chapters of the book, the name of the book, the title
 * of the chapter ("Psalm 121" for the Psalms, "Chapter 3" for the other books), the title of a psalm if it has one, and Previous and Next named by where they go
 * (ChapterNav; they cross the books and the parts, Malachi 4 to Tobit 1); then the words (ReaderText); at the end the same two buttons, one handwritten note,
 * and the credit of the translation with the plain line that it is not the one read at Mass. Touching a verse chooses it and raises the bar of actions (Bookmark,
 * Copy, Share); touching it again, or the close button, lets it go; a verse touched where the bar is about to be is scrolled up above it. A link that names a verse
 * (/library/bible/PSA/121?v=3) opens with that verse chosen and scrolled into view. The chapter is remembered as the one last read (the Bible tab's "Continue reading"). The words come from text.ts, which reads files inside the app:
 * nothing here uses the network.
 */
export function Reader({ place, verse }: { place: Place; verse: number | null }) {
  const router = useRouter();
  const book = bookByCode(place.code)!;
  const marks = useLibraryBookmarks();
  const lastRead = useLastRead();
  const chapter = useMemo(() => chapterOf(place), [place.code, place.chapter]);
  const blocks = useMemo(() => (chapter ? buildBlocks(chapter) : []), [chapter]);
  // the verse a link names, as the printed verse that holds it ("15" of a verse printed "15-16")
  const linked = useMemo(() => (chapter && verse !== null ? labelOfNumber(chapter, verse) : null), [chapter, verse]);
  const [selected, setSelected] = useState<string | null>(linked);

  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const layouts = useRef(new Map<number, { y: number; h: number }>());
  const top = useRef<number | null>(null);
  const waiting = useRef<string | null>(linked);
  // scrolls to the linked verse once the block that holds it and the column of blocks are both measured
  const scrollWhenReady = useCallback(() => {
    const label = waiting.current;
    if (!label) return;
    const at = locateVerse(blocks, label);
    if (!at) { waiting.current = null; return; }
    const box = layouts.current.get(at.block);
    if (!box || top.current === null) return;
    waiting.current = null;
    scroller.current?.scrollTo({ y: Math.max(0, top.current + box.y + box.h * at.at - SCROLL_MARGIN), animated: false });
  }, [blocks]);
  const onBlockLayout = useCallback((index: number, y: number, h: number) => { layouts.current.set(index, { y, h }); scrollWhenReady(); }, [scrollWhenReady]);

  const remember = lastRead.remember;
  useEffect(() => { if (chapter) remember({ code: place.code, chapter: place.chapter }); }, [chapter, place.code, place.chapter, remember]);

  // The bar of actions covers the bottom of the screen while a verse is chosen. A verse touched where the bar is about to be (or in the last lines above it) is
  // brought up above it, so that the bar never hides the verse that was chosen (actionBar.ts has the sums); the scroll is read from the screen's own.
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const covered = barCovers(insets.bottom);
  const scrollY = useRef(0);
  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => { scrollY.current = e.nativeEvent.contentOffset.y; }, []);
  const selectedNow = useRef<string | null>(linked);
  useEffect(() => { selectedNow.current = selected; }, [selected]);
  const onSelect = useCallback((label: string, pageY?: number) => {
    const choosing = selectedNow.current !== label; // touching the chosen verse again lets it go
    setSelected(choosing ? label : null);
    if (!choosing || pageY === undefined) return;
    const down = scrollForBar(pageY, windowHeight, covered, BODY_LINE);
    if (down > 0) scroller.current?.scrollTo({ y: scrollY.current + down, animated: true });
  }, [windowHeight, covered]);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace(bookHref(place.code)));
  // Previous and Next replace this screen: Back still goes to where the reader came from (the chapters, the search, a link), not through every chapter read
  const go = (to: Place) => router.replace(readerHref({ code: to.code, chapter: to.chapter }));

  if (!chapter) return <PlaceMissing message={MISSING_CHAPTER} code={place.code} />;

  const chosen = selected ? findVerse(chapter, selected) : undefined;
  const ref = chosen ? refOfVerse(place.code, place.chapter, chosen.n) : null;
  const key = ref ? verseKey(ref) : null;

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <Screen tabBar={false} scrollRef={scroller} onScroll={onScroll}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton name="back" label="Back" onPress={goBack} />
          <ChaptersLink onPress={() => router.push(bookHref(place.code))} />
        </View>
        <View style={{ gap: 2 }}>
          <AppText variant="h4" color={role.accentText} maxFontSizeMultiplier={READER_MAX_FONT_SCALE}>{book.name}</AppText>
          <AppText variant="h2" accessibilityRole="header" maxFontSizeMultiplier={READER_MAX_FONT_SCALE}>{chapterTitle(place)}</AppText>
          {!!chapter.title && <AppText variant="h4" muted maxFontSizeMultiplier={READER_MAX_FONT_SCALE} style={{ fontSize: 20, lineHeight: 26, marginTop: 2 }}>{chapter.title}</AppText>}
        </View>
        <ChapterNav place={place} variant="top" onGo={go} />
        <View onLayout={(e) => { top.current = e.nativeEvent.layout.y; scrollWhenReady(); }}>
          <ReaderText blocks={blocks} selected={selected} onSelect={onSelect} onBlockLayout={onBlockLayout} />
        </View>
        <ChapterNav place={place} variant="foot" onGo={go} />
        <AppText variant="accent" color={role.accentText}>{READER_NOTE}</AppText>
        <View style={{ gap: 6 }}>
          {creditLines(TRANSLATION.credit).map((line) => <AppText key={line} variant="caption" muted>{line}</AppText>)}
        </View>
        {selected !== null && <View style={{ height: roomUnder(insets.bottom) }} />}
      </Screen>
      {chosen && ref && key && (
        <VerseActions
          place={refLabel(ref)}
          words={verseText(chosen)}
          bookmarked={marks.has(key)}
          canBookmark={marks.ready}
          onBookmark={() => marks.toggle(key)}
          onClose={() => setSelected(null)}
        />
      )}
    </View>
  );
}
