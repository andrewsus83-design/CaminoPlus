import { memo, useCallback, useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { BackButton } from '@/components/BackButton';
import { Card } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { c, radius, role } from '@/theme';
import { BOOKMARK_NOT_SAVED } from '../bookmarks';
import { itemKey } from '../search';
import { useLibraryBookmarks } from '../useLibraryBookmarks';
import { BookCover } from './BookCover';
import { BookNotice, ReadButton } from './BookUi';
import { bookById, type CatalogBook } from './catalog';
import { UNKNOWN_TEXT, UNKNOWN_TITLE, UNREADABLE_TEXT, UNREADABLE_TITLE, kindName, pageNote, readerPath } from './copy';
import { noticeFor } from './notices';
import { bookFacts, chapterNav, formatMinutes, partName, partSubtitle, positionLine, readButtonLabel, readButtonSpoken, resumeAt, splitTitle, tocGroups, type TocEntry } from './reading';
import { safeText } from './safeText';
import { useBooksReading } from './useBooksReading';

// The page of one book, where a cover opens to: the cover, large (with its ribbon, the bookmark), the title in Fraunces, the subtitle, the kind of book, how long it is, the
// description, THE NOTICE OF ITS KIND (notices.ts: written with AI assistance, and what has and has not been checked: every book page has it, whatever the book), and then one
// of two things.
//  - A book whose text reads: the gold button ("Start reading" the first time, "Continue: Day 3" after), a line that says where that is, one short handwritten note, the table
//    of contents (the chapters with how long each takes, the ones read marked, the place where you stopped marked), and the credit of the book.
//  - A book whose text cannot be read (a damaged file): a calm sentence that says so, and no button.
// A book that is not in the Library (an old or a wrong link) gets a calm sentence and the way to the Library. Nothing here uses the network: the words and the contents
// are inside the app, and what is read and where you stopped is kept on the phone (useBooksReading.ts).

/** How wide the cover is on the page: about 60 % of the screen's width, so larger than the covers of the grid (173 on a 390 phone) and never more than 240. */
export const coverWidthOf = (screen: number): number => Math.min(Math.max(Math.round((screen - 32) * 0.6), 150), 240);

/** The kind of book under the title, in JetBrains Mono capitals on a pale ground. */
function KindMark({ kind }: { kind: string }) {
  return (
    <View accessibilityLabel={kindName(kind)} style={{ paddingHorizontal: 12, height: 26, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
      <AppText variant="mono" color={role.muted} style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1 }}>{kindName(kind).toUpperCase()}</AppText>
    </View>
  );
}

/**
 * One chapter in the table of contents: its number in the book (mono), its title split in two ("Day 3" in Inter, and under it what the day is about, muted, in at most three
 * lines), how long it takes (mono), a tick when it is read, and "Last read" where you stopped. One button; a screen reader hears the whole title.
 */
const TocRow = memo(function TocRow({ entry, minutes, read, here, first, onOpen }: { entry: TocEntry; minutes?: number; read: boolean; here: boolean; first: boolean; onOpen: (chapterId: string) => void }) {
  const spoken = `${entry.title}${minutes ? `, ${formatMinutes(minutes)}` : ''}${read ? ', read' : ''}${here ? ', where you stopped' : ''}`;
  const { label, subtitle } = splitTitle(entry.title);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      onPress={() => onOpen(entry.id)}
      style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 17, paddingHorizontal: 12, borderTopWidth: first ? 0 : 1, borderTopColor: role.border, backgroundColor: pressed ? role.sunken : 'transparent' })}
    >
      <AppText variant="mono" muted style={{ width: 28, textAlign: 'right', fontSize: 14, lineHeight: 20, marginTop: 1 }}>{entry.index + 1}</AppText>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <AppText variant="label">{label}</AppText>
        {!!subtitle && <AppText variant="small" muted numberOfLines={3} style={{ fontSize: 15, lineHeight: 21 }}>{subtitle}</AppText>}
        {here && (
          <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, height: 20, borderRadius: radius.pill, backgroundColor: role.sunken, justifyContent: 'center' }}>
            <AppText variant="mono" muted style={{ fontSize: 11, lineHeight: 14, letterSpacing: 1 }}>LAST READ</AppText>
          </View>
        )}
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        {!!minutes && <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 20 }}>{formatMinutes(minutes)}</AppText>}
        {read && <Icon name="check" color={c.success} size={20} strokeWidth={2.2} />}
      </View>
    </Pressable>
  );
});

