import { useState } from 'react';
import { Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { AppText } from '@/components/AppText';
import { Icon } from '@/components/Icon';
import { Pill } from '@/components/Pill';
import { SheetModal } from '@/components/SheetModal';
import { FormMessage } from '@/components/auth/Field';
import { c, fonts, radius, role } from '@/theme';
import { confirmDeleteNote } from './confirm';
import type { NoteTitles } from './diary';
import { NOTE_SHEET_PRIVACY, GROW_LABEL, GROW_NOTE, noteDate, noteProblemMessage, thousands } from './present';
import { NOTE_TEXT_MAX, type Note, type NoteProblem, type NoteType } from './notes';

// Browsers draw their own outline inside a text field; the border of the box (gold while writing) shows the focus instead. Web only: native rejects it.
const noOutline = (Platform.OS === 'web' ? { outlineStyle: 'none' } : null) as object | null;

/** What the sheet is about: the anchor, the words it was made on, which kind of note, and the names that title a Diary page grown from it. */
export type NoteTarget = {
  anchor: string;
  quote: string;
  type: NoteType;
  /** The questions of a day, shown above the field while the pilgrim writes a reflection. */
  prompts?: readonly string[];
  titles: NoteTitles;
};

/**
 * The side sheet of the notes: a bottom sheet over a dimmed page, in the style of the comments sheet. It shows the words a note was made on, then
 * the notes there are on that place (read, edit, delete, grow into a Diary page), or a field to write one. With no note yet it opens on the field.
 * It only draws and asks: what saving, editing, deleting and growing do is the screen's business (hooks in useNotes.ts, useGrow.ts), and each
 * answers whether it worked, so that what the pilgrim wrote is never lost: when it did not, the words stay in the field and the reason is said.
 *
 * The screen gives it a `key` made from the place it opens on, so each opening starts fresh. A reflection is one answer to the questions of a day:
 * it has no "add another"; a note can have several on the same place.
 */
export function NoteSheet({ target, notes, message, onAdd, onEdit, onDelete, onGrow, onOpenPlace, onClose }: {
  target: NoteTarget;
  /** The notes on this place of this kind, oldest first. */
  notes: readonly Note[];
  /** A sentence from the screen (the last change could not be saved, the notes could not be read). */
  message?: string | null;
  /** Each answers null when it worked, or why not. */
  onAdd: (text: string) => Promise<NoteProblem | null>;
  onEdit: (id: string, text: string) => Promise<NoteProblem | null>;
  onDelete: (id: string) => Promise<boolean>;
  /** Grows a note into a Diary page: null when it worked, else the sentence to show. */
  onGrow: (note: Note) => Promise<string | null>;
  /** The Notebook gives this, to go to the place in the book. */
  onOpenPlace?: (note: Note) => void;
  onClose: () => void;
}) {
  const { height } = useWindowDimensions();
  const reflection = target.type === 'reflection';
  // null: the notes are listed. { id: null }: a new one is written. { id }: that one is changed.
  const [writing, setWriting] = useState<{ id: string | null; text: string } | null>(notes.length === 0 ? { id: null, text: '' } : null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  const save = async () => {
    if (!writing || busy) return;
    setBusy(true);
    setSaid(null);
    const problem = writing.id ? await onEdit(writing.id, writing.text) : await onAdd(writing.text);
    setBusy(false);
    if (problem) { setSaid(noteProblemMessage(problem)); return; }
    onClose();
  };
  const cancel = () => { setSaid(null); if (notes.length === 0) onClose(); else setWriting(null); };
  const remove = (n: Note) => confirmDeleteNote(reflection ? 'reflection' : 'note', async () => {
    setSaid(null);
    if (await onDelete(n.id)) { if (notes.length <= 1) onClose(); } else setSaid(noteProblemMessage('not-saved'));
  });
  const grow = async (n: Note) => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const problem = await onGrow(n);
    setBusy(false);
    if (problem) setSaid(problem); else onClose();
  };

  const title = reflection ? 'Your reflection' : 'Note';
  const count = writing ? writing.text.length : 0;
  const quote = target.quote.trim();
  return (
    <SheetModal onClose={onClose} closeLabel="Close the note">
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="h4" accessibilityRole="header">{title}</AppText>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={4} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" color={role.text} size={26} />
            </Pressable>
          </View>

          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 14 }} keyboardShouldPersistTaps="handled">
            {!!quote && (
              <View style={{ borderLeftWidth: 3, borderLeftColor: c.gold, paddingLeft: 14 }}>
                <AppText variant="small" muted numberOfLines={4}>{quote}</AppText>
              </View>
            )}

            {reflection && !!target.prompts && target.prompts.length > 0 && (
              <View style={{ gap: 8 }}>
                <AppText variant="caption" muted>The questions for tonight</AppText>
                {target.prompts.map((q, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10 }}>
                    <AppText variant="small" color={role.accentText} importantForAccessibility="no" accessibilityElementsHidden style={{ width: 14, textAlign: 'center' }}>•</AppText>
                    <AppText variant="small" style={{ flex: 1 }}>{q}</AppText>
                  </View>
                ))}
              </View>
            )}

            {writing === null && notes.map((n) => (
              <View key={n.id} style={{ backgroundColor: role.surface, borderRadius: radius.md, borderWidth: 1, borderColor: role.border, padding: 16, gap: 10 }}>
                <AppText selectable>{n.text}</AppText>
                <AppText variant="caption" muted>{noteDate(n.createdAt)}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  <Action label="Edit" hint={reflection ? 'Changes your reflection' : 'Changes this note'} onPress={() => { setSaid(null); setWriting({ id: n.id, text: n.text }); }} />
                  <Action label="Delete" hint={reflection ? 'Deletes your reflection' : 'Deletes this note'} onPress={() => remove(n)} />
                  <Action label={GROW_LABEL} hint="Makes a page of your Diary from this" onPress={() => void grow(n)} disabled={busy} />
                  {!!onOpenPlace && <Action label="Go to this place" hint="Opens the book where this note is" onPress={() => onOpenPlace(n)} />}
                </View>
              </View>
            ))}

            {writing === null && !reflection && (
              <Pill variant="ghost" label="Add another note" onPress={() => { setSaid(null); setWriting({ id: null, text: '' }); }} />
            )}

            {writing !== null && (
              <View style={{ gap: 10 }}>
                <View style={{ backgroundColor: role.surface, borderRadius: radius.lg, borderWidth: 2, borderColor: focused ? c.gold : role.border, overflow: 'hidden' }}>
                  <TextInput
                    value={writing.text}
                    onChangeText={(text) => setWriting({ ...writing, text })}
                    onFocus={() => setFocused(true)}
                    onBlur={() => setFocused(false)}
                    autoFocus
                    multiline
                    maxLength={NOTE_TEXT_MAX}
                    placeholder={reflection ? 'Write your reflection' : 'Write a note'}
                    placeholderTextColor={role.muted}
                    accessibilityLabel={reflection ? 'Your reflection' : 'Your note'}
                    style={[{ minHeight: 140, maxHeight: Math.max(140, height * 0.32), paddingHorizontal: 18, paddingTop: 14, paddingBottom: 14, fontFamily: fonts.body, fontSize: 19, lineHeight: 28, color: role.text, textAlignVertical: 'top' }, noOutline]}
                  />
                </View>
                {count >= NOTE_TEXT_MAX - 500 && <AppText variant="caption" muted>{thousands(count)} / {thousands(NOTE_TEXT_MAX)}</AppText>}
                <Pill label={reflection ? 'Save reflection' : 'Save note'} onPress={() => void save()} loading={busy} disabled={writing.text.trim().length === 0} />
                <Pill variant="ghost" label="Cancel" onPress={cancel} disabled={busy} />
              </View>
            )}

            {!!said && <FormMessage>{said}</FormMessage>}
            {!!message && !said && <FormMessage>{message}</FormMessage>}
          </ScrollView>

          <View style={{ gap: 4 }}>
            <AppText variant="caption" muted>{NOTE_SHEET_PRIVACY}</AppText>
            {writing === null && notes.length > 0 && <AppText variant="caption" muted>{GROW_NOTE}</AppText>}
          </View>
    </SheetModal>
  );
}

function Action({ label, hint, onPress, disabled }: { label: string; hint: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({ minHeight: 44, paddingHorizontal: 16, borderRadius: radius.pill, borderWidth: 1, borderColor: role.border, backgroundColor: role.bg, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.55 : pressed ? 0.8 : 1 })}
    >
      <AppText variant="label">{label}</AppText>
    </Pressable>
  );
}
