import { useSyncExternalStore } from 'react';

// The room that something floating above the tab bar takes from the lists under it. The Library's "Continue reading" bar sits just above the tab bar (features/library/
// continueBar): it says how much room it takes (setAboveTabBar) while it is on the screen, and components/Screen.tsx adds that to the end of its list, so the last row can be
// scrolled clear of it. 0 when nothing floats there. Same shape as lib/tabBarVisibility.ts: a value, the ones who listen, and a hook.
let room = 0;
const listeners = new Set<() => void>();

/** Sets the room (in points). Anything that is not a positive number is 0. */
export const setAboveTabBar = (value: number) => {
  const next = Number.isFinite(value) && value > 0 ? value : 0;
  if (room === next) return;
  room = next;
  listeners.forEach((l) => l());
};

export const useAboveTabBar = (): number =>
  useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => room, () => 0);
