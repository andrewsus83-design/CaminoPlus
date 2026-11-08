import { ComponentRef, useCallback, useEffect, useMemo, useRef } from 'react';
import { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { role } from '@/theme';
import { BookPage } from './BookPage';
import { ChapterFooter } from './ChapterFooter';
import { ReaderBar, type ProgressApi } from './ReaderBar';
import { ReaderBlocks } from './ReaderBlocks';
import { ReaderHeader } from './ReaderHeader';
import type { BookText } from './bookTextTypes';
import { bookById } from './catalog';
import { NO_CHAPTER_TEXT, bookPath, readerPath } from './copy';
import { LONG_LABEL, blockWords, chapterIndex, chapterNav, groupThousands, isRead, layoutBlocks, offsetFor, partName, readingTime, resumeAt, scrollProgress, splitTitle, startAt } from './reading';
import { readerType } from './readerType';
import { safeText } from './safeText';
import { useReaderSize, type ReaderSize } from './useReaderSize';
import { useReadingWriter, type ReadingWriter } from './useReadingWriter';

// The reader: one chapter of one book, as a good reading app shows it. A header at the top that stays and has one row (BookPage's way back and the size of the
// text: ReaderHeader.tsx), the chapter under it: its part in JetBrains Mono, its title in Fraunces, how long it takes, the words in Inter with a line 1.6 times the
// letter and no more than about 70 characters across (ReaderBlocks.tsx), and at the end Next and Previous again, one short handwritten note and, after the last
// chapter, the credit of the edition (ChapterFooter.tsx). At the bottom a bar that stays, as on a Kindle: how far down the chapter you are, Previous, the title of the
// book with "Chapter 7 of 40", and Next (ReaderBar.tsx).
//
// The reader remembers, only on this phone, the chapter and how far down it you were, for every book (useReadingWriter.ts), and the chapters you have read. It writes
// a moment after you stop scrolling, when you leave and when the app goes to the background, and never before it has put you back where you were. A place that is
// missing, damaged, or about a chapter the text does not have opens the book at its start. The text size is one of five steps, kept on the phone too, and the
// chapter stays where it was when the size changes. Nothing here uses the network: the words come from bookText.ts, which reads files inside the app.
//
// Previous and Next replace this screen, so Back still goes to where the reader came from (the contents, the Books tab) and not through every chapter read; the
// way back to the contents is one tap on "Contents". The scroll is one ScrollView: a chapter is drawn once, and while it scrolls only the thin line is drawn again.

type ViewProps = { bookId: string; text: BookText; index: number; startY: number; size: ReaderSize; writer: ReadingWriter };

/** One chapter on the screen. Made again for another chapter (the screen gives it a key), so every number it keeps is the chapter's own. */
function ChapterView({ bookId, text, index, startY, size, writer }: ViewProps) {
  const router = useRouter();
  const chapter = text.chapters[index];
  const nav = chapterNav(text.chapters, index)!;
  const type = useMemo(() => readerType(size.step), [size.step]);
  const items = useMemo(() => layoutBlocks(chapter.blocks), [chapter]);
  const words = useMemo(() => blockWords(chapter.blocks), [chapter]);
  const head = useMemo(() => splitTitle(chapter.title), [chapter]);
  // a label that is a whole sentence ("Of the excellence of the obedient, and of the misery of the disobedient members of the religious orders") is set in the size of a heading, not of a title
  const face = head.label.length > LONG_LABEL ? type.heading : type.title;
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const progress: ProgressApi = useRef(null);
  const box = useRef({ content: 0, viewport: 0, offset: 0 });
  // Nothing is saved before the person has been put back where they were: the first scroll event of a chapter that is not at its top must not say "top".
  const placed = useRef(false);
  const counted = useRef(false);
  // The fraction to come back to when the text changes size (the chapter is longer or shorter then, and the same line should stay on the screen).
  const keep = useRef<number | null>(null);
  const lastStep = useRef(size.step);

  const apply = useCallback(() => {
    const { content, viewport, offset } = box.current;
    const p = scrollProgress(offset, content, viewport);
    progress.current?.(p);
    if (!placed.current) return;
    writer.save(chapter.id, p);
    if (!counted.current && isRead(p)) { counted.current = true; writer.markRead(chapter.id); }
  }, [writer, chapter.id]);

  /** Once the text and the screen both have a size: put the person at the line they were at, then start to keep the place. */
  const place = useCallback(() => {
    const { content, viewport } = box.current;
    if (content <= 0 || viewport <= 0) return;
    if (keep.current !== null) {
      const y = offsetFor(keep.current, content, viewport);
      keep.current = null;
      scroller.current?.scrollTo({ y, animated: false });
      box.current.offset = y;
      apply();
      return;
    }
    if (placed.current) { apply(); return; }
    placed.current = true;
    const y = offsetFor(startY, content, viewport);
    if (y > 0) scroller.current?.scrollTo({ y, animated: false });
    box.current.offset = y;
    apply();
  }, [apply, startY]);

  // A new size of the text: remember which line was on the screen, and come back to it when the chapter has been laid out again.
  useEffect(() => {
    if (lastStep.current === size.step) return;
    lastStep.current = size.step;
    const { content, viewport, offset } = box.current;
    keep.current = scrollProgress(offset, content, viewport);
  }, [size.step]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    box.current.offset = e.nativeEvent.contentOffset.y;
    apply();
  }, [apply]);
  const onLayout = useCallback((e: LayoutChangeEvent) => { box.current.viewport = e.nativeEvent.layout.height; place(); }, [place]);
  const onContentSizeChange = useCallback((_w: number, h: number) => { box.current.content = h; place(); }, [place]);

  const goTo = useCallback((id: string) => router.replace(readerPath(bookId, id)), [router, bookId]);
  const contents = useCallback(() => router.dismissTo(bookPath(bookId)), [router, bookId]);

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      <ReaderHeader
        step={size.step}
        canShrink={size.canShrink}
        canGrow={size.canGrow}
        onSmaller={size.smaller}
        onLarger={size.larger}
        onContents={contents}
      />
      <ScrollView
        ref={scroller}
        onScroll={onScroll}
        scrollEventThrottle={50}
        onLayout={onLayout}
        onContentSizeChange={onContentSizeChange}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 48, alignItems: 'center' }}
      >
        <View style={{ width: '100%', maxWidth: type.measure }}>
          <View style={{ gap: 6, marginBottom: Math.round(type.gap * 1.2) }}>
            {!!chapter.part && (
              <AppText variant="mono" muted maxFontSizeMultiplier={type.meta.maxMultiplier} style={{ fontSize: type.meta.size, lineHeight: type.meta.lineHeight, textTransform: 'uppercase', letterSpacing: 1.5 }}>{partName(chapter.part)}</AppText>
            )}
            {/* One heading for a screen reader, with the whole title, however it is split for the eye: "Chapter XXXVI" large, and what the chapter is about under it. */}
            <View accessible accessibilityRole="header" accessibilityLabel={chapter.title} style={{ gap: 6 }}>
              <AppText variant="h3" maxFontSizeMultiplier={face.maxMultiplier} style={{ fontSize: face.size, lineHeight: face.lineHeight }}>{head.label}</AppText>
              {!!head.subtitle && <AppText maxFontSizeMultiplier={type.quote.maxMultiplier} muted style={{ fontSize: type.quote.size, lineHeight: type.quote.lineHeight }}>{head.subtitle}</AppText>}
            </View>
            <AppText variant="mono" muted maxFontSizeMultiplier={type.meta.maxMultiplier} style={{ fontSize: type.meta.size, lineHeight: type.meta.lineHeight }}>{`${readingTime(words)} · ${groupThousands(words)} words`}</AppText>
          </View>
          <ReaderBlocks items={items} t={type} />
          <ChapterFooter
            nav={nav}
            credit={text.credit}
            onPrevious={() => nav.prev && goTo(nav.prev.id)}
            onNext={() => nav.next && goTo(nav.next.id)}
            onContents={contents}
          />
        </View>
      </ScrollView>
      <ReaderBar
        bookTitle={text.title}
        nav={nav}
        onPrevious={() => nav.prev && goTo(nav.prev.id)}
        onNext={() => nav.next && goTo(nav.next.id)}
        progress={progress}
      />
    </View>
  );
}

