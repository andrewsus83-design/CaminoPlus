import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card } from '@/components/ui';
import { radius, role, shadowStyle } from '@/theme';
import { refLabel } from './bible/order';
import { parseRef, type Ref } from './bible/ref';
import { useVerseSearch } from './bible/useVerseSearch';
import { LibraryGroups } from './LibraryTabs';
import { resultsLine, searchLibrary } from './search';
import type { LibraryMarks } from './useLibraryBookmarks';

export const NOTHING_FOUND_HINT = 'Check the spelling, try a shorter word, or clear the search to browse the tabs.';

/** The quiet line shown while the verses are being looked for. */
export const SEARCHING = 'Searching…';

/**
 * What the Library shows while something is typed in the search field, in place of the banner and the tabs: how many were found, and the rows grouped
 * (the books of the Bible, the books of the Library, the verses). The rows are found at once (a pure function, search.ts, run again for every letter); the verses are
 * found after the keystroke, when the typing has paused, and never in the way of it (bible/useVerseSearch.ts), with a quiet "Searching…" while that runs. A
 * reference that is typed ("Ps 121", "john 3:16") is offered first as a card that goes straight to it. No notice: what is found is in the app. Nothing found is a calm sentence with a way back (Clear search), never a blank.
 */
export function SearchResults({ query, marks, onClear, onOpenBook, onOpenVerse }: { query: string; marks: LibraryMarks; onClear: () => void; onOpenBook: (code: string) => void; onOpenVerse: (ref: Ref) => void }) {
  const found = useMemo(() => searchLibrary(query), [query]);
  const verses = useVerseSearch(query);
  const goTo = useMemo(() => parseRef(query), [query]);
  const hits = useMemo(() => ({ ...found.hits, Verses: verses.rows }), [found, verses.rows]);
  const total = found.total + verses.rows.length;
  const looking = verses.state === 'waiting' || verses.state === 'searching';
  return (
    <>
      {goTo && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Go to ${refLabel(goTo)}`}
          onPress={() => onOpenVerse(goTo)}
          style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingLeft: 20, paddingRight: 14, borderRadius: radius.lg, backgroundColor: pressed ? role.sunken : role.surface, borderWidth: 1, borderColor: role.border, ...shadowStyle('sm') })}
        >
          <AppText variant="label" style={{ flex: 1 }}>
            Go to <AppText variant="mono" style={{ fontSize: 17, lineHeight: 24 }}>{refLabel(goTo)}</AppText>
          </AppText>
          <Icon name="chevron" color={role.muted} size={22} />
        </Pressable>
      )}
      {total > 0 ? (
        <>
          {/* A polite live region: a screen reader says the new count as the list narrows. */}
          <AppText variant="small" muted accessibilityLiveRegion="polite">{resultsLine({ ...found, total })}</AppText>
          {verses.state === 'searching' && <AppText variant="caption" muted>{SEARCHING}</AppText>}
          <LibraryGroups hits={hits} marks={marks} onOpenBook={onOpenBook} onOpenVerse={onOpenVerse} versesCapped={verses.capped} />
        </>
      ) : looking ? (
        <AppText variant="small" muted accessibilityLiveRegion="polite">{SEARCHING}</AppText>
      ) : !goTo && (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="search" color={role.muted} size={30} />
          </View>
          <AppText variant="h4" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>{resultsLine({ ...found, total })}</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>{NOTHING_FOUND_HINT}</AppText>
          <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
            <Pill variant="ghost" label="Clear search" onPress={onClear} />
          </View>
        </Card>
      )}
    </>
  );
}
