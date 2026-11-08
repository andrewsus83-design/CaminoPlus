// The close button of the "Continue reading" bar, as a plain value. Pure: no React, no React Native, nothing stored here (plain node tests cover it, npm run test:library).
// useContinueBar.ts keeps it on the phone.
//
// What is kept. Not "the bar is closed" but WHICH place was closed: the Bible chapter or the book and chapter, and the time the place was saved. The bar stays away while the
// place that is saved is that one, and comes back as soon as it is another: a different chapter, a different book, or the same chapter saved again later (the person read on,
// so there is a newer place to continue from). Closing is therefore never a switch that has to be found and turned on again.
//
// Where it lives. Only on this phone, in the phone's key-value store under `u.<userId>.library.continueHidden` (lib/localStore.ts userKey), next to the places it is about:
// every `u.<userId>.…` key is wiped when that person logs out (lib/auth.tsx, clearUserData), and another account on the same phone has other keys. Nothing is sent anywhere.
//
// A stored value is never trusted. It can be missing, from a newer version of the app, or damaged: parseHidden then gives null, which means "nothing is hidden", so the
// worst a bad file can do is show the bar once more. Nothing throws.
import type { Spot } from './spot';

/** The name after `u.<userId>.`. */
export const HIDDEN_NAME = 'library.continueHidden';

/** What is stored: the place that was closed (`at` is its time in milliseconds). `v` is the version of the shape. */
export type HiddenMark =
  | { v: 1; kind: 'bible'; code: string; chapter: number; at: number }
  | { v: 1; kind: 'book'; id: string; c: string; at: number };

/**
 * The longest id (of a book, of a chapter, or a code of the Bible) that is believed: the bound the places of the books believe (books/reading.ts ID_MAX), so that a place that
 * can be offered can be closed and stay closed. The longest id in the bundle has 52 characters; what is longer than this is no id, it is a damaged file.
 */
const ID_MAX = 80;
const name = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length <= ID_MAX;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 8.64e15;
const chapterNo = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 999;

/** The mark that says "this place was closed". How far down a book chapter the person was is left out: the time already says the place moved. */
export function markOf(spot: Spot): HiddenMark {
  return spot.kind === 'bible'
    ? { v: 1, kind: 'bible', code: spot.code, chapter: spot.chapter, at: spot.at }
    : { v: 1, kind: 'book', id: spot.id, c: spot.c, at: spot.at };
}

/**
 * The mark in a stored value, or null (nothing stored, another version, a wrong type, a chapter that is no number, a string that is empty or far too long, a time that is
 * not a time): null means nothing is hidden. The result is a new object with only the fields of the shape, whatever else the stored one held.
 */
export function parseHidden(raw: unknown): HiddenMark | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.v !== 1 || !time(o.at)) return null;
  if (o.kind === 'bible') return name(o.code) && chapterNo(o.chapter) ? { v: 1, kind: 'bible', code: o.code, chapter: o.chapter, at: o.at } : null;
  if (o.kind === 'book') return name(o.id) && name(o.c) ? { v: 1, kind: 'book', id: o.id, c: o.c, at: o.at } : null;
  return null;
}

/** What is written: a copy with only the fields of the shape. */
export const packHidden = (m: HiddenMark): HiddenMark =>
  m.kind === 'bible' ? { v: 1, kind: 'bible', code: m.code, chapter: m.chapter, at: m.at } : { v: 1, kind: 'book', id: m.id, c: m.c, at: m.at };

/** Is this very place the one that was closed? The same kind, the same chapter (and book) and the same time. A mark of nothing, or a place of nothing, hides nothing. */
export function isHidden(mark: HiddenMark | null, spot: Spot | null): boolean {
  if (!mark || !spot || mark.kind !== spot.kind || mark.at !== spot.at) return false;
  return mark.kind === 'bible' && spot.kind === 'bible'
    ? mark.code === spot.code && mark.chapter === spot.chapter
    : mark.kind === 'book' && spot.kind === 'book' && mark.id === spot.id && mark.c === spot.c;
}
