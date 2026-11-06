// Gives supabase-js the WebCrypto pieces it needs on a phone, so sign-in uses the S256 PKCE method instead of
// silently falling back to "plain". Import this before the Supabase client is created (lib/supabase.ts does).
// Native only: browsers have WebCrypto in a secure context, and on a plain http page supabase-js falls back
// to "plain" by itself, which is better than a digest that cannot run.
import { Platform } from 'react-native';
import * as ExpoCrypto from 'expo-crypto';
import { installCryptoPolyfill } from './cryptoPolyfillCore';

if (Platform.OS !== 'web') {
  installCryptoPolyfill(globalThis as unknown as { crypto?: Record<string, unknown> }, {
    getRandomValues: (array) => ExpoCrypto.getRandomValues(array),
    // The cast only narrows the typed-array flavour for TypeScript (SharedArrayBuffer cannot be passed here).
    digestSha256: (data) => ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data as Parameters<typeof ExpoCrypto.digest>[1]),
  });
}
