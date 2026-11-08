import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_STEP, canGrow, canShrink, grow, shrink } from './readerType';
import { loadSize, saveSize } from './readingStore';

export type ReaderSize = {
  /** The size has been read from the phone: the reader shows the text once it has, so that it never opens at one size and jumps to another. */
  ready: boolean;
  step: number;
  smaller: () => void;
  larger: () => void;
  canShrink: boolean;
  canGrow: boolean;
};

/** The size of the text of the reader, one of five steps, kept on this phone (see readerType.ts). Nothing here uses the network and nothing throws. */
export function useReaderSize(): ReaderSize {
  const [state, setState] = useState<{ step: number } | null>(null);
  // The step as it is now, for a second tap that comes before React has drawn the first.
  const latest = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadSize().then((step) => {
      // A tap that came before the size was read is the person's choice; it wins over what was kept.
      if (!alive || latest.current !== null) return;
      latest.current = step;
      setState({ step });
    });
    return () => { alive = false; };
  }, []);

  const move = useCallback((to: (s: number) => number) => {
    const from = latest.current ?? DEFAULT_STEP;
    const next = to(from);
    if (next === from && latest.current !== null) return;
    latest.current = next;
    setState({ step: next });
    void saveSize(next);
  }, []);

  const step = state ? state.step : DEFAULT_STEP;
  return {
    ready: !!state,
    step,
    smaller: useCallback(() => move(shrink), [move]),
    larger: useCallback(() => move(grow), [move]),
    canShrink: canShrink(step),
    canGrow: canGrow(step),
  };
}
