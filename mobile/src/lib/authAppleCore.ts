// The parts of Sign in with Apple that are plain logic, with no React Native and no native module, so they can be unit
// tested in Node (src/lib/__tests__/authApple.test.ts). lib/authApple.ts plugs the native module and Supabase into them.

/**
 * Show the Apple button? Only on iOS, and only when the installed app has the native part of expo-apple-authentication.
 * Android and the web are left out in v1: there Apple's flow runs through a web page and needs a Services ID plus a
 * client secret that Apple makes expire every six months (mobile/docs/APPLE-SIGN-IN.md).
 */
export function appleAvailable(platform: string, moduleLoaded: boolean): boolean {
  return platform === 'ios' && moduleLoaded;
}

/** Lowercase hex of some bytes. */
export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * A one-time nonce. The raw value goes to Supabase, its SHA-256 (lowercase hex) goes to Apple, which writes it into the
 * identity token. Supabase hashes the raw value again and compares, so a token stolen from another sign-in cannot be
 * replayed here. `randomBytes` and `sha256Hex` come from expo-crypto in the app and from Node's crypto in the tests.
 */
export async function makeNonce(
  randomBytes: (n: number) => Uint8Array,
  sha256Hex: (text: string) => Promise<string>,
): Promise<{ raw: string; hashed: string }> {
  const bytes = randomBytes(32);
  if (!bytes || bytes.length < 32) throw new Error('Not enough random bytes for a nonce.');
  const raw = toHex(bytes);
  const hashed = (await sha256Hex(raw)).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(hashed)) throw new Error('The nonce hash is not SHA-256 hex.');
  return { raw, hashed };
}

const codeOf = (e: unknown): string =>
  typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string' ? (e as { code: string }).code : '';
const textOf = (e: unknown): string =>
  e instanceof Error ? e.message : typeof e === 'object' && e !== null && 'message' in e ? String((e as { message: unknown }).message) : typeof e === 'string' ? e : '';

/** The person closed Apple's sheet. Nothing to say then. */
export function isAppleCancel(e: unknown): boolean {
  const code = codeOf(e);
  return code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED';
}

/** Any failure in plain English, never a code. (A cancel is handled before this and shows nothing.) */
export function appleErrorMessage(e: unknown): string {
  const text = textOf(e).toLowerCase();
  if (/network|offline|fetch|timed? ?out|internet/.test(text)) return 'You are offline. Connect to the internet and try again.';
  if (/provider|not enabled|unsupported|audience|client id|issuer/.test(text)) return 'Sign in with Apple is not ready yet. Please use email or Google for now.';
  return 'Apple sign-in did not finish. Please try again.';
}

export type AppleName = { givenName?: string | null; middleName?: string | null; familyName?: string | null; nickname?: string | null } | null | undefined;

/** The name Apple shared (only on the very first sign-in), as one line of at most 60 characters, or null. */
export function appleFullName(n: AppleName): string | null {
  if (!n) return null;
  const parts = [n.givenName, n.middleName, n.familyName].map((p) => (p ?? '').trim()).filter(Boolean);
  const name = (parts.length ? parts.join(' ') : (n.nickname ?? '').trim()).replace(/\s+/g, ' ');
  return name ? name.slice(0, 60).trim() : null;
}

/**
 * The display name the sign-up trigger writes when the provider sends no name (Apple never puts it in its token): the start
 * of the email, lowercase, only letters, digits, "_" and "."; "pilgrim" when that is shorter than 3; at most 22 characters.
 * Mirrors private.handle_new_user() (supabase/migrations/20261104150100_profiles_auth.sql).
 */
export function triggerDisplayName(email: string | null | undefined): string {
  const local = (email ?? '').split('@')[0] ?? '';
  const base = local.replace(/[^a-zA-Z0-9_.]/g, '').toLowerCase();
  return (base.length < 3 ? 'pilgrim' : base).slice(0, 22);
}

/**
 * Has the profile only the automatic name? Exactly: empty, "pilgrim", or exactly what the trigger made from this account's
 * email (for a hidden email that is the random private relay name). Any other name was chosen by somebody and stays,
 * even "ana" for the username "ana.torres".
 */
export function isPlaceholderName(displayName: string | null | undefined, email: string | null | undefined): boolean {
  const d = (displayName ?? '').trim();
  return d === '' || d === 'pilgrim' || (!!email && d === triggerDisplayName(email));
}

/** The name to save, or null to leave the profile as it is (a name somebody chose, or no name from Apple). */
export function nameToSave(profile: { display_name: string | null } | null, fromApple: string | null, email: string | null | undefined): string | null {
  if (!fromApple || !profile) return null;
  return isPlaceholderName(profile.display_name, email) ? fromApple : null;
}

/**
 * Apple shares the name once. It is kept on the phone until the profile has it, so a failure in between (no signal, the
 * server busy) does not lose it: the next Apple sign-in of the same Apple account, or the next account load, tries again.
 */
export type PendingAppleName = { appleUser: string; name: string };

/** The name to use: the one Apple just sent, else the one kept for this same Apple account. */
export function nameFromAppleOrPending(fromApple: string | null, appleUser: string, pending: PendingAppleName | null): string | null {
  if (fromApple) return fromApple;
  return pending && pending.appleUser === appleUser && pending.name ? pending.name : null;
}

/** What happened to the name: saved, kept (the profile has a chosen name, nothing to do) or failed (try again later). */
export type NameOutcome = 'saved' | 'kept' | 'failed';
/** Forget the kept name unless saving failed. */
export const forgetPendingName = (o: NameOutcome) => o !== 'failed';
