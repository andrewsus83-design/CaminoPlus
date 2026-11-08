import { useMemo } from 'react';
import { View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { SampleNotice } from '@/components/SampleNotice';
import { Card } from '@/components/ui';
import { radius, role } from '@/theme';
import { LibraryGroups } from './LibraryTabs';
import { SEARCH_NOTICE } from './sample';
import { resultsLine, searchLibrary } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

export const NOTHING_FOUND_HINT = 'Check the spelling, try a shorter word, or clear the search to browse the tabs.';

/**
 * What the Library shows while something is typed in the search field, in place of the banner and the tabs: one Preview notice
 * (the results are the examples of the tabs, and it says so), how many were found, and the rows grouped by tab. Nothing found is a
 * calm sentence with a way back (Clear search), never a blank. The search is a pure function (search.ts), run again for every letter.
 */
export function SearchResults({ query, marks, onClear }: { query: string; marks: LibraryMarks; onClear: () => void }) {
  const found = useMemo(() => searchLibrary(query), [query]);
  return (
    <>
      <SampleNotice title="Preview">{SEARCH_NOTICE}</SampleNotice>
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
