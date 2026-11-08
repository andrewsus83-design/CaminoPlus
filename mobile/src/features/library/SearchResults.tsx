import { useMemo } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { SampleNotice } from '@/components/SampleNotice';
import { Card } from '@/components/ui';
import { radius, role } from '@/theme';
import { LibraryGroups } from './LibraryTabs';
import type { LibraryBook } from './books';
import { searchNotice } from './sample';
import { hitTabs, resultsLine, searchLibrary } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

export const NOTHING_FOUND_HINT = 'Check the spelling, try a shorter word, or clear the search to browse the tabs.';

/**
 * What the Library shows while something is typed in the search field, in place of the banner and the tabs: how many were found, and the
 * rows grouped by tab. The books are real; the Bible and Music rows are still examples, so a Preview notice shows only while one of those is
 * in the results, and says which. Nothing found is a calm sentence with a way back (Clear search), never a blank. The search is a pure
 * function (search.ts), run again for every letter.
 */
export function SearchResults({ query, books, marks, onClear }: { query: string; books: readonly LibraryBook[]; marks: LibraryMarks; onClear: () => void }) {
  const found = useMemo(() => searchLibrary(query, books), [query, books]);
  const notice = searchNotice(hitTabs(found.hits));
  return (
    <>
      {!!notice && <SampleNotice title="Preview">{notice}</SampleNotice>}
      {found.total > 0 ? (
        <>
          {/* A polite live region: a screen reader says the new count as the list narrows. */}
          <AppText variant="small" muted accessibilityLiveRegion="polite">{resultsLine(found)}</AppText>
          <LibraryGroups hits={found.hits} marks={marks} />
        </>
      ) : (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" color={role.muted} size={30} />
          </View>
          <AppText variant="h4" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>{resultsLine(found)}</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>{NOTHING_FOUND_HINT}</AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Pill variant="ghost" label="Clear search" onPress={onClear} />
          </View>
        </Card>
      )}
    </>
  );
}
