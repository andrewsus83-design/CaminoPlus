// The position the sheet shows and sends: the map's position at once (when it gave one), a fresh fix as soon as
// the phone has it, the last known one (with its age) when it has not, and "no position" when there is nothing honest to show.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createLatestGate } from '../logic';
import { getHelpFix } from './location';
import { chooseFix, fixFromSupplied, type FixFailure, type FixSource, type HelpFix, type HelpPosition } from './logic';

export type PositionState = {
  fix: HelpFix | null;
  source: FixSource | null;
  status: 'idle' | 'locating' | 'ready' | 'none';
  failure: FixFailure | null; // why there is no fresh position (also set while an older one is shown)
};

const IDLE: PositionState = { fix: null, source: null, status: 'idle', failure: null };

/** Seconds-level clock for ages and countdowns while the sheet is open. */
export function useTick(active: boolean, everyMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [active, everyMs]);
  return now;
}

export function usePosition(visible: boolean, supplied: HelpPosition | null | undefined) {
  const [state, setState] = useState<PositionState>(IDLE);
  const gate = useRef(createLatestGate()).current;
  const suppliedRef = useRef(supplied);
  suppliedRef.current = supplied;

  /** Looks for a new position (10 s at most). Resolves to what is shown afterwards, null when nothing honest is left. */
  const locate = useCallback(async (): Promise<{ fix: HelpFix; source: FixSource } | null> => {
    const current = gate.next();
    const start = Date.now();
    const fromMap = chooseFix({ supplied: fixFromSupplied(suppliedRef.current, start), now: start });
    // What we already show stays on screen while the phone looks for a better position.
    setState((s) => (s.fix ? { ...s, status: 'locating', failure: null } : { fix: fromMap?.fix ?? null, source: fromMap?.source ?? null, status: 'locating', failure: null }));
    const res = await getHelpFix();
    if (!current()) return null;
    const now = Date.now();
    const chosen = chooseFix({ fresh: res.fresh, lastKnown: res.lastKnown, supplied: fixFromSupplied(suppliedRef.current, now), now });
    if (chosen) {
      setState({ fix: chosen.fix, source: chosen.source, status: 'ready', failure: chosen.source === 'fresh' ? null : res.failure ?? 'unavailable' });
      return chosen;
    }
    setState({ fix: null, source: null, status: 'none', failure: res.failure ?? 'unavailable' });
    return null;
  }, [gate]);

  /** A fresh position or null (an older one is not good enough to send again). */
  const locateFresh = useCallback(async () => {
    const r = await locate();
    return r && r.source === 'fresh' ? r.fix : null;
  }, [locate]);

  useEffect(() => {
    if (!visible) {
      gate.invalidate();
      setState(IDLE);
      return;
    }
    void locate();
    return () => gate.invalidate();
  }, [visible, locate, gate]);

  return { ...state, locate, locateFresh };
}