/** Reads what the reader needs from the phone (the text size, the place in the book) and then shows the chapter. Until then it shows only the page. */
function Chapter({ bookId, text, chapterId }: { bookId: string; text: BookText; chapterId?: string }) {
  const size = useReaderSize();
  const writer = useReadingWriter(bookId);
  const ready = size.ready && writer.ready;
  const chapters = text.chapters;
  const target = useMemo(() => {
    if (!ready) return null;
    if (chapterId) {
      const i = chapterIndex(chapters, chapterId);
      return i < 0 ? ({ missing: true } as const) : ({ missing: false, index: i, y: startAt(writer.peek(), chapters[i].id) } as const);
    }
    const r = resumeAt(chapters, writer.peek());
    return { missing: false, index: r.index, y: r.y } as const;
    // The place is read once, when the reader is ready or the address changes: a save made while reading must not move the chapter under the person,
    // so `writer` is not a dependency (it is the same functions each time, and `peek` always reads the latest place).
  }, [ready, chapterId, chapters]);
  if (!target) return <View style={{ flex: 1, backgroundColor: role.bg }} />;
  if (target.missing) return <BookPage id={bookId} notice={NO_CHAPTER_TEXT} />;
  return <ChapterView key={chapters[target.index].id} bookId={bookId} text={text} index={target.index} startY={target.y} size={size} writer={writer} />;
}

/**
 * The reader of a book at a chapter (`chapterId`, from the address) or where the person was. A book that is not one of the twelve, or has no text, or whose text
 * cannot be read, shows its page instead (which says so); a chapter the text does not have shows the page with a sentence that says so.
 */
export function Reader({ id, chapterId }: { id: string; chapterId?: string }) {
  const text = useMemo(() => (bookById(id) ? safeText(id) : null), [id]);
  if (!text || text.chapters.length === 0) return <BookPage id={id} />;
  return <Chapter bookId={id} text={text} chapterId={chapterId} />;
}
