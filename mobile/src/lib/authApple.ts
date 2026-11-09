import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import type * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { getProfile, updateDisplayNameIf } from './api';
import { localStore } from './localStore';
import { hasNativeModule, NativeName } from './optionalNative';
import {
  appleAvailable, appleErrorMessage, appleFullName, forgetPendingName, isAppleCancel, makeNonce, nameFromAppleOrPending, nameToSave,
  type NameOutcome, type PendingAppleName,
} from './authAppleCore';

// Sign in with Apple (iOS only in v1, mobile/docs/APPLE-SIGN-IN.md). This is the ONE file that talks to Apple: it asks
// Apple for an identity token, hands it to Supabase, and passes Apple's one-time code to the apple-link function so the
// account can be revoked at Apple when it is deleted.
//
// expo-apple-authentication came with build 1.2.0. An app made before it has no native part for it, and loading the package
// there would crash the app, so it is never imported here at the top (only its types) and is required only after
// hasNativeModule() says yes (lib/optionalNative.ts). Without it there is simply no Apple button.
//
// Never log a token, a code or a nonce: nothing in this file writes to the log at all.

type AppleModule = typeof AppleAuthentication;

function appleModule(): AppleModule | null {
  if (Platform.OS !== 'ios') return null;
  if (!hasNativeModule(NativeName.appleAuthentication)) return null;
  return require('expo-apple-authentication') as AppleModule;
}

/** True when this phone can show the Apple button: iOS, a build with the module, and Apple says yes (isAvailableAsync). */
export async function isAppleSignInAvailable(): Promise<boolean> {
  const mod = appleModule();
  if (!appleAvailable(Platform.OS, mod != null) || !mod) return false;
  try {
    return await mod.isAvailableAsync();
  } catch {
    return false;
  }
}

/** Apple's own button view and its enums, or null when the module is missing (then there is no button at all). */
export function appleButtonKit(): Pick<AppleModule, 'AppleAuthenticationButtonType' | 'AppleAuthenticationButtonStyle'> & { Button: ComponentType<AppleAuthentication.AppleAuthenticationButtonProps> } | null {
  const mod = appleModule();
  if (!mod) return null;
  return { Button: mod.AppleAuthenticationButton, AppleAuthenticationButtonType: mod.AppleAuthenticationButtonType, AppleAuthenticationButtonStyle: mod.AppleAuthenticationButtonStyle };
}

const sha256Hex = (text: string) =>
  ExpoCrypto.digestStringAsync(ExpoCrypto.CryptoDigestAlgorithm.SHA256, text, { encoding: ExpoCrypto.CryptoEncoding.HEX });

// The name Apple shared, kept on this phone until the profile has it (one at a time; not tied to a user key, so a
// sign-out before it is saved does not lose it). Removed as soon as it is saved or not needed.
const PENDING_NAME_KEY = 'apple-pending-name';

/**
 * Put Apple's name on the profile if the profile has only the automatic name. The write happens only while the name is
 * still the one just read, so a name typed in that same second wins.
 */
async function saveAppleName(uid: string, name: string, email: string | null | undefined): Promise<NameOutcome> {
  try {
    const profile = await getProfile(uid);
    if (!profile) return 'failed';
    const next = nameToSave(profile, name, email);
    if (!next) return 'kept';
    return (await updateDisplayNameIf(uid, profile.display_name, next)) ? 'saved' : 'kept';
  } catch {
    return 'failed';
  }
}

async function settleName(uid: string, name: string | null, email: string | null | undefined): Promise<boolean> {
  if (!name) return false;
  const outcome = await saveAppleName(uid, name, email);
  if (forgetPendingName(outcome)) await localStore.remove(PENDING_NAME_KEY);
  return outcome === 'saved';
}

/**
 * Called by the account loading (lib/auth.tsx) after each successful load: if a name from Apple is still waiting for this
 * signed-in Apple account, save it now. True when the profile changed (then the caller loads it again).
 */
export async function finishPendingAppleName(uid: string): Promise<boolean> {
  const pending = await localStore.getJSON<PendingAppleName>(PENDING_NAME_KEY);
  if (!pending?.name) return false;
  try {
    const { data } = await supabase.auth.getSession(); // read from the phone, no network
    const user = data.session?.user;
    if (!user || user.id !== uid) return false;
    const apple = user.identities?.find((i) => i.provider === 'apple');
    const sub = (apple?.identity_data as { sub?: unknown } | undefined)?.sub ?? apple?.id;
    if (sub !== pending.appleUser) return false;
    return await settleName(uid, pending.name, user.email);
  } catch {
    return false;
  }
}

/** Hand Apple's one-time code to the server (apple-link), which keeps what it needs to revoke the account later. Best effort and silent. */
function linkAppleAccount(authorizationCode: string | null | undefined) {
  if (!authorizationCode) return;
  void supabase.functions.invoke('apple-link', { body: { authorizationCode } }).catch(() => undefined);
}

/**
 * One button for sign in and sign up. Same result shape as signInWithGoogle (lib/authLinks.ts): a cancel is `cancelled`
 * and shows nothing, every other failure is a plain sentence. `nameSaved` tells the caller to reload the profile.
 */
export async function signInWithApple(): Promise<{ ok: boolean; error?: string; cancelled?: boolean; nameSaved?: boolean }> {
  const mod = appleModule();
  if (!mod) return { ok: false, error: 'Sign in with Apple needs the latest version of the app.' };
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  let rawNonce: string;
  try {
    const nonce = await makeNonce((n) => ExpoCrypto.getRandomBytes(n), sha256Hex);
    rawNonce = nonce.raw;
    credential = await mod.signInAsync({
      requestedScopes: [mod.AppleAuthenticationScope.FULL_NAME, mod.AppleAuthenticationScope.EMAIL],
      nonce: nonce.hashed,
    });
  } catch (e) {
    if (isAppleCancel(e)) return { ok: false, cancelled: true };
    return { ok: false, error: appleErrorMessage(e) };
  }
  // Apple sends the name only this once: keep it on the phone first, so nothing below can lose it.
  const fromApple = appleFullName(credential.fullName);
  if (fromApple) await localStore.setJSON(PENDING_NAME_KEY, { appleUser: credential.user, name: fromApple } satisfies PendingAppleName);
  const name = nameFromAppleOrPending(fromApple, credential.user, await localStore.getJSON<PendingAppleName>(PENDING_NAME_KEY));
  if (!credential.identityToken) return { ok: false, error: appleErrorMessage(null) };
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) return { ok: false, error: appleErrorMessage(error) };
    linkAppleAccount(credential.authorizationCode);
    const uid = data.user?.id;
    const nameSaved = uid ? await settleName(uid, name, data.user?.email) : false;
    return { ok: true, nameSaved };
  } catch (e) {
    return { ok: false, error: appleErrorMessage(e) };
  }
}
