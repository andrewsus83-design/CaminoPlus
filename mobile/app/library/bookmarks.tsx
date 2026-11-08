import { useMemo } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { SampleNotice } from '@/components/SampleNotice';
import { Card, IconButton, SectionLabel } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { CATALOG, loadBookContent } from '@/features/library/bookBundle';
import { libraryBooks, type BookContent } from '@/features/library/books';
import { BOOKMARK_NOT_SAVED, LIBRARY_BOOKMARKS_EMPTY } from '@/features/library/bookmarks';
import { LibraryGroups } from '@/features/library/LibraryTabs';
import { bookPlaces } from '@/features/library/places';
import { PlaceRows } from '@/features/library/PlaceRows';
import { SavedPostCard } from '@/features/library/SavedPostCard';
import { BOOKMARKS_PRIVATE_LINE, bookmarksNotice } from '@/features/library/sample';
import { SAVED_EMPTY, SAVED_FAILED, SAVED_LIMIT_NOTE, SAVED_OFFLINE_EMPTY, SAVED_OFFLINE_NOTE } from '@/features/library/savedPosts';
import { hitCount, hitTabs, hitsForKeys } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { useSavedPosts } from '@/features/library/useSavedPosts';
import { NOTEBOOK_ROUTE, NotebookLink } from '@/features/notes/NotebookLink';
import { role } from '@/theme';

// A book's text can only be read here for the paragraphs that are bookmarked, and a book that cannot be read has no paragraph to show.
const readBook = (id: string): BookContent | null => { try { return loadBookContent(id); } catch { return null; } };

// Library > Bookmarks: what the pilgrim kept, in two parts. Library: the books, chapters, days and paragraphs bookmarked in the Books tab and in
// the reader (real), and the rows bookmarked in the Bible and Music tabs (examples, and a notice says so while one is on the screen); all of
// them live only on this phone (features/library/bookmarks.ts). Posts: the posts bookmarked in the journey viewer, read from the account
// (features/library/savedPosts.ts) with the copy of the last visit when there is no signal. A bookmark taken off here stays in its place,
// with an empty bookmark, until the screen is left, so a slip is put back with one tap. Under the title, the way into the Notebook.
export default function Bookmarks() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const marks = useLibraryBookmarks();
  const saved = useSavedPosts();
  const books = useMemo(() => libraryBooks(CATALOG), []);
  const hits = useMemo(() => hitsForKeys(marks.shown, books), [marks.shown, books]);
  const places = useMemo(() => bookPlaces(marks.shown, CATALOG, readBook), [marks.shown]);
  const notice = bookmarksNotice(hitTabs(hits));

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <AppText variant="h2" accessibilityRole="header">Bookmarks</AppText>

      <NotebookLink onPress={() => router.push(NOTEBOOK_ROUTE)} />

      <AppText variant="h4" accessibilityRole="header">Library</AppText>
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      {hitCount(hits) > 0 || places.length > 0 ? (
        <>
          {!!notice && <SampleNotice title="Preview">{notice}</SampleNotice>}
          <LibraryGroups hits={hits} marks={marks} />
          {places.length > 0 && (
            <View style={{ gap: 16 }}>
              <SectionLabel>{`Places in books · ${places.length}`}</SectionLabel>
              <PlaceRows places={places} marks={marks} />
            </View>
          )}
          <AppText variant="caption" muted>{BOOKMARKS_PRIVATE_LINE}</AppText>
        </>
      ) : marks.ready && (
        <Card><AppText variant="small" muted>{LIBRARY_BOOKMARKS_EMPTY}</AppText></Card>
      )}

      <AppText variant="h4" accessibilityRole="header" style={{ marginTop: 8 }}>Posts</AppText>
      {!!saved.notice && <FormMessage>{saved.notice}</FormMessage>}
      {saved.offlineNote && <FormMessage tone="info">{SAVED_OFFLINE_NOTE}</FormMessage>}
      {saved.failedNote && <FormMessage>{SAVED_FAILED}</FormMessage>}
      {saved.view === 'loading' && <ActivityIndicator accessibilityLabel="Loading your bookmarked posts" color={role.action} style={{ marginTop: 8 }} />}
      {saved.view === 'offline-empty' && <Card><AppText variant="small" muted>{SAVED_OFFLINE_EMPTY}</AppText></Card>}
      {saved.view === 'failed-empty' && <FormMessage>{SAVED_FAILED}</FormMessage>}
      {saved.view === 'empty' && <Card><AppText variant="small" muted>{SAVED_EMPTY}</AppText></Card>}
      {saved.view === 'list' && saved.posts.map((p) => (
        <SavedPostCard key={p.id} post={p} me={saved.uid} on={saved.isOn(p.id)} toggle={() => void saved.toggle(p)} />
      ))}
      {saved.view === 'list' && saved.capped && <AppText variant="caption" muted>{SAVED_LIMIT_NOTE}</AppText>}
    </Screen>
  );
}
