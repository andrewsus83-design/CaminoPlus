import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton, SectionLabel } from '@/components/ui';
import { bookLine, creditLine, formatMinutes } from '@/features/library/books';
import { BookmarkToggle } from '@/features/library/BookmarkToggle';
import { NotHere } from '@/features/library/NotHere';
import { resumePoint } from '@/features/library/reading';
import { itemKey } from '@/features/library/search';
import { useBook, type OpenBook } from '@/features/library/useBook';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { useReadingPlaces } from '@/features/library/useReadingPlaces';
import { bookPlaceOf, chapterAnchor } from '@/features/notes/anchor';
import { NOTEBOOK_ROUTE } from '@/features/notes/NotebookLink';
import { useNotes } from '@/features/notes/useNotes';
import { fixed, radius, role } from '@/theme';

// One book: its cover colour and title, what it is and how long it reads, a short description, a button that continues where the pilgrim stopped
// (or starts), the chapters or days with their minutes, and who made it and how (the credit, the rights and the AI disclosure exactly as the
// bundle has them). The book is in the app, so all of this works without a signal. The text of a chapter is the reader's (./[chapter].tsx).
export default function BookScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const open = useBook(id);
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  if (!open) return <NotHere title="This book is not here" line="It may have been taken out of the app. Your other books are still in the Library." goBack={goBack} />;
  return <BookView key={open.book.id} open={open} goBack={goBack} />;
}

function BookView({ open, goBack }: { open: OpenBook; goBack: () => void }) {
  const router = useRouter();
  const { book, content } = open;
  const marks = useLibraryBookmarks();
  const reading = useReadingPlaces();
  const { notes } = useNotes();
  const resume = resumePoint(book, reading.places);
  const go = (chapterId: string) => router.push(`/library/book/${book.id}/${chapterId}`);
  const bookKey = itemKey('Books', book.id);
  const mine = notes.filter((n) => bookPlaceOf(n.anchor)?.bookId === book.id);
  const reflected = new Set(mine.filter((n) => n.type === 'reflection').map((n) => bookPlaceOf(n.anchor)?.chapterId));

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />

      {/* The cover: a pale picture colour that does not change with light and dark, so what is on it is the fixed navy. */}
      <View style={{ backgroundColor: fixed[book.cover.colour], borderRadius: radius.lg, padding: 24, paddingTop: 20, gap: 28, minHeight: 220, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Icon name={book.cover.icon} color={fixed.blue} size={36} />
          <View style={{ marginTop: -8, marginRight: -12 }}>
            <BookmarkToggle on={marks.has(bookKey)} title={book.title} toggle={() => marks.toggle(bookKey)} color={fixed.blue} />
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <AppText variant="h3" accessibilityRole="header" color={fixed.blue}>{book.title}</AppText>
          <AppText variant="small" color={fixed.blue}>{book.subtitle}</AppText>
        </View>
      </View>

      <AppText variant="label" muted>{bookLine(book)}</AppText>
      <AppText>{book.description}</AppText>

      {resume && (
        <View style={{ gap: 8 }}>
          <Pill large label={resume.resumed ? 'Continue reading' : 'Start reading'} onPress={() => go(resume.chapterId)} />
          {resume.resumed && <AppText variant="small" muted style={{ textAlign: 'center' }}>{`You were reading: ${resume.title}`}</AppText>}
        </View>
      )}

      <SectionLabel>Contents</SectionLabel>
      <Card style={{ padding: 4 }}>
        {book.chapters.map((ch, i) => {
          const here = !!resume?.resumed && resume.chapterId === ch.id;
          const kept = marks.has(chapterAnchor(book.id, ch.id));
          const written = reflected.has(ch.id);
          const line = [formatMinutes(ch.minutes), here ? 'Where you stopped' : '', written ? 'Reflection written' : ''].filter(Boolean).join(' · ');
          return (
            <Pressable
              key={ch.id}
              accessibilityRole="button"
              accessibilityLabel={`${ch.title}. ${line}${kept ? '. Bookmarked' : ''}`}
              accessibilityHint="Opens this chapter"
              onPress={() => go(ch.id)}
              style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border, opacity: pressed ? 0.8 : 1 })}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <AppText variant="label">{ch.title}</AppText>
                <AppText variant="caption" muted>{line}</AppText>
              </View>
              {kept && <Icon name="bookmark" color={role.action} size={18} filled />}
              <Icon name="chevron" color={role.muted} size={20} />
            </Pressable>
          );
        })}
      </Card>

      {mine.length > 0 && <Pill variant="ghost" label={`Your notes in this book (${mine.length})`} onPress={() => router.push(NOTEBOOK_ROUTE)} />}

      <SectionLabel>About this edition</SectionLabel>
      <View style={{ gap: 8 }}>
        <AppText variant="small">{creditLine(content)}</AppText>
        <AppText variant="caption" muted>{content.rights}</AppText>
        <AppText variant="caption" muted>{content.ai_disclosure}</AppText>
      </View>
    </Screen>
  );
}
