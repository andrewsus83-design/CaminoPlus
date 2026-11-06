// RFC 4122 version 4 id. Client generated ids make writes idempotent (retries and the offline outbox send
// the same id again). Uses the platform generator when there is one, otherwise Math.random (ids need to be
// unique, not secret).
export function uuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
