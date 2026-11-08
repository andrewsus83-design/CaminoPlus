// Two small rules of the account loading in lib/auth.tsx, kept apart so they can be tested as behaviour in Node
// (src/lib/__tests__/accountLoad.test.ts).

/**
 * Only the newest load may write its answer. Right after a sign-in two loads can run at once: the one that starts with the
 * new session and one asked for later (after Sign in with Apple saved the name it shares only once). Without this, the older
 * one could finish last and put the old profile back on screen.
 */
export function latestGate() {
  let n = 0;
  return { begin: () => ++n, isLatest: (ticket: number) => ticket === n };
}

/**
 * refresh() and retry() load the account of whoever is signed in WHEN they are called, read from a ref, not the user id of
 * the render that made them. A button pressed while signed out (Continue with Apple) calls refresh() after the sign-in.
 */
export function reloadCurrent(getUid: () => string | undefined, load: (uid: string) => Promise<void>, before?: () => void) {
  return async () => {
    const uid = getUid();
    if (!uid) return;
    before?.();
    await load(uid);
  };
}
