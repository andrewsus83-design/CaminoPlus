import { memo, useCallback, useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { c, radius, role } from '@/theme';
import { BOOKMARK_NOT_SAVED } from '../bookmarks';
import { itemKey } from '../search';
import { useLibraryBookmarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import { ReadButton } from './BookUi';
import { BOOK_TEXT_INDEX } from './bookText';
import { bookById, type CatalogBook } from './catalog';
import { NOT_YET_TEXT, NOT_YET_TITLE, UNKNOWN_TEXT, UNKNOWN_TITLE, readerPath } from './copy';
import { bookFacts, positionLine, chapterNav, readButtonLabel, readButtonSpoken, resumeAt, tocGroups, type TocEntry } from './reading';
import { safeText } from './safeText';
import { useBooksReading } from './useBooksReading';

// The page of one book, where a cover opens to: the cover, large (with its ribbon, the bookmark), the title in Fraunces, the author, the era and the mark
// "Free" or "Soon", the blurb, and then one of two things.
//  - A book with a text: the gold button ("Start reading" the first time, "Continue: Chapter 7" after), a line that says where that is, one short handwritten note,
//    the table of contents (the chapters under their parts, the ones read marked, the place where you stopped marked), and the credit of the edition.
//  - A book without one: "Not in the app yet" and one honest sentence (its edition is being checked), and no button.
// A book that is not one of the twelve (an old or a wrong link) gets a calm sentence and the way to the Library. Nothing here uses the network: the words and the
// contents are inside the app, and what is read and where you stopped is kept on the phone (useBooksReading.ts).

/** The one short handwritten note of the page (Caveat), for a book you can read. */
export const PAGE_NOTE = 'A little each day';

/** The mark under the title, in JetBrains Mono: "FREE" for a book with a text, "SOON" for one without. */
function Mark({ free }: { free: boolean }) {
  return (
    <View accessibilityLabel={free ? 'Free to read' : 'Coming soon'} style={{ paddingHorizontal: 12, height: 26, borderRadius: radius.pill, backgroundColor: free ? c.successWash : role.sunken, justifyContent: 'center' }}>
      <AppText variant="mono" color={free ? c.success : role.muted} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1 }}>{free ? 'FREE' : 'SOON'}</AppText>
    </View>
  );
}

/** One chapter in the table of contents: its number in the book (mono), its title, a tick when it is read, and "Last read" where you stopped. One button. */
const TocRow = memo(function TocRow({ entry, read, here, first, onOpen }: { entry: TocEntry; read: boolean; here: boolean; first: boolean; onOpen: (chapterId: string) => void }) {
  const spoken = `${entry.title}${read ? ', read' : ''}${here ? ', where you stopped' : ''}`;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderTopWidth: first ? 0 : 1, borderTopColor: role.border, backgroundColor: pressed ? role.sunken : 'transparent' })}
    >
      <AppText variant="mono" muted style={{ width: 36, textAlign: 'right', fontSize: 14, lineHeight: 20 }}>{entry.index + 1}</AppText>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <AppText variant="small" style={{ fontSize: 17, lineHeight: 23 }}>{entry.title}</AppText>
        {here && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 20, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
            <AppText variant="mono" muted style={{ fontSize: 11, lineHeight: 14, letterSpacing: 1 }}>LAST READ</AppText>
          </View>
        )}
      </View>
      {read && <Icon name="check" color={c.success} size={20} strokeWidth={2.2} />}
    </Pressable>
  );
});

function Missing() {
  const router = useRouter();
  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/library'))} />
      <AppText variant="h2" accessibilityRole="header">Not found</AppText>
      <Card style={{ gap: 12 }}>
        <AppText variant="h4" accessibilityRole="header">{UNKNOWN_TITLE}</AppText>
        <AppText variant="small" accessibilityLiveRegion="polite">{UNKNOWN_TEXT}</AppText>
        <Pill variant="primary" label="Open the Library" onPress={() => router.replace('/library')} />
      </Card>
    </Screen>
  );
}

