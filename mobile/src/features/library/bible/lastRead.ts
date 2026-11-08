// The chapter a pilgrim read last, as a plain value, for the "Continue reading" bar above the tab bar of the Library (features/library/continueBar, which also
// goes back to the book read last). Pure: no React, no React Native, nothing stored here (plain node tests cover it, npm run test:library). useLastRead.ts keeps
// it on the phone.
//
// Where it lives. Only on this phone, in the phone's key-value store under `u.<userId>.library.lastRead` (lib/localStore.ts userKey), like the
// bookmarks of the Library: every `u.<userId>.…` key is wiped when that person logs out (lib/auth.tsx, clearUserData), and another account on the
// same phone has other keys. Nothing is sent anywhere. Only the chapter is kept, not the verse or how far the screen was scrolled: the bar
// opens the chapter at its top. The time is in it so that the bar can tell which is the more recent, this chapter or the book read last.
import { isPlace, placeLabel, type Place } from './order';

/** The name after `u.<userId>.`. */
export const LAST_READ_NAME = 'library.lastRead';

/** What is stored: the chapter and when, in milliseconds. `v` is the version of the shape. */
export type StoredLastRead = { v: 1; code: string; chapter: number; at: number };

/**
 * The place in a stored value. null when what was stored is not this shape (nothing stored, a newer or damaged file) or names a chapter that is not
 * in the Bible any more (a book that was taken out of the list): the card is then not shown, and nothing breaks.
 */
export function parseLastRead(raw: unknown): Place | null {
  if (!raw || typeof raw !== 'object') return null;
  const { v, code, chapter } = raw as { v?: unknown; code?: unknown; chapter?: unknown };
  if (v !== 1) return null;
  const place = { code, chapter };
  return isPlace(place) ? { code: place.code, chapter: place.chapter } : null;
}

export const packLastRead = (p: Place, now: number): StoredLastRead => ({ v: 1, code: p.code, chapter: p.chapter, at: now });

/** The same chapter? */
export const samePlace = (a: Place | null, b: Place | null): boolean => !!a && !!b && a.code === b.code && a.chapter === b.chapter;

/** The words of the bar: a line over the chapter ("Psalm 121"), and what a screen reader says for the whole bar. */
export const CONTINUE_TITLE = 'Continue reading';
export const continueLabel = (p: Place): string => `${CONTINUE_TITLE}, ${placeLabel(p)}`;
