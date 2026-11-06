// What supabase-js needs from WebCrypto to sign in with PKCE, and nothing more:
//   crypto.getRandomValues(typedArray)                  makes the code verifier
//   crypto.subtle.digest('SHA-256', bytes) -> ArrayBuffer   makes the S256 challenge
// React Native has neither. Without them supabase-js logs "WebCrypto API is not supported" and sends the
// verifier itself as the challenge (method "plain"): anyone who can see that request can replay the code,
// which is exactly what PKCE exists to stop. This file is the pure part (no react-native or expo imports) so
// it can be unit tested; lib/cryptoPolyfill.ts plugs expo-crypto into it.

export type CryptoLike = {
  getRandomValues?: (array: any) => any;
  subtle?: { digest?: (algorithm: any, data: any) => Promise<ArrayBuffer> };
  [key: string]: unknown;
};

export type CryptoBackend = {
  getRandomValues: (array: any) => any;
  digestSha256: (data: ArrayBuffer | ArrayBufferView) => Promise<ArrayBuffer>;
};

export type Installed = { randomValues: boolean; subtle: boolean };

/** Fills in what the platform lacks and never replaces something that is already there. */
export function installCryptoPolyfill(target: { crypto?: CryptoLike }, backend: CryptoBackend): Installed {
  const installed: Installed = { randomValues: false, subtle: false };
  if (!target.crypto) target.crypto = {};
  const c = target.crypto;

  if (typeof c.getRandomValues !== 'function') {
    c.getRandomValues = backend.getRandomValues;
    installed.randomValues = true;
  }

  if (!c.subtle || typeof c.subtle.digest !== 'function') {
    c.subtle = {
      digest: (algorithm: unknown, data: ArrayBuffer | ArrayBufferView) => {
        const name = typeof algorithm === 'string' ? algorithm : (algorithm as { name?: string } | null)?.name;
        // PKCE only ever asks for SHA-256. Anything else is a bug elsewhere: say so instead of guessing.
        if (String(name).toUpperCase() !== 'SHA-256') {
          return Promise.reject(new Error(`crypto.subtle.digest: only SHA-256 is available here (asked for ${String(name)})`));
        }
        return backend.digestSha256(data);
      },
    };
    installed.subtle = true;
  }
  return installed;
}
