import { type ComponentRef, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { useItalicFaces } from '@/components/ItalicFaces';
import { Pill } from '@/components/Pill';
import { IconButton } from '@/components/ui';
import { blockText, chapterPlace, findChapter } from '@/features/library/books';
import { BlockBody } from '@/features/library/BookText';
import { BookmarkToggle } from '@/features/library/BookmarkToggle';
import { NotHere } from '@/features/library/NotHere';
import { GUTTER, ReaderBlock } from '@/features/library/ReaderBlock';
import { ReflectionCard } from '@/features/library/ReflectionCard';
import { useBook, type OpenBook } from '@/features/library/useBook';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { useReadingPlaces } from '@/features/library/useReadingPlaces';
import { blockAnchor, chapterAnchor } from '@/features/notes/anchor';
import { isNotable, questionLines, quoteOf, reflectionPrompt } from '@/features/notes/blocks';
import { READER_HINT } from '@/features/notes/present';
import { useNoteSheet } from '@/features/notes/useNoteSheet';
import { useChapterNotes } from '@/features/notes/useNotes';
import { layout, radius, role } from '@/theme';

// The reader: one chapter, or one day of a reflection book. The blocks of the bundle are drawn as they were written (BookText.tsx); the back
// button and the bookmark of the chapter stay on top while the text scrolls. A paragraph, a quote or a list can carry a note and a bookmark
// (ReaderBlock.tsx: tap it to show the two buttons, press and hold to write a note); a side mark in the margin shows what it carries. The part
// "At the end of the day" shows its questions as the reflection prompt, with the button that opens the sheet to answer them. Notes are private
// and only on this phone (features/notes). Opened with ?block=<n> (a bookmark, a note) it scrolls to that paragraph and selects it. The last
// place read in each book is remembered, for Continue reading on the book's screen.
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function Reader() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[]; chapter?: string | string[]; block?: string | string[] }>();
  const id = one(params.id);
  const chapterId = one(params.chapter);
  const open = useBook(id);
  const toBook = () => (id ? router.replace(`/library/book/${id}`) : router.replace('/library'));
  const goBack = () => (router.canGoBack() ? router.back() : toBook());
  if (!open) return <NotHere title="This book is not here" line="It may have been taken out of the app. Your other books are still in the Library." goBack={goBack} />;
  const chapter = findChapter(open.content.chapters, chapterId);
  if (!chapter) return <NotHere title="This chapter is not here" line="The book has changed since this link was made. The rest of the book is still here." goBack={toBook} />;
  const block = Number(one(params.block));
  return <ChapterView key={`${open.book.id}/${chapter.id}`} open={open} chapter={chapter} startBlock={Number.isInteger(block) && block >= 0 && block < chapter.blocks.length ? block : null} goBack={goBack} />;
}

