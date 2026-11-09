// The words of the My Camino card on Me (the card under the name and the description), as plain functions: no React, so plain node tests cover them (npm run test:me).

/** A space that does not break the line: the words around it stay together. */
export const NBSP = '\u00A0';

/** "0 stages done", "1 stage done", "2 stages done": the word agrees with the number. Anything that is not a whole number of one or more is read as none. The spaces do not break the line. */
export function stagesDoneText(done: number): string {
  const n = Number.isFinite(done) ? Math.max(0, Math.floor(done)) : 0;
  return `${n}${NBSP}${n === 1 ? 'stage' : 'stages'}${NBSP}done`;
}

/**
 * The small line of the card under the name of the route: "From stage 3 · 12 stages done", or just "12 stages done" when the start of the journey is not known. The spaces inside "From stage 3" and
 * inside "12 stages done" do not break (NBSP): when the line is too long for the room it wraps at the dot ("From stage 3 ·" over "12 stages done"), never in the middle of a part. A screen reader
 * and a text search read an NBSP as a space.
 */
export function caminoLine(startStage: number | null | undefined, done: number): string {
  const from = typeof startStage === 'number' && Number.isFinite(startStage) ? `From${NBSP}stage${NBSP}${startStage} · ` : '';
  return `${from}${stagesDoneText(done)}`;
}
