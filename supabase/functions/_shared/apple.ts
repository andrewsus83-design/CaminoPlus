// Sign in with Apple, the server side: the client secret (an ES256 JWT signed with the .p8 key), the exchange of the
// app's one-time authorization code for a refresh token, and the revocation of that token when the account is deleted
// (App Store 5.1.1(v): an account made with Sign in with Apple is revoked at Apple when it is deleted).
// Apple's REST API: https://developer.apple.com/documentation/signinwithapplerestapi
//   POST https://appleid.apple.com/auth/token   client_id, client_secret, code, grant_type=authorization_code
//   POST https://appleid.apple.com/auth/revoke  client_id, client_secret, token, token_type_hint=refresh_token
// Used by apple-link (stores the refresh token) and delete-account (revokes it). mobile/docs/APPLE-SIGN-IN.md explains the setup.
//
// Secrets, set by the owner (names only, never in a file): APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY (the whole
// .p8 file), APPLE_BUNDLE_ID (plus.camino.app). When one is missing, appleConfig() is null and callers answer
// "not configured" and carry on. APPLE_AUTH_URL exists for the tests only (a fake Apple); leave it unset.
//
// Nothing here ever logs a token, a code, the key or the client secret.

export type AppleConfig = { teamId: string; keyId: string; privateKey: string; bundleId: string; baseUrl: string };

export function appleConfig(get: (name: string) => string | undefined = (n) => Deno.env.get(n)): AppleConfig | null {
  const teamId = get('APPLE_TEAM_ID')?.trim();
  const keyId = get('APPLE_KEY_ID')?.trim();
  const privateKey = get('APPLE_PRIVATE_KEY')?.trim();
  const bundleId = get('APPLE_BUNDLE_ID')?.trim();
  if (!teamId || !keyId || !privateKey || !bundleId) return null;
  const baseUrl = (get('APPLE_AUTH_URL')?.trim() || 'https://appleid.apple.com').replace(/\/+$/, '');
  return { teamId, keyId, privateKey, bundleId, baseUrl };
}

const b64urlBytes = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (v: unknown) => b64urlBytes(new TextEncoder().encode(JSON.stringify(v)));

/** The .p8 file as Apple gives it (PKCS#8 PEM). Also accepted: "\n" typed as two characters, or the base64 lines alone. */
export async function importAppleKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/\\n/g, '\n').replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  let der: Uint8Array<ArrayBuffer>;
  try {
    der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
  } catch {
    throw new Error('APPLE_PRIVATE_KEY is not a .p8 key');
  }
  return await crypto.subtle.importKey('pkcs8', der, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

/**
 * The client secret: a JWT, header { alg: ES256, kid }, claims { iss: team, iat, exp, aud: https://appleid.apple.com,
 * sub: bundle id }. Apple allows up to six months; this one lives five minutes because it is made for each request.
 * Web Crypto's ECDSA signature is already r || s (64 bytes), which is exactly what a JWS ES256 signature is.
 */
export async function clientSecret(cfg: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const key = await importAppleKey(cfg.privateKey);
  const input = `${b64urlJson({ alg: 'ES256', kid: cfg.keyId, typ: 'JWT' })}.${b64urlJson({
    // iat a minute back, so a server clock a little ahead of Apple's is fine
    iss: cfg.teamId, iat: nowSeconds - 60, exp: nowSeconds + 300, aud: 'https://appleid.apple.com', sub: cfg.bundleId,
  })}`;
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(input)));
  return `${input}.${b64urlBytes(sig)}`;
}

/** The claims of a JWT, without checking its signature (only for a token Apple just handed us over TLS). */
export function jwtClaims(jwt: string): Record<string, unknown> | null {
  const part = jwt.split('.')[1];
  if (!part) return null;
  try {
    const bin = atob(part.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (part.length % 4)) % 4));
    const v = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))));
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

/** Apple said no, or could not be reached. `reason` is Apple's error word (invalid_grant ...) or an HTTP status: safe to log. */
export class AppleError extends Error {
  constructor(readonly reason: string) {
    super(`Apple refused: ${reason}`);
  }
}

async function post(cfg: AppleConfig, path: string, form: Record<string, string>): Promise<Response> {
  const body = new URLSearchParams({ client_id: cfg.bundleId, client_secret: await clientSecret(cfg), ...form });
  let r: Response;
  try {
    r = await fetch(`${cfg.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new AppleError('unreachable');
  }
  if (!r.ok) {
    let reason = `http_${r.status}`;
    try {
      const j = await r.json();
      if (typeof j?.error === 'string' && /^[a-z_]{1,40}$/.test(j.error)) reason = j.error;
    } catch { /* no JSON body */ }
    throw new AppleError(reason);
  }
  return r;
}

/** The app's one-time authorization code (valid five minutes) -> a refresh token, and the Apple user id it belongs to. */
export async function exchangeCode(cfg: AppleConfig, code: string): Promise<{ refreshToken: string; sub: string | null }> {
  const r = await post(cfg, '/auth/token', { code, grant_type: 'authorization_code' });
  let j: { refresh_token?: unknown; id_token?: unknown };
  try {
    j = await r.json();
  } catch {
    throw new AppleError('bad_response');
  }
  if (typeof j.refresh_token !== 'string' || !j.refresh_token) throw new AppleError('no_refresh_token');
  const sub = typeof j.id_token === 'string' ? jwtClaims(j.id_token)?.sub : null;
  return { refreshToken: j.refresh_token, sub: typeof sub === 'string' ? sub : null };
}

/** Revoke a refresh token. Apple answers 200 also for a token that was already revoked. */
export async function revokeToken(cfg: AppleConfig, refreshToken: string): Promise<void> {
  await post(cfg, '/auth/revoke', { token: refreshToken, token_type_hint: 'refresh_token' });
}
