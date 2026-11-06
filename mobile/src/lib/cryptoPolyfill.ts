// Gives supabase-js the WebCrypto pieces it needs on a phone, so sign-in uses the S256 PKCE method instead of
// silently falling back to "plain". Import this before the Supabase client is created (lib/supabase.ts does).
// Native only: browsers have WebCrypto in a secure context, and on a plain http page supabase-js falls back
// to "plain" by itself, which is better than a digest that cannot run.
//
// expo-crypto is native code. A dev build compiled before it was added has no ExpoCrypto module, and
// importing expo-crypto there throws at startup and takes the whole app down. So check for the native
// module first and only then load expo-crypto. Without it the app still starts and sign-in uses "plain"
// until the dev build is rebuilt (npx expo run:ios / eas build).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import { installCryptoPolyfill } from './cryptoPolyfillCore';

if (Platform.OS !== 'web') {
  if (requireOptionalNativeModule('ExpoCrypto')) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ExpoCrypto = require('expo-crypto') as typeof import('expo-crypto');
    installCryptoPolyfill(globalThis as unknown as { crypto?: Record<string, unknown> }, {
      getRandomValues: (array) => ExpoCrypto.getRandomValues(array),
      // The cast only narrows the typed-array flavour for TypeScript (SharedArrayBuffer cannot be passed here).
      digestSha256: (data) => ExpoCrypto.digest(ExpoCrypto.CryptoDigestAlgorithm.SHA256, data as Parameters<typeof ExpoCrypto.digest>[1]),
    });
  } else if (__DEV__) {
    console.warn(
      'ExpoCrypto is not in this build, so sign-in falls back to PKCE "plain". Rebuild the dev client (npx expo run:ios) to fix.',
    );
  }
}
