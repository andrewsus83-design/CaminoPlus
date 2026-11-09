// For the tests only: a fresh P-256 key pair made on the spot, its private half shaped like a .p8 file from Apple
// (PKCS#8 PEM, 64 characters a line). Never a real key.
const b64 = (bytes: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(bytes)));

export async function throwawayKey(): Promise<{ pem: string; publicKey: CryptoKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const body = b64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).match(/.{1,64}/g)!.join('\n');
  return { pem: `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`, publicKey: pair.publicKey };
}