/** The page of the book with this id. `notice` is one calm sentence above the cover (the reader sends someone here when a chapter in a link does not exist). */
export function BookPage({ id, notice }: { id: string; notice?: string }) {
  const book = bookById(id);
  if (!book) return <Missing />;
  return <Page book={book} notice={notice} />;
}

function Page({ book, notice }: { book: CatalogBook; notice?: string }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const marks = useLibraryBookmarks();
  const reading = useBooksReading();
  const text = useMemo(() => safeText(book.id), [book.id]);
  const chapters = text?.chapters ?? [];
  const key = itemKey('Books', book.id);
  const place = reading.placeOf(book.id);
  const groups = useMemo(() => tocGroups(chapters), [chapters]);
  const index = BOOK_TEXT_INDEX.find((e) => e.id === book.id);
  const readSet = reading.readSet(book.id);
  const resume = resumeAt(chapters, place);
  const target = chapters[resume.index];
  const nav = target ? chapterNav(chapters, resume.index) : null;
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const open = useCallback((chapterId: string) => router.push(readerPath(book.id, chapterId)), [router, book.id]);
  const toggle = useCallback(() => marks.toggle(key), [marks, key]);
  const coverWidth = Math.min(Math.max(Math.round((width - 32) / 2), 140), 220);

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      {!!notice && <FormMessage tone="info">{notice}</FormMessage>}
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      <View style={{ alignItems: 'center', gap: 12 }}>
        <BookCover book={book} width={coverWidth} hasText={!!text} bookmarked={marks.has(key)} onBookmark={toggle} />
        <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
          <AppText variant="h3" accessibilityRole="header" style={{ textAlign: 'center' }}>{book.title}</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>{book.author}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <AppText variant="mono" muted style={{ fontSize: 14, lineHeight: 20 }}>{book.era}</AppText>
          <Mark free={!!text} />
        </View>
        {!!text && !!index && <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{bookFacts(index.chapters, index.words)}</AppText>}
      </View>
      <AppText variant="body">{book.blurb}</AppText>

      {text && target && nav ? (
        <>
          <View style={{ gap: 8 }}>
            <ReadButton
              label={readButtonLabel(chapters, place)}
              spoken={readButtonSpoken(chapters, place)}
              hint="Opens the reader"
              onPress={() => open(target.id)}
            />
            {!resume.fresh && (
              <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{[nav.part, positionLine(nav)].filter(Boolean).join(' · ')}</AppText>
            )}
            <AppText variant="accent" color={role.accentText} style={{ textAlign: 'center' }}>{PAGE_NOTE}</AppText>
          </View>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12 }}>
              <AppText variant="h4" accessibilityRole="header">Contents</AppText>
              <AppText variant="mono" muted style={{ fontSize: 14, lineHeight: 20 }}>{`${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}`}</AppText>
            </View>
            {groups.map((g, gi) => (
              <View key={`${gi}-${g.part ?? ''}`} style={{ gap: 8 }}>
                {!!g.part && <AppText variant="mono" muted accessibilityRole="header" style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: gi === 0 ? 0 : 8 }}>{g.part}</AppText>}
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {g.entries.map((e, i) => (
                    <TocRow key={e.id} entry={e} first={i === 0} read={readSet.has(e.id)} here={!!place && place.c === e.id} onOpen={open} />
                  ))}
                </Card>
              </View>
            ))}
          </View>
          <View style={{ gap: 4 }}>
            <AppText variant="mono" muted style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>The edition</AppText>
            <AppText variant="caption" muted>{text.credit}</AppText>
          </View>
        </>
      ) : (
        <Card style={{ gap: 8 }}>
          <AppText variant="h4" accessibilityRole="header">{NOT_YET_TITLE}</AppText>
          <AppText variant="small">{NOT_YET_TEXT}</AppText>
        </Card>
      )}
    </Screen>
  );
}
