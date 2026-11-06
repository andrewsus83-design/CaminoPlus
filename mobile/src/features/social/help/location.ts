// A position for the help bell. Foreground permission only (never background), high accuracy, a fresh fix
// within 10 seconds, else the last known one, whose age the sheet tells the pilgrim.
import * as Location from 'expo-location';
import { FIX_TIMEOUT_MS, LAST_KNOWN_MAX_AGE_MS, type FixFailure, type HelpFix } from './logic';

export type FixResult = { fresh: HelpFix | null; lastKnown: HelpFix | null; failure: FixFailure | null };

const toFix = (l: Location.LocationObject): HelpFix => ({
  lat: l.coords.latitude, lng: l.coords.longitude, accuracyM: typeof l.coords.accuracy === 'number' ? l.coords.accuracy : null, at: l.timestamp,
});

const timeout = (ms: number) => new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));

/** Asks for the permission when it can, then tries for a fresh high-accuracy fix (10 s at most), then falls back to
 *  the last known one. Never throws: `failure` says why there is no fresh position. */
export async function getHelpFix(timeoutMs = FIX_TIMEOUT_MS): Promise<FixResult> {
  const none = (failure: FixFailure): FixResult => ({ fresh: null, lastKnown: null, failure });
  try {
    let perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted && perm.canAskAgain !== false) perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return none(perm.canAskAgain === false ? 'blocked' : 'denied');
  } catch {
    return none('unavailable');
  }

  let failure: FixFailure | null = null;
  let fresh: HelpFix | null = null;
  try {
    if (!(await Location.hasServicesEnabledAsync())) failure = 'services-off';
    else fresh = toFix(await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }), timeout(timeoutMs)]));
  } catch (e) {
    failure = e instanceof Error && e.message === 'timeout' ? 'timeout' : 'unavailable';
  }
  if (fresh) return { fresh, lastKnown: null, failure: null };

  let lastKnown: HelpFix | null = null;
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (last) lastKnown = toFix(last);
  } catch {
    /* no last known position: the sheet says so */
  }
  return { fresh: null, lastKnown, failure: failure ?? 'unavailable' };
}
