import { useMemo } from 'react';
import { ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { bookHref, readerHref } from '@/features/library/bible/order';
import { hasBook, loadBook } from '@/features/library/bible/text';
import { readerPath } from '@/features/library/books/copy';
import { passageRowsForKeys } from '@/features/library/books/passages';
import { PassageRows } from '@/features/library/books/PassageRows';
import { safeText } from '@/features/library/books/safeText';
import { BOOKMARK_NOT_SAVED, LIBRARY_BOOKMARKS_EMPTY } from '@/features/library/bookmarks';
import { LibraryGroups } from '@/features/library/LibraryTabs';
import { SavedPostCard } from '@/features/library/SavedPostCard';
import { BOOKMARKS_KEPT } from '@/features/library/sample';
import { SAVED_EMPTY, SAVED_FAILED, SAVED_LIMIT_NOTE, SAVED_OFFLINE_EMPTY, SAVED_OFFLINE_NOTE } from '@/features/library/savedPosts';
import { hitCount, hitsForKeys } from '@/features/library/search';
import { useLibraryBookmarks } from '@/features/library/useLibraryBookmarks';
import { useSavedPosts } from '@/features/library/useSavedPosts';
import { role } from '@/theme';

// Library > Bookmarks: what the pilgrim kept, in two parts. Library: what was bookmarked in the tabs and in the Bible (a book of the Bible, a verse
// of it, a book of the Library, a passage of one of them), kept only on this phone (features/library/bookmarks.ts); a book opens its chapters, a verse opens the reader
// at it and a passage opens the reader at it too (books/PassageRows.tsx), and a bookmark whose book, chapter or verse is not in the text is left out without a word. Posts: the posts bookmarked in the journey viewer, read from the account
// (features/library/savedPosts.ts) with the copy of the last visit when there is no signal. A bookmark taken off here stays in its place,
// with an empty bookmark, until the screen is left, so a slip is put back with one tap.
export default function Bookmarks() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const marks = useLibraryBookmarks();
  const saved = useSavedPosts();
  const hits = useMemo(() => hitsForKeys(marks.shown, { hasBook, loadBook }), [marks.shown]);
  const passages = useMemo(() => passageRowsForKeys(marks.shown, safeText), [marks.shown]);

  return (
    <Screen tabBar={false}>
      <IconButton name="back" label="Back" onPress={goBack} />
      <AppText variant="h2" accessibilityRole="header">Bookmarks</AppText>

      <AppText variant="h4" accessibilityRole="header">Library</AppText>
      {marks.failed && <FormMessage>{BOOKMARK_NOT_SAVED}</FormMessage>}
      {hitCount(hits) > 0 || passages.length > 0 ? (
        <>
          <AppText variant="caption" muted>{BOOKMARKS_KEPT}</AppText>
          <LibraryGroups hits={hits} marks={marks} onOpenBook={(code) => router.push(bookHref(code))} onOpenVerse={(ref) => router.push(readerHref(ref))} />
          {passages.length > 0 && <PassageRows rows={passages} marks={marks} onOpen={(r) => router.push(readerPath(r.bookId, r.chapterId, r.block))} />}
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
