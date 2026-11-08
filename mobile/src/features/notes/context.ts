// The context a note is written with, filled in by the app and never typed: the day and, when the app knows it, the Camino the pilgrim
// has chosen. A pure module (plain node tests cover it, npm run test:notes).
//
// What the phone knows. The account (lib/auth.tsx, saved on the phone, so it is there offline) holds the pilgrim's current journey: the
// route they chose (its slug), where they start, and a status. That is enough for "this note was written on the Camino Francés". It is NOT
// enough to say which stage someone is on today: that is on the server (the day plan), changes with every day walked, and a stage worked
// out from the start date would be a guess. A note never carries a guessed stage, so `stage` stays empty until a screen can say it is known
// (the anchor scheme and the note already have room for it: NoteContext.stage, `stage:<routeSlug>/<n>`).
import { localDate, normalizeContext, type NoteContext } from './notes';

/** The part of the account's journey this reads (lib/api.ts Journey has more). */
export type JourneyContext = { route?: { slug?: string | null } | null } | null | undefined;

/** The context for a note written at `now`: the date, and the Camino of the current journey when it has one. */
export function contextFor(now: Date, journey: JourneyContext): NoteContext {
  const slug = journey?.route?.slug;
  return normalizeContext({ date: localDate(now), ...(typeof slug === 'string' ? { caminoSlug: slug } : {}) }, localDate(now));
}
