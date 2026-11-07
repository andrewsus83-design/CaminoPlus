// Text helpers of the Me screens that need no React, so plain-node tests can use them (npm run test:me).

/** Lower case, no accents, trimmed: "Nájera " and "najera" are the same word. Nothing (null, undefined) is the empty text. */
export const norm = (t: string | null | undefined) => (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