function ChapterView({ open, chapter, startBlock, goBack }: { open: OpenBook; chapter: OpenBook['content']['chapters'][number]; startBlock: number | null; goBack: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { book } = open;
  const italicReady = useItalicFaces();
  const marks = useLibraryBookmarks();
  const reading = useReadingPlaces();
  const notes = useChapterNotes(book.id, chapter.id);
  const { open: openSheet, sheet } = useNoteSheet(notes);
  const place = chapterPlace(book.chapters, chapter.id);
  const prompt = useMemo(() => reflectionPrompt(chapter.blocks), [chapter]);
  const titles = { book: book.title, chapter: chapter.title };
  const [active, setActive] = useState<number | null>(startBlock);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const scrolled = useRef(false);

  // This is now where the pilgrim is in the book (once the places were read, so nothing saved is written over).
  const { ready, remember } = reading;
  useEffect(() => { if (ready) remember(book.id, chapter.id); }, [ready, remember, book.id, chapter.id]);

  const chapterKey = chapterAnchor(book.id, chapter.id);
  const nav = (id: string) => router.replace(`/library/book/${book.id}/${id}`);
  const prevTitle = place?.prev ? book.chapters.find((c) => c.id === place.prev)?.title : undefined;
  const nextTitle = place?.next ? book.chapters.find((c) => c.id === place.next)?.title : undefined;

  const writeNote = (i: number) => {
    setActive(i);
    openSheet({ anchor: blockAnchor(book.id, chapter.id, i), quote: quoteOf(chapter.blocks[i]), type: 'note', titles });
  };
  const writeReflection = () => openSheet({ anchor: chapterKey, quote: chapter.title, type: 'reflection', prompts: prompt ? questionLines(prompt) : undefined, titles });
  const chapterNotes = () => openSheet({ anchor: chapterKey, quote: chapter.title, type: 'note', titles });

  return (
    <View style={{ flex: 1, backgroundColor: role.bg }}>
      {/* No margin on the screen: the text scrolls edge to edge and keeps its own, so the highlight of a selected paragraph can reach out of the column. */}
      <Screen tabBar={false} scroll={false} margin={0}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: layout.screenMargin }}>
          <IconButton name="back" label="Back" onPress={goBack} />
          <BookmarkToggle on={marks.has(chapterKey)} title={chapter.title} toggle={() => marks.toggle(chapterKey)} />
        </View>
        <ScrollView ref={scroller} style={{ flex: 1 }} contentContainerStyle={{ gap: 18, paddingTop: 8, paddingHorizontal: layout.screenMargin, paddingBottom: insets.bottom + 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ gap: 8, paddingRight: GUTTER }}>
            {!!place && <AppText variant="caption" muted>{`${book.title} · ${place.index + 1} of ${place.count}`}</AppText>}
            <AppText variant="h3" accessibilityRole="header">{chapter.title}</AppText>
            <AppText variant="caption" muted>{READER_HINT}</AppText>
          </View>

          {chapter.blocks.map((block, i) => {
            // Scrolls to the paragraph a bookmark or a note opened, once its place on the page is known.
            const onLayout = startBlock === i ? (e: { nativeEvent: { layout: { y: number } } }) => {
              if (scrolled.current) return;
              scrolled.current = true;
              scroller.current?.scrollTo({ y: Math.max(0, e.nativeEvent.layout.y - 96), animated: false });
            } : undefined;
            if (prompt && i === prompt.listIndex) {
              return (
                <View key={i} onLayout={onLayout}>
                  <ReflectionCard questions={prompt.questions} reflection={notes.here.reflection} onOpen={writeReflection} />
                </View>
              );
            }
            if (!isNotable(block)) {
              return <View key={i} onLayout={onLayout} style={{ paddingRight: GUTTER }}><BlockBody block={block} italicReady={italicReady} /></View>;
            }
            const key = blockAnchor(book.id, chapter.id, i);
            return (
              <View key={i} onLayout={onLayout}>
                <ReaderBlock
                  block={block}
                  italicReady={italicReady}
                  text={blockText(block)}
                  notes={notes.here.blocks[i]?.length ?? 0}
                  bookmarked={marks.has(key)}
                  active={active === i}
                  onToggle={() => setActive((a) => (a === i ? null : i))}
                  onNote={() => writeNote(i)}
                  onBookmark={() => marks.toggle(key)}
                />
              </View>
            );
          })}

          {!prompt && (
            <View style={{ paddingRight: GUTTER }}>
              <Pill variant="ghost" label={notes.here.chapter.length > 0 ? `Your notes on this chapter (${notes.here.chapter.length})` : 'Add a note on this chapter'} onPress={chapterNotes} />
            </View>
          )}

          <View style={{ gap: 12, marginTop: 8 }}>
            {place?.next && nextTitle ? <ChapterLink direction="next" title={nextTitle} onPress={() => nav(place.next as string)} /> : <Pill large label="Back to the book" onPress={() => router.replace(`/library/book/${book.id}`)} />}
            {place?.prev && prevTitle && <ChapterLink direction="previous" title={prevTitle} onPress={() => nav(place.prev as string)} />}
          </View>
        </ScrollView>
      </Screen>
      {sheet}
    </View>
  );
}

/** The way to the next or the previous chapter or day: a card that says which and its title. */
function ChapterLink({ direction, title, onPress }: { direction: 'next' | 'previous'; title: string; onPress: () => void }) {
  const next = direction === 'next';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${next ? 'Next' : 'Previous'}: ${title}`}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 12, borderRadius: radius.lg, backgroundColor: role.surface, borderWidth: 1, borderColor: role.border, opacity: pressed ? 0.85 : 1 })}
    >
      {!next && <View style={{ transform: [{ scaleX: -1 }] }}><Icon name="chevron" color={role.muted} size={22} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText variant="caption" muted>{next ? 'Next' : 'Previous'}</AppText>
        <AppText variant="label">{title}</AppText>
      </View>
      {next && <Icon name="chevron" color={role.muted} size={22} />}
    </Pressable>
  );
}
