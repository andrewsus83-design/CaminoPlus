import { useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '@/components/Screen';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { Card, IconButton } from '@/components/ui';
import { FormMessage } from '@/components/auth/Field';
import { CATALOG, loadBookContent } from '@/features/library/bookBundle';
import { findChapter } from '@/features/library/books';
import { isSearching } from '@/features/library/search';
import { bookPlaceOf } from '@/features/notes/anchor';
import { questionLines, reflectionPrompt } from '@/features/notes/blocks';
import { groupNotes, noteRoute, searchNotes, titlesOf } from '@/features/notes/notebook';
import { NotesSearch } from '@/features/notes/NotesSearch';
import type { Note } from '@/features/notes/notes';
import {
  NOTEBOOK_EMPTY, NOTEBOOK_EMPTY_TITLE, NOTEBOOK_HINT, NOTES_BLOCKED, NOTES_NOTHING_FOUND_HINT, NOTES_NOT_SAVED, NOTES_PRIVACY_LINE, noteDate, notesLabel, notesResultsLine,
} from '@/features/notes/present';
import { useNoteSheet } from '@/features/notes/useNoteSheet';
import { useNotes } from '@/features/notes/useNotes';
import { c, radius, role } from '@/theme';

// Library > Bookmarks > Notebook: the pilgrim's notes, grouped by what they are about (a book, then a chapter or day of it, in the order of
// the book: no timeline), with a plain search. A note opens in the same side sheet as in the reader, to read, change, delete or grow into a
// Diary page, and it can lead to its place in the book. The notes are only on this phone and the screen says so, with what clears them.
// There is nothing here to share, and nothing counts anyone's likes: it is a notebook.

/** The questions of a day, read from the book, so that a reflection can be changed here with its questions in front of it. */
function promptsFor(note: Note): string[] | undefined {
  const a = bookPlaceOf(note.anchor);
  if (note.type !== 'reflection' || !a || a.chapterId === null) return undefined;
  try {
    const chapter = findChapter(loadBookContent(a.bookId)?.chapters ?? [], a.chapterId);
    const prompt = chapter ? reflectionPrompt(chapter.blocks) : null;
    return prompt ? questionLines(prompt) : undefined;
  } catch {
    return undefined;
  }
}

export default function Notebook() {
  const router = useRouter();
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/library'));
  const api = useNotes();
  const [query, setQuery] = useState('');
  const { open, sheet } = useNoteSheet(api, (note) => { const to = noteRoute(note, CATALOG); if (to) router.push(to); });
  const searching = isSearching(query);
  const shown = useMemo(() => (searching ? searchNotes(api.notes, query, CATALOG) : api.notes), [api.notes, query, searching]);
  const groups = useMemo(() => groupNotes(shown, CATALOG), [shown]);

  return (
    <Screen tabBar={false} keyboard>
      <IconButton name="back" label="Back" onPress={goBack} />
      <View style={{ gap: 8 }}>
        <AppText variant="h2" accessibilityRole="header">Notebook</AppText>
        {api.notes.length > 0 && <AppText variant="label" muted>{notesLabel(api.notes.length)}</AppText>}
        <AppText variant="small" muted>{NOTES_PRIVACY_LINE}</AppText>
      </View>

      {api.blocked && <FormMessage>{NOTES_BLOCKED}</FormMessage>}
      {api.failed && <FormMessage>{NOTES_NOT_SAVED}</FormMessage>}

      {api.ready && api.notes.length === 0 && !api.blocked && (
        <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="pen" color={c.goldInk} size={30} />
          </View>
          <AppText variant="h4" style={{ textAlign: 'center' }}>{NOTEBOOK_EMPTY_TITLE}</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>{NOTEBOOK_EMPTY}</AppText>
          <AppText variant="small" muted style={{ textAlign: 'center' }}>{NOTEBOOK_HINT}</AppText>
        </Card>
      )}

      {api.notes.length > 0 && <NotesSearch value={query} onChangeText={setQuery} />}

      {searching && api.notes.length > 0 && (
        shown.length > 0
          ? <AppText variant="small" muted accessibilityLiveRegion="polite">{notesResultsLine(shown.length, query)}</AppText>
          : (
            <Card style={{ alignItems: 'center', gap: 12, paddingVertical: 32 }}>
              <View style={{ width: 64, height: 64, borderRadius: radius.pill, backgroundColor: role.sunken, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="search" color={role.muted} size={30} />
              </View>
              <AppText variant="h4" accessibilityLiveRegion="polite" style={{ textAlign: 'center' }}>{notesResultsLine(0, query)}</AppText>
              <AppText variant="small" muted style={{ textAlign: 'center' }}>{NOTES_NOTHING_FOUND_HINT}</AppText>
              <View style={{ alignSelf: 'stretch', marginTop: 8 }}>
                <Pill variant="ghost" label="Clear search" onPress={() => setQuery('')} />
              </View>
            </Card>
          )
      )}

      {groups.map((g) => (
        <View key={g.bookId ?? 'other'} style={{ gap: 12 }}>
          <View style={{ gap: 2 }}>
            <AppText variant="h4" accessibilityRole="header">{g.title}</AppText>
            {!!g.subtitle && <AppText variant="caption" muted numberOfLines={2}>{g.subtitle}</AppText>}
          </View>
          {g.chapters.map((ch, ci) => (
            <View key={`${ch.chapterId ?? 'whole'}:${ci}`} style={{ gap: 8 }}>
              {!!ch.title && <AppText variant="label" muted>{ch.title}</AppText>}
              <Card style={{ padding: 4 }}>
                {ch.notes.map((n, i) => (
                  <Pressable
                    key={n.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${n.type === 'reflection' ? 'Reflection. ' : ''}${n.text}${n.type === 'note' && n.quote ? `. On: ${n.quote}` : ''}`}
                    accessibilityHint="Opens the note"
                    onPress={() => open({ anchor: n.anchor, quote: n.quote, type: n.type, prompts: promptsFor(n), titles: titlesOf(n, CATALOG) })}
                    style={({ pressed }) => ({ minHeight: 64, gap: 6, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: role.border, opacity: pressed ? 0.8 : 1 })}
                  >
                    {n.type === 'reflection' && (
                      <View style={{ alignSelf: 'flex-start', paddingHorizontal: 10, height: 24, borderRadius: radius.pill, backgroundColor: c.goldWash, borderWidth: 1, borderColor: c.goldSoft, justifyContent: 'center' }}>
                        <AppText variant="mono" color={c.goldInk} style={{ fontSize: 11, letterSpacing: 1 }}>REFLECTION</AppText>
                      </View>
                    )}
                    {n.type === 'note' && !!n.quote && <AppText variant="caption" muted numberOfLines={2}>{`“${n.quote}”`}</AppText>}
                    <AppText variant="small" numberOfLines={4}>{n.text}</AppText>
                    <AppText variant="caption" muted>{noteDate(n.createdAt)}</AppText>
                  </Pressable>
                ))}
              </Card>
            </View>
          ))}
        </View>
      ))}
      {sheet}
    </Screen>
  );
}