function Missing() {
  const router = useRouter();
  return (
    <Screen tabBar={false}>
      <BackButton fallback="/library" />
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
  const minutes = useMemo(() => new Map(book.chapters.map((x) => [x.id, x.minutes] as const)), [book]);
  const key = itemKey('Books', book.id);
  const place = reading.placeOf(book.id);
  const groups = useMemo(() => tocGroups(chapters), [chapters]);
  const readSet = reading.readSet(book.id);
  const resume = resumeAt(chapters, place);
  const target = chapters[resume.index];
  const nav = target ? chapterNav(chapters, resume.index) : null;
  const open = useCallback((chapterId: string) => router.push(readerPath(book.id, chapterId)), [router, book.id]);
  const toggle = useCallback(() => marks.toggle(key), [marks, key]);
  const coverWidth = coverWidthOf(width);

  return (
    <Screen tabBar={false}>
      <BackButton fallback="/library" />
      {!!notice && <FormMessage tone="info">{notice}</FormMessage>}
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      <View style={{ alignItems: 'center', gap: 12 }}>
        <BookCover book={book} width={coverWidth} bookmarked={marks.has(key)} onBookmark={toggle} />
        <View style={{ alignItems: 'center', gap: 4, marginTop: 8 }}>
          <AppText variant="h3" accessibilityRole="header" style={{ textAlign: 'center' }}>{book.title}</AppText>
          {!!book.subtitle && <AppText variant="small" muted style={{ textAlign: 'center' }}>{book.subtitle}</AppText>}
        </View>
        <KindMark kind={book.kind} />
        <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{bookFacts(book.chapters.length, book.words)}</AppText>
      </View>
      <AppText variant="body">{book.description}</AppText>
      <BookNotice text={noticeFor(book.kind)} />

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
              <AppText variant="mono" muted style={{ fontSize: 13, lineHeight: 19, textAlign: 'center' }}>{[nav.part ? partName(nav.part) : null, positionLine(nav)].filter(Boolean).join(' · ')}</AppText>
            )}
            <AppText variant="accent" color={role.accentText} style={{ textAlign: 'center' }}>{pageNote(book.kind)}</AppText>
          </View>
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', columnGap: 12 }}>
              <AppText variant="h4" accessibilityRole="header">Contents</AppText>
              <AppText variant="mono" muted style={{ fontSize: 14, lineHeight: 20 }}>{`${chapters.length} ${chapters.length === 1 ? 'chapter' : 'chapters'}`}</AppText>
            </View>
            {groups.map((g, gi) => (
              <View key={`${gi}-${g.part ?? ''}`} style={{ gap: 8 }}>
                {!!g.part && (
                  <View accessible accessibilityRole="header" accessibilityLabel={g.part} style={{ gap: 2, marginTop: gi === 0 ? 0 : 8 }}>
                    <AppText variant="h4" style={{ fontSize: 19, lineHeight: 25 }}>{partName(g.part)}</AppText>
                    {!!partSubtitle(g.part) && <AppText variant="small" muted numberOfLines={4} style={{ fontSize: 15, lineHeight: 21 }}>{partSubtitle(g.part)}</AppText>}
                  </View>
                )}
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {g.entries.map((e, i) => (
                    <TocRow key={e.id} entry={e} minutes={minutes.get(e.id)} first={i === 0} read={readSet.has(e.id)} here={!!place && place.c === e.id} onOpen={open} />
                  ))}
                </Card>
              </View>
            ))}
          </View>
          {!!text.credit && (
            <View style={{ gap: 4 }}>
              <AppText variant="mono" muted style={{ fontSize: 12, lineHeight: 16, letterSpacing: 1.5, textTransform: 'uppercase' }}>Credit</AppText>
              <AppText variant="caption" muted>{text.credit}</AppText>
            </View>
          )}
        </>
      ) : (
        <Card style={{ gap: 8 }}>
          <AppText variant="h4" accessibilityRole="header">{UNREADABLE_TITLE}</AppText>
          <AppText variant="small">{UNREADABLE_TEXT}</AppText>
        </Card>
      )}
    </Screen>
  );
}
