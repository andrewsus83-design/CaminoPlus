// Adding the place you are at, as steps the screen draws (PlaceParts.tsx). Nothing here is asked of the person without being told
// first, and nothing is asked twice by itself:
//
//   idle      nothing going on.
//   explain   the one-line explanation (what is read, where it stays) with Continue and Not now. Only when the phone would ask for
//             the permission: when it has been given already there is nothing to ask, so it goes straight on.
//   locating  the phone is finding the position (and a name for it). It can be cancelled; a late answer is dropped.
//   problem   why no place was added, in calm words, with how to open the Settings when that is the way forward.
//
// A person who said no is never asked again unless they tap the button again: one tap, at most one system prompt. When the phone
// will not ask again ("blocked") the step says how to turn location on in the Settings instead.
import { useCallback, useEffect, useRef, useState } from 'react';
import { device } from './device';
import type { DiaryPlace, PlaceFailure } from './place';

export type PlaceFlow =
  | { step: 'idle' }
  | { step: 'explain' }
  | { step: 'locating' }
  | { step: 'problem'; failure: PlaceFailure };

const IDLE: PlaceFlow = { step: 'idle' };

export function usePlaceFlow(onPlace: (place: DiaryPlace) => void) {
  const [flow, setFlow] = useState<PlaceFlow>(IDLE);
  const run = useRef(0); // the number of the attempt that may still answer; cancelling or leaving moves it on
  const alive = useRef(true);
  const give = useRef(onPlace);
  give.current = onPlace;
  useEffect(() => { alive.current = true; return () => { alive.current = false; run.current += 1; }; }, []);

  const set = useCallback((next: PlaceFlow) => { if (alive.current) setFlow(next); }, []);

  const locate = useCallback(async () => {
    const mine = (run.current += 1);
    set({ step: 'locating' });
    const res = await device.findPlace();
    if (mine !== run.current || !alive.current) return;
    if (res.status === 'ok') { give.current(res.place); set(IDLE); } else set({ step: 'problem', failure: res.status });
  }, [set]);

  /** The person tapped "Add place". */
  const start = useCallback(async () => {
    const mine = (run.current += 1);
    if (!device.canFindPlace()) { set({ step: 'problem', failure: 'unsupported' }); return; }
    const access = await device.placeAccess();
    if (mine !== run.current || !alive.current) return;
    if (access === 'granted') { void locate(); return; }
    if (access === 'blocked') { set({ step: 'problem', failure: 'blocked' }); return; }
    if (access === 'unsupported') { set({ step: 'problem', failure: 'unsupported' }); return; }
    set({ step: 'explain' });
  }, [locate, set]);

  /** "Not now", "Cancel", "Close": whatever is going on stops, and a late answer is dropped. */
  const close = useCallback(() => { run.current += 1; set(IDLE); }, [set]);

  return { flow, start, confirm: locate, close };
}
