import { useCallback, useState, type ReactElement } from 'react';
import { NoteSheet, type NoteTarget } from './NoteSheet';
import { NOTES_BLOCKED, NOTES_NOT_SAVED } from './present';
import { notesAt, type Note } from './notes';
import type { NotesApi } from './useNotes';
import { useGrow } from './useGrow';

/**
 * The note sheet for a screen that has the notes (useNotes): `open(target)` shows it on a place, and `sheet` is the element to draw (null while
 * it is closed). The notes it lists are those of the place it was opened on, read from the screen's own list, so a note that is added, changed or
 * deleted shows in it at once. Each opening is a fresh sheet (its own key). The screen's `onOpenPlace` is for the Notebook.
 */
export function useNoteSheet(api: NotesApi, onOpenPlace?: (note: Note) => void): { open: (target: NoteTarget) => void; close: () => void; sheet: ReactElement | null } {
  const [target, setTarget] = useState<NoteTarget | null>(null);
  const [openings, setOpenings] = useState(0);
  const grow = useGrow();
  const open = useCallback((t: NoteTarget) => { setOpenings((n) => n + 1); setTarget(t); }, []);
  const close = useCallback(() => setTarget(null), []);
  const sheet = target ? (
    <NoteSheet
      key={`${openings}:${target.anchor}:${target.type}`}
      target={target}
      notes={notesAt(api.notes, target.anchor, target.type)}
      message={api.blocked ? NOTES_BLOCKED : api.failed ? NOTES_NOT_SAVED : null}
      onAdd={async (text) => { const res = await api.add({ anchor: target.anchor, quote: target.quote, text, type: target.type }); return res.ok ? null : res.reason; }}
      onEdit={async (id, text) => { const res = await api.edit(id, text); return res.ok ? null : res.reason; }}
      onDelete={api.remove}
      onGrow={(note) => grow(note, target.titles)}
      onOpenPlace={onOpenPlace ? (note) => { close(); onOpenPlace(note); } : undefined}
      onClose={close}
    />
  ) : null;
  return { open, close, sheet };
}
