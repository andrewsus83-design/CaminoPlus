import type { ComponentType } from 'react';
import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import type * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from './supabase';
import { getProfile, updateProfile } from './api';
import { hasNativeModule, NativeName } from './optionalNative';
import { appleAvailable, appleErrorMessage, appleFullName, isAppleCancel, makeNonce, nameToSave } from './authAppleCore';

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

/** Keep Apple's name if the new profile has only the automatic one. Best effort: a failure keeps the automatic name. */
async function saveAppleName(uid: string, fromApple: string | null): Promise<boolean> {
  if (!fromApple) return false;
  try {
    const profile = await getProfile(uid);
    const name = nameToSave(profile, fromApple);
    if (!name) return false;
    await updateProfile(uid, { display_name: name });
    return true;
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
  if (!credential.identityToken) return { ok: false, error: appleErrorMessage(null) };
  try {
    const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'apple', token: credential.identityToken, nonce: rawNonce });
    if (error) return { ok: false, error: appleErrorMessage(error) };
    linkAppleAccount(credential.authorizationCode);
    const uid = data.user?.id;
    const nameSaved = uid ? await saveAppleName(uid, appleFullName(credential.fullName)) : false;
    return { ok: true, nameSaved };
  } catch (e) {
    return { ok: false, error: appleErrorMessage(e) };
  }
}
