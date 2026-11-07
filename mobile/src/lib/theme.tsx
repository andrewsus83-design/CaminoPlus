import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { applyScheme, Scheme } from '@/theme';
import { localStore } from './localStore';

// Light / dark mode. The choice is saved on the phone (works offline). Colours are plain objects read while
// screens render, so switching swaps them in place and the app root remounts with `key={scheme}` (app/_layout).
// The remount drops the current screen state, so we remember to come back to Settings afterwards.
const KEY = 'theme-scheme';

type Ctx = { scheme: Scheme; toggle: () => void };
const ThemeContext = createContext<Ctx>({ scheme: 'light', toggle: () => {} });

let returnToSettings = false;
/** True once after a toggle: the root calls this after remounting to go back to Settings. */
export function consumeReturnToSettings() {
  const v = returnToSettings;
  returnToSettings = false;
  return v;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setScheme] = useState<Scheme>('light');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void localStore.getJSON<Scheme>(KEY).then((saved) => {
      if (!alive) return;
      const next: Scheme = saved === 'dark' ? 'dark' : 'light';
      applyScheme(next);
      setScheme(next);
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const toggle = useCallback(() => {
    const next: Scheme = scheme === 'dark' ? 'light' : 'dark';
    applyScheme(next);
    returnToSettings = true;
    void localStore.setJSON(KEY, next);
    setScheme(next);
  }, [scheme]);

  const value = useMemo(() => ({ scheme, toggle }), [scheme, toggle]);
  if (!ready) return null; // the native splash is still showing; avoids a light flash for dark-mode people
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
