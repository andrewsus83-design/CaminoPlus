// How big the text of the reader is, as pure functions: no React, no React Native (plain node tests cover it, npm run test:library).
//
// Five steps, chosen with the two buttons "Smaller text" and "Larger text" in the header of the reader and kept on the phone (see
// useReaderSize.ts). The middle-low one, 19, is the size of the app's own body text. The phone's own text size (Settings > Display) still
// counts, as it does everywhere in the app: but a text drawn at the largest step on a phone set to the largest text would not fit a line
// of any use, so the combination is capped. `maxFontSizeMultiplier` is how many times the phone's setting may grow a text, and it is
// worked out here so that the text is never drawn bigger than MAX_BODY (the running text) or MAX_TITLE (the titles), whatever the two
// settings are. At a step of 28 a phone set to 1.3 times draws 36, and a phone set to twice draws 36 as well.

/** The size of the running text at each step, in points. */
export const READER_SIZES = [17, 19, 21, 24, 28] as const;
export const DEFAULT_STEP = 1;
export const LAST_STEP = READER_SIZES.length - 1;

/** The running text is never drawn bigger than this, the phone's text size included. */
export const MAX_BODY = 36;
/** A title is never drawn bigger than this. */
export const MAX_TITLE = 46;

/** The name after nothing: the size is a setting of the phone, not of a person, so it is not wiped when someone logs out (like the light/dark choice). */
export const SIZE_NAME = 'library.books.size';

/** A step as a whole number inside the steps. Anything else (nothing, a text, NaN, a step from a later version) is the default. */
export function clampStep(n: unknown): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_STEP;
  return Math.min(Math.max(Math.round(n), 0), LAST_STEP);
}

/** What is stored: `{ v: 1, step }`. null when it is not that shape. */
export const parseStep = (raw: unknown): number | null => {
  if (!raw || typeof raw !== 'object') return null;
  const { v, step } = raw as { v?: unknown; step?: unknown };
  return v === 1 && typeof step === 'number' && Number.isFinite(step) ? clampStep(step) : null;
};
export const packStep = (step: number): { v: 1; step: number } => ({ v: 1, step: clampStep(step) });

export const canShrink = (step: number): boolean => clampStep(step) > 0;
export const canGrow = (step: number): boolean => clampStep(step) < LAST_STEP;
export const shrink = (step: number): number => Math.max(clampStep(step) - 1, 0);
export const grow = (step: number): number => Math.min(clampStep(step) + 1, LAST_STEP);

/** "Text size 2 of 5": said when the size changes (a polite live region of the reader). */
export const sizeLine = (step: number): string => `Text size ${clampStep(step) + 1} of ${READER_SIZES.length}`;

/** One text of the reader: its size, the height of a line, and how far the phone's own setting may grow it. */
export type Face = { size: number; lineHeight: number; maxMultiplier: number };

export type ReaderType = {
  step: number;
  body: Face;
  /** A quotation, a prayer or a poem. */
  quote: Face;
  /** A heading inside a chapter (Fraunces). */
  heading: Face;
  /** The title of the chapter (Fraunces). */
  title: Face;
  /** The small mono lines (the part, the time to read). They grow a little with the phone's setting, no more. */
  meta: Face;
  /** The space after a paragraph. */
  gap: number;
  /** How wide the text may be, so that a line holds about 70 characters on a tablet or a window: it is the whole screen width on a phone. */
  measure: number;
};

const face = (size: number, ratio: number, cap: number): Face => ({
  size,
  lineHeight: Math.round(size * ratio),
  // The most the phone's setting may add: it never goes under 1 (a setting under 1 is still followed), and never over what keeps the text under `cap`.
  maxMultiplier: Math.max(1, Math.floor((cap / size) * 100) / 100),
});

/** Everything the reader draws, at this step. */
export function readerType(step: number): ReaderType {
  const s = clampStep(step);
  const body = READER_SIZES[s];
  return {
    step: s,
    body: face(body, 1.6, MAX_BODY),
    quote: face(Math.round(body * 0.95), 1.55, MAX_BODY),
    heading: face(Math.round(body * 1.2), 1.3, MAX_TITLE),
    title: face(Math.round(body * 1.45), 1.2, MAX_TITLE),
    meta: face(13, 1.4, 17),
    gap: Math.round(body * 0.8),
    measure: Math.round(body * 36),
  };
}

/** What a text is drawn at: its size times the phone's setting, but not past the cap the face carries. For tests and for anyone who wants to know. */
export const drawnSize = (f: Face, systemScale: number): number => f.size * Math.min(Math.max(systemScale, 0), f.maxMultiplier);
